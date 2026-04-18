import { Injectable } from '@nestjs/common';
import { MercadoPagoService } from './mercadopago.service';

export const WITHDRAWAL_PAYOUT_PROVIDER = 'WITHDRAWAL_PAYOUT_PROVIDER';

export type WithdrawalTransferMethod =
  | 'pix'
  | 'bank_transfer'
  | 'mercadopago_balance';

export interface WithdrawalPayoutBankAccount {
  bank: string;
  agency: string;
  account: string;
  accountType: string;
}

export interface WithdrawalPayoutPersonalData {
  pixKey?: string;
  bankAccount?: WithdrawalPayoutBankAccount;
  mpAccountId?: string;
  accessToken?: string;
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
  };
}

export interface WithdrawalPayoutResult {
  success: boolean;
  provider: string;
  transferId?: string;
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
export class MercadoPagoWithdrawalPayoutProvider
  implements WithdrawalPayoutProvider
{
  constructor(private readonly mercadoPagoService: MercadoPagoService) {}

  async executePayout(
    request: WithdrawalPayoutRequest,
  ): Promise<WithdrawalPayoutResult> {
    const transferResult = await this.mercadoPagoService.transferToPersonal({
      personalId: request.personalId,
      amount: request.amount,
      description: request.description,
      transferMethod: request.transferMethod,
      personalData: request.personalData,
    });

    if (!transferResult.success) {
      return {
        success: false,
        provider: 'mercadopago',
        externalStatus: 'failed',
        failureReason: transferResult.error,
        raw: transferResult,
      };
    }

    return {
      success: true,
      provider: 'mercadopago',
      transferId: transferResult.transferId,
      externalStatus: 'completed',
      raw: transferResult,
    };
  }
}
