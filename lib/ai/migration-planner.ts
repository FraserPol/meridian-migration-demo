import type { LegacyRoute } from "@/lib/legacy-inventory";

export type MigrationApproach = "keep-domain-on-legacy" | "point-domain-to-vercel";
export type MigrationStrategy = "vertical" | "horizontal" | "hybrid";

export type MigrationRecommendation = {
  route: string;
  strategy: MigrationStrategy;
  approach: MigrationApproach;
  rationale: string;
};

/**
 * Deterministic, rule-based recommendation — NOT model-generated.
 *
 * This is a deliberate design decision: the Migration Copilot's LLM layer
 * decides *when* to call this tool and explains the result in plain
 * language, but the actual strategy and generated config text (see
 * generateMigrationSnippet below) come from plain TypeScript, not from
 * the model. For a regulated customer, "the AI wrote our routing config"
 * is a much harder sell than "the AI orchestrated a lookup against a
 * reviewed, deterministic rules engine." Same reason database migrations
 * shouldn't be generated free-form by an LLM either.
 *
 * Rules, mapped to https://vercel.com/docs/incremental-migration:
 *   - Any single route is a "vertical" migration by definition (migrating
 *     by feature). Routes with meaningful traffic or complexity also get
 *     a "horizontal" rollout by user group layered on top (hybrid) —
 *     ship to internal admins first, then a canary of customers, then
 *     everyone — rather than a single global cutover.
 *   - Low-complexity, low-traffic routes are safe to migrate with the
 *     lighter-weight "keep your domain on the legacy server" approach
 *     (a single reverse-proxy rule once verified).
 *   - Everything else uses "point your domain to Vercel" with a fallback
 *     rewrite, so a Global Config flag can instantly fall back to legacy
 *     without touching the legacy proxy at all mid-incident.
 */
export function recommendMigrationStrategy(route: LegacyRoute): MigrationRecommendation {
  const isRiskier = route.complexity !== "low" || route.trafficPct >= 15;

  const strategy: MigrationStrategy = isRiskier ? "hybrid" : "vertical";
  const approach: MigrationApproach = isRiskier
    ? "point-domain-to-vercel"
    : "keep-domain-on-legacy";

  const rationale = isRiskier
    ? `${route.route} carries ${route.trafficPct}% of traffic with ${route.complexity} complexity ` +
      `(currently ${route.currentStack}). Recommend a hybrid migration: cut this feature over ` +
      `(vertical) but roll it out by user group first (horizontal) — internal admins, then a ` +
      `small customer canary, then everyone. Use the "point your domain to Vercel" approach so a ` +
      `single Global Config flag can fall back to the legacy origin instantly if something breaks ` +
      `mid-rollout, without waiting on ${route.owner} to touch the legacy proxy.`
    : `${route.route} is low complexity and low traffic (${route.trafficPct}%, currently ` +
      `${route.currentStack}). A straightforward vertical migration is enough — verify it fully on ` +
      `Vercel first, then add one reverse-proxy rule on the legacy server ("keep your domain on the ` +
      `legacy server" approach) to send just this path over. No Global Config infrastructure needed yet.`;

  return { route: route.route, strategy, approach, rationale };
}

/**
 * Generates the actual configuration text for a recommendation.
 * Template-based on purpose — see the comment on recommendMigrationStrategy.
 *
 * KNOWN FUTURE RISK — unescaped string interpolation: route.route and
 * route.owner are template-literal'd directly into generated code/config
 * below with no escaping, at four points: `basePath: "${route.route}"` and
 * `matcher: ["${route.route}"]` (breaking out of the string injects
 * executable code into next.config.ts/proxy.ts, files Next.js actually
 * runs, not just displays); the nginx `location`/`proxy_pass` lines
 * (injects arbitrary nginx directives if route.route contains `{`, `}`, or
 * a newline); and the inline `//` comment referencing route.route (a
 * newline there ends the comment early, turning the rest of the string
 * into live, uncommented code in the generated file). Safe today only
 * because getLegacyRouteInventory() is a hardcoded array the developer
 * wrote — there is no untrusted input reaching these fields. That stops
 * being true the moment this becomes a real CMDB export: whoever can write
 * to the CMDB (or tamper with its export pipeline) controls these strings,
 * and "an admin reviews and merges the generated snippet"
 * (solution-architecture.md) is a weak safeguard against a route name
 * crafted to look normal at a glance. Fix then: escape/validate route
 * fields before interpolation, or generate structured config (e.g. AST/
 * object construction) instead of string-templating.
 */
export function generateMigrationSnippet(
  route: LegacyRoute,
  approach: MigrationApproach,
): { filename: string; language: string; code: string }[] {
  if (approach === "keep-domain-on-legacy") {
    return [
      {
        filename: "next.config.ts (Vercel project)",
        language: "ts",
        code: `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "${route.route}",
};

export default nextConfig;
`,
      },
      {
        filename: `nginx.conf (legacy server, owned by ${route.owner})`,
        language: "nginx",
        code: `location ${route.route} {
    proxy_pass https://meridian-migration-demo.vercel.app${route.route};
}
`,
      },
    ];
  }

  return [
    {
      filename: "next.config.ts (Vercel project)",
      language: "ts",
      code: `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      // Everything falls back to the legacy origin except paths we've
      // explicitly migrated. Remove entries here as each route lands.
      fallback: [
        {
          source: "/:path*",
          destination: "https://legacy.meridiancapital.internal/:path*",
        },
      ],
    };
  },
};

export default nextConfig;
`,
    },
    {
      filename: "proxy.ts (Global Config kill-switch)",
      language: "ts",
      code: `import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/edge-config";

export const config = { matcher: ["${route.route}"] };

export async function proxy(request: NextRequest) {
  // Flip "isNewVersionActive" off in Global Config to send ${route.route}
  // back to the legacy origin instantly — no redeploy, no ticket.
  const isNewVersionActive = await get<boolean>("isNewVersionActive_${slugify(route.route)}");
  if (!isNewVersionActive) {
    const url = request.nextUrl.clone();
    url.hostname = "legacy.meridiancapital.internal";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}
`,
    },
  ];
}

function slugify(route: string): string {
  return route.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
