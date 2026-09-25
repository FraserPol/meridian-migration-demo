import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { LegacyRoute } from "@/lib/legacy-inventory";
import { generateMigrationSnippet } from "./migration-planner";
import {
  bareFilename,
  expectationsFor,
  parseValidatorOutput,
  roleFor,
  VALIDATOR_SCRIPT,
} from "./sandbox-validator";

const run = promisify(execFile);

/**
 * The sandbox round-trip itself isn't unit-testable without provisioning a
 * microVM, so these cover the pure boundaries around it: the filename
 * sanitising that decides what gets written into the VM, the assertions
 * handed to the script, and the parsing of what comes back. Those are the
 * parts where a silent mistake would make a validation result *wrong*
 * rather than merely absent — a "passed" verdict nobody earned is worse
 * than no verdict at all.
 */
describe("bareFilename", () => {
  it("strips the human label chat renders as a heading", () => {
    expect(bareFilename("next.config.ts (Vercel project)")).toBe("next.config.ts");
    expect(bareFilename("nginx.conf (legacy server, owned by Platform Team)")).toBe("nginx.conf");
  });

  it("keeps a bare filename unchanged", () => {
    expect(bareFilename("proxy.ts")).toBe("proxy.ts");
  });

  it("refuses to let a label escape the sandbox working directory", () => {
    // Route names reach these labels by string interpolation (see the
    // KNOWN FUTURE RISK note in migration-planner.ts), so a traversal
    // attempt must not become a write path.
    expect(bareFilename("../../etc/passwd")).toBe("passwd");
    expect(bareFilename("/absolute/next.config.ts (project)")).toBe("next.config.ts");
  });
});

describe("expectationsFor", () => {
  it("asserts basePath for the keep-domain-on-legacy approach", () => {
    expect(expectationsFor("/watchlist", "keep-domain-on-legacy")).toEqual({
      kind: "basePath",
      route: "/watchlist",
    });
  });

  it("asserts a fallback rewrite for the point-domain-to-vercel approach", () => {
    expect(expectationsFor("/watchlist", "point-domain-to-vercel")).toEqual({
      kind: "fallbackRewrite",
      route: "/watchlist",
    });
  });
});

describe("parseValidatorOutput", () => {
  const checks = [{ file: "next.config.ts", method: "executed", passed: true, detail: "ok" }];

  it("reads the result the sandbox script printed", () => {
    expect(parseValidatorOutput(`__RESULT__${JSON.stringify(checks)}`)).toEqual(checks);
  });

  it("ignores anything the runtime logged before the result", () => {
    const stdout = `ExperimentalWarning: type stripping is experimental\n__RESULT__${JSON.stringify(checks)}\n`;
    expect(parseValidatorOutput(stdout)).toEqual(checks);
  });

  it("returns null rather than a false verdict when there is no result", () => {
    expect(parseValidatorOutput("")).toBeNull();
    expect(parseValidatorOutput("node: command not found")).toBeNull();
  });

  it("returns null on a truncated or malformed result", () => {
    expect(parseValidatorOutput('__RESULT__[{"file":')).toBeNull();
    expect(parseValidatorOutput('__RESULT__{"not":"an array"}')).toBeNull();
  });
});

/**
 * Runs the *real* validator script against the *real* generator output, in
 * a temp directory with plain node — everything the production path does
 * except provisioning the microVM. Without this, a mistake in the script
 * would only ever show up as a "skipped" verdict in production, which is
 * exactly the failure mode that looks like a sandbox problem and isn't.
 *
 * It also pins the two halves together: if someone edits the config
 * templates in migration-planner.ts so they no longer produce the route
 * table the assertions expect, this fails here rather than silently
 * downgrading every future validation to "failed" in front of an approver.
 */
describe("validator script (run locally against real generated config)", () => {
  function fixture(overrides: Partial<LegacyRoute> = {}): LegacyRoute {
    return {
      route: "/watchlist",
      tier: "frontend",
      currentStack: "React (CRA) served from S3 + CloudFront, IT-managed",
      trafficPct: 42,
      complexity: "low",
      owner: "IT Admin Team",
      notes: "",
      ...overrides,
    };
  }

  async function validateLocally(route: LegacyRoute, approach: Parameters<typeof generateMigrationSnippet>[1]) {
    const dir = await mkdtemp(join(tmpdir(), "migration-validate-"));
    const snippets = generateMigrationSnippet(route, approach);
    const files = snippets.map((s) => {
      const name = bareFilename(s.filename);
      return { name, role: roleFor(name), code: s.code };
    });

    await Promise.all([
      ...files.map((f) => writeFile(join(dir, f.name), f.code)),
      writeFile(join(dir, "validate.mjs"), VALIDATOR_SCRIPT),
      writeFile(
        join(dir, "manifest.json"),
        JSON.stringify({
          files: files.map(({ name, role }) => ({ name, role })),
          expect: expectationsFor(route.route, approach),
        }),
      ),
    ]);

    const { stdout } = await run(process.execPath, ["validate.mjs"], { cwd: dir });
    return parseValidatorOutput(stdout);
  }

  it("passes every check for the point-domain-to-vercel config", async () => {
    const checks = await validateLocally(fixture(), "point-domain-to-vercel");
    expect(checks).not.toBeNull();
    expect(checks!.map((c) => c.file).sort()).toEqual(["next.config.ts", "proxy.ts"]);
    // next.config.ts is genuinely imported and its rewrites() called; proxy.ts
    // is only parsed, because it imports next/server.
    expect(checks!.find((c) => c.file === "next.config.ts")?.method).toBe("executed");
    expect(checks!.find((c) => c.file === "proxy.ts")?.method).toBe("parsed");
    expect(checks!.every((c) => c.passed)).toBe(true);
  }, 30_000);

  it("passes every check for the keep-domain-on-legacy config", async () => {
    // A low-traffic, low-complexity route is the one the rules engine sends
    // down this branch (next.config.ts + nginx.conf).
    const checks = await validateLocally(
      fixture({ route: "/reports", trafficPct: 2, complexity: "low" }),
      "keep-domain-on-legacy",
    );
    expect(checks).not.toBeNull();
    expect(checks!.map((c) => c.file).sort()).toEqual(["next.config.ts", "nginx.conf"]);
    expect(checks!.find((c) => c.file === "nginx.conf")?.method).toBe("structure");
    expect(checks!.every((c) => c.passed)).toBe(true);
  }, 30_000);

  it("fails — rather than passes quietly — when the config does not do what was claimed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "migration-validate-bad-"));
    await Promise.all([
      writeFile(
        join(dir, "next.config.ts"),
        'const nextConfig = { basePath: "/wrong" };\nexport default nextConfig;\n',
      ),
      writeFile(join(dir, "validate.mjs"), VALIDATOR_SCRIPT),
      writeFile(
        join(dir, "manifest.json"),
        JSON.stringify({
          files: [{ name: "next.config.ts", role: "next-config" }],
          expect: expectationsFor("/watchlist", "keep-domain-on-legacy"),
        }),
      ),
    ]);

    const { stdout } = await run(process.execPath, ["validate.mjs"], { cwd: dir });
    const checks = parseValidatorOutput(stdout);
    expect(checks![0].passed).toBe(false);
    expect(checks![0].detail).toContain("/watchlist");
  }, 30_000);
});
