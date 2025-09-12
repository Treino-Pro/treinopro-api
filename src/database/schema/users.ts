import { pgTable, uuid, varchar, text, timestamp, boolean, pgEnum, json } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userTypeEnum = pgEnum('user_type', ['student', 'personal']);
export const userStatusEnum = pgEnum('user_status', ['active', 'inactive', 'suspended']);
export const documentTypeEnum = pgEnum('document_type', ['RG', 'CNH']);

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  userType: userTypeEnum('user_type').notNull(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  birthDate: timestamp('birth_date').notNull(),
  
  // Documentos de identificação (obrigatórios)
  documentType: documentTypeEnum('document_type').notNull(),
  documentNumber: varchar('document_number', { length: 20 }).notNull(),
  documentImageUrl: text('document_image_url').notNull(),
  
  // Campos específicos para Personal Trainers
  cref: varchar('cref', { length: 20 }),
  crefImageUrl: text('cref_image_url'),
  crefValidated: boolean('cref_validated').default(false),
  specialties: json('specialties').$type<string[]>(),
  
  // Campos para menores de idade
  isMinor: boolean('is_minor').default(false),
  guardianName: varchar('guardian_name', { length: 200 }),
  guardianEmail: varchar('guardian_email', { length: 255 }),
  guardianConsent: boolean('guardian_consent').default(false),
  guardianConsentDate: timestamp('guardian_consent_date'),
  
  // Termos e políticas (obrigatórios)
  termsAccepted: boolean('terms_accepted').default(false).notNull(),
  privacyPolicyAccepted: boolean('privacy_policy_accepted').default(false).notNull(),
  termsAcceptedDate: timestamp('terms_accepted_date'),
  
  // Outros campos
  profileImageUrl: text('profile_image_url'),
  isVerified: boolean('is_verified').default(false),
  status: userStatusEnum('status').default('active'),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  proposals: many(proposals),
  classesAsStudent: many(classes, { relationName: 'student' }),
  classesAsPersonal: many(classes, { relationName: 'personal' }),
  healthQuestionnaires: many(healthQuestionnaires),
  evaluationsGiven: many(evaluations, { relationName: 'evaluator' }),
  evaluationsReceived: many(evaluations, { relationName: 'evaluated' }),
  financialRecords: many(financialRecords),
}));

// Import other tables for relations
import { proposals } from './proposals';
import { classes } from './classes';
import { healthQuestionnaires } from './health';
import { evaluations } from './evaluations';
import { financialRecords } from './financial';
