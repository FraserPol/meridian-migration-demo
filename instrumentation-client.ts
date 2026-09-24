import { initBotId } from "botid/client/core";

/**
 * Vercel BotID — an invisible challenge run in the browser, verified
 * server-side by checkBotId() in app/login/actions.ts.
 *
 * Only /login is protected. It's the credential-stuffing surface on a
 * bank-facing app, and it's the one route where automated traffic has no
 * legitimate reason to be. The path here is the *page* the server action
 * is invoked from, not an API route — the client attaches its challenge
 * headers to the action's POST, and a route missing from this list makes
 * checkBotId() fail on the server, so the two must stay in sync.
 *
 * Deliberately not applied to /api/chat: automated end-to-end tests drive
 * the Migration Copilot against production (Vault credentials are scoped
 * to the production environment, so there is nowhere else to test it), and
 * the spend cap in lib/ai/budget.ts already bounds what abuse of that
 * endpoint can cost.
 */
initBotId({
  protect: [
    {
      path: "/login",
      method: "POST",
    },
  ],
});
