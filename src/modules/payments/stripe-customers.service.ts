import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';

interface CreateStripeCustomerInput {
  email?: string;
  name?: string;
  phone?: string;
  metadata?: Record<string, string>;
}

interface UpdateStripeCustomerInput {
  customerId: string;
  email?: string;
  name?: string;
  phone?: string;
  metadata?: Record<string, string>;
}

interface CreateStripeSetupIntentInput {
  customerId: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class StripeCustomersService {
  private readonly secretKey = process.env.STRIPE_SECRET_KEY || '';
  private readonly apiVersion =
    (process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion) ||
    '2026-02-25.clover';

  private readonly stripe =
    this.secretKey.trim().length > 0
      ? new Stripe(this.secretKey, {
          apiVersion: this.apiVersion,
        })
      : null;

  isConfigured(): boolean {
    return this.stripe !== null;
  }

  async createCustomer(
    input: CreateStripeCustomerInput,
  ): Promise<Stripe.Customer> {
    return this.assertConfigured().customers.create({
      email: input.email,
      name: input.name,
      phone: input.phone,
      metadata: input.metadata,
    });
  }

  async retrieveCustomer(customerId: string): Promise<Stripe.Customer> {
    const customer =
      await this.assertConfigured().customers.retrieve(customerId);

    if ('deleted' in customer && customer.deleted) {
      throw new BadRequestException('Cliente Stripe removido');
    }

    return customer as Stripe.Customer;
  }

  async updateCustomer(
    input: UpdateStripeCustomerInput,
  ): Promise<Stripe.Customer> {
    return this.assertConfigured().customers.update(input.customerId, {
      email: input.email,
      name: input.name,
      phone: input.phone,
      metadata: input.metadata,
    });
  }

  async createEphemeralKey(customerId: string): Promise<Stripe.EphemeralKey> {
    return this.assertConfigured().ephemeralKeys.create(
      {
        customer: customerId,
      },
      {
        apiVersion: this.apiVersion,
      },
    );
  }

  async createSetupIntent(
    input: CreateStripeSetupIntentInput,
  ): Promise<Stripe.SetupIntent> {
    return this.assertConfigured().setupIntents.create({
      customer: input.customerId,
      usage: 'off_session',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: input.metadata,
    });
  }

  async retrieveSetupIntent(
    setupIntentId: string,
  ): Promise<Stripe.SetupIntent> {
    return this.assertConfigured().setupIntents.retrieve(setupIntentId);
  }

  async retrievePaymentMethod(
    paymentMethodId: string,
  ): Promise<Stripe.PaymentMethod> {
    return this.assertConfigured().paymentMethods.retrieve(paymentMethodId);
  }

  async listPaymentMethods(
    customerId: string,
    type: Stripe.PaymentMethodListParams.Type = 'card',
  ): Promise<Stripe.ApiList<Stripe.PaymentMethod>> {
    return this.assertConfigured().paymentMethods.list({
      customer: customerId,
      type,
    });
  }

  async attachPaymentMethod(
    customerId: string,
    paymentMethodId: string,
  ): Promise<Stripe.PaymentMethod> {
    return this.assertConfigured().paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  }

  async detachPaymentMethod(
    paymentMethodId: string,
  ): Promise<Stripe.PaymentMethod> {
    return this.assertConfigured().paymentMethods.detach(paymentMethodId);
  }

  private assertConfigured(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException('Stripe não está configurado corretamente');
    }

    return this.stripe;
  }
}
