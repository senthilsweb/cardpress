import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import type { DateRange as Picked } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ToggleGroupItem } from "@/components/ui/toggle-group";
import { dayOf, rangeLabel, rangeProblem, shortRange, toDay } from "@/lib/dashboard";

/** Whether the window has room for two months side by side. */
function useWide() {
  const query = "(min-width: 640px)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const change = () => setWide(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  return wide;
}

type Days = { from: string; to: string };

/**
 * The **Custom** tab of the period: it opens a calendar in a pop-up. Nothing changes until Apply.
 * `value` is the range in use, if Custom is the period; `start` is what the calendar shows otherwise.
 */
export function DateRangeTab({ value, start, onApply }: { value?: Days; start: Days; onApply: (range: Days) => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Picked | undefined>();
  const tab = useRef<HTMLButtonElement | null>(null);
  const wide = useWide();

  const show = () => {
    const now = value ?? start;
    setPicked({ from: dayOf(now.from), to: dayOf(now.to) });
    setOpen(true);
  };
  const from = picked?.from ? toDay(picked.from) : "";
  const to = picked?.to ? toDay(picked.to) : from; // one press is a single day
  const problem = rangeProblem(from, to);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <ToggleGroupItem
          ref={tab}
          value="custom"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={show}
          className="whitespace-nowrap max-sm:px-2 data-[state=off]:aria-expanded:bg-accent data-[state=off]:aria-expanded:text-foreground"
        >
          <CalendarDays aria-hidden />
          {value ? shortRange(value.from, value.to) : "Custom"}
        </ToggleGroupItem>
      </PopoverAnchor>
      <PopoverContent
        align="end"
        sideOffset={8}
        aria-label="Choose dates"
        className="max-h-[var(--radix-popover-content-available-height)] w-auto overflow-auto p-3"
        onCloseAutoFocus={(e) => { e.preventDefault(); tab.current?.focus(); }}
      >
        <Calendar
          autoFocus
          mode="range"
          resetOnSelect
          weekStartsOn={1}
          numberOfMonths={wide ? 2 : 1}
          // the month of the last day; with two months it is on the right
          defaultMonth={wide ? monthBefore(dayOf((value ?? start).to)) : dayOf((value ?? start).to)}
          startMonth={new Date(2000, 0)}
          endMonth={new Date()}
          disabled={{ after: new Date() }}
          selected={picked}
          onSelect={setPicked}
        />
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <p role="status" className="min-w-0 flex-1 text-xs text-muted-foreground">{problem || rangeLabel(from, to)}</p>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" variant="brand" disabled={!!problem} onClick={() => { onApply({ from, to }); setOpen(false); }}>Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const monthBefore = (d: Date | undefined) => (d ? new Date(d.getFullYear(), d.getMonth() - 1, 1) : undefined);
