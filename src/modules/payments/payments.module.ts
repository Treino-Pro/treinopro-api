import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsController } from './payments.controller';
import { PaymentsHealthController } from './payments-health.controller';
import { WebhooksController } from './webhooks.controller';
import { PaymentsService } from './payments.service';
import { MercadoPagoService } from './mercadopago.service';
import { FinancialProfileService } from './financial-profile.service';
import { StudentPaymentMethodsService } from './student-payment-methods.service';
import { RefundsService } from './refunds.service';
import { WebhooksService } from './webhooks.service';
import { ErrorHandlerService } from './error-handler.service';
import { PaymentSimulationService } from './payment-simulation.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    PaymentsController,
    WebhooksController,
    PaymentsHealthController,
  ],
  providers: [
    PaymentsService,
    MercadoPagoService,
    FinancialProfileService,
    StudentPaymentMethodsService,
    RefundsService,
    WebhooksService,
    ErrorHandlerService,
    PaymentSimulationService,
  ],
  exports: [
    PaymentsService,
    MercadoPagoService,
    FinancialProfileService,
    StudentPaymentMethodsService,
    RefundsService,
    WebhooksService,
    ErrorHandlerService,
    PaymentSimulationService,
  ],
})
export class PaymentsModule {}
