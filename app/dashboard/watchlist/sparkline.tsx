/**
 * Inline 30-day trend for a watchlist row. Hand-rolled SVG rather than a
 * charting library: it's a polyline over ~30 points, and a chart
 * dependency would cost more client JavaScript than the whole dashboard
 * currently ships.
 *
 * Server-rendered — the mock series is deterministic per calendar day
 * (lib/quotes.ts), so there's nothing for the client to recompute.
 */
export function Sparkline({
  values,
  up,
  width = 96,
  height = 26,
}: {
  values: number[];
  up: boolean;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <span aria-hidden="true">—</span>;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  // A perfectly flat series would divide by zero; draw it down the middle.
  const y = (v: number) =>
    span === 0 ? height / 2 : height - ((v - min) / span) * (height - 2) - 1;
  const x = (i: number) => (i / (values.length - 1)) * width;

  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const stroke = up ? "var(--green)" : "var(--red)";

  return (
    <svg
      className="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`30-day trend, ${up ? "up" : "down"} overall`}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
