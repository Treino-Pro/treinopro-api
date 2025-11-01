import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Health Questionnaires table
export const healthQuestionnaires = pgTable('health_questionnaires', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  medicalCondition: text('medical_condition'),
  regularMedication: text('regular_medication'),
  chronicInjury: text('chronic_injury'),
  trainingGoal: text('training_goal'),
  dietaryRestrictions: text('dietary_restrictions'),
  completedAt: timestamp('completed_at'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const healthQuestionnairesRelations = relations(
  healthQuestionnaires,
  ({ one }) => ({
    user: one(users, {
      fields: [healthQuestionnaires.userId],
      references: [users.id],
    }),
  }),
);

// Import users table for relations
import { users } from './users';
