import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Messages table
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  classId: uuid('class_id').notNull(),
  senderId: uuid('sender_id').notNull(),
  receiverId: uuid('receiver_id').notNull(),
  messageText: text('message_text').notNull(),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  isRead: boolean('is_read').default(false),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const messagesRelations = relations(messages, ({ one }) => ({
  class: one(classes, {
    fields: [messages.classId],
    references: [classes.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
  receiver: one(users, {
    fields: [messages.receiverId],
    references: [users.id],
  }),
}));

// Import other tables for relations
import { classes } from './classes';
import { users } from './users';
