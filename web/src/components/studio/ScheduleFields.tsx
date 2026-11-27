import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { formatInZone, relative, timezones, zonedToUtc, zoneOtherName } from "@/lib/jobs";

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
export function ScheduleFields({ idPrefix, local, tz, onLocal, onTz, verb = "Posts" }: { idPrefix: string; local: string; tz: string; onLocal: (v: string) => void; onTz: (v: string) => void; /** What happens at that time: "Posts" for a post, "Planned for" for an article. */ verb?: string }) {
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
          <Combobox id={`${idPrefix}-tz`} searchLabel="Search time zones" value={tz} onChange={onTz}
            options={(zones.includes(tz) ? zones : [tz, ...zones]).map((z) => ({ value: z, label: z.replace(/_/g, " "), words: zoneOtherName(z) }))} />
        </div>
      </div>
      <p className={problem ? "text-xs text-destructive" : "text-xs text-muted-foreground"} aria-live="polite">
        {problem ?? (at && `${verb} ${formatInZone(at.toISOString(), tz)} (${relative(at.toISOString())}).`)}
      </p>
    </div>
  );
}
