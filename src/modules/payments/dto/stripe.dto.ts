import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PaymentProvider {
  STRIPE = 'stripe',
}

export enum PaymentProcessingModel {
  SEPARATE_CHARGES_AND_TRANSFERS = 'separate_charges_and_transfers',
}

export enum StripeConnectedAccountMode {
  RECIPIENT = 'recipient',
}

export enum StripeWebhookEventType {
  PAYMENT_INTENT_SUCCEEDED = 'payment_intent.succeeded',
  PAYMENT_INTENT_PAYMENT_FAILED = 'payment_intent.payment_failed',
  PAYMENT_INTENT_CANCELED = 'payment_intent.canceled',
  CHARGE_REFUNDED = 'charge.refunded',
  CHARGE_DISPUTE_CREATED = 'charge.dispute.created',
  CHARGE_DISPUTE_CLOSED = 'charge.dispute.closed',
}

export enum StripeRefundReason {
  DUPLICATE = 'duplicate',
  FRAUDULENT = 'fraudulent',
  REQUESTED_BY_CUSTOMER = 'requested_by_customer',
}

export class CreateStripePaymentIntentDto {
  @ApiProperty({
    description: 'ID da aula ou proposta vinculada ao pagamento',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  referenceId: string;

  @ApiProperty({
    description: 'Valor bruto do pagamento em reais',
    example: 80,
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({
    description: 'Moeda do pagamento',
    example: 'brl',
    default: 'brl',
  })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({
    description: 'ID do customer Stripe',
    example: 'cus_123',
  })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'ID do payment method Stripe',
    example: 'pm_123',
  })
  @IsString()
  @IsOptional()
  paymentMethodId?: string;

  @ApiPropertyOptional({
    description: 'Descrição exibida no pagamento',
    example: 'Aula de personal training',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Indica se o Stripe deve confirmar o pagamento imediatamente',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  confirm?: boolean;

  @ApiPropertyOptional({
    description:
      'Indica se o método de pagamento deve ser reutilizado no futuro',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  savePaymentMethod?: boolean;

  @ApiPropertyOptional({
    description:
      'Grupo de transferência usado para associar cobrança e repasse',
    example: 'proposal_123',
  })
  @IsString()
  @IsOptional()
  transferGroup?: string;

  @ApiPropertyOptional({
    description: 'Metadados do pagamento',
    example: {
      proposalId: '123e4567-e89b-12d3-a456-426614174000',
      paymentProvider: 'stripe',
    },
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, string>;
}

export class StripePaymentIntentResponseDto {
  @ApiProperty({ example: 'pi_123' })
  paymentIntentId: string;

  @ApiProperty({ example: 'pi_123_secret_abc' })
  clientSecret: string;

  @ApiProperty({ enum: PaymentProvider, example: PaymentProvider.STRIPE })
  provider: PaymentProvider;

  @ApiProperty({
    enum: PaymentProcessingModel,
    example: PaymentProcessingModel.SEPARATE_CHARGES_AND_TRANSFERS,
  })
  processingModel: PaymentProcessingModel;

  @ApiProperty({ example: 'requires_payment_method' })
  status: string;
}

export class CreateStripeConnectedAccountDto {
  @ApiProperty({
    description: 'E-mail do personal para criar a conta conectada',
    example: 'personal@treinopro.com',
  })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({
    description: 'Nome exibido na conta conectada',
    example: 'João Personal',
  })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({
    description: 'País da conta conectada',
    example: 'BR',
    default: 'BR',
  })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({
    description: 'Metadados da conta conectada',
    example: {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      role: 'personal',
    },
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, string>;
}

export class StripeConnectedAccountResponseDto {
  @ApiProperty({ example: 'acct_123' })
  accountId: string;

  @ApiProperty({
    enum: StripeConnectedAccountMode,
    example: StripeConnectedAccountMode.RECIPIENT,
  })
  mode: StripeConnectedAccountMode;

  @ApiPropertyOptional({ example: false })
  onboardingCompleted?: boolean;
}

export class CreateStripeAccountOnboardingLinkDto {
  @ApiProperty({ example: 'acct_123' })
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @ApiPropertyOptional({
    description: 'URL de retorno após o onboarding',
    example: 'https://app.treinopro.com/payments/stripe/return',
  })
  @IsUrl()
  @IsOptional()
  returnUrl?: string;

  @ApiPropertyOptional({
    description: 'URL de refresh do onboarding',
    example: 'https://app.treinopro.com/payments/stripe/refresh',
  })
  @IsUrl()
  @IsOptional()
  refreshUrl?: string;
}

export class StripeAccountOnboardingLinkResponseDto {
  @ApiProperty({ example: 'https://connect.stripe.com/setup/s/abc' })
  url: string;

  @ApiPropertyOptional({ example: 1740000000 })
  expiresAt?: number;
}

export class CreateStripeTransferDto {
  @ApiProperty({ example: 'acct_123' })
  @IsString()
  @IsNotEmpty()
  destinationAccountId: string;

  @ApiProperty({
    description: 'Valor do repasse em reais',
    example: 72,
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({
    description: 'Grupo de transferência para ligar repasse ao pagamento',
    example: 'proposal_123',
  })
  @IsString()
  @IsOptional()
  transferGroup?: string;

  @ApiPropertyOptional({
    description: 'Charge usada como origem contábil do repasse',
    example: 'ch_123',
  })
  @IsString()
  @IsOptional()
  sourceTransaction?: string;

  @ApiPropertyOptional({
    description: 'Descrição do repasse',
    example: 'Repasse da aula concluída',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Metadados do repasse',
    example: { classId: '123e4567-e89b-12d3-a456-426614174000' },
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, string>;
}

export class StripeTransferResponseDto {
  @ApiProperty({ example: 'tr_123' })
  transferId: string;

  @ApiProperty({ example: 'paid' })
  status: string;
}

export class CreateStripeRefundDto {
  @ApiPropertyOptional({
    description: 'ID do PaymentIntent Stripe',
    example: 'pi_123',
  })
  @IsString()
  @IsOptional()
  paymentIntentId?: string;

  @ApiPropertyOptional({
    description: 'ID da charge Stripe',
    example: 'ch_123',
  })
  @IsString()
  @IsOptional()
  chargeId?: string;

  @ApiPropertyOptional({
    description: 'Valor do reembolso em reais',
    example: 80,
  })
  @IsNumber()
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({
    enum: StripeRefundReason,
    example: StripeRefundReason.REQUESTED_BY_CUSTOMER,
  })
  @IsEnum(StripeRefundReason)
  @IsOptional()
  reason?: StripeRefundReason;

  @ApiPropertyOptional({
    description: 'Se deve reverter o transfer relacionado',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  reverseTransfer?: boolean;

  @ApiPropertyOptional({
    description: 'Se deve reembolsar a application fee também',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  refundApplicationFee?: boolean;

  @ApiPropertyOptional({
    description: 'Metadados do reembolso',
    example: { proposalId: '123e4567-e89b-12d3-a456-426614174000' },
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, string>;
}

export class StripeWebhookEventDto {
  @ApiProperty({ example: 'evt_123' })
  id: string;

  @ApiProperty({
    enum: StripeWebhookEventType,
    example: StripeWebhookEventType.PAYMENT_INTENT_SUCCEEDED,
  })
  type: StripeWebhookEventType;

  @ApiPropertyOptional({
    description: 'Objeto principal do evento recebido do Stripe',
  })
  data?: {
    object?: Record<string, any>;
  };
}
