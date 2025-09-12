import { pgTable, uuid, varchar, text, timestamp, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const classStatusEnum = pgEnum('class_status', ['scheduled', 'active', 'completed', 'cancelled']);

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
