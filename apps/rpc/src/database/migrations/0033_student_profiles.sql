ALTER TYPE "public"."asset_purpose" ADD VALUE 'profile';--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"usn" text DEFAULT '' NOT NULL,
	"lrn" text DEFAULT '' NOT NULL,
	"middle_name" text DEFAULT '' NOT NULL,
	"suffix" text DEFAULT '' NOT NULL,
	"purok" text DEFAULT '' NOT NULL,
	"barangay" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"contact_number" text DEFAULT '' NOT NULL,
	"birth_date" text DEFAULT '' NOT NULL,
	"personal_email" text DEFAULT '' NOT NULL,
	"facebook_url" text DEFAULT '' NOT NULL,
	"contact_first_name" text DEFAULT '' NOT NULL,
	"contact_last_name" text DEFAULT '' NOT NULL,
	"contact_middle_name" text DEFAULT '' NOT NULL,
	"contact_phone" text DEFAULT '' NOT NULL,
	"contact_address" text DEFAULT '' NOT NULL,
	"picture" text,
	"signature" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;