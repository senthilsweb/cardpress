import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatInZone, relative, timezones, zonedToUtc } from "@/lib/jobs";

/** The earliest and latest times the server accepts (it checks again). */
const MIN_LEAD_MS = 60_000;
const MAX_LEAD_MS = 360 * 24 * 3600_000;

/** What the person chose, resolved to a real instant, and why it may not be usable. */
export function resolveSchedule(local: string, tz: string, now = Date.now()): { at: Date | null; problem: string | null } {
  const at = zonedToUtc(local, tz);
  if (!at) return { at: null, problem: local ? "That is not a valid date and time." : "Choose a date and time." };
  if (at.getTime() < now + MIN_LEAD_MS) return { at, problem: "Choose a time at least a minute from now." };
  if (at.getTime() > now + MAX_LEAD_MS) return { at, problem: "Choose a time within the next year." };
  return { at, problem: null };
}

/** A date and time in a chosen time zone, with the result spelled out so a daylight-saving edge is never a surprise. */
export function ScheduleFields({ idPrefix, local, tz, onLocal, onTz }: { idPrefix: string; local: string; tz: string; onLocal: (v: string) => void; onTz: (v: string) => void }) {
  const zones = useMemo(() => timezones(), []);
  const { at, problem } = resolveSchedule(local, tz);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-when`}>Date and time</Label>
          <Input id={`${idPrefix}-when`} type="datetime-local" value={local} onChange={(e) => onLocal(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-tz`}>Time zone</Label>
          <select
            id={`${idPrefix}-tz`} value={tz} onChange={(e) => onTz(e.target.value)}
            className="flex h-9 w-full cursor-pointer rounded-md border border-input bg-card px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {(zones.includes(tz) ? zones : [tz, ...zones]).map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
        </div>
      </div>
      <p className={problem ? "text-xs text-destructive" : "text-xs text-muted-foreground"} aria-live="polite">
        {problem ?? (at && `Posts ${formatInZone(at.toISOString(), tz)} (${relative(at.toISOString())}).`)}
      </p>
    </div>
  );
}
