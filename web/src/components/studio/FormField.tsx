import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { counter, labelOfField, type FieldName } from "@/lib/details";
import type { DraftKind } from "@/lib/draft";
import { cn } from "@/lib/utils";
import { FieldChoices } from "./Choices";

/**
 * One field of the Details form: its name from the content schema, a counter, and a mark when someone else has just
 * changed it. The mark goes once the field is looked at.
 */
export function FormField({ name, kind, draftId, value, label, htmlFor, hint, changed, onSeen, children }: {
  name: FieldName; kind: DraftKind;
  /** The item on screen: options offered for this field are shown under it. */
  draftId?: string;
  /** What is counted; leave out for a field with no length. */
  value?: string | readonly string[];
  /** Another name than the schema's, where the card's layout calls it something else. */
  label?: string;
  htmlFor?: string; hint?: string;
  changed?: boolean; onSeen?: (name: FieldName) => void;
  children: ReactNode;
}) {
  const count = value === undefined ? null : counter(name, kind, value);
  const seen = changed ? () => onSeen?.(name) : undefined;
  return (
    <div className="space-y-1.5" onFocusCapture={seen} onPointerEnter={seen}>
      <div className="flex items-baseline gap-2">
        <Label htmlFor={htmlFor}>{label ?? labelOfField(name)}</Label>
        {changed && <span className="flex items-center gap-1 text-[10.5px] font-medium text-brand"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" /> Changed</span>}
        <span className="flex-1" />
        {count && <span className={cn("font-mono text-[10.5px]", count.state === "over" ? "text-destructive" : count.state === "aside" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>{count.text}</span>}
      </div>
      {children}
      {draftId && <FieldChoices draftId={draftId} field={name} />}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}
