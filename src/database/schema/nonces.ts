import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';

// Tabela para armazenar nonces usados (prevenir replay attacks)
export const usedNonces = pgTable(
  'used_nonces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nonce: varchar('nonce', { length: 255 }).notNull().unique(),
    proposalId: uuid('proposal_id').notNull(),
    personalId: uuid('personal_id').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    nonceIdx: index('idx_used_nonces_nonce').on(table.nonce),
    proposalIdx: index('idx_used_nonces_proposal').on(table.proposalId),
  }),
);
