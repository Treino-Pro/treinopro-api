import { IsString, IsNumber, IsEnum, IsOptional, IsUUID, IsNotEmpty, IsEmail, IsObject, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

// Enums
export enum PaymentStatus {
  PENDING = 'pending',
  AUTHORIZED = 'authorized',
  CAPTURED = 'captured',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
  DISPUTED = 'disputed',
  DISPUTE_RESOLVED = 'dispute_resolved',
}

export enum PaymentType {
  CLASS_PAYMENT = 'class_payment',
  REFUND = 'refund',
  PLATFORM_FEE = 'platform_fee',
  PERSONAL_EARNINGS = 'personal_earnings',
}

export enum DisputeStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  RESOLVED_PRO_STUDENT = 'resolved_pro_student',
  RESOLVED_PRO_PERSONAL = 'resolved_pro_personal',
  EXPIRED = 'expired',
}

// DTOs de criação
export class CreatePaymentDto {
  @IsUUID()
  @IsNotEmpty()
  classId: string;

  @IsNumber()
  @Min(0.01)
  totalAmount: number;

  @IsString()
  @IsOptional()
  description?: string;
}

export class CreatePaymentPreferenceDto {
  @IsUUID()
  @IsNotEmpty()
  classId: string;

  @IsNumber()
  @Min(0.01)
  totalAmount: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  successUrl?: string;

  @IsString()
  @IsOptional()
  failureUrl?: string;
}

// DTOs de atualização
export class UpdatePaymentDto {
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;

  @IsString()
  @IsOptional()
  mpPaymentId?: string;

  @IsString()
  @IsOptional()
  mpPreferenceId?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  platformFee?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  personalAmount?: number;

  @IsObject()
  @IsOptional()
  splitData?: any;
}

// DTOs de disputa
export class CreateDisputeDto {
  @IsUUID()
  @IsNotEmpty()
  paymentId: string;

  @IsString()
  @IsNotEmpty()
  reason: string; // 'no_show', 'cancellation', etc.

  @IsString()
  @IsOptional()
  description?: string;
}

export class SubmitEvidenceDto {
  @IsString()
  @IsNotEmpty()
  evidence: string; // Descrição das evidências

  @IsString()
  @IsOptional()
  attachments?: string; // URLs dos anexos
}

export class ResolveDisputeDto {
  @IsEnum(DisputeStatus)
  resolution: DisputeStatus;

  @IsString()
  @IsOptional()
  adminNotes?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

// DTOs de carteira
export class UpdateWalletDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  availableBalance?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  pendingBalance?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  totalEarned?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  totalWithdrawn?: number;

  @IsObject()
  @IsOptional()
  bankAccount?: any;
}

export class WithdrawRequestDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsOptional()
  description?: string;
}

// DTOs de resposta
export class PaymentResponseDto {
  id: string;
  classId: string;
  studentId: string;
  personalId: string;
  mpPaymentId?: string;
  mpPreferenceId?: string;
  totalAmount: number;
  platformFee: number;
  personalAmount: number;
  status: PaymentStatus;
  type: PaymentType;
  splitData?: any;
  
  // Informações da aula
  class?: {
    id: string;
    date: Date;
    time: string;
    location: string;
    duration: number;
  };
  
  // Informações dos usuários
  student?: {
    id: string;
    name: string;
    email: string;
  };
  
  personal?: {
    id: string;
    name: string;
    email: string;
  };
  
  createdAt: Date;
  updatedAt: Date;
  authorizedAt?: Date;
  capturedAt?: Date;
  refundedAt?: Date;
}

export class DisputeResponseDto {
  id: string;
  paymentId: string;
  reportedBy: string;
  reason: string;
  description?: string;
  status: DisputeStatus;
  studentEvidence?: string;
  personalEvidence?: string;
  adminNotes?: string;
  resolution?: string;
  resolvedBy?: string;
  resolvedAt?: Date;
  studentDisputeCount: number;
  personalDisputeCount: number;
  expiresAt: Date;
  
  // Informações do pagamento
  payment?: PaymentResponseDto;
  
  // Informações do usuário que reportou
  reportedByUser?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

export class WalletResponseDto {
  id: string;
  userId: string;
  availableBalance: number;
  pendingBalance: number;
  totalEarned: number;
  totalWithdrawn: number;
  bankAccount?: any;
  isActive: string;
  lastWithdrawalAt?: Date;
  
  // Informações do usuário
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

export class TransactionResponseDto {
  id: string;
  paymentId: string;
  userId: string;
  type: PaymentType;
  amount: number;
  description?: string;
  mpTransactionId?: string;
  mpOperationId?: string;
  status: PaymentStatus;
  metadata?: any;
  
  // Informações do usuário
  user?: {
    id: string;
    name: string;
    email: string;
  };
  
  createdAt: Date;
  processedAt?: Date;
}

// DTOs para estatísticas
export class PaymentStatsDto {
  totalPayments: number;
  totalAmount: number;
  platformEarnings: number;
  personalEarnings: number;
  pendingAmount: number;
  refundedAmount: number;
  
  // Estatísticas por status
  statusBreakdown: {
    pending: number;
    authorized: number;
    captured: number;
    refunded: number;
    cancelled: number;
    disputed: number;
  };
  
  // Estatísticas por período
  periodStats: {
    today: { count: number; amount: number };
    thisWeek: { count: number; amount: number };
    thisMonth: { count: number; amount: number };
  };
}

export class WalletStatsDto {
  totalUsers: number;
  totalAvailableBalance: number;
  totalPendingBalance: number;
  totalEarned: number;
  totalWithdrawn: number;
  
  // Estatísticas por usuário
  userBreakdown: {
    students: { count: number; totalBalance: number };
    personals: { count: number; totalBalance: number };
  };
}

// DTOs para filtros
export class PaymentFiltersDto {
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;

  @IsEnum(PaymentType)
  @IsOptional()
  type?: PaymentType;

  @IsUUID()
  @IsOptional()
  classId?: string;

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxAmount?: number;

  @Type(() => Date)
  @IsOptional()
  startDate?: Date;

  @Type(() => Date)
  @IsOptional()
  endDate?: Date;
}

export class DisputeFiltersDto {
  @IsEnum(DisputeStatus)
  @IsOptional()
  status?: DisputeStatus;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsUUID()
  @IsOptional()
  paymentId?: string;

  @IsUUID()
  @IsOptional()
  reportedBy?: string;

  @Type(() => Date)
  @IsOptional()
  startDate?: Date;

  @Type(() => Date)
  @IsOptional()
  endDate?: Date;
}

// DTOs para notificações
export class DisputeNotificationDto {
  disputeId: string;
  paymentId: string;
  type: 'student_denied' | 'personal_reported' | 'evidence_submitted' | 'dispute_resolved';
  message: string;
  actionRequired: boolean;
  deadline?: Date;
  evidenceInstructions?: string;
}

// DTOs para integração com Mercado Pago
export class MercadoPagoWebhookDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  action: string;

  @IsObject()
  @IsNotEmpty()
  data: any;
}

export class MercadoPagoSplitDto {
  @IsString()
  @IsNotEmpty()
  marketplace: string;

  @IsString()
  @IsNotEmpty()
  marketplace_fee: string;

  @IsString()
  @IsNotEmpty()
  application_fee: string;

  @IsString()
  @IsNotEmpty()
  amount: string;
}
