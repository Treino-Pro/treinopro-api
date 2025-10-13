import { IsString, IsEnum, IsOptional, IsNotEmpty, IsEmail, Matches, Length, IsBoolean, IsDateString } from 'class-validator';

// Enums
export enum StudentPaymentMethod {
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card', 
  MERCADO_PAGO = 'mercado_pago',
  PIX = 'pix',
}

export enum CardBrand {
  VISA = 'visa',
  MASTERCARD = 'mastercard',
  AMERICAN_EXPRESS = 'amex',
  ELO = 'elo',
  HIPERCARD = 'hipercard',
  DINERS = 'diners',
}

export enum CardType {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

// DTO para cadastrar cartão
export class SaveCardDto {
  @IsString()
  @IsNotEmpty()
  @Length(13, 19)
  @Matches(/^\d+$/, { message: 'Número do cartão deve conter apenas dígitos' })
  cardNumber: string; // Será tokenizado

  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  cardHolderName: string; // Nome no cartão

  @IsString()
  @IsNotEmpty()
  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/, { message: 'Data deve estar no formato MM/YY' })
  expirationDate: string; // MM/YY

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{3,4}$/, { message: 'CVV deve ter 3 ou 4 dígitos' })
  cvv: string; // Não será salvo, apenas para tokenização

  @IsEnum(CardType)
  cardType: CardType; // Crédito ou débito

  @IsString()
  @IsOptional()
  nickname?: string; // Apelido do cartão (ex: "Cartão Principal")

  @IsBoolean()
  @IsOptional()
  setAsDefault?: boolean; // Definir como padrão
}

// DTO para dados do Mercado Pago do aluno
export class StudentMercadoPagoDto {
  @IsEmail()
  @IsNotEmpty()
  email: string; // Email da conta MP

  @IsString()
  @IsOptional()
  accessToken?: string; // Token de acesso (se aplicável)

  @IsBoolean()
  @IsOptional()
  allowSaveCard?: boolean; // Permitir salvar cartão no MP
}

// DTO para atualizar métodos de pagamento do aluno
export class UpdateStudentPaymentMethodsDto {
  @IsEnum(StudentPaymentMethod)
  preferredMethod: StudentPaymentMethod; // Método preferido

  @IsOptional()
  mercadoPagoAccount?: StudentMercadoPagoDto; // Dados MP

  @IsBoolean()
  @IsOptional()
  enableAutoPayment?: boolean; // Pagamento automático

  @IsString()
  @IsOptional()
  defaultCardId?: string; // ID do cartão padrão
}

// DTO para resposta dos métodos de pagamento
export class StudentPaymentMethodsResponseDto {
  id: string;
  userId: string;
  preferredMethod: StudentPaymentMethod;
  enableAutoPayment: boolean;
  defaultCardId?: string;

  // Cartões salvos (dados mascarados)
  savedCards: {
    id: string;
    nickname?: string;
    cardBrand: CardBrand;
    cardType: CardType;
    lastFourDigits: string; // **** **** **** 1234
    expirationMonth: string;
    expirationYear: string;
    cardHolderName: string;
    isDefault: boolean;
    isActive: boolean;
    createdAt: Date;
  }[];

  // Dados do Mercado Pago (mascarados)
  mercadoPagoAccount?: {
    email: string; // Mascarado: j***@email.com
    isVerified: boolean;
    allowSaveCard: boolean;
  };

  // Status
  canMakePayments: boolean; // Se pode fazer pagamentos
  hasValidPaymentMethod: boolean; // Se tem método válido
  missingSetup: string[]; // O que falta configurar

  createdAt: Date;
  updatedAt: Date;
}

// DTO para processar pagamento de aula
export class ProcessClassPaymentDto {
  @IsString()
  @IsNotEmpty()
  classId: string; // ID da aula

  @IsEnum(StudentPaymentMethod)
  paymentMethod: StudentPaymentMethod; // Método escolhido

  @IsString()
  @IsOptional()
  cardId?: string; // ID do cartão salvo (se aplicável)

  @IsOptional()
  cardData?: SaveCardDto; // Dados do cartão (se não salvo)

  @IsString()
  @IsOptional()
  installments?: string; // Número de parcelas (1-12)

  @IsBoolean()
  @IsOptional()
  saveCard?: boolean; // Salvar cartão para futuras compras

  @IsString()
  @IsOptional()
  cardNickname?: string; // Apelido para o cartão (se salvar)

  // Dados do pagador (vindos do app)
  @IsEmail()
  @IsOptional()
  payerEmail?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'CPF deve conter 11 dígitos numéricos' })
  payerCpf?: string;
}

// DTO para resposta do processamento
export class PaymentProcessResponseDto {
  success: boolean;
  paymentId: string;
  
  // Dados do Mercado Pago
  mpPreferenceId?: string;
  mpPaymentId?: string;
  checkoutUrl?: string; // URL para checkout
  
  // Status do pagamento
  status: string; // pending, approved, rejected, etc.
  statusDetail?: string;
  
  // Dados da transação
  transactionAmount: number;
  installments?: number;
  
  // QR Code (para PIX)
  qrCode?: string;
  qrCodeBase64?: string;
  
  // Dados do cartão (se aplicável)
  cardInfo?: {
    lastFourDigits: string;
    cardBrand: CardBrand;
    wasCardSaved: boolean;
    cardId?: string;
  };
  
  // URLs de retorno
  successUrl?: string;
  failureUrl?: string;
  pendingUrl?: string;
  
  message: string;
  createdAt: Date;
}

// DTO para validar cartão
export class ValidateCardDto {
  @IsString()
  @IsNotEmpty()
  cardNumber: string;

  @IsString()
  @IsNotEmpty()
  expirationDate: string;

  @IsString()
  @IsNotEmpty()
  cvv: string;

  @IsString()
  @IsNotEmpty()
  cardHolderName: string;
}

// DTO para histórico de pagamentos do aluno
export class StudentPaymentHistoryDto {
  id: string;
  classId: string;
  amount: string;
  method: StudentPaymentMethod;
  status: string;
  installments?: number;
  
  // Dados da aula
  classInfo: {
    date: Date;
    time: string;
    location: string;
    personalName: string;
    duration: number;
  };
  
  // Dados do pagamento
  mpPaymentId?: string;
  cardInfo?: {
    lastFourDigits: string;
    cardBrand: CardBrand;
  };
  
  // Timestamps
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
}

// DTO para estatísticas de pagamento do aluno
export class StudentPaymentStatsDto {
  // Totais
  totalSpent: string;
  totalClasses: number;
  averagePerClass: string;
  
  // Este mês
  thisMonth: {
    spent: string;
    classes: number;
    averagePerClass: string;
  };
  
  // Métodos mais usados
  preferredMethods: {
    method: StudentPaymentMethod;
    count: number;
    percentage: number;
  }[];
  
  // Histórico recente
  recentPayments: StudentPaymentHistoryDto[];
  
  // Status atual
  paymentStatus: {
    hasValidMethod: boolean;
    preferredMethod: StudentPaymentMethod;
    activeCardsCount: number;
    canMakePayments: boolean;
  };
}

// DTO para configurações de pagamento automático
export class AutoPaymentSettingsDto {
  @IsBoolean()
  enabled: boolean; // Habilitar pagamento automático

  @IsString()
  @IsOptional()
  defaultCardId?: string; // Cartão padrão para cobrança

  @IsEnum(StudentPaymentMethod)
  @IsOptional()
  fallbackMethod?: StudentPaymentMethod; // Método alternativo

  @IsBoolean()
  @IsOptional()
  notifyBeforeCharge?: boolean; // Notificar antes de cobrar

  @IsString()
  @IsOptional()
  notificationTime?: string; // Tempo de antecedência (ex: "2h", "1d")
}

// DTO para remover cartão
export class RemoveCardDto {
  @IsString()
  @IsNotEmpty()
  cardId: string;

  @IsString()
  @IsOptional()
  reason?: string; // Motivo da remoção
}

// DTO para atualizar cartão
export class UpdateCardDto {
  @IsString()
  @IsNotEmpty()
  cardId: string;

  @IsString()
  @IsOptional()
  nickname?: string; // Novo apelido

  @IsString()
  @IsOptional()
  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/)
  expirationDate?: string; // Nova data de expiração

  @IsBoolean()
  @IsOptional()
  setAsDefault?: boolean; // Definir como padrão

  @IsBoolean()
  @IsOptional()
  isActive?: boolean; // Ativar/desativar
}
