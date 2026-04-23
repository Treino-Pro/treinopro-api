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
  },
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
      expect(mockPaymentsService.processWithdrawalPayout).not.toHaveBeenCalled();
    });
  });
});
