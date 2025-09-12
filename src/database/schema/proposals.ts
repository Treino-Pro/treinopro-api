import { pgTable, uuid, varchar, text, timestamp, decimal, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const proposalStatusEnum = pgEnum('proposal_status', ['pending', 'matched', 'completed', 'cancelled']);

// Proposals table
export const proposals = pgTable('proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull(),
  locationId: uuid('location_id'),
  locationName: varchar('location_name', { length: 255 }),
  locationAddress: text('location_address'),
  trainingDate: timestamp('training_date').notNull(),
  trainingTime: varchar('training_time', { length: 10 }).notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  modalityId: uuid('modality_id'),
  modalityName: varchar('modality_name', { length: 100 }),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  additionalNotes: text('additional_notes'),
  status: proposalStatusEnum('status').default('pending'),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const proposalsRelations = relations(proposals, ({ one, many }) => ({
  student: one(users, {
    fields: [proposals.studentId],
    references: [users.id],
  }),
  classes: many(classes),
}));

// Import users table for relations
import { users } from './users';
import { classes } from './classes';
