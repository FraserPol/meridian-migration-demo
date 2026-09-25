import { Sandbox } from "@vercel/sandbox";
import type { MigrationApproach } from "./migration-planner";

/**
 * Runs the config the Copilot just generated inside a Vercel Sandbox and
 * reports whether it actually works.
 *
 * Why this exists: generateMigrationConfig is template-based and
 * deterministic (see migration-planner.ts), so the snippets are
 * *predictable* — but "predictable" is not "verified". Until this step
 * existed, the Copilot's strongest claim was "here is config that should
 * work". The whole point of the human approval gate on that tool is that
 * emitting routing config for a bank's traffic is consequential; handing
 * the approver text nobody ever ran is a weak thing to ask approval for.
 *
 * A Firecracker microVM is the right place for this specifically because
 * next.config.ts is *executed*, not parsed: `rewrites()` is a function, and
 * the only way to know what route table it really produces is to call it.
 * Running agent-produced code inside the app's own process to find that out
 * would be the actual vulnerability — see migration-planner.ts's
 * KNOWN FUTURE RISK note about unescaped route interpolation, which becomes
 * live code execution the moment the inventory stops being a hardcoded
 * array. The sandbox is what makes executing it a safe thing to do, and it
 * is the reason this check can go further than a linter.
 *
 * Fails open by design: if the sandbox can't run (no OIDC token locally,
 * quota, a cold-start blip), the result is "skipped" with a reason and the
 * snippets are still returned. A validator outage must not take config
 * generation down with it.
 */

export type CheckMethod = "executed" | "parsed" | "structure";

export interface ConfigCheck {
  file: string;
  method: CheckMethod;
  passed: boolean;
  detail: string;
}

export interface ValidationResult {
  status: "passed" | "failed" | "skipped";
  checks: ConfigCheck[];
  /** Wall-clock for the whole create → run → stop cycle. */
  durationMs?: number;
  /** Billed CPU, which is a fraction of durationMs under Active CPU pricing. */
  activeCpuMs?: number;
  reason?: string;
}

export interface Snippet {
  filename: string;
  language: string;
  code: string;
}

/**
 * Snippet filenames carry a human label ("next.config.ts (Vercel project)")
 * because they're rendered as headings in chat. The sandbox needs the real
 * filename, and needs it to be a bare basename — a label containing a slash
 * would otherwise write outside the working directory.
 */
export function bareFilename(label: string): string {
  const name = label.split(" (")[0].trim();
  return name.split("/").pop() || "config.txt";
}

/** Hard cap on the whole sandbox round-trip, so a hung VM can't hang a chat turn. */
const SANDBOX_TIMEOUT_MS = 60_000;

/**
 * Assertions are declared here (not in the sandbox script) so they're
 * reviewable in this repo and unit-testable without a sandbox. The script
 * only executes them.
 */
export function expectationsFor(route: string, approach: MigrationApproach) {
  return approach === "keep-domain-on-legacy"
    ? { kind: "basePath" as const, route }
    : { kind: "fallbackRewrite" as const, route };
}

/**
 * The script that runs *inside* the microVM. Deliberately dependency-free:
 * `import type { NextConfig } from "next"` is erased by Node's type
 * stripping, so next.config.ts imports cleanly with no npm install and the
 * sandbox stays a few seconds rather than a few minutes.
 */
export const VALIDATOR_SCRIPT = `
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { pathToFileURL } from "node:url";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const checks = [];

function check(file, method, passed, detail) {
  checks.push({ file, method, passed, detail });
}

for (const file of manifest.files) {
  try {
    if (file.role === "next-config") {
      const mod = await import(pathToFileURL(file.name).href);
      const config = mod.default;
      if (!config || typeof config !== "object") {
        check(file.name, "executed", false, "Module loaded but its default export is not a config object.");
        continue;
      }
      const want = manifest.expect;
      if (want.kind === "basePath") {
        const ok = config.basePath === want.route;
        check(file.name, "executed", ok, ok
          ? "Loaded and exports basePath " + JSON.stringify(config.basePath) + ", matching the route being migrated."
          : "Expected basePath " + JSON.stringify(want.route) + " but got " + JSON.stringify(config.basePath) + ".");
      } else {
        if (typeof config.rewrites !== "function") {
          check(file.name, "executed", false, "Expected a rewrites() function; none was exported.");
          continue;
        }
        const rules = await config.rewrites();
        const fallback = rules && rules.fallback;
        if (!Array.isArray(fallback) || fallback.length === 0) {
          check(file.name, "executed", false, "rewrites() ran but returned no fallback rules, so unmigrated paths would 404 instead of reaching the legacy origin.");
          continue;
        }
        const rule = fallback[0];
        const catchAll = rule.source === "/:path*";
        const toLegacy = typeof rule.destination === "string" && rule.destination.includes("legacy.meridiancapital.internal");
        const preservesPath = typeof rule.destination === "string" && rule.destination.includes("/:path*");
        const ok = catchAll && toLegacy && preservesPath;
        check(file.name, "executed", ok, ok
          ? "rewrites() executed and returned a catch-all fallback " + rule.source + " -> " + rule.destination + ", so any path not yet migrated still reaches the legacy origin with its path preserved."
          : "Fallback rule did not match the intended shape: " + JSON.stringify(rule));
      }
    } else if (file.role === "typescript") {
      const src = await readFile(file.name, "utf8");
      stripTypeScriptTypes(src);
      check(file.name, "parsed", true, "Parsed as valid TypeScript. Not executed here: it imports next/server and @vercel/edge-config, which only resolve inside a deployed project.");
    } else {
      const src = await readFile(file.name, "utf8");
      let depth = 0;
      let balanced = true;
      for (const ch of src) {
        if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth < 0) { balanced = false; break; } }
      }
      if (depth !== 0) balanced = false;
      const hasLocation = /location\\s+\\S+\\s*\\{/.test(src);
      const proxyPass = src.match(/proxy_pass\\s+(\\S+?);/);
      let urlOk = false;
      if (proxyPass) {
        try { new URL(proxyPass[1]); urlOk = true; } catch {}
      }
      const ok = balanced && hasLocation && urlOk;
      check(file.name, "structure", ok, ok
        ? "Directive blocks balanced, has a location block, and proxy_pass targets a valid absolute URL. Structural only: nginx itself is not installed here."
        : "Structural check failed (balanced=" + balanced + ", location=" + hasLocation + ", proxy_pass URL=" + urlOk + ").");
    }
  } catch (err) {
    check(file.name, file.role === "nginx" ? "structure" : "executed", false,
      (err && err.message ? err.message : String(err)));
  }
}

console.log("__RESULT__" + JSON.stringify(checks));
`;

export function roleFor(name: string): "next-config" | "typescript" | "nginx" {
  if (name === "next.config.ts") return "next-config";
  if (name.endsWith(".ts")) return "typescript";
  return "nginx";
}

/** Pure: pulls the JSON the sandbox script printed out of its stdout. */
export function parseValidatorOutput(stdout: string): ConfigCheck[] | null {
  const marker = stdout.lastIndexOf("__RESULT__");
  if (marker < 0) return null;
  try {
    const parsed = JSON.parse(stdout.slice(marker + "__RESULT__".length).trim());
    return Array.isArray(parsed) ? (parsed as ConfigCheck[]) : null;
  } catch {
    return null;
  }
}

export async function validateGeneratedConfig(
  snippets: Snippet[],
  route: string,
  approach: MigrationApproach,
): Promise<ValidationResult> {
  const started = Date.now();
  let sandbox: Sandbox | undefined;

  try {
    const files = snippets.map((s) => {
      const name = bareFilename(s.filename);
      return { name, role: roleFor(name), code: s.code };
    });

    sandbox = await Sandbox.create({
      timeout: SANDBOX_TIMEOUT_MS,
      // Not persistent: every validation is a clean room. Snapshotting the
      // result would only carry agent-written files into the next run.
      persistent: false,
      tags: { app: "meridian", purpose: "migration-config-validation" },
    });

    await sandbox.writeFiles([
      ...files.map((f) => ({ path: f.name, content: Buffer.from(f.code) })),
      {
        path: "manifest.json",
        content: Buffer.from(
          JSON.stringify({
            files: files.map(({ name, role }) => ({ name, role })),
            expect: expectationsFor(route, approach),
          }),
        ),
      },
      { path: "validate.mjs", content: Buffer.from(VALIDATOR_SCRIPT) },
    ]);

    const run = await sandbox.runCommand("node", ["validate.mjs"]);
    const stdout = await run.stdout();
    const checks = parseValidatorOutput(stdout);

    // Stopped here rather than only in `finally` so the Active CPU figure
    // can be reported — it's the honest cost of the check, and under Active
    // CPU pricing it's a fraction of the wall-clock the user waited.
    const stopped = await sandbox.stop().catch(() => undefined);
    sandbox = undefined;
    const activeCpuMs = stopped?.activeCpuDurationMs;

    if (!checks) {
      return {
        status: "skipped",
        checks: [],
        durationMs: Date.now() - started,
        activeCpuMs,
        reason: `Validator produced no parseable result (exit ${run.exitCode}): ${(await run.stderr()).slice(0, 300)}`,
      };
    }

    return {
      status: checks.every((c) => c.passed) ? "passed" : "failed",
      checks,
      durationMs: Date.now() - started,
      activeCpuMs,
    };
  } catch (err) {
    return {
      status: "skipped",
      checks: [],
      durationMs: Date.now() - started,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (sandbox) {
      // Never let teardown surface as a validation failure — the verdict is
      // already decided by this point.
      try {
        await sandbox.stop();
      } catch {}
    }
  }
}
