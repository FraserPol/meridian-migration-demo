"use client";

import { useActionState, useState } from "react";
import { updateHolding } from "./actions";

/**
 * Compact per-row editor for a position. Collapsed to a button by
 * default so the table stays scannable — a row of always-visible inputs
 * would turn the watchlist into a form.
 */
export function HoldingEditor({
  itemId,
  ticker,
  quantity,
  costBasis,
}: {
  itemId: string;
  ticker: string;
  quantity: string | null;
  costBasis: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateHolding, undefined);
  const held = quantity !== null && costBasis !== null;

  if (!open) {
    return (
      <button type="button" className="link-button" onClick={() => setOpen(true)}>
        {held ? "Edit" : "Add position"}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="holding-form"
      onSubmit={() => {
        // The action revalidates the page, so the refreshed row renders
        // the saved values — collapsing here avoids leaving a stale open
        // form behind next to them.
        setOpen(false);
      }}
    >
      <input type="hidden" name="itemId" value={itemId} />
      <label className="sr-only" htmlFor={`qty-${itemId}`}>
        Shares of {ticker}
      </label>
      <input
        id={`qty-${itemId}`}
        name="quantity"
        inputMode="decimal"
        placeholder="Shares"
        defaultValue={quantity ?? ""}
      />
      <label className="sr-only" htmlFor={`cost-${itemId}`}>
        Average cost for {ticker}
      </label>
      <input
        id={`cost-${itemId}`}
        name="costBasis"
        inputMode="decimal"
        placeholder="Avg cost"
        defaultValue={costBasis ?? ""}
      />
      <button type="submit" disabled={pending}>
        {pending ? "…" : "Save"}
      </button>
      <button type="button" className="link-button" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {state?.error && (
        <span className="holding-error" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
