/**
 * Confirms, against a live AI Gateway account, the assumption
 * workflows/migration-copilot/workflow.ts makes for the live-failover-demo
 * toggle: that an invalid/nonexistent primary model slug falls through to
 * providerOptions.gateway.models' fallback list, instead of hard-failing
 * the whole request the way an invalid slug does with no fallback list
 * configured (see the AI Gateway docs' "Invalid model identifier" case).
 *
 * Verified 2026-08-13 against a live account with billing set up: it does
 * fall through. Also surfaced a second bug while verifying: `result.response
 * .modelId` (and StepResult's `model.provider`/`model.modelId`, used
 * throughout the audit trail) report the *requested* model, captured before
 * the call happens — never what Gateway's routing actually served. The real
 * answer only appears in `providerMetadata.gateway.routing` after the call
 * completes; see servedModel() in lib/ai/routing.ts, which this script now
 * uses instead of the misleading `response.modelId`.
 *
 * Re-run any time this needs re-checking (e.g. after a model deprecation):
 *
 *   set -a && source .env.local && set +a && npx tsx scripts/verify-gateway-fallback.ts
 */
import { generateText, gateway, APICallError } from "ai";
import { FAST_MODEL, servedModel } from "@/lib/ai/routing";

const BROKEN_MODEL = `${FAST_MODEL}-simulated-unavailable`;

async function main() {
  console.log(`Primary (broken):  ${BROKEN_MODEL}`);
  console.log(`Fallback list:     [${FAST_MODEL}]`);
  console.log();

  try {
    const result = await generateText({
      model: gateway(BROKEN_MODEL),
      prompt: "Reply with exactly one word: hello",
      providerOptions: {
        gateway: { models: [FAST_MODEL] },
      },
    });
    console.log("RESULT: fell through to the fallback model — the toggle's assumption holds.");
    console.log("text:", result.text);
    console.log("served by (servedModel(), the accurate source):", servedModel(result.steps[0]));
    console.log("raw step.model (misleading — always the requested slug):", result.steps[0].model);
  } catch (err) {
    console.log("RESULT: did NOT fall through — the toggle's assumption does not hold as coded.");
    if (APICallError.isInstance(err)) {
      console.log("statusCode:", err.statusCode);
      console.log("message:", err.message);
      if (err.statusCode === 402 || err.statusCode === 403) {
        console.log();
        console.log("This looks like a billing/account issue, not a fallback-behavior result —");
        console.log("add a card in the Vercel dashboard's AI Gateway settings and re-run.");
      }
    } else {
      console.log(err);
    }
    console.log();
    console.log("If this keeps failing with a real 400 once billing is fixed, the toggle in");
    console.log("workflows/migration-copilot/workflow.ts needs a different mechanism — e.g. a");
    console.log("valid-but-currently-unavailable model instead of a fabricated slug.");
  }
}

main();
