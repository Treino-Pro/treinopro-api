import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsController } from './payments.controller';
import { PaymentsHealthController } from './payments-health.controller';
import { WebhooksController } from './webhooks.controller';
import { PaymentsService } from './payments.service';
import { MercadoPagoService } from './mercadopago.service';
import { MercadoPagoOAuthService } from './mercadopago-oauth.service';
import { FinancialProfileService } from './financial-profile.service';
import { StudentPaymentMethodsService } from './student-payment-methods.service';
import { RefundsService } from './refunds.service';
import { WebhooksService } from './webhooks.service';
import { ErrorHandlerService } from './error-handler.service';
import { PaymentSimulationService } from './payment-simulation.service';
import {
  MercadoPagoWithdrawalPayoutProvider,
  WITHDRAWAL_PAYOUT_PROVIDER,
} from './withdrawal-payout.provider';

@Module({
  imports: [DatabaseModule, AuthModule, forwardRef(() => NotificationsModule)],
  controllers: [
    PaymentsController,
    WebhooksController,
    PaymentsHealthController,
  ],
  providers: [
    PaymentsService,
    MercadoPagoService,
    MercadoPagoOAuthService,
    FinancialProfileService,
    StudentPaymentMethodsService,
    RefundsService,
    WebhooksService,
    ErrorHandlerService,
    PaymentSimulationService,
    MercadoPagoWithdrawalPayoutProvider,
    {
      provide: WITHDRAWAL_PAYOUT_PROVIDER,
      useExisting: MercadoPagoWithdrawalPayoutProvider,
    },
  ],
  exports: [
    PaymentsService,
    MercadoPagoService,
    MercadoPagoOAuthService,
    FinancialProfileService,
    StudentPaymentMethodsService,
    RefundsService,
    WebhooksService,
    ErrorHandlerService,
    PaymentSimulationService,
    WITHDRAWAL_PAYOUT_PROVIDER,
  ],
})
export class PaymentsModule {}
