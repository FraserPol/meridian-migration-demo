import type { Quote } from "@/lib/quotes";

/**
 * Price-alert evaluation. Derived from the current quote rather than
 * stored (see the priceAlerts table comment in lib/db/schema.ts): a page
 * render never writes, and an alert reflects where the price actually is
 * now rather than latching on the first crossing it ever saw.
 */

export type AlertDirection = "above" | "below";

export function isAlertDirection(value: string): value is AlertDirection {
  return value === "above" || value === "below";
}

export type EvaluatedAlert = {
  id: string;
  ticker: string;
  direction: AlertDirection;
  threshold: number;
  /** Undefined when the ticker has no quote (e.g. removed from the watchlist). */
  currentPrice?: number;
  triggered: boolean;
  /** How far the price is from firing, as a percentage of the threshold. */
  distancePct?: number;
};

export function evaluateAlert(
  alert: { id: string; ticker: string; direction: string; threshold: string },
  quotes: Map<string, Quote>,
): EvaluatedAlert {
  const direction: AlertDirection = isAlertDirection(alert.direction) ? alert.direction : "above";
  const threshold = Number(alert.threshold);
  const quote = quotes.get(alert.ticker);

  if (!quote) {
    return { id: alert.id, ticker: alert.ticker, direction, threshold, triggered: false };
  }

  // Inclusive on both sides: "alert me at $220" should fire at exactly
  // $220, not only past it.
  const triggered = direction === "above" ? quote.price >= threshold : quote.price <= threshold;

  return {
    id: alert.id,
    ticker: alert.ticker,
    direction,
    threshold,
    currentPrice: quote.price,
    triggered,
    distancePct: threshold > 0 ? ((quote.price - threshold) / threshold) * 100 : undefined,
  };
}

export function evaluateAlerts(
  alerts: Array<{ id: string; ticker: string; direction: string; threshold: string }>,
  quotes: Map<string, Quote>,
): EvaluatedAlert[] {
  // Triggered first — the whole point of an alert list is the ones that
  // need attention, and they shouldn't be buried under dormant ones.
  return alerts
    .map((a) => evaluateAlert(a, quotes))
    .sort((a, b) => Number(b.triggered) - Number(a.triggered));
}
