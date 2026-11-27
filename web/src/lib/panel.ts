/** The left list of a panel dialog (`components/ui/panel-dialog.tsx`). */

export interface PanelItem {
  key: string;
  name: string;
  /** Sits under the item above it. */
  sub?: boolean;
}

export interface PanelGroup<T extends PanelItem = PanelItem> {
  name?: string;
  items: T[];
}

/** The item an arrow, Home or End key moves to, from the one at `from`; null for any other key. The ends do not wrap. */
export function moveTo(key: string, from: number, count: number): number | null {
  if (!count) return null;
  const to = key === "ArrowDown" ? from + 1 : key === "ArrowUp" ? from - 1 : key === "Home" ? 0 : key === "End" ? count - 1 : null;
  return to === null ? null : Math.min(count - 1, Math.max(0, to));
}

/** The one item the Tab key reaches: the picked one, or the first when none is picked. */
export function tabStop(groups: PanelGroup[], picked: string): string | undefined {
  const items = groups.flatMap((g) => g.items);
  return (items.find((i) => i.key === picked) ?? items[0])?.key;
}
