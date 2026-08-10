import type { NextConfig } from "next";

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
};

export default nextConfig;
