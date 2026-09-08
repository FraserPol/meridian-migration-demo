"use client";

import { useActionState, useRef, useState } from "react";
import { login } from "./actions";

const DEMO_PASSWORD = "VercelDemo!2026";

const DEMO_ACCOUNTS = [
  { email: "jordan.reyes@meridiancapital.demo", role: "customer", desc: "Populated watchlist" },
  {
    email: "alex.chen@meridiancapital.demo",
    role: "customer",
    desc: "No profile yet — onboarding flow",
  },
  { email: "admin@meridiancapital.demo", role: "admin", desc: "Migration Copilot" },
] as const;

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Copies to the clipboard (best-effort — clipboard access can be denied
  // or unavailable outside a secure context) and, either way, fills both
  // form fields directly so a click here is genuinely enough to sign in —
  // not just a copy the user still has to go paste by hand.
  function fillAccount(email: string) {
    if (emailRef.current) emailRef.current.value = email;
    if (passwordRef.current) passwordRef.current.value = DEMO_PASSWORD;
    navigator.clipboard?.writeText(email).catch(() => {});
    setCopied(email);
    window.setTimeout(() => setCopied((c) => (c === email ? null : c)), 1500);
  }

  function copyPassword() {
    navigator.clipboard?.writeText(DEMO_PASSWORD).catch(() => {});
    if (passwordRef.current) passwordRef.current.value = DEMO_PASSWORD;
    setCopied("password");
    window.setTimeout(() => setCopied((c) => (c === "password" ? null : c)), 1500);
  }

  return (
    <main className="auth-page">
      <div className="card auth-card">
        <div className="brand-mark" aria-hidden="true">
          MC
        </div>
        <h1>Meridian Capital</h1>
        <p className="auth-subtitle">Portfolio Watchlist — Vercel SA take-home demo</p>

        <form action={formAction}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required ref={emailRef} />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            ref={passwordRef}
          />

          {state?.error && (
            <div className="error-banner" role="alert">
              {state.error}
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <button type="submit" disabled={pending} className="auth-submit">
              {pending ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>

        <div className="demo-creds">
          <div className="demo-creds-header">
            <span>Demo accounts — click to fill</span>
            <button type="button" className="demo-password" onClick={copyPassword}>
              password: <code>{copied === "password" ? "Copied ✓" : DEMO_PASSWORD}</code>
            </button>
          </div>
          <ul className="demo-account-list">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  className="demo-account-btn"
                  onClick={() => fillAccount(account.email)}
                  aria-label={`Fill email and password for ${account.email}`}
                >
                  <div className="demo-account-row">
                    <code>{copied === account.email ? "Copied ✓ — filled in above" : account.email}</code>
                    <span className="badge">{account.role}</span>
                  </div>
                  <span className="demo-account-desc">{account.desc}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
