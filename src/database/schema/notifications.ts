import {
  pgTable,
  text,
  boolean,
  jsonb,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Tabela de notificações in-app
 * Armazena notificações que aparecem dentro do app
 */
export const inAppNotifications = pgTable('in_app_notifications', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: text('type').notNull(), // info, success, warning, error
  isRead: boolean('is_read').notNull().default(false),
  data: jsonb('data'), // Dados adicionais específicos do tipo
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type InAppNotification = typeof inAppNotifications.$inferSelect;
export type NewInAppNotification = typeof inAppNotifications.$inferInsert;
