import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsController } from './payments.controller';
import { PaymentsHealthController } from './payments-health.controller';
import { WebhooksController } from './webhooks.controller';
import { PaymentsService } from './payments.service';
import { FinancialProfileService } from './financial-profile.service';
import { StudentPaymentMethodsService } from './student-payment-methods.service';
import { RefundsService } from './refunds.service';
import { StripeConnectService } from './stripe-connect.service';
import { StripeWebhooksService } from './stripe-webhooks.service';
import { StripeFinancialAccountsService } from './stripe-financial-accounts.service';
import { StripePaymentIntentsService } from './stripe-payment-intents.service';
import { StripeCustomersService } from './stripe-customers.service';
import { StripeRefundsService } from './stripe-refunds.service';
import { StripeTransfersService } from './stripe-transfers.service';
import {
  StripeWithdrawalPayoutProvider,
  WITHDRAWAL_PAYOUT_PROVIDER,
} from './withdrawal-payout.provider';
import { PaymentsAdminController } from './payments-admin.controller';
import { PaymentsReconciliationService } from './reconciliation.service';

@Module({
  imports: [DatabaseModule, AuthModule, forwardRef(() => NotificationsModule)],
  controllers: [
    PaymentsController,
    WebhooksController,
    PaymentsHealthController,
    PaymentsAdminController,
  ],
  providers: [
    PaymentsService,
    FinancialProfileService,
    StudentPaymentMethodsService,
    RefundsService,
    StripeConnectService,
    StripeWebhooksService,
    StripeFinancialAccountsService,
    StripePaymentIntentsService,
    StripeCustomersService,
    StripeRefundsService,
    StripeTransfersService,
    StripeWithdrawalPayoutProvider,
    PaymentsReconciliationService,
    {
      provide: WITHDRAWAL_PAYOUT_PROVIDER,
      useExisting: StripeWithdrawalPayoutProvider,
    },
  ],
  exports: [
    PaymentsService,
    FinancialProfileService,
    StudentPaymentMethodsService,
    RefundsService,
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
