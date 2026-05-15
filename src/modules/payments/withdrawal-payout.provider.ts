import { Injectable } from '@nestjs/common';
import { StripeTransfersService } from './stripe-transfers.service';

export const WITHDRAWAL_PAYOUT_PROVIDER = 'WITHDRAWAL_PAYOUT_PROVIDER';

export type WithdrawalTransferMethod = 'bank_transfer' | 'stripe_connect';

export interface WithdrawalPayoutBankAccount {
  bank: string;
  agency: string;
  account: string;
  accountType: string;
}

export interface WithdrawalPayoutPersonalData {
  bankAccount?: WithdrawalPayoutBankAccount;
  stripeAccountId?: string;
}

export interface WithdrawalPayoutRequest {
  personalId: string;
  amount: number;
  description: string;
  transferMethod: WithdrawalTransferMethod;
  personalData: WithdrawalPayoutPersonalData;
  context?: {
    withdrawalId?: string;
    initiatedBy?: string;
    idempotencyKey?: string;
    sourceTransactionId?: string;
  };
}

export interface WithdrawalPayoutResult {
  success: boolean;
  provider: string;
  transferId?: string;
  balanceTransactionId?: string;
  destinationAccountId?: string;
  idempotencyKey?: string;
  externalStatus?: 'processing' | 'completed' | 'failed';
  failureCode?: string;
  failureReason?: string;
  raw?: any;
}

export interface WithdrawalPayoutProvider {
  executePayout(
    request: WithdrawalPayoutRequest,
  ): Promise<WithdrawalPayoutResult>;
}

@Injectable()
export class StripeWithdrawalPayoutProvider
  implements WithdrawalPayoutProvider
{
  constructor(
    private readonly stripeTransfersService: StripeTransfersService,
  ) {}

  async executePayout(
    request: WithdrawalPayoutRequest,
  ): Promise<WithdrawalPayoutResult> {
    const stripeAccountId = request.personalData.stripeAccountId;

    if (!stripeAccountId) {
      return {
        success: false,
        provider: 'stripe',
        externalStatus: 'failed',
        failureCode: 'missing_stripe_account',
        failureReason: 'Conta Stripe Connect do personal não encontrada',
      };
    }

    if (request.transferMethod !== 'stripe_connect') {
      return {
        success: false,
        provider: 'stripe',
        externalStatus: 'failed',
        failureCode: 'invalid_transfer_method',
        failureReason: 'Saque deve ser processado via Stripe Connect',
      };
    }

    const withdrawalId = request.context?.withdrawalId || 'manual';
    const idempotencyKey =
      request.context?.idempotencyKey ||
      `stripe_withdrawal:${withdrawalId}:${request.personalId}:${request.amount.toFixed(2)}`;
    const transferGroup = `withdrawal_${withdrawalId}`;

    try {
      // Stripe BR requires source_transaction for separate charges/transfers.
      // When a source charge already has a transfer_group, Stripe rejects a new
      // transfer_group on the Transfer, so we only send it for non-source flows.
      const transfer = await this.stripeTransfersService.createTransfer({
        amount: request.amount,
        destinationAccountId: stripeAccountId,
        sourceTransactionId: request.context?.sourceTransactionId,
        transferGroup: request.context?.sourceTransactionId
          ? undefined
          : transferGroup,
        description: request.description,
        idempotencyKey,
        metadata: {
          type: 'manual_withdrawal',
          withdrawalId,
          personalId: request.personalId,
          initiatedBy: request.context?.initiatedBy || 'system',
        },
      });

      const balanceTransaction = transfer.balance_transaction;
      const balanceTransactionId =
        typeof balanceTransaction === 'string'
          ? balanceTransaction
          : balanceTransaction?.id;

      return {
        success: true,
        provider: 'stripe',
        transferId: transfer.id,
        balanceTransactionId,
        destinationAccountId: stripeAccountId,
        idempotencyKey,
        externalStatus: 'completed',
        raw: transfer,
      };
    } catch (error) {
      return {
        success: false,
        provider: 'stripe',
        externalStatus: 'failed',
        failureCode: error?.code || error?.type,
        failureReason: error?.message || 'Falha ao criar transfer no Stripe',
        destinationAccountId: stripeAccountId,
        idempotencyKey,
        raw: {
          type: error?.type,
          code: error?.code,
          message: error?.message,
          declineCode: error?.decline_code,
          requestId: error?.requestId,
        },
      };
    }
  }
}
