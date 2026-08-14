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
// Baseline security headers for a bank-facing demo. CSP allows 'unsafe-inline'
// for script/style because Next.js's inline bootstrap/hydration scripts and
// styled-jsx aren't nonce-wired in this app — a real hardening pass would add
// a per-request nonce and drop both 'unsafe-inline' entries (see README.md
// "Known limitations"). script-src/connect-src additionally allowlist
// Vercel's own domains because Analytics and Speed Insights (app/layout.tsx)
// load a script from and beacon to them.
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
