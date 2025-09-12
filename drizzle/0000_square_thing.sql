DO $$ BEGIN
 CREATE TYPE "class_status" AS ENUM('scheduled', 'active', 'completed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "evaluation_type" AS ENUM('student_to_personal', 'personal_to_student');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "financial_status" AS ENUM('pending', 'completed', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "financial_type" AS ENUM('earning', 'payment', 'withdrawal');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "user_status" AS ENUM('active', 'inactive', 'suspended');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "user_type" AS ENUM('student', 'personal');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "proposal_status" AS ENUM('pending', 'matched', 'completed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"receiver_id" uuid NOT NULL,
	"message_text" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"personal_id" uuid NOT NULL,
	"location" varchar(255) NOT NULL,
	"date" timestamp NOT NULL,
	"time" varchar(10) NOT NULL,
	"duration" integer NOT NULL,
	"status" "class_status" DEFAULT 'scheduled',
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"evaluator_id" uuid NOT NULL,
	"evaluated_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"type" "evaluation_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"personal_id" uuid NOT NULL,
	"bank_name" varchar(100) NOT NULL,
	"agency" varchar(20) NOT NULL,
	"account" varchar(20) NOT NULL,
	"account_type" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"personal_id" uuid NOT NULL,
	"class_id" uuid,
	"amount" numeric(10, 2) NOT NULL,
	"type" "financial_type" NOT NULL,
	"status" "financial_status" DEFAULT 'pending',
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "health_questionnaires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"medical_condition" text,
	"regular_medication" text,
	"chronic_injury" text,
	"training_goal" text,
	"dietary_restrictions" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"user_type" "user_type" NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"phone" varchar(20),
	"birth_date" timestamp,
	"profile_image_url" text,
	"is_verified" boolean DEFAULT false,
	"status" "user_status" DEFAULT 'active',
	"cref" varchar(20),
	"specialties" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"location_id" uuid,
	"location_name" varchar(255),
	"location_address" text,
	"training_date" timestamp NOT NULL,
	"training_time" varchar(10) NOT NULL,
	"duration_minutes" integer NOT NULL,
	"modality_id" uuid,
	"modality_name" varchar(100),
	"price" numeric(10, 2) NOT NULL,
	"additional_notes" text,
	"status" "proposal_status" DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
