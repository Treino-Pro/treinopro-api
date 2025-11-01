import {
  pgTable,
  varchar,
  text,
  integer,
  timestamp,
  pgEnum,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { classes } from './classes';

// Enum para tipos de avaliação
export const ratingTypeEnum = pgEnum('rating_type', [
  'student_to_personal', // Aluno avalia personal
  'personal_to_student', // Personal avalia aluno
]);

// Enum para status da avaliação
export const ratingStatusEnum = pgEnum('rating_status', [
  'pending', // Aguardando avaliação
  'completed', // Avaliação concluída
  'cancelled', // Avaliação cancelada
]);

export const ratings = pgTable('ratings', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Relacionamentos
  classId: uuid('class_id')
    .notNull()
    .references(() => classes.id, { onDelete: 'cascade' }),
  raterId: uuid('rater_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  ratedId: uuid('rated_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Dados da avaliação
  type: ratingTypeEnum('type').notNull(),
  rating: integer('rating').notNull(), // 1-5 estrelas
  comment: text('comment'),
  status: ratingStatusEnum('status').default('pending').notNull(),

  // Campos específicos por tipo
  punctuality: integer('punctuality'), // Pontualidade (1-5)
  communication: integer('communication'), // Comunicação (1-5)
  knowledge: integer('knowledge'), // Conhecimento técnico (1-5)
  motivation: integer('motivation'), // Motivação (1-5)
  equipment: integer('equipment'), // Uso de equipamentos (1-5)

  // Campos específicos para avaliação do aluno
  studentEngagement: integer('student_engagement'), // Engajamento do aluno (1-5)
  studentEffort: integer('student_effort'), // Esforço do aluno (1-5)
  studentProgress: integer('student_progress'), // Progresso do aluno (1-5)

  // Campos específicos para avaliação do personal
  personalProfessionalism: integer('personal_professionalism'), // Profissionalismo (1-5)
  personalKnowledge: integer('personal_knowledge'), // Conhecimento técnico (1-5)
  personalMotivation: integer('personal_motivation'), // Capacidade de motivar (1-5)
  personalCommunication: integer('personal_communication'), // Comunicação (1-5)

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// Relacionamentos
export const ratingsRelations = relations(ratings, ({ one }) => ({
  class: one(classes, {
    fields: [ratings.classId],
    references: [classes.id],
  }),
  rater: one(users, {
    fields: [ratings.raterId],
    references: [users.id],
    relationName: 'rater',
  }),
  rated: one(users, {
    fields: [ratings.ratedId],
    references: [users.id],
    relationName: 'rated',
  }),
}));

// Relacionamentos reversos nas tabelas users e classes
export const usersRatingsRelations = relations(users, ({ many }) => ({
  ratingsGiven: many(ratings, { relationName: 'rater' }),
  ratingsReceived: many(ratings, { relationName: 'rated' }),
}));

export const classesRatingsRelations = relations(classes, ({ many }) => ({
  ratings: many(ratings),
}));
