"use client";

import { useActionState } from "react";
import { addTicker } from "./actions";

/**
 * `known` is the set the mock market-data API can actually price
 * (lib/quotes.ts). Offered through a native <datalist> rather than a
 * custom combobox: it gets keyboard behaviour, screen-reader support and
 * mobile handling for free, and still allows a symbol outside the list —
 * the server validates either way.
 */
export function AddTickerForm({ known }: { known: string[] }) {
  const [state, formAction, pending] = useActionState(addTicker, undefined);

  return (
    <form action={formAction} className="add-ticker-form">
      <div className="add-field add-field-ticker">
        <label htmlFor="ticker">Ticker symbol</label>
        <input
          id="ticker"
          name="ticker"
          list="known-tickers"
          placeholder="e.g. AAPL"
          maxLength={6}
          autoComplete="off"
          required
        />
        <datalist id="known-tickers">
          {known.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>

      <div className="add-field">
        <label htmlFor="quantity">
          Shares <span className="field-optional">optional</span>
        </label>
        <input id="quantity" name="quantity" inputMode="decimal" placeholder="40" />
      </div>

      <div className="add-field">
        <label htmlFor="costBasis">
          Avg cost <span className="field-optional">optional</span>
        </label>
        <input id="costBasis" name="costBasis" inputMode="decimal" placeholder="198.20" />
      </div>

      <button type="submit" disabled={pending}>
        {pending ? "Adding..." : "Add"}
      </button>

      {state?.error && (
        <div className="error-banner" role="alert" style={{ width: "100%" }}>
          {state.error}
        </div>
      )}
    </form>
  );
}
