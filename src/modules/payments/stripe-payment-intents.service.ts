import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';

interface CreateStripePaymentIntentInput {
  amount: number;
  currency?: string;
  customerId?: string;
  paymentMethodId?: string;
  paymentMethodTypes?: string[];
  paymentMethodData?: Stripe.PaymentIntentCreateParams.PaymentMethodData;
  paymentMethodOptions?: Stripe.PaymentIntentCreateParams.PaymentMethodOptions;
  description?: string;
  confirm?: boolean;
  captureMethod?: Stripe.PaymentIntentCreateParams.CaptureMethod;
  setupFutureUsage?: Stripe.PaymentIntentCreateParams.SetupFutureUsage;
  metadata?: Record<string, string>;
  transferGroup?: string;
}

interface CaptureStripePaymentIntentInput {
  paymentIntentId: string;
  amountToCapture?: number;
  metadata?: Record<string, string>;
}

interface CancelStripePaymentIntentInput {
  paymentIntentId: string;
  cancellationReason?: Stripe.PaymentIntentCancelParams.CancellationReason;
}

@Injectable()
export class StripePaymentIntentsService {
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

  toMinorUnits(amount: number): number {
    return Math.round(amount * 100);
  }

  async createPaymentIntent(
    input: CreateStripePaymentIntentInput,
  ): Promise<Stripe.PaymentIntent> {
    const stripe = this.assertConfigured();

    const params: Stripe.PaymentIntentCreateParams = {
      amount: this.toMinorUnits(input.amount),
      currency: input.currency || this.defaultCurrency,
      customer: input.customerId,
      payment_method: input.paymentMethodId,
      payment_method_types: input.paymentMethodTypes,
      payment_method_data: input.paymentMethodData,
      payment_method_options: input.paymentMethodOptions,
      description: input.description,
      confirm: input.confirm,
      capture_method: input.captureMethod,
      setup_future_usage: input.setupFutureUsage,
      metadata: input.metadata,
      transfer_group: input.transferGroup,
    };

    if (!input.paymentMethodTypes?.length) {
      params.automatic_payment_methods = {
        enabled: true,
      };
    }

    return stripe.paymentIntents.create(params);
  }

  async retrievePaymentIntent(
    paymentIntentId: string,
  ): Promise<Stripe.PaymentIntent> {
    return this.assertConfigured().paymentIntents.retrieve(paymentIntentId);
  }

  async confirmPaymentIntent(
    paymentIntentId: string,
    paymentMethodId?: string,
  ): Promise<Stripe.PaymentIntent> {
    const stripe = this.assertConfigured();

    return stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
    });
  }

  async capturePaymentIntent(
    input: CaptureStripePaymentIntentInput,
  ): Promise<Stripe.PaymentIntent> {
    const stripe = this.assertConfigured();

    return stripe.paymentIntents.capture(input.paymentIntentId, {
      amount_to_capture:
        typeof input.amountToCapture === 'number'
          ? this.toMinorUnits(input.amountToCapture)
          : undefined,
      metadata: input.metadata,
    });
  }

  async cancelPaymentIntent(
    input: CancelStripePaymentIntentInput,
  ): Promise<Stripe.PaymentIntent> {
    const stripe = this.assertConfigured();

    return stripe.paymentIntents.cancel(input.paymentIntentId, {
      cancellation_reason: input.cancellationReason,
    });
  }

  private assertConfigured(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException('Stripe não está configurado corretamente');
    }

    return this.stripe;
  }
}
