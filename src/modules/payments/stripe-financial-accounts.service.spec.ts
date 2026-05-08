import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StripeFinancialAccountsService } from './stripe-financial-accounts.service';
import { StripeConnectService } from './stripe-connect.service';

const mockDb = {
  query: {
    users: {
      findFirst: jest.fn(),
    },
    financialProfiles: {
      findFirst: jest.fn(),
    },
  },
  insert: jest.fn(),
  update: jest.fn(),
};

const mockStripeConnectService = {
  createRecipientAccount: jest.fn(),
  retrieveAccount: jest.fn(),
  createEmbeddedOnboardingSession: jest.fn(),
};

describe('StripeFinancialAccountsService', () => {
  let service: StripeFinancialAccountsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeFinancialAccountsService,
        { provide: 'DATABASE_CONNECTION', useValue: mockDb },
        {
          provide: StripeConnectService,
          useValue: mockStripeConnectService,
        },
      ],
    }).compile();

    service = module.get<StripeFinancialAccountsService>(
      StripeFinancialAccountsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ensureConnectedAccount', () => {
    it('creates a connected account and persists Stripe onboarding status', async () => {
      mockDb.query.users.findFirst.mockResolvedValue({
        id: 'personal-1',
        userType: 'personal',
        email: 'personal@treinopro.com',
        firstName: 'Maria',
        lastName: 'Silva',
        documentNumber: '12345678901',
      });
      mockDb.query.financialProfiles.findFirst.mockResolvedValue(null);

      const returningMock = jest.fn().mockResolvedValue([
        {
          id: 'profile-1',
          userId: 'personal-1',
          stripeAccountId: 'acct_123',
          stripeOnboardingCompleted: false,
          stripeDetailsSubmitted: false,
          stripeChargesEnabled: false,
          stripePayoutsEnabled: false,
          stripeRequirements: {
            currentlyDue: ['external_account'],
            eventuallyDue: [],
            pastDue: [],
            pendingVerification: [],
            disabledReason: null,
          },
          canReceivePayments: false,
        },
      ]);
      const valuesMock = jest.fn().mockReturnValue({ returning: returningMock });
      mockDb.insert.mockReturnValue({ values: valuesMock });

      mockStripeConnectService.createRecipientAccount.mockResolvedValue({
        id: 'acct_123',
        details_submitted: false,
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: {
                  status: 'inactive',
                },
              },
            },
          },
        },
        requirements: {
          currently_due: ['external_account'],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
          disabled_reason: null,
        },
      });

      const result = await service.ensureConnectedAccount('personal-1');

      expect(mockStripeConnectService.createRecipientAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'personal@treinopro.com',
          displayName: 'Maria Silva',
          metadata: expect.objectContaining({
            userId: 'personal-1',
            userType: 'personal',
          }),
        }),
      );
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'personal-1',
          stripeAccountId: 'acct_123',
          stripeDetailsSubmitted: false,
          stripeChargesEnabled: false,
          stripePayoutsEnabled: false,
          stripeRequirements: expect.objectContaining({
            currentlyDue: ['external_account'],
          }),
          canReceivePayments: false,
        }),
      );
      expect(result.accountId).toBe('acct_123');
      expect(result.onboardingComplete).toBe(false);
    });

    it('reuses an existing connected account and does not create another one', async () => {
      mockDb.query.users.findFirst.mockResolvedValue({
        id: 'personal-1',
        userType: 'personal',
        email: 'personal@treinopro.com',
        firstName: 'Maria',
        lastName: 'Silva',
      });
      mockDb.query.financialProfiles.findFirst.mockResolvedValue({
        id: 'profile-1',
        userId: 'personal-1',
        stripeAccountId: 'acct_existing',
      });

      const setMock = jest.fn().mockReturnThis();
      const whereMock = jest.fn().mockReturnThis();
      const returningMock = jest.fn().mockResolvedValue([
        {
          id: 'profile-1',
          userId: 'personal-1',
          stripeAccountId: 'acct_existing',
          stripeOnboardingCompleted: true,
          stripeDetailsSubmitted: true,
          stripeChargesEnabled: true,
          stripePayoutsEnabled: true,
          stripeRequirements: {
            currentlyDue: [],
            eventuallyDue: [],
            pastDue: [],
            pendingVerification: [],
            disabledReason: null,
          },
          canReceivePayments: true,
        },
      ]);
      mockDb.update.mockReturnValue({
        set: setMock,
        where: whereMock,
        returning: returningMock,
      });

      mockStripeConnectService.retrieveAccount.mockResolvedValue({
        id: 'acct_existing',
        details_submitted: true,
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: {
                  status: 'active',
                },
              },
            },
          },
        },
        requirements: {
          currently_due: [],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
          disabled_reason: null,
        },
      });

      const result = await service.ensureConnectedAccount('personal-1');

      expect(mockStripeConnectService.createRecipientAccount).not.toHaveBeenCalled();
      expect(mockStripeConnectService.retrieveAccount).toHaveBeenCalledWith(
        'acct_existing',
      );
      expect(result.onboardingComplete).toBe(true);
    });

    it('throws when the user does not exist', async () => {
      mockDb.query.users.findFirst.mockResolvedValue(null);

      await expect(service.ensureConnectedAccount('missing-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createEmbeddedOnboardingSession', () => {
    it('creates an Account Session for embedded onboarding', async () => {
      const ensureSpy = jest
        .spyOn(service, 'ensureConnectedAccount')
        .mockResolvedValue({
          accountId: 'acct_123',
          onboardingComplete: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          requirements: {
            currentlyDue: ['external_account'],
            eventuallyDue: [],
            pastDue: [],
            pendingVerification: [],
            disabledReason: null,
          },
        });

      mockStripeConnectService.createEmbeddedOnboardingSession.mockResolvedValue({
        client_secret: 'acctsess_secret_123',
        expires_at: 1_760_000_000,
      });

      const result = await service.createEmbeddedOnboardingSession('personal-1');

      expect(ensureSpy).toHaveBeenCalledWith('personal-1');
      expect(
        mockStripeConnectService.createEmbeddedOnboardingSession,
      ).toHaveBeenCalledWith({
        accountId: 'acct_123',
      });
      expect(result).toEqual({
        accountId: 'acct_123',
        clientSecret: 'acctsess_secret_123',
        expiresAt: 1_760_000_000,
      });
    });
  });

  describe('syncConnectedAccountStatus', () => {
    it('persists details_submitted, payouts_enabled and requirements from Stripe', async () => {
      mockDb.query.financialProfiles.findFirst.mockResolvedValue({
        id: 'profile-1',
        userId: 'personal-1',
        stripeAccountId: 'acct_123',
      });

      const setMock = jest.fn().mockReturnThis();
      const whereMock = jest.fn().mockReturnThis();
      const returningMock = jest.fn().mockResolvedValue([
        {
          id: 'profile-1',
          userId: 'personal-1',
          stripeAccountId: 'acct_123',
          stripeDetailsSubmitted: true,
          stripeChargesEnabled: true,
          stripePayoutsEnabled: false,
          stripeRequirements: {
            currentlyDue: ['external_account'],
            eventuallyDue: ['individual.verification.document'],
            pastDue: [],
            pendingVerification: [],
            disabledReason: 'requirements.past_due',
          },
          canReceivePayments: false,
        },
      ]);
      mockDb.update.mockReturnValue({
        set: setMock,
        where: whereMock,
        returning: returningMock,
      });

      const result = await service.syncConnectedAccountStatus({
        account: {
          id: 'acct_123',
          details_submitted: true,
          charges_enabled: true,
          payouts_enabled: false,
          requirements: {
            currently_due: ['external_account'],
            eventually_due: ['individual.verification.document'],
            past_due: [],
            pending_verification: [],
            disabled_reason: 'requirements.past_due',
          },
        },
      });

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          stripeDetailsSubmitted: true,
          stripeChargesEnabled: true,
          stripePayoutsEnabled: false,
          stripeRequirements: expect.objectContaining({
            currentlyDue: ['external_account'],
            eventuallyDue: ['individual.verification.document'],
            disabledReason: 'requirements.past_due',
          }),
          canReceivePayments: false,
        }),
      );
      expect(result?.requirements.currentlyDue).toEqual(['external_account']);
    });

    it('keeps Stripe-side verification out of user-actionable requirements', async () => {
      mockDb.query.financialProfiles.findFirst.mockResolvedValue({
        id: 'profile-1',
        userId: 'personal-1',
        stripeAccountId: 'acct_123',
      });

      const setMock = jest.fn().mockReturnThis();
      const whereMock = jest.fn().mockReturnThis();
      const returningMock = jest.fn().mockResolvedValue([
        {
          id: 'profile-1',
          userId: 'personal-1',
          stripeAccountId: 'acct_123',
          stripeOnboardingCompleted: true,
          stripeDetailsSubmitted: true,
          stripeChargesEnabled: false,
          stripePayoutsEnabled: false,
          stripeRequirements: {
            currentlyDue: [],
            eventuallyDue: [],
            pastDue: [],
            pendingVerification: ['identity.individual.political_exposure'],
            disabledReason: null,
          },
          canReceivePayments: false,
        },
      ]);
      mockDb.update.mockReturnValue({
        set: setMock,
        where: whereMock,
        returning: returningMock,
      });

      const result = await service.syncConnectedAccountStatus({
        account: {
          id: 'acct_123',
          configuration: {
            merchant: {
              capabilities: {
                card_payments: { status: 'pending' },
              },
            },
            recipient: {
              capabilities: {
                stripe_balance: {
                  stripe_transfers: { status: 'pending' },
                },
              },
            },
          },
          requirements: {
            entries: [
              {
                awaiting_action_from: 'stripe',
                description: 'identity.individual.political_exposure',
                minimum_deadline: {
                  status: 'past_due',
                },
              },
            ],
          },
        },
      });

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          stripeOnboardingCompleted: true,
          stripeDetailsSubmitted: true,
          stripePayoutsEnabled: false,
          stripeRequirements: expect.objectContaining({
            currentlyDue: [],
            pastDue: [],
            pendingVerification: ['identity.individual.political_exposure'],
          }),
          canReceivePayments: false,
          verificationStatus: 'pending',
        }),
      );
      expect(result?.requirements.pastDue).toEqual([]);
      expect(result?.requirements.pendingVerification).toEqual([
        'identity.individual.political_exposure',
      ]);
    });
  });

  describe('handleAccountUpdated', () => {
    it('syncs the profile when Stripe sends account.updated', async () => {
      const syncSpy = jest
        .spyOn(service, 'syncConnectedAccountStatus')
        .mockResolvedValue({
          accountId: 'acct_123',
          onboardingComplete: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          requirements: {
            currentlyDue: ['external_account'],
            eventuallyDue: [],
            pastDue: [],
            pendingVerification: [],
            disabledReason: null,
          },
        });

      await service.handleAccountUpdated({
        id: 'evt_123',
        type: 'account.updated',
        data: {
          object: {
            id: 'acct_123',
            details_submitted: false,
            payouts_enabled: false,
            requirements: {
              currently_due: ['external_account'],
            },
          },
        },
      } as any);

      expect(syncSpy).toHaveBeenCalledWith({
        account: expect.objectContaining({
          id: 'acct_123',
        }),
      });
    });

    it('retrieves and syncs the account when Stripe sends a v2 account event', async () => {
      const account = {
        id: 'acct_123',
        object: 'v2.core.account',
        configuration: {
          merchant: {
            capabilities: {
              card_payments: {
                status: 'active',
              },
            },
          },
          recipient: {
            capabilities: {
              stripe_balance: {
                payouts: {
                  status: 'active',
                },
                stripe_transfers: {
                  status: 'active',
                },
              },
            },
          },
        },
        requirements: {
          entries: [],
          summary: null,
        },
      };
      mockStripeConnectService.retrieveAccount.mockResolvedValue(account);
      const syncSpy = jest
        .spyOn(service, 'syncConnectedAccountStatus')
        .mockResolvedValue({
          accountId: 'acct_123',
          onboardingComplete: true,
          chargesEnabled: true,
          payoutsEnabled: true,
          detailsSubmitted: true,
          requirements: {
            currentlyDue: [],
            eventuallyDue: [],
            pastDue: [],
            pendingVerification: [],
            disabledReason: null,
          },
        });

      await service.handleAccountUpdated({
        id: 'evt_test_123',
        type: 'v2.core.account.updated',
        related_object: {
          id: 'acct_123',
          type: 'v2.core.account',
        },
        data: {},
      } as any);

      expect(mockStripeConnectService.retrieveAccount).toHaveBeenCalledWith(
        'acct_123',
      );
      expect(syncSpy).toHaveBeenCalledWith({
        account,
      });
    });
  });
});
