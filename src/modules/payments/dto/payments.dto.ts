import { IsString, IsNumber, IsEnum, IsOptional, IsUUID, IsNotEmpty, IsEmail, IsObject, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  @ApiProperty({
    description: 'ID da aula para pagamento',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({
    description: 'Valor total do pagamento em reais',
    example: 80.00,
    minimum: 0.01
  })
  @IsNumber()
  @Min(0.01)
  totalAmount: number;

  @ApiPropertyOptional({
    description: 'Descrição do pagamento',
    example: 'Pagamento da aula de musculação'
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'URL de sucesso do pagamento',
    example: 'https://app.treinopro.com/payment/success'
  })
  @IsString()
  @IsOptional()
  successUrl?: string;

  @ApiPropertyOptional({
    description: 'URL de falha do pagamento',
    example: 'https://app.treinopro.com/payment/failure'
  })
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
  @ApiProperty({
    description: 'ID do pagamento em disputa',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  @IsNotEmpty()
  paymentId: string;

  @ApiProperty({
    description: 'Motivo da disputa',
    example: 'no_show',
    enum: ['no_show', 'cancellation', 'service_not_provided', 'other']
  })
  @IsString()
  @IsNotEmpty()
  reason: string; // 'no_show', 'cancellation', etc.

  @ApiPropertyOptional({
    description: 'Descrição detalhada da disputa',
    example: 'O personal trainer não compareceu na aula agendada'
  })
  @IsString()
  @IsOptional()
  description?: string;
}

export class SubmitEvidenceDto {
  @ApiProperty({
    description: 'Descrição das evidências',
    example: 'Foto do local de treino vazio no horário agendado'
  })
  @IsString()
  @IsNotEmpty()
  evidence: string; // Descrição das evidências

  @ApiPropertyOptional({
    description: 'URLs dos anexos (fotos, documentos)',
    example: 'https://example.com/evidence1.jpg,https://example.com/evidence2.jpg'
  })
  @IsString()
  @IsOptional()
  attachments?: string; // URLs dos anexos
}

export class ResolveDisputeDto {
  @ApiProperty({
    description: 'Resolução da disputa',
    enum: DisputeStatus,
    example: DisputeStatus.RESOLVED_PRO_STUDENT
  })
  @IsEnum(DisputeStatus)
  resolution: DisputeStatus;

  @ApiPropertyOptional({
    description: 'Notas do administrador sobre a resolução',
    example: 'Disputa resolvida a favor do aluno após análise das evidências'
  })
  @IsString()
  @IsOptional()
  adminNotes?: string;

  @ApiPropertyOptional({
    description: 'Motivo da resolução',
    example: 'Evidências insuficientes do personal trainer'
  })
  @IsString()
  @IsOptional()
  reason?: string;
}

// DTOs de carteira
export class UpdateWalletDto {
  @ApiPropertyOptional({
    description: 'Saldo disponível para saque',
    example: 150.00,
    minimum: 0
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  availableBalance?: number;

  @ApiPropertyOptional({
    description: 'Saldo pendente de confirmação',
    example: 50.00,
    minimum: 0
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  pendingBalance?: number;

  @ApiPropertyOptional({
    description: 'Total ganho pelo usuário',
    example: 500.00,
    minimum: 0
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  totalEarned?: number;

  @ApiPropertyOptional({
    description: 'Total sacado pelo usuário',
    example: 350.00,
    minimum: 0
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  totalWithdrawn?: number;

  @ApiPropertyOptional({
    description: 'Dados da conta bancária',
    example: { bank: '001', agency: '1234', account: '56789-0' }
  })
  @IsObject()
  @IsOptional()
  bankAccount?: any;
}

export class WithdrawRequestDto {
  @ApiProperty({
    description: 'Valor do saque',
    example: 100.00,
    minimum: 0.01
  })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({
    description: 'Descrição do saque',
    example: 'Saque mensal'
  })
  @IsString()
  @IsOptional()
  description?: string;
}

// DTOs de resposta
export class PaymentResponseDto {
  @ApiProperty({
    description: 'ID do pagamento',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  id: string;

  @ApiProperty({
    description: 'ID da aula',
    example: '123e4567-e89b-12d3-a456-426614174001'
  })
  classId: string;

  @ApiProperty({
    description: 'ID do aluno',
    example: '123e4567-e89b-12d3-a456-426614174002'
  })
  studentId: string;

  @ApiProperty({
    description: 'ID do personal trainer',
    example: '123e4567-e89b-12d3-a456-426614174003'
  })
  personalId: string;

  @ApiPropertyOptional({
    description: 'ID do pagamento no Mercado Pago',
    example: '1234567890'
  })
  mpPaymentId?: string;

  @ApiPropertyOptional({
    description: 'ID da preferência no Mercado Pago',
    example: '1234567890'
  })
  mpPreferenceId?: string;

  @ApiProperty({
    description: 'Valor total do pagamento',
    example: 80.00
  })
  totalAmount: number;

  @ApiProperty({
    description: 'Taxa da plataforma (10%)',
    example: 8.00
  })
  platformFee: number;

  @ApiProperty({
    description: 'Valor do personal trainer (90%)',
    example: 72.00
  })
  personalAmount: number;

  @ApiProperty({
    description: 'Status do pagamento',
    enum: PaymentStatus,
    example: PaymentStatus.AUTHORIZED
  })
  status: PaymentStatus;

  @ApiProperty({
    description: 'Tipo do pagamento',
    enum: PaymentType,
    example: PaymentType.CLASS_PAYMENT
  })
  type: PaymentType;

  @ApiPropertyOptional({
    description: 'Dados do split de pagamento',
    example: { marketplace: '1234567890', marketplace_fee: '8.00', application_fee: '0.00', amount: '72.00' }
  })
  splitData?: any;
  
  // Informações da aula
  @ApiPropertyOptional({
    description: 'Informações da aula',
    type: 'object',
    properties: {
      id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174001' },
      date: { type: 'string', format: 'date-time', example: '2024-01-15T14:00:00.000Z' },
      time: { type: 'string', example: '14:00' },
      location: { type: 'string', example: 'Academia Smart Fit' },
      duration: { type: 'number', example: 60 }
    }
  })
  class?: {
    id: string;
    date: Date;
    time: string;
    location: string;
    duration: number;
  };
  
  // Informações dos usuários
  @ApiPropertyOptional({
    description: 'Informações do aluno',
    type: 'object',
    properties: {
      id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174002' },
      name: { type: 'string', example: 'João Silva' },
      email: { type: 'string', example: 'joao@email.com' }
    }
  })
  student?: {
    id: string;
    name: string;
    email: string;
  };
  
  @ApiPropertyOptional({
    description: 'Informações do personal trainer',
    type: 'object',
    properties: {
      id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174003' },
      name: { type: 'string', example: 'Maria Santos' },
      email: { type: 'string', example: 'maria@email.com' }
    }
  })
  personal?: {
    id: string;
    name: string;
    email: string;
  };
  
  @ApiProperty({
    description: 'Data de criação',
    example: '2024-01-15T10:00:00.000Z'
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Data de atualização',
    example: '2024-01-15T14:00:00.000Z'
  })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'Data de autorização',
    example: '2024-01-15T14:00:00.000Z'
  })
  authorizedAt?: Date;

  @ApiPropertyOptional({
    description: 'Data de captura',
    example: '2024-01-15T15:00:00.000Z'
  })
  capturedAt?: Date;

  @ApiPropertyOptional({
    description: 'Data de reembolso',
    example: '2024-01-16T10:00:00.000Z'
  })
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
  @ApiPropertyOptional({
    description: 'Status do pagamento para filtrar',
    enum: PaymentStatus,
    example: PaymentStatus.AUTHORIZED
  })
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;

  @ApiPropertyOptional({
    description: 'Tipo do pagamento para filtrar',
    enum: PaymentType,
    example: PaymentType.CLASS_PAYMENT
  })
  @IsEnum(PaymentType)
  @IsOptional()
  type?: PaymentType;

  @ApiPropertyOptional({
    description: 'ID da aula para filtrar',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  @IsOptional()
  classId?: string;

  @ApiPropertyOptional({
    description: 'ID do usuário para filtrar',
    example: '123e4567-e89b-12d3-a456-426614174001'
  })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Valor mínimo para filtrar',
    example: 50.00,
    minimum: 0
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minAmount?: number;

  @ApiPropertyOptional({
    description: 'Valor máximo para filtrar',
    example: 200.00,
    minimum: 0
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  maxAmount?: number;

  @ApiPropertyOptional({
    description: 'Data inicial para filtrar',
    example: '2024-01-01T00:00:00.000Z'
  })
  @Type(() => Date)
  @IsOptional()
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'Data final para filtrar',
    example: '2024-12-31T23:59:59.999Z'
  })
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

// ===== DTOs PARA TRANSFERÊNCIA REAL =====

export class TransferRequestDto {
  @ApiProperty({
    description: 'ID do personal trainer',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  @IsNotEmpty()
  personalId: string;

  @ApiProperty({
    description: 'Valor da transferência',
    example: 100.00,
    minimum: 1.00,
    maximum: 10000.00
  })
  @IsNumber()
  @Min(1.00)
  @Max(10000.00)
  amount: number;

  @ApiProperty({
    description: 'Descrição da transferência',
    example: 'Saque mensal - Janeiro 2024'
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'Método de transferência',
    enum: ['pix', 'bank_transfer', 'mercadopago_balance'],
    example: 'pix'
  })
  @IsEnum(['pix', 'bank_transfer', 'mercadopago_balance'])
  transferMethod: 'pix' | 'bank_transfer' | 'mercadopago_balance';

  @ApiProperty({
    description: 'Dados específicos do método de transferência',
    type: 'object'
  })
  @IsObject()
  personalData: {
    pixKey?: string;
    bankAccount?: {
      bank: string;
      agency: string;
      account: string;
      accountType: string;
    };
    mpAccountId?: string;
  };
}

export class ApproveWithdrawalDto {
  @ApiProperty({
    description: 'ID da solicitação de saque',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  @IsNotEmpty()
  withdrawalId: string;

  @ApiProperty({
    description: 'Notas do administrador',
    example: 'Saque aprovado após verificação dos dados bancários'
  })
  @IsString()
  @IsOptional()
  adminNotes?: string;

  @ApiProperty({
    description: 'Método de transferência escolhido pelo admin',
    enum: ['pix', 'bank_transfer', 'mercadopago_balance'],
    example: 'pix'
  })
  @IsEnum(['pix', 'bank_transfer', 'mercadopago_balance'])
  @IsOptional()
  transferMethod?: 'pix' | 'bank_transfer' | 'mercadopago_balance';
}

export class RejectWithdrawalDto {
  @ApiProperty({
    description: 'ID da solicitação de saque',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  @IsNotEmpty()
  withdrawalId: string;

  @ApiProperty({
    description: 'Motivo da rejeição',
    example: 'Dados bancários inválidos'
  })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({
    description: 'Notas adicionais do administrador',
    example: 'Favor verificar os dados da conta bancária'
  })
  @IsString()
  @IsOptional()
  adminNotes?: string;
}

export class WithdrawalRequestDto {
  @ApiProperty({
    description: 'Valor do saque',
    example: 100.00,
    minimum: 1.00,
    maximum: 10000.00
  })
  @IsNumber()
  @Min(1.00)
  @Max(10000.00)
  amount: number;

  @ApiProperty({
    description: 'Método de saque preferido',
    enum: ['pix', 'bank_transfer', 'mercadopago_balance'],
    example: 'pix'
  })
  @IsEnum(['pix', 'bank_transfer', 'mercadopago_balance'])
  method: 'pix' | 'bank_transfer' | 'mercadopago_balance';

  @ApiProperty({
    description: 'Urgência do saque',
    enum: ['normal', 'urgent'],
    example: 'normal'
  })
  @IsEnum(['normal', 'urgent'])
  @IsOptional()
  urgency?: 'normal' | 'urgent';

  @ApiProperty({
    description: 'Descrição do saque',
    example: 'Saque mensal'
  })
  @IsString()
  @IsOptional()
  description?: string;
}

export class WithdrawalResponseDto {
  @ApiProperty({
    description: 'ID da solicitação de saque',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  id: string;

  @ApiProperty({
    description: 'ID do usuário',
    example: '123e4567-e89b-12d3-a456-426614174001'
  })
  userId: string;

  @ApiProperty({
    description: 'Valor solicitado',
    example: 100.00
  })
  amount: number;

  @ApiProperty({
    description: 'Taxa aplicada',
    example: 2.50
  })
  fee: number;

  @ApiProperty({
    description: 'Valor líquido (após taxa)',
    example: 97.50
  })
  netAmount: number;

  @ApiProperty({
    description: 'Método de saque',
    example: 'pix'
  })
  method: string;

  @ApiProperty({
    description: 'Status da solicitação',
    enum: ['pending', 'approved', 'rejected', 'processing', 'completed', 'failed'],
    example: 'pending'
  })
  status: string;

  @ApiProperty({
    description: 'Descrição do saque',
    example: 'Saque mensal'
  })
  description?: string;

  @ApiProperty({
    description: 'Motivo da rejeição (se aplicável)',
    example: 'Dados bancários inválidos'
  })
  rejectionReason?: string;

  @ApiProperty({
    description: 'Notas do administrador',
    example: 'Saque aprovado'
  })
  adminNotes?: string;

  @ApiProperty({
    description: 'ID da transferência no Mercado Pago',
    example: '1234567890'
  })
  mpTransferId?: string;

  @ApiProperty({
    description: 'Data de criação',
    example: '2024-01-15T10:00:00.000Z'
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Data de processamento',
    example: '2024-01-15T15:00:00.000Z'
  })
  processedAt?: Date;

  @ApiProperty({
    description: 'Dados do usuário',
    type: 'object'
  })
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}
