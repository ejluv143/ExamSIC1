CREATE INDEX "attempts_in_progress_session_id_idx" ON "attempts" USING btree ("session_id") WHERE "attempts"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX "quiz_sessions_status_opens_at_idx" ON "quiz_sessions" USING btree ("status","opens_at");--> statement-breakpoint
CREATE INDEX "quiz_sessions_status_closes_at_idx" ON "quiz_sessions" USING btree ("status","closes_at");