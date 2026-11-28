import { spentShare, type BudgetStatus } from "@/lib/brandAssistant";
import { money } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

/** What is spent of a monthly amount, as a bar that changes colour at the alert and when nothing is left. */
export function BudgetBar({ budget, className }: { budget: BudgetStatus; className?: string }) {
  if (!(budget.monthCents > 0)) {
    return <p className={cn("text-xs text-muted-foreground", className)}>{money(budget.spentCents)} spent this month.</p>;
  }
  const share = spentShare(budget);
  const note = budget.level === "used" ? "Used up" : budget.level === "alert" ? "Nearly used" : null;
  return (
    <div className={cn("space-y-1", className)}>
      <div role="progressbar" aria-label="Budget spent this month" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share} className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", budget.level === "used" ? "bg-destructive" : budget.level === "alert" ? "bg-amber-500" : "bg-brand")} style={{ width: `${share}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {money(budget.spentCents)} of {money(budget.monthCents)} this month
        {note && <span className={cn("ml-2 font-medium", budget.level === "used" ? "text-destructive" : "text-amber-600 dark:text-amber-400")}>{note}</span>}
      </p>
    </div>
  );
}
