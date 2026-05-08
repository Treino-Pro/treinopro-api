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

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly stripeWebhooksService: StripeWebhooksService,
    private readonly stripeFinancialAccountsService: StripeFinancialAccountsService,
    private readonly moduleRef: ModuleRef,
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

      if (
        [
          'charge.refunded',
          'charge.dispute.created',
          'charge.dispute.closed',
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
        }
      }

      return { status: 'success' };
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
