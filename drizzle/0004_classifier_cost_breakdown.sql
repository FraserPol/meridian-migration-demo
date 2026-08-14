ALTER TABLE "migration_copilot_runs" ADD COLUMN "classifier_input_tokens" integer;--> statement-breakpoint
ALTER TABLE "migration_copilot_runs" ADD COLUMN "classifier_output_tokens" integer;--> statement-breakpoint
ALTER TABLE "migration_copilot_runs" ADD COLUMN "classifier_cost_usd" numeric(10, 6);