import { Controller, Get } from '@nestjs/common';
import { StripeConnectService } from './stripe-connect.service';

@Controller('payments/health')
export class PaymentsHealthController {
  constructor(private readonly stripeConnectService: StripeConnectService) {}

  @Get()
  async getHealthStatus() {
    const stripeConfigured = this.stripeConnectService.isConfigured();

    return {
      status: stripeConfigured ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        stripe: {
          status: stripeConfigured ? 'healthy' : 'unhealthy',
          provider: 'stripe',
          configured: stripeConfigured,
          lastCheck: new Date().toISOString(),
        },
      },
    };
  }

  @Get('stripe')
  async getStripeHealth() {
    const configured = this.stripeConnectService.isConfigured();

    return {
      status: configured ? 'healthy' : 'unhealthy',
      provider: 'stripe',
      configured,
      lastCheck: new Date().toISOString(),
    };
  }
}
