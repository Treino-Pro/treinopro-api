import { pgTable, uuid, varchar, integer, boolean, timestamp, text } from 'drizzle-orm/pg-core';
import { users } from './users';

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  storedName: varchar('stored_name', { length: 255 }).notNull(), // UUID + extensão
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  size: integer('size').notNull(),
  path: varchar('path', { length: 500 }).notNull(), // Caminho físico
  url: varchar('url', { length: 500 }).notNull(),   // URL pública
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  category: varchar('category', { length: 50 }).notNull(), // 'profile', 'document', 'temp'
  isProcessed: boolean('is_processed').default(false).notNull(),
  metadata: text('metadata'), // JSON com metadados adicionais
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
