import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  decimal,
  boolean,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const financialTypeEnum = pgEnum('financial_type', [
  'earning',
  'payment',
  'withdrawal',
]);
export const financialStatusEnum = pgEnum('financial_status', [
  'pending',
  'completed',
  'failed',
]);

// Financial Records table
export const financialRecords = pgTable('financial_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  personalId: uuid('personal_id').notNull(),
  classId: uuid('class_id'),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  type: financialTypeEnum('type').notNull(),
  status: financialStatusEnum('status').default('pending'),
  description: text('description'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Bank Accounts table
export const bankAccounts = pgTable('bank_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  personalId: uuid('personal_id').notNull(),
  bankName: varchar('bank_name', { length: 100 }).notNull(),
  agency: varchar('agency', { length: 20 }).notNull(),
  account: varchar('account', { length: 20 }).notNull(),
  accountType: varchar('account_type', { length: 20 }).notNull(), // 'checking' or 'savings'
  isActive: boolean('is_active').default(true),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const financialRecordsRelations = relations(
  financialRecords,
  ({ one }) => ({
    personal: one(users, {
      fields: [financialRecords.personalId],
      references: [users.id],
    }),
    class: one(classes, {
      fields: [financialRecords.classId],
      references: [classes.id],
    }),
  }),
);

export const bankAccountsRelations = relations(bankAccounts, ({ one }) => ({
  personal: one(users, {
    fields: [bankAccounts.personalId],
    references: [users.id],
  }),
}));

// Import other tables for relations
import { users } from './users';
import { classes } from './classes';
