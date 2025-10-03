import { pgTable, varchar, text, integer, timestamp, pgEnum, uuid, decimal, jsonb, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { classes } from './classes';
import { proposals } from './proposals';

// Enum para status do pagamento
export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',           // Aguardando confirmação
  'authorized',        // Autorizado (em custódia)
  'captured',          // Capturado (split aplicado)
  'refunded',          // Reembolsado
  'cancelled',         // Cancelado
  'disputed',          // Em disputa
  'dispute_resolved'   // Disputa resolvida
]);

// Enum para tipo de pagamento
export const paymentTypeEnum = pgEnum('payment_type', [
  'class_payment',     // Pagamento de aula
  'refund',            // Reembolso
  'platform_fee',     // Taxa da plataforma
  'personal_earnings'  // Ganhos do personal
]);

// Enum para status da disputa
export const disputeStatusEnum = pgEnum('dispute_status', [
  'pending',           // Aguardando evidências
  'under_review',      // Em análise
  'resolved_pro_student',  // Resolvido a favor do aluno
  'resolved_pro_personal', // Resolvido a favor do personal
  'expired'            // Expirada (48h)
]);

// Tabela principal de pagamentos
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relacionamentos
  classId: uuid('class_id'), // Pode ser NULL para propostas
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  personalId: uuid('personal_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Para propostas (quando classId é NULL)
  proposalId: uuid('proposal_id'), // ID da proposta quando não há aula
  
  // Dados do Mercado Pago
  mpPaymentId: varchar('mp_payment_id', { length: 255 }), // ID do pagamento no MP
  mpPreferenceId: varchar('mp_preference_id', { length: 255 }), // ID da preferência
  
  // Valores
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  platformFee: decimal('platform_fee', { precision: 10, scale: 2 }).notNull(),
  personalAmount: decimal('personal_amount', { precision: 10, scale: 2 }).notNull(),
  
  // Status e tipo
  status: paymentStatusEnum('status').default('pending').notNull(),
  type: paymentTypeEnum('type').default('class_payment').notNull(),
  
  // Dados do split
  splitData: jsonb('split_data'), // Dados do split do Mercado Pago
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  authorizedAt: timestamp('authorized_at'),
  capturedAt: timestamp('captured_at'),
  refundedAt: timestamp('refunded_at'),
});

// Tabela de disputas
export const paymentDisputes = pgTable('payment_disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relacionamentos
  paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
  reportedBy: uuid('reported_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Dados da disputa
  reason: varchar('reason', { length: 100 }).notNull(), // 'no_show', 'cancellation', etc.
  description: text('description'),
  status: disputeStatusEnum('status').default('pending').notNull(),
  
  // Evidências
  studentEvidence: text('student_evidence'), // Evidências do aluno
  personalEvidence: text('personal_evidence'), // Evidências do personal
  adminNotes: text('admin_notes'), // Notas do admin
  
  // Decisão
  resolution: varchar('resolution', { length: 50 }), // 'pro_student', 'pro_personal'
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at'),
  
  // Contadores de disputas
  studentDisputeCount: integer('student_dispute_count').default(0),
  personalDisputeCount: integer('personal_dispute_count').default(0),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(), // 48h para resolver
});

// Tabela de transações (histórico detalhado)
export const paymentTransactions = pgTable('payment_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relacionamentos
  paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Dados da transação
  type: paymentTypeEnum('type').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  description: text('description'),
  
  // Dados do Mercado Pago
  mpTransactionId: varchar('mp_transaction_id', { length: 255 }),
  mpOperationId: varchar('mp_operation_id', { length: 255 }),
  
  // Status
  status: paymentStatusEnum('status').notNull(),
  
  // Metadados
  metadata: jsonb('metadata'), // Dados adicionais
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
});

// Enum para método de pagamento
export const paymentMethodEnum = pgEnum('payment_method', [
  'bank_transfer',
  'mercado_pago'
]);

// Enum para tipo de conta
export const accountTypeEnum = pgEnum('account_type', [
  'checking',
  'savings'
]);

// Enum para status de saque
export const withdrawalStatusEnum = pgEnum('withdrawal_status', [
  'pending',
  'processing', 
  'completed',
  'failed',
  'cancelled'
]);

// Enums para métodos de pagamento dos alunos
export const studentPaymentMethodEnum = pgEnum('student_payment_method', [
  'credit_card',
  'debit_card',
  'mercado_pago',
  'pix'
]);

export const cardBrandEnum = pgEnum('card_brand', [
  'visa',
  'mastercard',
  'amex',
  'elo',
  'hipercard',
  'diners'
]);

export const cardTypeEnum = pgEnum('card_type', [
  'credit',
  'debit'
]);

// Tabela de perfis financeiros
export const financialProfiles = pgTable('financial_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relacionamento
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  
  // Configurações
  preferredMethod: paymentMethodEnum('preferred_method').notNull(),
  isComplete: boolean('is_complete').default(false).notNull(),
  canReceivePayments: boolean('can_receive_payments').default(false).notNull(),
  
  // Dados bancários
  bankCode: varchar('bank_code', { length: 10 }),
  bankName: varchar('bank_name', { length: 100 }),
  accountType: accountTypeEnum('account_type'),
  accountNumber: varchar('account_number', { length: 20 }),
  agency: varchar('agency', { length: 10 }),
  accountHolderName: varchar('account_holder_name', { length: 100 }),
  document: varchar('document', { length: 20 }), // CPF/CNPJ
  
  // Dados do Mercado Pago
  mpEmail: varchar('mp_email', { length: 255 }),
  mpUserId: varchar('mp_user_id', { length: 100 }),
  mpAccessToken: text('mp_access_token'), // Criptografado
  mpIsVerified: boolean('mp_is_verified').default(false),
  
  // Status e validação
  verificationStatus: varchar('verification_status', { length: 20 }).default('pending'), // pending, verified, rejected
  verifiedAt: timestamp('verified_at'),
  lastUpdatedAt: timestamp('last_updated_at'),
  notes: text('notes'),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Tabela de carteiras dos usuários (simplificada)
export const userWallets = pgTable('user_wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relacionamento
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  
  // Saldos
  availableBalance: decimal('available_balance', { precision: 10, scale: 2 }).default('0.00').notNull(),
  pendingBalance: decimal('pending_balance', { precision: 10, scale: 2 }).default('0.00').notNull(),
  totalEarned: decimal('total_earned', { precision: 10, scale: 2 }).default('0.00').notNull(),
  totalWithdrawn: decimal('total_withdrawn', { precision: 10, scale: 2 }).default('0.00').notNull(),
  
  // Status
  isActive: varchar('is_active', { length: 10 }).default('true').notNull(),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastWithdrawalAt: timestamp('last_withdrawal_at'),
});

// Tabela de histórico de saques
export const withdrawalRequests = pgTable('withdrawal_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relacionamentos
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  walletId: uuid('wallet_id').notNull().references(() => userWallets.id, { onDelete: 'cascade' }),
  
  // Dados do saque
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  fee: decimal('fee', { precision: 10, scale: 2 }).default('0.00').notNull(),
  netAmount: decimal('net_amount', { precision: 10, scale: 2 }).notNull(),
  method: text('method').notNull(), // 'bank_transfer', 'mercado_pago'
  urgency: varchar('urgency', { length: 10 }).default('normal').notNull(), // normal, urgent
  
  // Status e processamento
  status: text('status').notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed', 'cancelled'
  description: text('description'),
  transactionId: varchar('transaction_id', { length: 255 }), // ID da transação externa
  failureReason: text('failure_reason'),
  
  // Dados da transferência (snapshot dos dados no momento do saque)
  transferData: jsonb('transfer_data'), // Dados bancários ou MP usados
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
  completedAt: timestamp('completed_at'),
});

// Tabela de histórico de ações de saque
export const withdrawalHistory = pgTable('withdrawal_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  withdrawalId: uuid('withdrawal_id').references(() => withdrawalRequests.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  action: varchar('action', { length: 50 }).notNull(), // 'requested', 'approved', 'rejected', 'processing', 'completed', 'failed'
  description: text('description'),
  adminId: uuid('admin_id').references(() => users.id), // Admin que processou
  metadata: jsonb('metadata'), // Dados adicionais da ação
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Tabela de métodos de pagamento dos alunos
export const studentPaymentMethods = pgTable('student_payment_methods', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relacionamento
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  
  // Configurações
  preferredMethod: studentPaymentMethodEnum('preferred_method').notNull(),
  enableAutoPayment: boolean('enable_auto_payment').default(false).notNull(),
  defaultCardId: uuid('default_card_id'), // Referência ao cartão padrão
  
  // Dados do Mercado Pago
  mpEmail: varchar('mp_email', { length: 255 }),
  mpIsVerified: boolean('mp_is_verified').default(false),
  mpAllowSaveCard: boolean('mp_allow_save_card').default(true),
  
  // Status
  canMakePayments: boolean('can_make_payments').default(true).notNull(),
  hasValidPaymentMethod: boolean('has_valid_payment_method').default(false).notNull(),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Tabela de cartões salvos
export const savedCards = pgTable('saved_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relacionamento
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Dados do cartão (tokenizados/criptografados)
  mpCardToken: varchar('mp_card_token', { length: 255 }), // Token do MP
  cardBrand: cardBrandEnum('card_brand').notNull(),
  cardType: cardTypeEnum('card_type').notNull(),
  lastFourDigits: varchar('last_four_digits', { length: 4 }).notNull(),
  expirationMonth: varchar('expiration_month', { length: 2 }).notNull(),
  expirationYear: varchar('expiration_year', { length: 2 }).notNull(),
  cardHolderName: varchar('card_holder_name', { length: 100 }).notNull(),
  
  // Configurações
  nickname: varchar('nickname', { length: 50 }), // Apelido do cartão
  isDefault: boolean('is_default').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  
  // Dados de uso
  timesUsed: integer('times_used').default(0).notNull(),
  lastUsedAt: timestamp('last_used_at'),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'), // Data de expiração calculada
});

// Tabela de configurações de pagamento automático
export const autoPaymentSettings = pgTable('auto_payment_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relacionamento
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  
  // Configurações
  enabled: boolean('enabled').default(false).notNull(),
  defaultCardId: uuid('default_card_id').references(() => savedCards.id),
  fallbackMethod: studentPaymentMethodEnum('fallback_method'),
  notifyBeforeCharge: boolean('notify_before_charge').default(true).notNull(),
  notificationTime: varchar('notification_time', { length: 10 }).default('2h'), // Ex: "2h", "1d"
  
  // Limites de segurança
  maxAmountPerMonth: decimal('max_amount_per_month', { precision: 10, scale: 2 }),
  maxAmountPerClass: decimal('max_amount_per_class', { precision: 10, scale: 2 }),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relacionamentos
export const paymentsRelations = relations(payments, ({ one, many }) => ({
  class: one(classes, {
    fields: [payments.classId],
    references: [classes.id],
  }),
  proposal: one(proposals, {
    fields: [payments.proposalId],
    references: [proposals.id],
  }),
  student: one(users, {
    fields: [payments.studentId],
    references: [users.id],
    relationName: 'student',
  }),
  personal: one(users, {
    fields: [payments.personalId],
    references: [users.id],
    relationName: 'personal',
  }),
  disputes: many(paymentDisputes),
  transactions: many(paymentTransactions),
}));

export const paymentDisputesRelations = relations(paymentDisputes, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentDisputes.paymentId],
    references: [payments.id],
  }),
  reportedByUser: one(users, {
    fields: [paymentDisputes.reportedBy],
    references: [users.id],
    relationName: 'reportedBy',
  }),
  resolvedByUser: one(users, {
    fields: [paymentDisputes.resolvedBy],
    references: [users.id],
    relationName: 'resolvedBy',
  }),
}));

export const paymentTransactionsRelations = relations(paymentTransactions, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentTransactions.paymentId],
    references: [payments.id],
  }),
  user: one(users, {
    fields: [paymentTransactions.userId],
    references: [users.id],
  }),
}));

export const userWalletsRelations = relations(userWallets, ({ one, many }) => ({
  user: one(users, {
    fields: [userWallets.userId],
    references: [users.id],
  }),
  withdrawalRequests: many(withdrawalRequests),
}));

export const financialProfilesRelations = relations(financialProfiles, ({ one }) => ({
  user: one(users, {
    fields: [financialProfiles.userId],
    references: [users.id],
  }),
}));

export const withdrawalRequestsRelations = relations(withdrawalRequests, ({ one }) => ({
  user: one(users, {
    fields: [withdrawalRequests.userId],
    references: [users.id],
  }),
  wallet: one(userWallets, {
    fields: [withdrawalRequests.walletId],
    references: [userWallets.id],
  }),
}));

export const studentPaymentMethodsRelations = relations(studentPaymentMethods, ({ one, many }) => ({
  user: one(users, {
    fields: [studentPaymentMethods.userId],
    references: [users.id],
  }),
  defaultCard: one(savedCards, {
    fields: [studentPaymentMethods.defaultCardId],
    references: [savedCards.id],
  }),
  savedCards: many(savedCards),
  autoPaymentSettings: one(autoPaymentSettings),
}));

export const savedCardsRelations = relations(savedCards, ({ one }) => ({
  user: one(users, {
    fields: [savedCards.userId],
    references: [users.id],
  }),
  studentPaymentMethods: one(studentPaymentMethods, {
    fields: [savedCards.userId],
    references: [studentPaymentMethods.userId],
  }),
}));

export const autoPaymentSettingsRelations = relations(autoPaymentSettings, ({ one }) => ({
  user: one(users, {
    fields: [autoPaymentSettings.userId],
    references: [users.id],
  }),
  defaultCard: one(savedCards, {
    fields: [autoPaymentSettings.defaultCardId],
    references: [savedCards.id],
  }),
  studentPaymentMethods: one(studentPaymentMethods, {
    fields: [autoPaymentSettings.userId],
    references: [studentPaymentMethods.userId],
  }),
}));

// Relacionamentos reversos nas tabelas users e classes
export const usersPaymentsRelations = relations(users, ({ many }) => ({
  paymentsAsStudent: many(payments, { relationName: 'student' }),
  paymentsAsPersonal: many(payments, { relationName: 'personal' }),
  disputesReported: many(paymentDisputes, { relationName: 'reportedBy' }),
  disputesResolved: many(paymentDisputes, { relationName: 'resolvedBy' }),
  paymentTransactions: many(paymentTransactions),
  wallet: many(userWallets),
}));

export const classesPaymentsRelations = relations(classes, ({ many }) => ({
  payments: many(payments),
}));
