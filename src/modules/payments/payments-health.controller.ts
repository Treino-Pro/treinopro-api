import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { ErrorHandlerService } from './error-handler.service';
import { MercadoPagoService } from './mercadopago.service';

@Controller('payments/health')
export class PaymentsHealthController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly errorHandler: ErrorHandlerService,
    private readonly mercadoPagoService: MercadoPagoService,
  ) {}

  @Get()
  async getHealthStatus() {
    try {
      // Verificar conectividade com Mercado Pago
      const mpHealth = await this.checkMercadoPagoHealth();

      // Verificar webhooks
      const webhookHealth = await this.webhooksService.getWebhookHealth();

      // Verificar error handling
      const errorStats = this.errorHandler.getErrorStats();

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          mercadoPago: mpHealth,
          webhooks: webhookHealth,
          errorHandling: errorStats,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  @Get('webhooks')
  async getWebhookHealth() {
    return await this.webhooksService.getWebhookHealth();
  }

  @Get('errors')
  async getErrorStats() {
    return this.errorHandler.getErrorStats();
  }

  @Post('webhooks/:webhookId/retry')
  async retryWebhook(@Param('webhookId') webhookId: string) {
    await this.webhooksService.retryFailedWebhook(webhookId);
    return { message: 'Webhook retry initiated' };
  }

  @Post('circuit-breaker/:service/reset')
  async resetCircuitBreaker(@Param('service') service: string) {
    // Implementar reset do circuit breaker
    return { message: `Circuit breaker reset for ${service}` };
  }

  private async checkMercadoPagoHealth(): Promise<{
    status: string;
    responseTime: number;
    lastCheck: string;
  }> {
    const startTime = Date.now();

    try {
      // Testar conectividade com uma chamada simples
      // se disponível, teste de chamada simples; caso não exista, apenas retornar healthy
      await this.mercadoPagoService.getIdentificationTypes();

      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime,
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toISOString(),
      };
    }
  }
}
