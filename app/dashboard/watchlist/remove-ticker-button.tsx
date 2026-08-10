import { removeTicker } from "./actions";

export function RemoveTickerButton({ itemId }: { itemId: string }) {
  return (
    <form action={removeTicker}>
      <input type="hidden" name="itemId" value={itemId} />
      <button type="submit" className="secondary">
        Remove
      </button>
    </form>
  );
}
