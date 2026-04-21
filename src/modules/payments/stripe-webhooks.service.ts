import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeWebhooksService {
  private readonly secretKey = process.env.STRIPE_SECRET_KEY || '';
  private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  private readonly apiVersion =
    (process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion) ||
    '2026-02-25.clover';

  private readonly stripe =
    this.secretKey.trim().length > 0
      ? new Stripe(this.secretKey, {
          apiVersion: this.apiVersion,
        })
      : null;

  isConfigured(): boolean {
    return this.stripe !== null;
  }

  hasWebhookSecret(): boolean {
    return this.webhookSecret.trim().length > 0;
  }

  constructEvent(
    rawBody: Buffer | string,
    signature: string,
  ): Stripe.Event {
    const stripe = this.assertConfigured();

    if (!this.hasWebhookSecret()) {
      throw new BadRequestException(
        'Stripe webhook secret não está configurado',
      );
    }

    try {
      return stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (error) {
      throw new BadRequestException(
        `Assinatura de webhook Stripe inválida: ${error.message}`,
      );
    }
  }

  getEventType(event: Stripe.Event): string {
    return event.type;
  }

  isPaymentIntentSucceeded(event: Stripe.Event): boolean {
    return event.type === 'payment_intent.succeeded';
  }

  isPaymentIntentFailed(event: Stripe.Event): boolean {
    return event.type === 'payment_intent.payment_failed';
  }

  isPaymentIntentCanceled(event: Stripe.Event): boolean {
    return event.type === 'payment_intent.canceled';
  }

  isChargeRefunded(event: Stripe.Event): boolean {
    return event.type === 'charge.refunded';
  }

  isChargeDisputeCreated(event: Stripe.Event): boolean {
    return event.type === 'charge.dispute.created';
  }

  isChargeDisputeClosed(event: Stripe.Event): boolean {
    return event.type === 'charge.dispute.closed';
  }

  private assertConfigured(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException(
        'Stripe não está configurado corretamente',
      );
    }

    return this.stripe;
  }
}
