import { pgTable, uuid, varchar, text, timestamp, boolean, pgEnum, json } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userTypeEnum = pgEnum('user_type', ['student', 'personal']);
export const userStatusEnum = pgEnum('user_status', ['active', 'inactive', 'suspended']);

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  userType: userTypeEnum('user_type').notNull(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  birthDate: timestamp('birth_date'),
  profileImageUrl: text('profile_image_url'),
  isVerified: boolean('is_verified').default(false),
  status: userStatusEnum('status').default('active'),
  
  // Campos específicos para Personal Trainers
  cref: varchar('cref', { length: 20 }),
  specialties: json('specialties').$type<string[]>(),
  
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
