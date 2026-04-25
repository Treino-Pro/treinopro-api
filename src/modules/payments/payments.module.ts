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
import { StripeConnectService } from './stripe-connect.service';
import { StripeWebhooksService } from './stripe-webhooks.service';
import { StripeFinancialAccountsService } from './stripe-financial-accounts.service';
import { StripePaymentIntentsService } from './stripe-payment-intents.service';
import { StripeCustomersService } from './stripe-customers.service';
import { StripeRefundsService } from './stripe-refunds.service';
import { StripeTransfersService } from './stripe-transfers.service';
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
    StripeConnectService,
    StripeWebhooksService,
    StripeFinancialAccountsService,
    StripePaymentIntentsService,
    StripeCustomersService,
    StripeRefundsService,
    StripeTransfersService,
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
    StripeConnectService,
    StripeWebhooksService,
    StripeFinancialAccountsService,
    StripePaymentIntentsService,
    StripeCustomersService,
    StripeRefundsService,
    StripeTransfersService,
    WITHDRAWAL_PAYOUT_PROVIDER,
  ],
})
export class PaymentsModule {}
