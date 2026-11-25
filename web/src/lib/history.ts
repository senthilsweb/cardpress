/** Conversations in the groups they are read in: today, the week before it, and earlier. Order is kept. */
export function groupByAge<T extends { updatedAt: string }>(list: T[], now = new Date()): { name: string; items: T[] }[] {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const week = midnight - 6 * 86_400_000;
  const groups = [{ name: "Today", items: [] as T[] }, { name: "Last 7 days", items: [] as T[] }, { name: "Earlier", items: [] as T[] }];
  for (const c of list) {
    const at = new Date(c.updatedAt).getTime();
    groups[at >= midnight ? 0 : at >= week ? 1 : 2].items.push(c);
  }
  return groups.filter((g) => g.items.length);
}

/** A cost at list price, as recorded (whole cents). */
export const costText = (cents: number) => (cents < 1 ? "under $0.01" : `$${(cents / 100).toFixed(2)}`);
