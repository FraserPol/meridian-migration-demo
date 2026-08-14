import { cacheLife, cacheTag } from "next/cache";

/**
 * Mocked inventory of Meridian's existing AWS/EKS-hosted app that the
 * Migration Copilot advises on.
 *
 * Per the take-home brief, this stands in for "an AWS-hosted API or a
 * realistic mock" — in production this would be a real internal endpoint
 * (a CMDB, a routing table export, an EKS Ingress dump), reached the same
 * way the app reaches Postgres and Vault: over Secure Compute. For this
 * demo it's static data so the reviewer can run it without standing up a
 * second AWS service, while the Migration Copilot's tool-calling code path
 * is identical either way — see app/api/chat/route.ts.
 *
 * This is also the one genuinely cacheable read in the app — unlike the
 * session-gated pages (see next.config.ts), nothing about this data is
 * per-user or per-request. In production it would be a CMDB export that
 * changes on a change-management cadence, not per request, so it's
 * wrapped in "use cache" with a long cacheLife rather than refetched
 * every tool call. Route Handlers can't put "use cache" on the exported
 * GET/POST function itself, so both call sites (the tool below and
 * app/api/legacy-inventory/route.ts) go through this cached helper.
 */
export type LegacyRoute = {
  route: string;
  tier: "frontend" | "app";
  currentStack: string;
  trafficPct: number;
  complexity: "low" | "medium" | "high";
  owner: string;
  notes: string;
};

const rawLegacyRouteInventory: LegacyRoute[] = [
  {
    route: "/watchlist",
    tier: "frontend",
    currentStack: "React (CRA) served from S3 + CloudFront, IT-managed",
    trafficPct: 42,
    complexity: "low",
    owner: "Web Team",
    notes: "Mostly static, reads from the profile API. Good first candidate.",
  },
  {
    route: "/profile",
    tier: "frontend",
    currentStack: "React (CRA) served from S3 + CloudFront, IT-managed",
    trafficPct: 19,
    complexity: "low",
    owner: "Web Team",
    notes: "Simple CRUD form. Low risk to migrate alongside /watchlist.",
  },
  {
    route: "/api/profile",
    tier: "app",
    currentStack: "Java Spring Boot on EKS",
    trafficPct: 18,
    complexity: "medium",
    owner: "Platform Team",
    notes: "Talks directly to RDS. Needs the Vault + Secure Compute pattern before cutover.",
  },
  {
    route: "/api/watchlist",
    tier: "app",
    currentStack: "Java Spring Boot on EKS",
    trafficPct: 15,
    complexity: "medium",
    owner: "Platform Team",
    notes: "Same backend service as /api/profile; migrate together.",
  },
  {
    route: "/admin/reports",
    tier: "frontend",
    currentStack: "Legacy jQuery admin panel, IT-managed VM",
    trafficPct: 4,
    complexity: "high",
    owner: "Internal Tools Team",
    notes: "Low traffic but tightly coupled to a nightly batch job. Migrate last.",
  },
  {
    route: "/api/market-data-proxy",
    tier: "app",
    currentStack: "Node.js on EC2, proxies a third-party quotes vendor",
    trafficPct: 2,
    complexity: "low",
    owner: "Platform Team",
    notes: "Stateless proxy, no session concerns. Easy win once profile/watchlist land.",
  },
];

export async function getLegacyRouteInventory(): Promise<LegacyRoute[]> {
  "use cache";
  cacheLife("max");
  // No revalidateTag("legacy-route-inventory") call exists anywhere yet —
  // deliberately. rawLegacyRouteInventory above is a static, hardcoded
  // array; nothing in this demo ever mutates it, so there's no event to
  // hang an invalidation on. This tag is the hook for the real fix once
  // the inventory becomes an actual CMDB export: a webhook route that
  // calls revalidateTag("legacy-route-inventory") on each
  // change-management event, not a fake trigger wired up just to look
  // dynamic today.
  cacheTag("legacy-route-inventory");
  return rawLegacyRouteInventory;
}
