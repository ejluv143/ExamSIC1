CREATE TABLE "post_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"announcement_id" text NOT NULL,
	"student_id" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"turned_in_at" timestamp with time zone,
	"score" integer,
	"returned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_submissions_post_student_unique" UNIQUE("announcement_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "class_announcements" ADD COLUMN "accepting_submissions" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "post_submissions" ADD CONSTRAINT "post_submissions_announcement_id_class_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."class_announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_submissions" ADD CONSTRAINT "post_submissions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;