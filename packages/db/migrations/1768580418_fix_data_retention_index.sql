-- Fix data retention cleanup index for PostgreSQL generic plans
-- Partial indexes don't work with prepared statements after PostgreSQL switches to generic plans.
-- Replace partial index with composite index that includes data_retention_cleaned_up as a column.
DROP INDEX IF EXISTS "log_data_retention_pending_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "log_data_retention_idx" ON "log" ("project_id","data_retention_cleaned_up","created_at");
