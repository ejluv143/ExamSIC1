CREATE TABLE "post_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"announcement_id" text NOT NULL,
	"student_id" text NOT NULL,
	"author_id" text NOT NULL,
	"from_teacher" boolean DEFAULT false NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_announcement_id_class_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."class_announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_comments_thread_idx" ON "post_comments" USING btree ("announcement_id","student_id","created_at");