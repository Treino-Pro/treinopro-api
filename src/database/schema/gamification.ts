import { pgTable, text, integer, timestamp, boolean, json, uuid, varchar, decimal } from 'drizzle-orm/pg-core';
import { users } from './users';

// ===== TABELAS DE GAMIFICAÇÃO =====

// Perfil de gamificação do usuário
export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  level: integer('level').default(1).notNull(),
  totalXP: integer('total_xp').default(0).notNull(),
  currentLevelXP: integer('current_level_xp').default(0).notNull(),
  achievements: json('achievements').$type<string[]>().default([]),
  missions: json('missions').$type<string[]>().default([]),
  lastMissionReset: timestamp('last_mission_reset'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Missões do sistema
export const missions = pgTable('missions', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  xpReward: integer('xp_reward').notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'daily', 'weekly', 'monthly', 'special'
  action: varchar('action', { length: 100 }).notNull(), // Ação que a missão monitora
  isActive: boolean('is_active').default(true).notNull(),
  priority: integer('priority').default(0).notNull(), // Prioridade para atribuição automática (0 = mais alta)
  autoAssign: boolean('auto_assign').default(true).notNull(), // Se deve ser atribuída automaticamente
  prerequisites: json('prerequisites').$type<string[]>().default([]), // IDs das missões que devem ser completadas antes
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  requirements: json('requirements').$type<{
    action: string;
    count: number;
    timeframe?: string;
    conditions?: Record<string, any>;
  }>().notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Conquistas do sistema
export const achievements = pgTable('achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  xpReward: integer('xp_reward').notNull(),
  icon: varchar('icon', { length: 100 }),
  category: varchar('category', { length: 50 }).notNull(), // 'training', 'social', 'streak', 'special'
  action: varchar('action', { length: 100 }).notNull(), // Ação que a conquista monitora
  requirements: json('requirements').$type<{
    action: string;
    count: number;
    conditions?: Record<string, any>;
  }>().notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Conquistas conquistadas pelos usuários
export const userAchievements = pgTable('user_achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  achievementId: uuid('achievement_id').references(() => achievements.id, { onDelete: 'cascade' }).notNull(),
  earnedAt: timestamp('earned_at').defaultNow().notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Missões atribuídas aos usuários
export const userMissions = pgTable('user_missions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  missionId: uuid('mission_id').references(() => missions.id, { onDelete: 'cascade' }).notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(), // 'active', 'completed', 'expired'
  progress: integer('progress').default(0).notNull(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Histórico de XP (para auditoria e estatísticas)
export const xpHistory = pgTable('xp_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  xpAmount: integer('xp_amount').notNull(),
  source: varchar('source', { length: 50 }).notNull(), // 'class_completion', 'achievement', 'mission', 'bonus'
  sourceId: uuid('source_id'), // ID da fonte (aula, conquista, missão)
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ===== ENUMS =====

export const MissionType = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  SPECIAL: 'special',
} as const;

export const AchievementCategory = {
  TRAINING: 'training',
  SOCIAL: 'social',
  STREAK: 'streak',
  SPECIAL: 'special',
} as const;

export const MissionStatus = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  EXPIRED: 'expired',
} as const;

export const XPSource = {
  CLASS_COMPLETION: 'class_completion',
  ACHIEVEMENT: 'achievement',
  MISSION: 'mission',
  BONUS: 'bonus',
} as const;

// ===== TIPOS TYPESCRIPT =====

export type MissionType = typeof MissionType[keyof typeof MissionType];
export type AchievementCategory = typeof AchievementCategory[keyof typeof AchievementCategory];
export type MissionStatus = typeof MissionStatus[keyof typeof MissionStatus];
export type XPSource = typeof XPSource[keyof typeof XPSource];

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
export type Mission = typeof missions.$inferSelect;
export type NewMission = typeof missions.$inferInsert;
export type Achievement = typeof achievements.$inferSelect;
export type NewAchievement = typeof achievements.$inferInsert;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type NewUserAchievement = typeof userAchievements.$inferInsert;
export type UserMission = typeof userMissions.$inferSelect;
export type NewUserMission = typeof userMissions.$inferInsert;
export type XPHistory = typeof xpHistory.$inferSelect;
export type NewXPHistory = typeof xpHistory.$inferInsert;
