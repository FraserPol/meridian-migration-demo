const REPO = "https://github.com/FraserPol/meridian-migration-demo";

/**
 * Names the Vercel primitives actually in play on the page it's rendered
 * on, linking to the architecture write-up for the detail.
 *
 * Deliberately per-page rather than one global list: a strip that claimed
 * every primitive on every screen would be decoration. Each entry here is
 * doing something on the page it appears on, which is the only version of
 * this worth showing — and the reason it links to ARCHITECTURE.md rather
 * than explaining itself inline.
 */
export function PlatformStrip({ items }: { items: readonly string[] }) {
  return (
    <aside className="platform-strip">
      <span className="platform-strip-label">On this page</span>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <a href={`${REPO}/blob/main/ARCHITECTURE.md`} target="_blank" rel="noreferrer">
        How it fits together →
      </a>
    </aside>
  );
}
