import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const liveActivityTokens = pgTable(
  'live_activity_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    proposalId: varchar('proposal_id', { length: 255 }),
    token: text('token').notNull(),
    platform: varchar('platform', { length: 20 }).notNull().default('ios'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('live_activity_tokens_user_id_idx').on(table.userId),
    proposalIdIdx: index('live_activity_tokens_proposal_id_idx').on(
      table.proposalId,
    ),
    tokenUnique: unique('live_activity_tokens_token_unique').on(table.token),
  }),
);

export const liveActivityTokensRelations = relations(
  liveActivityTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [liveActivityTokens.userId],
      references: [users.id],
    }),
  }),
);
