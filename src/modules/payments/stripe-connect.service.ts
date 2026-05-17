import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import Stripe from 'stripe';

type StripePrimitive = string | number | boolean | null | undefined;
type StripePayload =
  | StripePrimitive
  | StripePayload[]
  | { [key: string]: StripePayload };

interface CreateRecipientAccountInput {
  email: string;
  displayName?: string;
  country?: string;
  givenName?: string;
  familyName?: string;
  metadata?: Record<string, string>;
}

interface CreateRecipientOnboardingLinkInput {
  accountId: string;
  refreshUrl?: string;
  returnUrl?: string;
}

interface CreateEscrowPaymentIntentInput {
  amount: number;
  customerId?: string;
  paymentMethodId?: string;
  description?: string;
  confirm?: boolean;
  savePaymentMethod?: boolean;
  metadata?: Record<string, string>;
  transferGroup?: string;
}

interface CreateTransferInput {
  amount: number;
  destinationAccountId: string;
  sourceTransaction?: string;
  transferGroup?: string;
  description?: string;
  metadata?: Record<string, string>;
}

interface CreateRefundInput {
  paymentIntentId: string;
  amount?: number;
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  metadata?: Record<string, string>;
}

interface CreateEmbeddedOnboardingSessionInput {
  accountId: string;
}

@Injectable()
export class StripeConnectService {
  private readonly logger = new Logger(StripeConnectService.name);
  private readonly secretKey = process.env.STRIPE_SECRET_KEY || '';
  private readonly apiVersion =
    (process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion) ||
    '2026-02-25.clover';
  private readonly defaultCurrency =
    process.env.STRIPE_DEFAULT_CURRENCY || 'brl';

  private readonly stripe =
    this.secretKey.trim().length > 0
      ? new Stripe(this.secretKey, {
          apiVersion: this.apiVersion,
        })
      : null;

  isConfigured(): boolean {
    return this.stripe !== null;
  }

  getDefaultCurrency(): string {
    return this.defaultCurrency;
  }

  toMinorUnits(amount: number): number {
    return Math.round(amount * 100);
  }

  /**
   * Cria uma conta Stripe Express para o Personal Trainer (V1 API)
   */
  async createRecipientAccount(
    input: CreateRecipientAccountInput,
  ): Promise<Stripe.Account> {
    const stripe = this.assertConfigured();

    try {
      return await stripe.accounts.create({
        type: 'express',
        email: input.email,
        country: input.country || 'BR',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        individual: {
          first_name: input.givenName,
          last_name: input.familyName,
          email: input.email,
        },
        metadata: input.metadata,
      });
    } catch (error) {
      this.handleStripeError(error, 'createAccount');
    }
  }

  async retrieveAccount(accountId: string): Promise<Stripe.Account> {
    const stripe = this.assertConfigured();
    try {
      return await stripe.accounts.retrieve(accountId);
    } catch (error) {
      this.handleStripeError(error, 'retrieveAccount');
    }
  }

  async createRecipientOnboardingLink(
    input: CreateRecipientOnboardingLinkInput,
  ): Promise<Stripe.AccountLink> {
    const stripe = this.assertConfigured();

    const returnUrl =
      input.returnUrl ||
      process.env.STRIPE_CONNECT_RETURN_URL ||
      process.env.FRONTEND_URL ||
      'https://app.treinopro.com';
    const refreshUrl =
      input.refreshUrl ||
      process.env.STRIPE_CONNECT_REFRESH_URL ||
      process.env.FRONTEND_URL ||
      'https://app.treinopro.com';

    try {
      return await stripe.accountLinks.create({
        account: input.accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });
    } catch (error) {
      this.handleStripeError(error, 'createAccountLink');
    }
  }

  async createEmbeddedOnboardingSession(
    input: CreateEmbeddedOnboardingSessionInput,
  ): Promise<Stripe.AccountSession> {
    const stripe = this.assertConfigured();

    try {
      return await stripe.accountSessions.create({
        account: input.accountId,
        components: {
          account_onboarding: {
            enabled: true,
          },
        },
      });
    } catch (error) {
      this.handleStripeError(error, 'createAccountSession');
    }
  }

  async createEscrowPaymentIntent(
    input: CreateEscrowPaymentIntentInput,
  ): Promise<Stripe.PaymentIntent> {
    const stripe = this.assertConfigured();

    try {
      const params: Stripe.PaymentIntentCreateParams = {
        amount: this.toMinorUnits(input.amount),
        currency: this.defaultCurrency,
        confirm: input.confirm ?? false,
        capture_method: 'automatic',
        automatic_payment_methods: {
          enabled: true,
        },
        description: input.description,
        customer: input.customerId,
        payment_method: input.paymentMethodId,
        transfer_group: input.transferGroup,
        metadata: input.metadata,
      };

      if (input.savePaymentMethod) {
        params.setup_future_usage = 'off_session';
      }

      return await stripe.paymentIntents.create(params);
    } catch (error) {
      this.handleStripeError(error, 'createPaymentIntent');
    }
  }

  async retrievePaymentIntent(
    paymentIntentId: string,
  ): Promise<Stripe.PaymentIntent> {
    const stripe = this.assertConfigured();
    try {
      return await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      this.handleStripeError(error, 'retrievePaymentIntent');
    }
  }

  async capturePaymentIntent(
    paymentIntentId: string,
    amountToCapture?: number,
  ): Promise<Stripe.PaymentIntent> {
    const stripe = this.assertConfigured();

    try {
      const params: Stripe.PaymentIntentCaptureParams = {};
      if (typeof amountToCapture === 'number') {
        params.amount_to_capture = this.toMinorUnits(amountToCapture);
      }

      return await stripe.paymentIntents.capture(paymentIntentId, params);
    } catch (error) {
      this.handleStripeError(error, 'capturePaymentIntent');
    }
  }

  async createTransfer(input: CreateTransferInput): Promise<Stripe.Transfer> {
    const stripe = this.assertConfigured();

    try {
      return await stripe.transfers.create({
        amount: this.toMinorUnits(input.amount),
        currency: this.defaultCurrency,
        destination: input.destinationAccountId,
        source_transaction: input.sourceTransaction,
        transfer_group: input.transferGroup,
        description: input.description,
        metadata: input.metadata,
      });
    } catch (error) {
      this.handleStripeError(error, 'createTransfer');
    }
  }

  async createRefund(input: CreateRefundInput): Promise<Stripe.Refund> {
    const stripe = this.assertConfigured();

    try {
      return await stripe.refunds.create({
        payment_intent: input.paymentIntentId,
        amount:
          typeof input.amount === 'number'
            ? this.toMinorUnits(input.amount)
            : undefined,
        reason: input.reason,
        metadata: input.metadata,
      });
    } catch (error) {
      this.handleStripeError(error, 'createRefund');
    }
  }

  private assertConfigured(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException('Stripe não está configurado corretamente');
    }
    return this.stripe;
  }

  private handleStripeError(error: any, action: string): never {
    const message = error.message || 'Erro desconhecido na Stripe';
    this.logger.error(`[STRIPE] Error in ${action}: ${message}`, error.stack);

    if (error instanceof Stripe.errors.StripeError) {
      if (error.type === 'StripeInvalidRequestError') {
        throw new BadRequestException(message);
      }
      throw new BadGatewayException(message);
    }

    throw new BadGatewayException(message);
  }
}
