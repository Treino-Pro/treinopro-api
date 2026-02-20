import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  pgEnum,
  decimal,
  unique,
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

  // Confirmação de início por código 4 dígitos
  startConfirmationCodeHash: text('start_confirmation_code_hash'),
  startConfirmationCodeExpiresAt: timestamp('start_confirmation_code_expires_at'),
  startConfirmationAttempts: integer('start_confirmation_attempts').default(0),

  // Regra de 45 minutos
  minimumCompletionAt: timestamp('minimum_completion_at'),

  // Defesa estruturada por lado (replica)
  studentDefenseText: text('student_defense_text'),
  personalDefenseText: text('personal_defense_text'),
  studentDefenseSubmittedAt: timestamp('student_defense_submitted_at'),
  personalDefenseSubmittedAt: timestamp('personal_defense_submitted_at'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Enum para role no snapshot
export const presenceRoleEnum = pgEnum('presence_role', ['student', 'personal']);
export const captureSourceEnum = pgEnum('capture_source', ['foreground', 'resume', 'background_task']);
export const appStateEnum = pgEnum('app_state_snapshot', ['foreground', 'background', 'resumed']);

// Tabela de snapshots de presença por aula (1 por participante por aula — unique enforced)
export const classPresenceSnapshots = pgTable(
  'class_presence_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: presenceRoleEnum('role').notNull(),
    latitude: decimal('latitude', { precision: 10, scale: 8 }).notNull(),
    longitude: decimal('longitude', { precision: 11, scale: 8 }).notNull(),
    accuracyMeters: decimal('accuracy_meters', { precision: 10, scale: 2 }),
    capturedAt: timestamp('captured_at').notNull(),
    captureSource: captureSourceEnum('capture_source').notNull(),
    appState: appStateEnum('app_state').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    classUserUnique: unique('class_presence_snapshots_class_id_user_id_unique').on(
      table.classId,
      table.userId,
    ),
  }),
);

// Relations
export const classPresenceSnapshotsRelations = relations(classPresenceSnapshots, ({ one }) => ({
  class: one(classes, {
    fields: [classPresenceSnapshots.classId],
    references: [classes.id],
  }),
  user: one(users, {
    fields: [classPresenceSnapshots.userId],
    references: [users.id],
  }),
}));

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
