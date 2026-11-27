import { useState } from "react";
import { money, shortDay, type Spend } from "@/lib/dashboard";

/** Cost for each day or week: one series of bars on one scale, the figure of the bar under the pointer above them, and a table. */
export function CostChart({ series, bucket }: { series: Spend[]; bucket: "day" | "week" }) {
  const [at, setAt] = useState<number | null>(null);
  const top = Math.max(1, ...series.map((s) => s.costCents));
  const name = (s: Spend) => (bucket === "week" ? `Week of ${shortDay(s.start)}` : shortDay(s.start));
  const shown = at === null ? undefined : series[at];
  return (
    <figure className="m-0">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <figcaption>Cost for each {bucket}</figcaption>
        <span aria-hidden className="tabular-nums">{shown ? `${name(shown)} · ${money(shown.costCents)} · ${shown.replies} ${shown.replies === 1 ? "reply" : "replies"}` : `Highest ${money(top)}`}</span>
      </div>
      <div className="flex h-36 items-stretch gap-[2px] border-b border-border" onPointerLeave={() => setAt(null)}>
        {series.map((s, i) => (
          // the whole column answers the pointer and the keyboard, not only the bar
          <div key={s.start} role="img" tabIndex={0} aria-label={`${name(s)}: ${money(s.costCents)}, ${s.replies} replies`}
            onPointerEnter={() => setAt(i)} onFocus={() => setAt(i)} onBlur={() => setAt(null)}
            className="flex min-w-0 flex-1 flex-col justify-end outline-none hover:bg-muted focus-visible:bg-muted">
            {s.costCents > 0 && <span className="mx-auto block w-full max-w-6 rounded-t bg-brand" style={{ height: `${Math.max(2, (s.costCents / top) * 100)}%` }} />}
          </div>
        ))}
      </div>
      {series.length > 0 && (
        <div aria-hidden className="mt-1 flex justify-between text-[11px] text-muted-foreground">
          <span>{shortDay(series[0].start)}</span>
          {series.length > 1 && <span>{shortDay(series[series.length - 1].start)}</span>}
        </div>
      )}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Show as a table</summary>
        <div className="mt-2 max-h-56 overflow-auto">
          <table className="w-full tabular-nums">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">{bucket === "week" ? "Week of" : "Day"}</th><th className="py-1 text-right font-medium">Replies</th><th className="py-1 text-right font-medium">Cost</th></tr></thead>
            <tbody>{series.map((s) => <tr key={s.start} className="border-t border-border"><td className="py-1">{shortDay(s.start)}</td><td className="py-1 text-right">{s.replies}</td><td className="py-1 text-right">{money(s.costCents)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
