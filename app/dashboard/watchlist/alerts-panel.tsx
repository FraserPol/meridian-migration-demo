"use client";

import { useActionState } from "react";
import { createAlert, deleteAlert } from "./actions";
import type { EvaluatedAlert } from "@/lib/alerts";

/**
 * Price alerts on watched tickers. Status is evaluated against the
 * current quote on every render (lib/alerts.ts) rather than stored, so
 * "triggered" always means "true right now" rather than "was true once".
 */
export function AlertsPanel({
  alerts,
  tickers,
}: {
  alerts: EvaluatedAlert[];
  tickers: string[];
}) {
  const [state, formAction, pending] = useActionState(createAlert, undefined);
  const triggered = alerts.filter((a) => a.triggered);

  return (
    <div className="card">
      <h2>
        Price alerts
        {triggered.length > 0 && (
          <span className="alert-count">
            {triggered.length} triggered
          </span>
        )}
      </h2>

      <form action={formAction} className="alert-form">
        <div className="alert-field">
          <label htmlFor="alert-ticker">Ticker</label>
          <select id="alert-ticker" name="ticker" required defaultValue={tickers[0] ?? ""}>
            {tickers.length === 0 && <option value="">Add a ticker first</option>}
            {tickers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="alert-field">
          <label htmlFor="alert-direction">When price is</label>
          <select id="alert-direction" name="direction" defaultValue="below">
            <option value="below">at or below</option>
            <option value="above">at or above</option>
          </select>
        </div>
        <div className="alert-field">
          <label htmlFor="alert-threshold">Target price</label>
          <input
            id="alert-threshold"
            name="threshold"
            inputMode="decimal"
            placeholder="220.00"
            required
          />
        </div>
        <button type="submit" disabled={pending || tickers.length === 0}>
          {pending ? "Adding…" : "Add alert"}
        </button>
        {state?.error && (
          <div className="error-banner" role="alert" style={{ width: "100%" }}>
            {state.error}
          </div>
        )}
      </form>

      {alerts.length === 0 ? (
        <p style={{ color: "var(--muted)", marginTop: 4 }}>
          No alerts yet — set one above and it will flag here as soon as the price crosses.
        </p>
      ) : (
        <ul className="alert-list">
          {alerts.map((a) => (
            <li key={a.id} className={a.triggered ? "alert-row triggered" : "alert-row"}>
              <div className="alert-summary">
                <strong>{a.ticker}</strong>{" "}
                <span className="alert-rule">
                  {a.direction === "below" ? "at or below" : "at or above"} $
                  {a.threshold.toFixed(2)}
                </span>
                {a.currentPrice !== undefined && (
                  <span className="alert-current">
                    now ${a.currentPrice.toFixed(2)}
                    {a.distancePct !== undefined && (
                      <> ({a.distancePct >= 0 ? "+" : ""}{a.distancePct.toFixed(1)}%)</>
                    )}
                  </span>
                )}
              </div>
              <div className="alert-actions">
                {a.triggered ? (
                  <span className="alert-badge">Triggered</span>
                ) : (
                  <span className="alert-badge watching">Watching</span>
                )}
                <form action={deleteAlert}>
                  <input type="hidden" name="alertId" value={a.id} />
                  <button type="submit" className="link-button">
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
