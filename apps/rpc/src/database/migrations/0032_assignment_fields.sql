ALTER TABLE "class_announcements" ADD COLUMN "points" integer;--> statement-breakpoint
ALTER TABLE "class_announcements" ADD COLUMN "time_limit_minutes" integer;--> statement-breakpoint
ALTER TABLE "class_announcements" ADD COLUMN "rubric" jsonb DEFAULT '[]'::jsonb NOT NULL;