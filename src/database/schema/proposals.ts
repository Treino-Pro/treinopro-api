import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  decimal,
  integer,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const proposalStatusEnum = pgEnum('proposal_status', [
  'pending',
  'matched',
  'completed',
  'cancelled',
]);

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

  // Campos de pagamento
  paymentId: varchar('payment_id', { length: 255 }), // ID do pagamento processado
  paymentMethod: varchar('payment_method', { length: 50 }), // credit_card, debit_card, pix, etc
  paymentStatus: varchar('payment_status', { length: 50 }), // pending, approved, rejected, etc

  // Referência à aula criada (quando aceita)
  classId: uuid('class_id'), // ID da aula criada automaticamente

  // Campo para recontratação direta
  targetPersonalId: uuid('target_personal_id'), // ID do personal específico para recontratação

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
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
