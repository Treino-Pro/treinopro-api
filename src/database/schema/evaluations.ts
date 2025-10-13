import { pgTable, uuid, text, timestamp, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const evaluationTypeEnum = pgEnum('evaluation_type', ['student_to_personal', 'personal_to_student']);

// Evaluations table
export const evaluations = pgTable('evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  classId: uuid('class_id').notNull(),
  evaluatorId: uuid('evaluator_id').notNull(),
  evaluatedId: uuid('evaluated_id').notNull(),
  rating: integer('rating').notNull(), // 1-5 stars
  comment: text('comment'),
  type: evaluationTypeEnum('type').notNull(),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const evaluationsRelations = relations(evaluations, ({ one }) => ({
  class: one(classes, {
    fields: [evaluations.classId],
    references: [classes.id],
  }),
  evaluator: one(users, {
    fields: [evaluations.evaluatorId],
    references: [users.id],
    relationName: 'evaluator',
  }),
  evaluated: one(users, {
    fields: [evaluations.evaluatedId],
    references: [users.id],
    relationName: 'evaluated',
  }),
}));

// Import other tables for relations
import { classes } from './classes';
import { users } from './users';
