import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';

interface CreateStripeRefundInput {
  paymentIntentId?: string;
  chargeId?: string;
  amount?: number;
  reason?: Stripe.RefundCreateParams.Reason;
  metadata?: Record<string, string>;
  reverseTransfer?: boolean;
  refundApplicationFee?: boolean;
  idempotencyKey?: string;
}

@Injectable()
export class StripeRefundsService {
  private readonly secretKey = process.env.STRIPE_SECRET_KEY || '';
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

  toMinorUnits(amount: number): number {
    return Math.round(amount * 100);
  }

  async createRefund(input: CreateStripeRefundInput): Promise<Stripe.Refund> {
    const stripe = this.assertConfigured();

    if (!input.paymentIntentId && !input.chargeId) {
      throw new BadRequestException(
        'paymentIntentId ou chargeId é obrigatório para criar refund',
      );
    }

    const refundTarget: Pick<
      Stripe.RefundCreateParams,
      'payment_intent' | 'charge'
    > = input.paymentIntentId
      ? { payment_intent: input.paymentIntentId }
      : { charge: input.chargeId };

    try {
      return await this.createStripeRefund(stripe, input, refundTarget);
    } catch (error) {
      if (
        input.paymentIntentId &&
        input.chargeId &&
        this.isMissingStripeResourceError(error)
      ) {
        return this.createStripeRefund(
          stripe,
          {
            ...input,
            idempotencyKey: input.idempotencyKey
              ? `${input.idempotencyKey}:charge`
              : undefined,
          },
          { charge: input.chargeId },
        );
      }

      throw error;
    }
  }

  async retrieveRefund(refundId: string): Promise<Stripe.Refund> {
    return this.assertConfigured().refunds.retrieve(refundId);
  }

  async listRefundsByPaymentIntent(
    paymentIntentId: string,
    limit = 20,
  ): Promise<Stripe.ApiList<Stripe.Refund>> {
    return this.assertConfigured().refunds.list({
      payment_intent: paymentIntentId,
      limit,
    });
  }

  async listRefundsByCharge(
    chargeId: string,
    limit = 20,
  ): Promise<Stripe.ApiList<Stripe.Refund>> {
    return this.assertConfigured().refunds.list({
      charge: chargeId,
      limit,
    });
  }

  private assertConfigured(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException('Stripe não está configurado corretamente');
    }

    return this.stripe;
  }

  private createStripeRefund(
    stripe: Stripe,
    input: CreateStripeRefundInput,
    refundTarget: Pick<Stripe.RefundCreateParams, 'payment_intent' | 'charge'>,
  ): Promise<Stripe.Refund> {
    return stripe.refunds.create(
      {
        ...refundTarget,
        amount:
          typeof input.amount === 'number'
            ? this.toMinorUnits(input.amount)
            : undefined,
        reason: input.reason,
        metadata: input.metadata,
        reverse_transfer: input.reverseTransfer,
        refund_application_fee: input.refundApplicationFee,
      },
      input.idempotencyKey
        ? {
            idempotencyKey: input.idempotencyKey,
          }
        : undefined,
    );
  }

  private isMissingStripeResourceError(error: any): boolean {
    const message = String(error?.message || '').toLowerCase();
    return error?.code === 'resource_missing' || message.includes('no such');
  }
}
