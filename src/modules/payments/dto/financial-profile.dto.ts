import {
  IsString,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  IsEmail,
  Matches,
  Length,
} from 'class-validator';

// Enums
export enum PaymentMethod {
  BANK_TRANSFER = 'bank_transfer', // Transferência bancária
  MERCADO_PAGO = 'mercado_pago', // Direto no MP
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

// DTO para dados do Mercado Pago
export class MercadoPagoAccountDto {
  @IsEmail()
  @IsNotEmpty()
  email: string; // Email da conta MP

  @IsString()
  @IsOptional()
  userId?: string; // User ID do MP (se disponível)

  @IsString()
  @IsOptional()
  accessToken?: string; // Token de acesso (se aplicável)
}

// DTO para perfil financeiro completo
export class UpdateFinancialProfileDto {
  @IsEnum(PaymentMethod)
  preferredMethod: PaymentMethod; // Método preferido de recebimento

  @IsOptional()
  bankAccount?: BankAccountDto; // Dados bancários (obrigatório se method = bank_transfer)

  @IsOptional()
  mercadoPagoAccount?: MercadoPagoAccountDto; // Dados MP (obrigatório se method = mercado_pago)

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

  // Dados do Mercado Pago (mascarados)
  mercadoPagoAccount?: {
    email: string; // Mascarado: j***@email.com
    userId?: string;
    isVerified: boolean; // Se a conta está verificada
  };

  // Status
  canReceivePayments: boolean; // Se pode receber pagamentos
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

// DTO para teste de conectividade MP
export class ValidateMercadoPagoDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  accessToken?: string;
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
  transactionId?: string; // ID da transação bancária/MP
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
