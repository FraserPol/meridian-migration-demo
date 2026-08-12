import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

/**
 * Demo note (Step 2 of the SA take-home): in a real incremental migration,
 * this file is where the "Point your domain to Vercel" approach lives —
 * a `fallback` rewrite sends unmigrated paths back to the legacy origin
 * while migrated paths are served by Vercel. See docs:
 * https://vercel.com/docs/incremental-migration
 *
 * This demo app has nothing legacy to fall back to (it's a greenfield
 * Next.js app), so the object below is left empty on purpose. The
 * Migration Copilot (see app/admin/migration-copilot) generates this
 * exact shape of config for Meridian's *actual* legacy routes.
 */
const nextConfig: NextConfig = {
  async rewrites() {
    return {
      fallback: [],
    };
  },
  // Next.js 16 primitive named explicitly in the take-home brief. Every
  // authenticated route in this app reads the session cookie (a genuinely
  // request-time-dependent value — there is no static shell to serve a
  // signed-out visitor), so those segments opt out of instant-navigation
  // validation with `export const instant = false` rather than being
  // forced into a Suspense-per-layout rewrite of the auth flow. The one
  // segment that's genuinely cacheable — the legacy route inventory the
  // Migration Copilot reads — adopts `"use cache"` for real. See
  // lib/legacy-inventory.ts and README.md "Known limitations."
  cacheComponents: true,
};

// Compiles workflows/**'s "use workflow"/"use step" directives — see
// workflows/migration-copilot/workflow.ts.
export default withWorkflow(nextConfig);
