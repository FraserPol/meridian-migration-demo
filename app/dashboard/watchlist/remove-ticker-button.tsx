import { removeTicker } from "./actions";

export function RemoveTickerButton({ itemId, ticker }: { itemId: string; ticker: string }) {
  return (
    <form action={removeTicker}>
      <input type="hidden" name="itemId" value={itemId} />
      {/* Without this, a screen reader tabbing through the watchlist table
          hears "Remove, Remove, Remove..." with no way to tell which
          row's button is which. */}
      <button type="submit" className="secondary" aria-label={`Remove ${ticker}`}>
        Remove
      </button>
    </form>
  );
}
