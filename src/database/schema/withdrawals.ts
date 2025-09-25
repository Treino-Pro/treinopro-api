import { pgTable, uuid, text, timestamp, decimal, boolean, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users';

export const withdrawalRequests = pgTable('withdrawal_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  walletId: uuid('wallet_id').notNull(), // Referência à carteira do usuário
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  fee: decimal('fee', { precision: 10, scale: 2 }).notNull().default('0.00'),
  netAmount: decimal('net_amount', { precision: 10, scale: 2 }).notNull(),
  method: text('method').notNull(), // 'pix', 'bank_transfer', 'mercadopago_balance'
  urgency: text('urgency').notNull().default('normal'), // 'normal', 'urgent'
  description: text('description'),
  status: text('status').notNull().default('pending'), // 'pending', 'approved', 'rejected', 'processing', 'completed', 'failed'
  rejectionReason: text('rejection_reason'),
  adminNotes: text('admin_notes'),
  mpTransferId: text('mp_transfer_id'), // ID da transferência no Mercado Pago
  transferData: jsonb('transfer_data'), // Dados específicos da transferência
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const withdrawalHistory = pgTable('withdrawal_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  withdrawalId: uuid('withdrawal_id').references(() => withdrawalRequests.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  action: text('action').notNull(), // 'requested', 'approved', 'rejected', 'processing', 'completed', 'failed'
  description: text('description'),
  adminId: uuid('admin_id').references(() => users.id), // Admin que processou
  metadata: jsonb('metadata'), // Dados adicionais da ação
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
