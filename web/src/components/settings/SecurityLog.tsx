import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { eventLabel, eventLine, type SecurityEvent } from "@/lib/security";
import { FormSection, reason } from "./form";

const when = (at: string) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** What happened around signing in and the accounts, newest first. `version` reads it again after a change. */
export function SecurityLog({ version }: { version: unknown }) {
  const [events, setEvents] = useState<SecurityEvent[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async (before?: number) => {
    setBusy(true); setError(null);
    try {
      const page = await api.securityLog(before);
      setEvents((old) => (before ? [...(old ?? []), ...page.events] : page.events));
      setMore(page.more);
    } catch (e) { setError(reason(e)); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void read(); }, [read, version]);

  return (
    <FormSection title="Security log">
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {!events ? <p className="text-sm text-muted-foreground">{error ? "" : "Loading…"}</p> : !events.length ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : (
        <ul aria-label="Security events" className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {events.map((e) => (
            <li key={e.id} className="px-3 py-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-medium">{eventLabel(e.event)}</span>
                <time dateTime={e.at} className="shrink-0 text-[11px] text-muted-foreground">{when(e.at)}</time>
              </div>
              <p className="break-words text-xs text-muted-foreground">{eventLine(e)}</p>
            </li>
          ))}
        </ul>
      )}
      {more && events && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void read(events[events.length - 1].id)}>{busy && <Loader2 className="animate-spin" />} Older</Button>}
    </FormSection>
  );
}
