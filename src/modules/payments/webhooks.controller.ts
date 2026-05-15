import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { StripeFinancialAccountsService } from './stripe-financial-accounts.service';
import { StripeWebhooksService } from './stripe-webhooks.service';
import { PaymentsService } from './payments.service';
import { ProposalsService } from '../proposals/proposals.service';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { stripeEvents } from '../../database/schema';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly stripeWebhooksService: StripeWebhooksService,
    private readonly stripeFinancialAccountsService: StripeFinancialAccountsService,
    private readonly moduleRef: ModuleRef,
    @Inject('DATABASE_CONNECTION') private readonly db: any,
  ) {}

  @Post('stripe')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ status: string }> {
    try {
      if (!signature) {
        throw new BadRequestException(
          'Header stripe-signature ausente no webhook Stripe',
        );
      }

      const rawBody = req.body;
      if (!Buffer.isBuffer(rawBody)) {
        throw new BadRequestException(
          'Body bruto do webhook Stripe indisponível. Verifique se express.raw está configurado antes do parser JSON.',
        );
      }

      const event = this.stripeWebhooksService.constructEvent(
        rawBody,
        signature,
      );

      // --- VERIFICAÇÃO DE IDEMPOTÊNCIA ---
      const existingEvent = await this.db.query.stripeEvents.findFirst({
        where: eq(stripeEvents.id, event.id),
      });

      if (existingEvent && existingEvent.status === 'processed') {
        this.logger.log(
          `Evento ${event.id} (${event.type}) já processado. Ignorando.`,
        );
        return { status: 'success' };
      }

      // Registrar ou atualizar para 'processing'
      await this.db
        .insert(stripeEvents)
        .values({
          id: event.id,
          type: event.type,
          status: 'processing',
          payload: event.data.object,
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: stripeEvents.id,
          set: { status: 'processing', updatedAt: new Date() },
        });

      try {
        if (this.isStripeAccountStatusEvent(event)) {
          await this.stripeFinancialAccountsService.handleAccountUpdated(event);
        }

        if (
          [
            'payment_intent.succeeded',
            'payment_intent.payment_failed',
            'payment_intent.canceled',
          ].includes(event.type)
        ) {
          const proposalsService = this.moduleRef.get(ProposalsService, {
            strict: false,
          });
          await proposalsService.handleStripePaymentIntentEvent(
            event.type,
            event.data.object as any,
          );
        }

        // Handlers de Pagamentos, Reembolsos, Disputas e Repasses
        if (
          [
            'charge.refunded',
            'charge.dispute.created',
            'charge.dispute.closed',
            'transfer.reversed',
            'payout.failed',
          ].includes(event.type)
        ) {
          const paymentsService = this.moduleRef.get(PaymentsService, {
            strict: false,
          });

          if (event.type === 'charge.refunded') {
            await paymentsService.handleStripeChargeRefundedEvent(
              event.data.object as any,
            );
          } else if (event.type === 'charge.dispute.created') {
            await paymentsService.handleStripeDisputeCreatedEvent(
              event.data.object as any,
            );
          } else if (event.type === 'charge.dispute.closed') {
            await paymentsService.handleStripeDisputeClosedEvent(
              event.data.object as any,
            );
          } else if (event.type === 'transfer.reversed') {
            this.logger.warn(`⚠️ [Stripe] Transfer Revertido: ${event.id}`);
            await paymentsService.handleStripeTransferReversedEvent(
              event.data.object as any,
            );
          } else if (event.type === 'payout.failed') {
            this.logger.error(`❌ [Stripe] Payout Falhou: ${event.id}`);
            await paymentsService.handleStripePayoutFailedEvent(
              event.data.object as any,
            );
          }
        }

        // Marcar como processado
        await this.db
          .update(stripeEvents)
          .set({ status: 'processed', processedAt: new Date() })
          .where(eq(stripeEvents.id, event.id));

        return { status: 'success' };
      } catch (processingError) {
        // Marcar como falha
        await this.db
          .update(stripeEvents)
          .set({
            status: 'failed',
            error:
              processingError instanceof Error
                ? processingError.message
                : String(processingError),
          })
          .where(eq(stripeEvents.id, event.id));

        throw processingError;
      }
    } catch (error) {
      this.logger.error(
        'Erro ao processar webhook Stripe:',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  private isStripeAccountStatusEvent(event: { type?: string }): boolean {
    return Boolean(
      event.type === 'account.updated' ||
        event.type?.startsWith('v2.core.account'),
    );
  }
}
