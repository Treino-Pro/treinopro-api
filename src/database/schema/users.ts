import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  pgEnum,
  json,
  decimal,
  integer,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userTypeEnum = pgEnum('user_type', [
  'student',
  'personal',
  'admin',
]);
export const userStatusEnum = pgEnum('user_status', [
  'active',
  'inactive',
  'suspended',
]);
export const documentTypeEnum = pgEnum('document_type', ['RG', 'CNH']);

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  userType: userTypeEnum('user_type').notNull(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  birthDate: timestamp('birth_date').notNull(),

  // Documentos de identificação (obrigatórios)
  documentType: documentTypeEnum('document_type').notNull(),
  documentNumber: varchar('document_number', { length: 20 }).notNull(),
  documentImageId: uuid('document_image_id').references(() => files.id),

  // Campos específicos para Personal Trainers
  cref: varchar('cref', { length: 20 }), // Formato completo: SP-106227
  crefUf: varchar('cref_uf', { length: 2 }), // UF separada: SP
  crefNumber: varchar('cref_number', { length: 10 }), // Número separado: 106227
  crefImageId: uuid('cref_image_id').references(() => files.id),
  crefValidated: boolean('cref_validated').default(false),
  crefValidatedAt: timestamp('cref_validated_at'),
  crefValidatedName: varchar('cref_validated_name', { length: 200 }), // Nome do CONFEF
  crefValidatedSituation: varchar('cref_validated_situation', { length: 100 }), // Situação do CONFEF
  specialties: json('specialties').$type<string[]>(),

  // Campos para menores de idade
  isMinor: boolean('is_minor').default(false),
  guardianName: varchar('guardian_name', { length: 200 }),
  guardianEmail: varchar('guardian_email', { length: 255 }),
  guardianConsent: boolean('guardian_consent').default(false),
  guardianConsentDate: timestamp('guardian_consent_date'),

  // Termos e políticas (obrigatórios)
  termsAccepted: boolean('terms_accepted').default(false).notNull(),
  privacyPolicyAccepted: boolean('privacy_policy_accepted')
    .default(false)
    .notNull(),
  termsAcceptedDate: timestamp('terms_accepted_date'),

  // Rating do usuário (como Uber - todos começam com 5.0)
  rating: decimal('rating', { precision: 3, scale: 2 }).default('5.00'),
  totalRatings: integer('total_ratings').default(0),

  // Outros campos
  profileImageId: uuid('profile_image_id').references(() => files.id),
  isVerified: boolean('is_verified').default(false),
  status: userStatusEnum('status').default('active'),

  // Firebase Cloud Messaging
  fcmToken: text('fcm_token'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  proposals: many(proposals),
  classesAsStudent: many(classes, { relationName: 'student' }),
  classesAsPersonal: many(classes, { relationName: 'personal' }),
  healthQuestionnaires: many(healthQuestionnaires),
  evaluationsGiven: many(evaluations, { relationName: 'evaluator' }),
  evaluationsReceived: many(evaluations, { relationName: 'evaluated' }),
  financialRecords: many(financialRecords),
  // File relations
  profileImage: one(files, {
    fields: [users.profileImageId],
    references: [files.id],
  }),
  documentImage: one(files, {
    fields: [users.documentImageId],
    references: [files.id],
  }),
  crefImage: one(files, {
    fields: [users.crefImageId],
    references: [files.id],
  }),
}));

// Import other tables for relations
import { proposals } from './proposals';
import { classes } from './classes';
import { healthQuestionnaires } from './health';
import { evaluations } from './evaluations';
import { financialRecords } from './financial';
import { files } from './files';
