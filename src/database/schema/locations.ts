import {
  pgTable,
  uuid,
  varchar,
  text,
  decimal,
  json,
  timestamp,
  integer,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Locations table
export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address').notNull(),
  lat: decimal('lat', { precision: 10, scale: 8 }).notNull(),
  lng: decimal('lng', { precision: 11, scale: 8 }).notNull(),
  type: varchar('type', { length: 50 }).notNull().default('other'), // gym, park, home, other
  rating: decimal('rating', { precision: 3, scale: 2 }), // 0.00 to 5.00
  openingHours: text('opening_hours'),
  phone: varchar('phone', { length: 20 }),
  website: text('website'),
  photos: json('photos').$type<string[]>(),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// User favorite locations table
export const userFavoriteLocations = pgTable('user_favorite_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  locationId: uuid('location_id').notNull(),
  customName: varchar('custom_name', { length: 255 }),
  usageCount: integer('usage_count').default(1).notNull(),
  lastUsedAt: timestamp('last_used_at').defaultNow().notNull(),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const locationsRelations = relations(locations, ({ many }) => ({
  userFavorites: many(userFavoriteLocations),
}));

export const userFavoriteLocationsRelations = relations(
  userFavoriteLocations,
  ({ one }) => ({
    user: one(users, {
      fields: [userFavoriteLocations.userId],
      references: [users.id],
    }),
    location: one(locations, {
      fields: [userFavoriteLocations.locationId],
      references: [locations.id],
    }),
  }),
);

// Import users table for relations
import { users } from './users';
