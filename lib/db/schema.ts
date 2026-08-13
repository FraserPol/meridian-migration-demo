import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  numeric,
  integer,
  jsonb,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Two roles for this demo: "customer" (the end user tracking stocks) and
// "admin" (the legacy IT admin persona the Migration Copilot is built for).
// See solution-architecture.md Section 3 for why the AI feature targets
// admins specifically.
export const userRole = pgEnum("user_role", ["customer", "admin"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("customer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Split from `users` on purpose: "create a profile" is a distinct step in
// the take-home's app description, and keeping it separate lets the demo
// show both states — a user who has an account but no profile yet, and one
// who has completed onboarding.
export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  investmentGoal: text("investment_goal").notNull(),
  riskTolerance: text("risk_tolerance").notNull(), // "conservative" | "balanced" | "aggressive"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    // Snapshot of the price at the moment it was added, purely for demo
    // flavor in the UI ("added at $x, now at $y").
    addedAtPrice: numeric("added_at_price", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userTickerUnique: uniqueIndex("watchlist_items_user_ticker_idx").on(
      table.userId,
      table.ticker,
    ),
  }),
);

// The Migration Copilot's audit trail — "eat your own dog food" on the
// solution-architecture.md pitch that AI Gateway gives Finance/Compliance
// a spend/trace record: every run gets a Postgres row recording who asked,
// what tools ran (in what order), which provider actually served each
// model call (visible proof of Gateway failover if/when it happens — see
// order: ["bedrock", "anthropic"] in workflows/migration-copilot/workflow.ts),
// token usage, and an estimated cost (see lib/ai/pricing.ts). Written by a
// durable step at the end of the workflow run, not the route handler —
// see persistCopilotRun in workflows/migration-copilot/workflow.ts.
export type CopilotToolCallRecord = { name: string; input: unknown; output: unknown };
// `role` distinguishes the step-up classifier call (lib/ai/routing.ts) from
// the main agent's own model-call steps — both are recorded here so the
// classifier's cost/provider is visible in the audit trail too, not just
// the agent's. `note` carries the classifier's one-line tier justification.
export type CopilotProviderRecord = {
  provider: string;
  modelId: string;
  role?: "classifier" | "agent";
  note?: string;
};

export const migrationCopilotRuns = pgTable("migration_copilot_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminEmail: text("admin_email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Ordered array of { name, input, output } — one entry per tool call.
  toolCalls: jsonb("tool_calls").$type<CopilotToolCallRecord[]>().notNull(),
  // Ordered array of { provider, modelId } — one entry per model-call step.
  providers: jsonb("providers").$type<CopilotProviderRecord[]>().notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 6 }).notNull(),
  finalResponseText: text("final_response_text").notNull(),
  // Whether the live-failover-demo toggle was on for this run — see
  // workflows/migration-copilot/workflow.ts. When true, the workflow
  // deliberately breaks the primary model slug so AI Gateway's real
  // providerOptions.gateway.models fallback list has to serve the request
  // — the `providers` column above is still the honest record of which
  // model actually served it, so a run with this flag set should show the
  // fallback model, not the primary, in that column.
  simulatedFailureRequested: boolean("simulated_failure_requested").notNull().default(false),
});

export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type WatchlistItem = typeof watchlistItems.$inferSelect;
export type MigrationCopilotRun = typeof migrationCopilotRuns.$inferSelect;
