CREATE TABLE IF NOT EXISTS "migration_copilot_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tool_calls" jsonb NOT NULL,
	"providers" jsonb NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"total_tokens" integer NOT NULL,
	"estimated_cost_usd" numeric(10, 6) NOT NULL,
	"final_response_text" text NOT NULL
);
