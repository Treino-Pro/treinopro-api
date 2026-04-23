import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { MercadoPagoService } from './mercadopago.service';
import { StripeWebhooksService } from './stripe-webhooks.service';
import { StripeFinancialAccountsService } from './stripe-financial-accounts.service';

describe('WebhooksController', () => {
  let controller: WebhooksController;

  const stripeWebhooksService = {
    constructEvent: jest.fn(),
  };

  const stripeFinancialAccountsService = {
    handleAccountUpdated: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: WebhooksService, useValue: {} },
        { provide: MercadoPagoService, useValue: {} },
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
    expect(stripeFinancialAccountsService.handleAccountUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'account.updated',
      }),
    );
    expect(result).toEqual({ status: 'success' });
  });
});
