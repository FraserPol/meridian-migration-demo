import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  numeric,
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

export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type WatchlistItem = typeof watchlistItems.$inferSelect;
