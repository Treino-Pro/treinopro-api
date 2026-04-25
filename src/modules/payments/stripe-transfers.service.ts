import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';

export interface CreateStripeTransferInput {
  amount: number;
  destinationAccountId: string;
  sourceTransactionId?: string;
  transferGroup?: string;
  description?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
  currency?: string;
}

@Injectable()
export class StripeTransfersService {
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

  buildClassReleaseIdempotencyKey(input: {
    paymentId: string;
    classId?: string | null;
    personalId?: string | null;
  }): string {
    const classScope = input.classId || 'proposal';
    const personalScope = input.personalId || 'personal_pending';
    return `stripe_transfer_release:${input.paymentId}:${classScope}:${personalScope}`;
  }

  async createTransfer(
    input: CreateStripeTransferInput,
  ): Promise<Stripe.Transfer> {
    const stripe = this.assertConfigured();

    return stripe.transfers.create(
      {
        amount: this.toMinorUnits(input.amount),
        currency: input.currency || this.defaultCurrency,
        destination: input.destinationAccountId,
        source_transaction: input.sourceTransactionId,
        transfer_group: input.transferGroup,
        description: input.description,
        metadata: input.metadata,
      },
      input.idempotencyKey
        ? {
            idempotencyKey: input.idempotencyKey,
          }
        : undefined,
    );
  }

  async retrieveTransfer(transferId: string): Promise<Stripe.Transfer> {
    return this.assertConfigured().transfers.retrieve(transferId);
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
