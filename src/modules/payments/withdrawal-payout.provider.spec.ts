import { StripeWithdrawalPayoutProvider } from './withdrawal-payout.provider';
import { StripeTransfersService } from './stripe-transfers.service';

describe('StripeWithdrawalPayoutProvider', () => {
  it('creates a Stripe Connect transfer with withdrawal idempotency', async () => {
    const stripeTransfersService = {
      createTransfer: jest.fn().mockResolvedValue({
        id: 'tr_123',
        balance_transaction: 'txn_123',
      }),
    } as unknown as StripeTransfersService;
    const provider = new StripeWithdrawalPayoutProvider(stripeTransfersService);

    const result = await provider.executePayout({
      personalId: 'personal-1',
      amount: 100,
      description: 'Saque TreinoPro',
      transferMethod: 'stripe_connect',
      personalData: {
        stripeAccountId: 'acct_123',
      },
      context: {
        withdrawalId: 'withdrawal-1',
        initiatedBy: 'system:auto_withdrawal',
        idempotencyKey: 'stripe_withdrawal:withdrawal-1:personal-1:100.00',
        sourceTransactionId: 'ch_123',
      },
    });

    expect(stripeTransfersService.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 100,
        destinationAccountId: 'acct_123',
        idempotencyKey: 'stripe_withdrawal:withdrawal-1:personal-1:100.00',
        sourceTransactionId: 'ch_123',
        transferGroup: undefined,
        metadata: expect.objectContaining({
          type: 'manual_withdrawal',
          withdrawalId: 'withdrawal-1',
          personalId: 'personal-1',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        provider: 'stripe',
        transferId: 'tr_123',
        balanceTransactionId: 'txn_123',
        destinationAccountId: 'acct_123',
        idempotencyKey: 'stripe_withdrawal:withdrawal-1:personal-1:100.00',
      }),
    );
  });

  it('fails clearly when the connected account is missing', async () => {
    const stripeTransfersService = {
      createTransfer: jest.fn(),
    } as unknown as StripeTransfersService;
    const provider = new StripeWithdrawalPayoutProvider(stripeTransfersService);

    const result = await provider.executePayout({
      personalId: 'personal-1',
      amount: 100,
      description: 'Saque TreinoPro',
      transferMethod: 'stripe_connect',
      personalData: {},
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        provider: 'stripe',
        failureCode: 'missing_stripe_account',
      }),
    );
    expect(stripeTransfersService.createTransfer).not.toHaveBeenCalled();
  });
});
