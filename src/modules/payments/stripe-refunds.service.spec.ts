import { BadRequestException } from '@nestjs/common';
import { StripeRefundsService } from './stripe-refunds.service';

describe('StripeRefundsService', () => {
  let service: StripeRefundsService;
  let createRefundMock: jest.Mock;

  beforeEach(() => {
    service = new StripeRefundsService();
    createRefundMock = jest.fn().mockResolvedValue({
      id: 're_123',
      status: 'succeeded',
      amount: 1000,
    });

    Object.defineProperty(service as any, 'stripe', {
      value: {
        refunds: {
          create: createRefundMock,
        },
      },
    });
  });

  it('uses payment_intent and omits charge when both identifiers are available', async () => {
    await service.createRefund({
      paymentIntentId: 'pi_123',
      chargeId: 'ch_123',
      amount: 10,
      idempotencyKey: 'stripe_refund:payment-1',
    });

    expect(createRefundMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ charge: expect.anything() }),
      { idempotencyKey: 'stripe_refund:payment-1' },
    );
    expect(createRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_123',
        amount: 1000,
      }),
      expect.any(Object),
    );
  });

  it('falls back to charge when payment_intent is missing', async () => {
    await service.createRefund({
      chargeId: 'ch_123',
      amount: 10,
    });

    expect(createRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        charge: 'ch_123',
        amount: 1000,
      }),
      undefined,
    );
  });

  it('retries with charge when the stored payment_intent no longer exists', async () => {
    createRefundMock
      .mockRejectedValueOnce({
        code: 'resource_missing',
        message: "No such payment_intent: 'pi_missing'",
      })
      .mockResolvedValueOnce({
        id: 're_456',
        status: 'succeeded',
        amount: 1000,
      });

    await service.createRefund({
      paymentIntentId: 'pi_missing',
      chargeId: 'ch_123',
      amount: 10,
      idempotencyKey: 'stripe_refund:payment-1',
    });

    expect(createRefundMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        payment_intent: 'pi_missing',
      }),
      { idempotencyKey: 'stripe_refund:payment-1' },
    );
    expect(createRefundMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        charge: 'ch_123',
      }),
      { idempotencyKey: 'stripe_refund:payment-1:charge' },
    );
  });

  it('requires a payment_intent or charge', async () => {
    await expect(service.createRefund({ amount: 10 })).rejects.toThrow(
      BadRequestException,
    );
  });
});
