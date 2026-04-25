import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { FinancialProfileService } from './financial-profile.service';
import { PaymentsService } from './payments.service';
import { StripeFinancialAccountsService } from './stripe-financial-accounts.service';
import { PaymentMethod } from './dto/financial-profile.dto';

const mockDb = {
  query: {
    financialProfiles: {
      findFirst: jest.fn(),
    },
    userWallets: {
      findFirst: jest.fn(),
    },
    withdrawalRequests: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  },
  transaction: jest.fn(async (callback: any) => callback(mockDb)),
  update: jest.fn(),
  insert: jest.fn(),
};

const mockPaymentsService = {
  processWithdrawalPayout: jest.fn(),
};

const mockStripeFinancialAccountsService = {
  isStripePayoutReady: jest.fn(),
};

describe('FinancialProfileService', () => {
  let service: FinancialProfileService;

  beforeEach(async () => {
    mockDb.transaction.mockImplementation(async (callback: any) =>
      callback(mockDb),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialProfileService,
        { provide: 'DATABASE_CONNECTION', useValue: mockDb },
        { provide: PaymentsService, useValue: mockPaymentsService },
        {
          provide: StripeFinancialAccountsService,
          useValue: mockStripeFinancialAccountsService,
        },
      ],
    }).compile();

    service = module.get<FinancialProfileService>(FinancialProfileService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requestWithdrawal', () => {
    it('blocks withdrawals while Stripe onboarding is incomplete', async () => {
      mockDb.query.financialProfiles.findFirst.mockResolvedValue({
        id: 'profile-1',
        userId: 'personal-1',
        preferredMethod: PaymentMethod.BANK_TRANSFER,
        isComplete: true,
        canReceivePayments: true,
        stripeAccountId: 'acct_123',
        stripeDetailsSubmitted: false,
        stripePayoutsEnabled: false,
        stripeRequirements: {
          currentlyDue: ['external_account'],
        },
      });
      mockStripeFinancialAccountsService.isStripePayoutReady.mockReturnValue(
        false,
      );

      await expect(
        service.requestWithdrawal('personal-1', {
          amount: '100.00',
          method: PaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockDb.query.userWallets.findFirst).not.toHaveBeenCalled();
      expect(
        mockPaymentsService.processWithdrawalPayout,
      ).not.toHaveBeenCalled();
    });

    it('creates a Stripe Connect withdrawal, reserves wallet balance and auto processes it', async () => {
      const profile = {
        id: 'profile-1',
        userId: 'personal-1',
        preferredMethod: PaymentMethod.BANK_TRANSFER,
        isComplete: true,
        canReceivePayments: true,
        stripeAccountId: 'acct_123',
        stripeDetailsSubmitted: true,
        stripePayoutsEnabled: true,
        stripeRequirements: {
          currentlyDue: [],
          pastDue: [],
        },
      };
      const wallet = {
        id: 'wallet-1',
        userId: 'personal-1',
        availableBalance: '150.00',
        pendingBalance: '0.00',
      };
      const withdrawal = {
        id: 'withdrawal-1',
        userId: 'personal-1',
        walletId: 'wallet-1',
        amount: '100.00',
        fee: '0.00',
        netAmount: '100.00',
        method: 'stripe_connect',
        urgency: 'normal',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.query.financialProfiles.findFirst.mockResolvedValue(profile);
      mockStripeFinancialAccountsService.isStripePayoutReady.mockReturnValue(
        true,
      );
      mockDb.query.withdrawalRequests.findFirst.mockResolvedValue(null);
      mockDb.query.userWallets.findFirst.mockResolvedValue(wallet);

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([
          {
            ...wallet,
            availableBalance: '50.00',
            pendingBalance: '100.00',
          },
        ]),
      });

      const withdrawalInsertValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([withdrawal]),
      });
      const historyInsertValues = jest.fn().mockResolvedValue(undefined);
      mockDb.insert
        .mockReturnValueOnce({ values: withdrawalInsertValues })
        .mockReturnValueOnce({ values: historyInsertValues });

      mockPaymentsService.processWithdrawalPayout.mockResolvedValue({
        success: true,
        withdrawal: {
          ...withdrawal,
          status: 'completed',
          transactionId: 'tr_123',
        },
      });

      const result = await service.requestWithdrawal('personal-1', {
        amount: '100.00',
        method: PaymentMethod.BANK_TRANSFER,
      });

      expect(withdrawalInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: '100.00',
          fee: '0.00',
          netAmount: '100.00',
          method: 'stripe_connect',
          transferData: expect.objectContaining({
            provider: 'stripe',
            requestedMethod: PaymentMethod.BANK_TRANSFER,
            stripeAccount: expect.objectContaining({
              accountId: 'acct_123',
            }),
          }),
        }),
      );
      expect(mockPaymentsService.processWithdrawalPayout).toHaveBeenCalledWith(
        'withdrawal-1',
        expect.objectContaining({
          transferMethodOverride: 'stripe_connect',
          initiatedBy: 'system:auto_withdrawal',
          keepPendingOnFailure: true,
        }),
      );
      expect(result.status).toBe('completed');
      expect((result as any).autoProcessed).toBe(true);
    });

    it('returns an open withdrawal idempotently instead of reserving balance again', async () => {
      const openWithdrawal = {
        id: 'withdrawal-open',
        userId: 'personal-1',
        amount: '90.00',
        fee: '0.00',
        netAmount: '90.00',
        method: 'stripe_connect',
        urgency: 'normal',
        status: 'processing',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.query.financialProfiles.findFirst.mockResolvedValue({
        id: 'profile-1',
        userId: 'personal-1',
        preferredMethod: PaymentMethod.BANK_TRANSFER,
        isComplete: true,
        canReceivePayments: true,
        stripeAccountId: 'acct_123',
        stripeDetailsSubmitted: true,
        stripePayoutsEnabled: true,
        stripeRequirements: {},
      });
      mockStripeFinancialAccountsService.isStripePayoutReady.mockReturnValue(
        true,
      );
      mockDb.query.withdrawalRequests.findFirst.mockResolvedValue(
        openWithdrawal,
      );

      const result = await service.requestWithdrawal('personal-1', {
        amount: '90.00',
        method: PaymentMethod.BANK_TRANSFER,
      });

      expect(result.id).toBe('withdrawal-open');
      expect((result as any).idempotent).toBe(true);
      expect(mockDb.query.userWallets.findFirst).not.toHaveBeenCalled();
      expect(
        mockPaymentsService.processWithdrawalPayout,
      ).not.toHaveBeenCalled();
    });
  });
});
