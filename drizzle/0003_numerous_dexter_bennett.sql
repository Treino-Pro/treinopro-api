CREATE TABLE IF NOT EXISTS "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"address" text NOT NULL,
	"lat" numeric(10, 8) NOT NULL,
	"lng" numeric(11, 8) NOT NULL,
	"type" varchar(50) DEFAULT 'other' NOT NULL,
	"rating" numeric(3, 2),
	"opening_hours" text,
	"phone" varchar(20),
	"website" text,
	"photos" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_favorite_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"custom_name" varchar(255),
	"usage_count" integer DEFAULT 1 NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
