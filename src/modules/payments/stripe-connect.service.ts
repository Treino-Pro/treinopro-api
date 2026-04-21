import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

type StripePrimitive = string | number | boolean | null | undefined;
type StripePayload =
  | StripePrimitive
  | StripePayload[]
  | { [key: string]: StripePayload };

interface CreateRecipientAccountInput {
  email: string;
  displayName?: string;
  country?: string;
  metadata?: Record<string, string>;
}

interface CreateRecipientOnboardingLinkInput {
  accountId: string;
  refreshUrl?: string;
  returnUrl?: string;
}

interface CreateEscrowPaymentIntentInput {
  amount: number;
  customerId?: string;
  paymentMethodId?: string;
  description?: string;
  confirm?: boolean;
  savePaymentMethod?: boolean;
  metadata?: Record<string, string>;
  transferGroup?: string;
}

interface CreateTransferInput {
  amount: number;
  destinationAccountId: string;
  sourceTransaction?: string;
  transferGroup?: string;
  description?: string;
  metadata?: Record<string, string>;
}

interface CreateRefundInput {
  paymentIntentId: string;
  amount?: number;
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  metadata?: Record<string, string>;
}

@Injectable()
export class StripeConnectService {
  private readonly logger = new Logger(StripeConnectService.name);
  private readonly apiBaseUrl =
    process.env.STRIPE_API_BASE_URL || 'https://api.stripe.com';
  private readonly secretKey = process.env.STRIPE_SECRET_KEY || '';
  private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  private readonly apiVersion =
    process.env.STRIPE_API_VERSION || '2026-02-25.clover';
  private readonly connectApiVersion =
    process.env.STRIPE_CONNECT_API_VERSION || '2026-03-25.preview';
  private readonly defaultCurrency =
    process.env.STRIPE_DEFAULT_CURRENCY || 'brl';

  isConfigured(): boolean {
    return this.secretKey.trim().length > 0;
  }

  getDefaultCurrency(): string {
    return this.defaultCurrency;
  }

  toMinorUnits(amount: number): number {
    return Math.round(amount * 100);
  }

  async createRecipientAccount(input: CreateRecipientAccountInput): Promise<any> {
    this.assertConfigured();

    const payload = {
      contact_email: input.email,
      display_name: input.displayName,
      defaults: {
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
      },
      dashboard: 'express',
      identity: {
        country: (input.country || 'BR').toLowerCase(),
      },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: {
                requested: true,
              },
            },
          },
        },
      },
      metadata: input.metadata,
      include: ['configuration.recipient', 'identity', 'requirements'],
    };

    return this.requestJson('POST', '/v2/core/accounts', payload, {
      'Stripe-Version': this.connectApiVersion,
    });
  }

  async retrieveAccount(accountId: string): Promise<any> {
    this.assertConfigured();

    const include = encodeURIComponent('configuration.recipient');
    const requirements = encodeURIComponent('requirements');
    return this.requestJson(
      'GET',
      `/v2/core/accounts/${accountId}?include[]=${include}&include[]=${requirements}`,
      undefined,
      {
        'Stripe-Version': this.connectApiVersion,
      },
    );
  }

  async createRecipientOnboardingLink(
    input: CreateRecipientOnboardingLinkInput,
  ): Promise<any> {
    this.assertConfigured();

    const returnUrl =
      input.returnUrl ||
      process.env.STRIPE_CONNECT_RETURN_URL ||
      process.env.FRONTEND_URL ||
      'https://app.treinopro.com';
    const refreshUrl =
      input.refreshUrl ||
      process.env.STRIPE_CONNECT_REFRESH_URL ||
      process.env.FRONTEND_URL ||
      'https://app.treinopro.com';

    return this.requestJson(
      'POST',
      '/v2/core/account_links',
      {
        account: input.accountId,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            configurations: ['recipient'],
            refresh_url: refreshUrl,
            return_url: returnUrl,
          },
        },
      },
      {
        'Stripe-Version': this.connectApiVersion,
      },
    );
  }

  async createEscrowPaymentIntent(
    input: CreateEscrowPaymentIntentInput,
  ): Promise<any> {
    this.assertConfigured();

    const payload: Record<string, StripePayload> = {
      amount: this.toMinorUnits(input.amount),
      currency: this.defaultCurrency,
      confirm: input.confirm ?? false,
      capture_method: 'automatic',
      automatic_payment_methods: {
        enabled: true,
      },
      description: input.description,
      customer: input.customerId,
      payment_method: input.paymentMethodId,
      transfer_group: input.transferGroup,
      metadata: input.metadata,
    };

    if (input.savePaymentMethod) {
      payload.setup_future_usage = 'off_session';
    }

    return this.requestForm('POST', '/v1/payment_intents', payload);
  }

  async retrievePaymentIntent(paymentIntentId: string): Promise<any> {
    this.assertConfigured();
    return this.requestJson('GET', `/v1/payment_intents/${paymentIntentId}`);
  }

  async capturePaymentIntent(
    paymentIntentId: string,
    amountToCapture?: number,
  ): Promise<any> {
    this.assertConfigured();

    const payload: Record<string, StripePayload> = {};
    if (typeof amountToCapture === 'number') {
      payload.amount_to_capture = this.toMinorUnits(amountToCapture);
    }

    return this.requestForm(
      'POST',
      `/v1/payment_intents/${paymentIntentId}/capture`,
      payload,
    );
  }

  async createTransfer(input: CreateTransferInput): Promise<any> {
    this.assertConfigured();

    return this.requestForm('POST', '/v1/transfers', {
      amount: this.toMinorUnits(input.amount),
      currency: this.defaultCurrency,
      destination: input.destinationAccountId,
      source_transaction: input.sourceTransaction,
      transfer_group: input.transferGroup,
      description: input.description,
      metadata: input.metadata,
    });
  }

  async createRefund(input: CreateRefundInput): Promise<any> {
    this.assertConfigured();

    return this.requestForm('POST', '/v1/refunds', {
      payment_intent: input.paymentIntentId,
      amount:
        typeof input.amount === 'number'
          ? this.toMinorUnits(input.amount)
          : undefined,
      reason: input.reason,
      metadata: input.metadata,
    });
  }

  verifyWebhookSignature(rawBody: string, signatureHeader?: string): boolean {
    if (!this.webhookSecret || !signatureHeader) {
      return false;
    }

    const pairs = signatureHeader.split(',').map((entry) => entry.trim());
    const timestamp = pairs
      .find((entry) => entry.startsWith('t='))
      ?.slice(2)
      ?.trim();
    const signature = pairs
      .find((entry) => entry.startsWith('v1='))
      ?.slice(3)
      ?.trim();

    if (!timestamp || !signature) {
      return false;
    }

    const payload = `${timestamp}.${rawBody}`;
    const expected = createHmac('sha256', this.webhookSecret)
      .update(payload, 'utf8')
      .digest('hex');

    try {
      return timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(signature, 'hex'),
      );
    } catch {
      return false;
    }
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'Stripe não está configurado corretamente',
      );
    }
  }

  private async requestJson(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, StripePayload>,
    extraHeaders?: Record<string, string>,
  ): Promise<any> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
        'Stripe-Version': this.apiVersion,
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    return this.parseResponse(response, path);
  }

  private async requestForm(
    method: 'GET' | 'POST',
    path: string,
    payload?: Record<string, StripePayload>,
    extraHeaders?: Record<string, string>,
  ): Promise<any> {
    const body = new URLSearchParams();

    if (payload) {
      this.appendFormFields(body, payload);
    }

    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': this.apiVersion,
        ...extraHeaders,
      },
      body: method === 'GET' ? undefined : body.toString(),
    });

    return this.parseResponse(response, path);
  }

  private appendFormFields(
    form: URLSearchParams,
    payload: Record<string, StripePayload>,
    prefix?: string,
  ): void {
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) {
        continue;
      }

      const formKey = prefix ? `${prefix}[${key}]` : key;

      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (item === undefined || item === null) {
            return;
          }
          if (typeof item === 'object') {
            this.appendFormFields(form, item as Record<string, StripePayload>, `${formKey}[${index}]`);
            return;
          }
          form.append(`${formKey}[${index}]`, String(item));
        });
        continue;
      }

      if (typeof value === 'object') {
        this.appendFormFields(form, value as Record<string, StripePayload>, formKey);
        continue;
      }

      form.append(formKey, String(value));
    }
  }

  private async parseResponse(response: Response, path: string): Promise<any> {
    const text = await response.text();
    const payload = text ? this.safeJsonParse(text) : {};

    if (response.ok) {
      return payload;
    }

    const message =
      payload?.error?.message ||
      payload?.message ||
      `Stripe respondeu com status ${response.status}`;

    this.logger.error(`[STRIPE] ${path} -> ${response.status}: ${message}`);

    if (response.status >= 400 && response.status < 500) {
      throw new BadRequestException(message);
    }

    throw new BadGatewayException(message);
  }

  private safeJsonParse(value: string): any {
    try {
      return JSON.parse(value);
    } catch {
      return { raw: value };
    }
  }
}
