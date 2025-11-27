-- Migration: Switch from boolean data_retention_cleaned_up to timestamp cleaned_up_at
-- This enables better index selectivity and query optimization for log cleanup

-- Add cleaned_up_at column
ALTER TABLE "log" ADD COLUMN "cleaned_up_at" timestamp;--> statement-breakpoint

-- Backfill cleaned_up_at for already-cleaned rows using updated_at as approximation
UPDATE "log" SET "cleaned_up_at" = "updated_at" WHERE "data_retention_cleaned_up" = true;--> statement-breakpoint

-- Drop the old boolean column
ALTER TABLE "log" DROP COLUMN "data_retention_cleaned_up";--> statement-breakpoint

-- Drop old partial index
DROP INDEX IF EXISTS "log_data_retention_pending_idx";--> statement-breakpoint

-- Create new partial index for cleanup worker - only uncleaned rows
CREATE INDEX IF NOT EXISTS "idx_log_cleanup_queue" ON "log" USING btree ("project_id","created_at") WHERE cleaned_up_at IS NULL;--> statement-breakpoint

-- Create index for cleaned history - helps exclude old cleaned rows from scans
CREATE INDEX IF NOT EXISTS "idx_log_cleaned_history" ON "log" USING btree ("cleaned_up_at");
