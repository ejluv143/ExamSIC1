CREATE TABLE "class_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"kind" text DEFAULT 'link' NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_resources" ADD CONSTRAINT "class_resources_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_resources_class_id_idx" ON "class_resources" USING btree ("class_id","created_at");