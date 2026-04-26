import {
  IsString,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  Matches,
  Length,
} from 'class-validator';

// Enums
export enum PaymentMethod {
  BANK_TRANSFER = 'bank_transfer', // Transferência bancária
  STRIPE_CONNECT = 'stripe_connect',
}

export enum AccountType {
  CHECKING = 'checking', // Conta corrente
  SAVINGS = 'savings', // Conta poupança
}

// DTO para dados bancários
export class BankAccountDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 3)
  bankCode: string; // Código do banco (001, 341, etc.)

  @IsString()
  @IsNotEmpty()
  bankName: string; // Nome do banco (Banco do Brasil, Itaú, etc.)

  @IsEnum(AccountType)
  accountType: AccountType; // Tipo da conta

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{1,10}-?\d?$/, { message: 'Número da conta inválido' })
  accountNumber: string; // Número da conta

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-?\d?$/, { message: 'Agência inválida' })
  agency: string; // Agência

  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  accountHolderName: string; // Nome do titular

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{11}$|^\d{14}$/, { message: 'CPF/CNPJ inválido' })
  document: string; // CPF ou CNPJ do titular (apenas números)
}

// DTO para perfil financeiro completo
export class UpdateFinancialProfileDto {
  @IsEnum(PaymentMethod)
  preferredMethod: PaymentMethod; // Método preferido de recebimento

  @IsOptional()
  bankAccount?: BankAccountDto; // Dados bancários (obrigatório se method = bank_transfer)

  @IsString()
  @IsOptional()
  notes?: string; // Observações adicionais
}

// DTO para resposta do perfil financeiro
export class FinancialProfileResponseDto {
  id: string;
  userId: string;
  preferredMethod: PaymentMethod;
  isComplete: boolean; // Se o perfil está completo para receber pagamentos

  // Dados bancários (mascarados para segurança)
  bankAccount?: {
    bankCode: string;
    bankName: string;
    accountType: AccountType;
    accountNumber: string; // Mascarado: 12345-*
    agency: string; // Mascarado: 1234-*
    accountHolderName: string;
    document: string; // Mascarado: ***.***.***-**
  };

  // Status
  canReceivePayments: boolean; // Se pode receber pagamentos
  stripeAccount?: {
    accountId?: string;
    onboardingCompleted: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirements: {
      currentlyDue: string[];
      eventuallyDue: string[];
      pastDue: string[];
      pendingVerification: string[];
      disabledReason: string | null;
    };
  };
  lastUpdatedAt: Date;
  verifiedAt?: Date; // Data da verificação

  createdAt: Date;
  updatedAt: Date;
}

// DTO para validação de dados bancários
export class ValidateBankAccountDto {
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @IsString()
  @IsNotEmpty()
  agency: string;

  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @IsString()
  @IsNotEmpty()
  document: string;
}

// DTO para solicitação de saque
export class WithdrawalRequestDto {
  @IsString()
  @IsNotEmpty()
  amount: string; // Valor em string para precisão decimal

  @IsEnum(PaymentMethod)
  method: PaymentMethod; // Método de saque

  @IsString()
  @IsOptional()
  description?: string; // Descrição do saque

  @IsString()
  @IsOptional()
  urgency?: 'normal' | 'urgent'; // Urgência (normal = 1-2 dias, urgent = mesmo dia)
}

// DTO para histórico de saques
export class WithdrawalHistoryDto {
  id: string;
  userId: string;
  amount: string;
  method: PaymentMethod;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  description?: string;
  urgency: string;

  // Dados da transferência
  transactionId?: string; // ID da transferência Stripe
  processedAt?: Date;
  completedAt?: Date;
  failureReason?: string;

  // Taxas
  fee: string; // Taxa cobrada
  netAmount: string; // Valor líquido recebido

  createdAt: Date;
  updatedAt: Date;
}

// DTO para estatísticas financeiras do personal
export class PersonalFinancialStatsDto {
  // Saldos
  availableBalance: string;
  pendingBalance: string;
  totalEarned: string;
  totalWithdrawn: string;

  // Estatísticas do mês
  thisMonth: {
    earned: string;
    withdrawn: string;
    classesCompleted: number;
    averagePerClass: string;
  };

  // Últimos saques
  recentWithdrawals: WithdrawalHistoryDto[];

  // Próximos pagamentos
  upcomingPayments: {
    classId: string;
    studentName: string;
    amount: string;
    scheduledDate: Date;
  }[];

  // Status do perfil
  profileStatus: {
    isComplete: boolean;
    canReceivePayments: boolean;
    missingFields: string[];
    verificationStatus: 'pending' | 'verified' | 'rejected';
  };
}
