import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { StripeWebhooksService } from './stripe-webhooks.service';
import { StripeFinancialAccountsService } from './stripe-financial-accounts.service';
import { PaymentsService } from './payments.service';

describe('WebhooksController', () => {
  let controller: WebhooksController;

  const stripeWebhooksService = {
    constructEvent: jest.fn(),
  };

  const stripeFinancialAccountsService = {
    handleAccountUpdated: jest.fn(),
  };

  const paymentsService = {
    handleStripeChargeRefundedEvent: jest.fn(),
    handleStripeDisputeCreatedEvent: jest.fn(),
    handleStripeDisputeClosedEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: StripeWebhooksService, useValue: stripeWebhooksService },
        {
          provide: StripeFinancialAccountsService,
          useValue: stripeFinancialAccountsService,
        },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('handles Stripe account.updated webhooks', async () => {
    stripeWebhooksService.constructEvent.mockReturnValue({
      id: 'evt_123',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_123',
          payouts_enabled: false,
        },
      },
    });

    const result = await controller.handleStripeWebhook(
      Buffer.from('{}'),
      't=123,v1=signature',
    );

    expect(stripeWebhooksService.constructEvent).toHaveBeenCalled();
    expect(
      stripeFinancialAccountsService.handleAccountUpdated,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'account.updated',
      }),
    );
    expect(result).toEqual({ status: 'success' });
  });

  it('handles Stripe v2 account status webhooks', async () => {
    stripeWebhooksService.constructEvent.mockReturnValue({
      id: 'evt_test_123',
      type: 'v2.core.account.updated',
      related_object: {
        id: 'acct_123',
        type: 'v2.core.account',
      },
      data: {},
    });

    const result = await controller.handleStripeWebhook(
      Buffer.from('{}'),
      't=123,v1=signature',
    );

    expect(
      stripeFinancialAccountsService.handleAccountUpdated,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'v2.core.account.updated',
        related_object: expect.objectContaining({
          id: 'acct_123',
        }),
      }),
    );
    expect(result).toEqual({ status: 'success' });
  });

  it('routes Stripe dispute webhooks to PaymentsService', async () => {
    stripeWebhooksService.constructEvent.mockReturnValue({
      id: 'evt_dispute_123',
      type: 'charge.dispute.created',
      data: {
        object: {
          id: 'dp_123',
          charge: 'ch_123',
        },
      },
    });
    jest
      .spyOn((controller as any).moduleRef, 'get')
      .mockImplementation((token: unknown) => {
        if (token === PaymentsService) return paymentsService;
        return {};
      });

    const result = await controller.handleStripeWebhook(
      Buffer.from('{}'),
      't=123,v1=signature',
    );

    expect(
      paymentsService.handleStripeDisputeCreatedEvent,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'dp_123',
      }),
    );
    expect(result).toEqual({ status: 'success' });
  });
});
