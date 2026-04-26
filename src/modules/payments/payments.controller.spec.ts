import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { StudentPaymentMethodsService } from './student-payment-methods.service';
import { RefundsService } from './refunds.service';
import { PaymentsService } from './payments.service';
import { FinancialProfileService } from './financial-profile.service';
import { StripeFinancialAccountsService } from './stripe-financial-accounts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

describe('PaymentsController', () => {
  let controller: PaymentsController;

  const stripeFinancialAccountsService = {
    createEmbeddedOnboardingSession: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: StudentPaymentMethodsService, useValue: {} },
        { provide: RefundsService, useValue: {} },
        { provide: PaymentsService, useValue: {} },
        { provide: FinancialProfileService, useValue: {} },
        { provide: JwtAuthGuard, useValue: { canActivate: jest.fn() } },
        { provide: JwtService, useValue: { verify: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        {
          provide: StripeFinancialAccountsService,
          useValue: stripeFinancialAccountsService,
        },
      ],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates an embedded onboarding session for the authenticated personal', async () => {
    stripeFinancialAccountsService.createEmbeddedOnboardingSession.mockResolvedValue(
      {
        accountId: 'acct_123',
        clientSecret: 'acctsess_secret_123',
        expiresAt: 1_760_000_000,
      },
    );

    const result = await controller.createStripeEmbeddedOnboardingSession({
      user: { sub: 'personal-1' },
    });

    expect(
      stripeFinancialAccountsService.createEmbeddedOnboardingSession,
    ).toHaveBeenCalledWith('personal-1');
    expect(result).toEqual({
      success: true,
      data: {
        accountId: 'acct_123',
        clientSecret: 'acctsess_secret_123',
        expiresAt: 1_760_000_000,
      },
    });
  });
});
