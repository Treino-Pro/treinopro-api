import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { MercadoPagoService } from './mercadopago.service';

export interface WebhookPayload {
  id: number;
  live_mode: boolean;
  type: string;
  date_created: string;
  application_id: number;
  user_id: number;
  version: number;
  api_version: string;
  action: string;
  data: {
    id: string;
  };
}

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly mercadoPagoService: MercadoPagoService,
  ) {}

  @Post('mercadopago')
  @HttpCode(HttpStatus.OK)
  async handleMercadoPagoWebhook(
    @Body() payload: WebhookPayload,
    @Headers() headers: Record<string, string>,
  ): Promise<{ status: string }> {
    try {
      this.logger.log('🔔 [WEBHOOK] Recebido webhook do Mercado Pago');
      this.logger.log('🔍 [WEBHOOK] Tipo:', payload.type);
      this.logger.log('🔍 [WEBHOOK] Action:', payload.action);
      this.logger.log('🔍 [WEBHOOK] Data ID:', payload.data.id);

      // Validar assinatura do webhook
      const isValid = await this.webhooksService.validateWebhookSignature(
        payload,
        headers,
      );
      if (!isValid) {
        this.logger.error('❌ [WEBHOOK] Assinatura inválida');
        throw new Error('Webhook signature validation failed');
      }

      this.logger.log('✅ [WEBHOOK] Assinatura validada com sucesso');

      // Processar webhook baseado no tipo
      await this.processWebhookByType(payload);

      this.logger.log('✅ [WEBHOOK] Webhook processado com sucesso');
      return { status: 'success' };
    } catch (error) {
      this.logger.error('❌ [WEBHOOK] Erro ao processar webhook:', error);

      // Retornar 200 mesmo com erro para evitar reenvios
      return { status: 'error' } as any;
    }
  }

  private async processWebhookByType(payload: WebhookPayload): Promise<void> {
    const { type, action, data } = payload;

    switch (type) {
      case 'payment':
        await this.handlePaymentWebhook(action, data.id);
        break;

      case 'plan':
        await this.handlePlanWebhook(action, data.id);
        break;

      case 'subscription':
        await this.handleSubscriptionWebhook(action, data.id);
        break;

      case 'invoice':
        await this.handleInvoiceWebhook(action, data.id);
        break;

      default:
        this.logger.warn(`⚠️ [WEBHOOK] Tipo não tratado: ${type}`);
    }
  }

  private async handlePaymentWebhook(
    action: string,
    paymentId: string,
  ): Promise<void> {
    this.logger.log(
      `💳 [WEBHOOK] Processando pagamento: ${action} - ${paymentId}`,
    );

    try {
      // Buscar pagamento no Mercado Pago
      const payment = await this.mercadoPagoService.getPayment(paymentId);

      if (!payment) {
        this.logger.error(
          `❌ [WEBHOOK] Pagamento não encontrado: ${paymentId}`,
        );
        return;
      }

      this.logger.log(`✅ [WEBHOOK] Pagamento encontrado: ${payment.id}`);
      this.logger.log(`🔍 [WEBHOOK] Status: ${payment.status}`);
      this.logger.log(
        `🔍 [WEBHOOK] External Reference: ${payment.external_reference}`,
      );

      // Processar baseado na ação
      switch (action) {
        case 'payment.created':
          await this.webhooksService.handlePaymentCreated(payment);
          break;

        case 'payment.updated':
          await this.webhooksService.handlePaymentUpdated(payment);
          break;

        case 'payment.approved':
          await this.webhooksService.handlePaymentApproved(payment);
          break;

        case 'payment.cancelled':
          await this.webhooksService.handlePaymentCancelled(payment);
          break;

        case 'payment.refunded':
          await this.webhooksService.handlePaymentRefunded(payment);
          break;

        default:
          this.logger.warn(
            `⚠️ [WEBHOOK] Ação de pagamento não tratada: ${action}`,
          );
      }
    } catch (error) {
      this.logger.error(
        `❌ [WEBHOOK] Erro ao processar pagamento ${paymentId}:`,
        error,
      );
      throw error;
    }
  }

  private async handlePlanWebhook(
    action: string,
    planId: string,
  ): Promise<void> {
    this.logger.log(`📋 [WEBHOOK] Processando plano: ${action} - ${planId}`);
    // Implementar se necessário
  }

  private async handleSubscriptionWebhook(
    action: string,
    subscriptionId: string,
  ): Promise<void> {
    this.logger.log(
      `🔄 [WEBHOOK] Processando assinatura: ${action} - ${subscriptionId}`,
    );
    // Implementar se necessário
  }

  private async handleInvoiceWebhook(
    action: string,
    invoiceId: string,
  ): Promise<void> {
    this.logger.log(
      `📄 [WEBHOOK] Processando fatura: ${action} - ${invoiceId}`,
    );
    // Implementar se necessário
  }
}
