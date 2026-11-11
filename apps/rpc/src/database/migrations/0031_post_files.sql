ALTER TYPE "public"."asset_purpose" ADD VALUE 'post';--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "class_announcements" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;