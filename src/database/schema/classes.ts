import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const classStatusEnum = pgEnum('class_status', [
  'scheduled',
  'pending_confirmation',
  'active',
  'completed',
  'cancelled',
  'no_show',
  'no_show_dispute',
  'custody',
]);

export const classDisputeStatusEnum = pgEnum('class_dispute_status', [
  'pending',
  'student_confirmed_absence',
  'student_denied_absence',
  'resolved_for_student',
  'resolved_for_personal',
]);

// Classes table
export const classes = pgTable('classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  proposalId: uuid('proposal_id').notNull(),
  studentId: uuid('student_id').notNull(),
  personalId: uuid('personal_id').notNull(),
  location: varchar('location', { length: 255 }).notNull(),
  date: timestamp('date').notNull(),
  time: varchar('time', { length: 10 }).notNull(),
  duration: integer('duration').notNull(), // em minutos
  status: classStatusEnum('status').default('scheduled'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),

  // Novos campos para lógica de aulas
  pendingConfirmationAt: timestamp('pending_confirmation_at'),
  confirmedAt: timestamp('confirmed_at'),
  noShowReportedAt: timestamp('no_show_reported_at'),
  noShowReportedBy: varchar('no_show_reported_by', { length: 20 }), // 'student' ou 'personal'
  noShowReason: text('no_show_reason'), // motivo/descrição ao criar a disputa
  noShowNotes: text('no_show_notes'), // observações ao criar a disputa
  disputeStatus: classDisputeStatusEnum('dispute_status'),
  custodyExpiresAt: timestamp('custody_expires_at'),
  evidenceDeadline: timestamp('evidence_deadline'),
  studentEvidence: text('student_evidence'),
  personalEvidence: text('personal_evidence'),
  resolution: text('resolution'),
  resolvedAt: timestamp('resolved_at'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const classesRelations = relations(classes, ({ one, many }) => ({
  proposal: one(proposals, {
    fields: [classes.proposalId],
    references: [proposals.id],
  }),
  student: one(users, {
    fields: [classes.studentId],
    references: [users.id],
    relationName: 'student',
  }),
  personal: one(users, {
    fields: [classes.personalId],
    references: [users.id],
    relationName: 'personal',
  }),
  messages: many(messages),
  evaluations: many(evaluations),
}));

// Import other tables for relations
import { proposals } from './proposals';
import { users } from './users';
import { messages } from './chat';
import { evaluations } from './evaluations';
