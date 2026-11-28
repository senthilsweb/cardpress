import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { Shell } from "@/components/shell/Rail";
import { BootScreen } from "@/components/studio/BootScreen";
import { SessionProvider } from "@/components/studio/SessionProvider";
import { ScheduleFields, resolveSchedule } from "@/components/studio/ScheduleFields";
import { api } from "@/lib/api";
import { byDay, clock, dayKey, entryHref, entryState, parseDayKey, sameDay, startOfDay, step, viewDays, viewRange, viewTitle, type CalendarEntry, type CalendarView, type ReadyItem } from "@/lib/calendar";
import { defaultTimezone, formatInZone, toLocalInput } from "@/lib/jobs";
import { useSession } from "@/lib/session";
import { useLibraryBoot, type LibraryBoot } from "@/lib/useLibraryBoot";
import { useTheme } from "@/lib/useTheme";
import { cn } from "@/lib/utils";

const base = () => import.meta.env.BASE_URL;
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
const noop = () => undefined;
const VIEW_KEY = "cardpress.calendar.view";

export default function Calendar() {
  const { boot, retry, submitToken } = useLibraryBoot();
  if (boot.status !== "ready") return <BootScreen boot={boot} retry={retry} submitToken={submitToken} importLegacy={noop} discardLegacy={noop} />;
  return <SessionProvider initial={boot.data.session}><Page data={boot.data} /></SessionProvider>;
}

const STATE_STYLE: Record<ReturnType<typeof entryState>, string> = {
  sent: "border-l-brand bg-brand/10",
  waiting: "border-l-amber-500 bg-amber-500/10",
  problem: "border-l-destructive bg-destructive/10",
  planned: "border-l-sky-500 bg-sky-500/10 border-dashed",
};
const STATE_LABEL: Record<ReturnType<typeof entryState>, string> = { sent: "Sent", waiting: "Waiting", problem: "Needs a look", planned: "Planned article" };

function Page({ data }: { data: LibraryBoot }) {
  const [theme, toggleTheme] = useTheme();
  const { can } = useSession();
  const wide = window.matchMedia("(min-width: 1024px)").matches;
  // the address keeps the view and the day, so a reload or a shared link shows the same thing: /calendar/?view=week&day=2026-11-26
  const q = new URLSearchParams(window.location.search);
  const [view, setView] = useState<CalendarView>(() => {
    const v = q.get("view") ?? (() => { try { return localStorage.getItem(VIEW_KEY); } catch { return null; } })();
    return v === "month" || v === "week" || v === "day" ? v : wide ? "month" : "day";
  });
  const [anchor, setAnchor] = useState<Date>(() => parseDayKey(q.get("day")) ?? startOfDay(new Date()));
  const [brand, setBrand] = useState(data.activeId);
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [ready, setReady] = useState<ReadyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<{ day: Date; hour?: number; item?: ReadyItem } | null>(null);
  const run = useRef(0);

  useEffect(() => {
    window.history.replaceState(null, "", `${window.location.pathname}?view=${view}&day=${dayKey(anchor)}`);
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* not remembered */ }
  }, [view, anchor]);

  const load = useCallback(async () => {
    const id = ++run.current;
    setLoading(true); setError(null);
    try {
      const { from, to } = viewRange(view, anchor);
      const [e, r] = await Promise.all([api.calendar(brand, from, to), api.calendarReady(brand)]);
      if (id !== run.current) return;
      setEntries(e); setReady(r);
    } catch (e) { if (id === run.current) setError(message(e)); } finally { if (id === run.current) setLoading(false); }
  }, [view, anchor, brand]);
  useEffect(() => { void load(); }, [load]);

  const days = useMemo(() => viewDays(view, anchor), [view, anchor]);
  const grouped = useMemo(() => byDay(entries), [entries]);
  const names = Object.fromEntries(data.profiles.map((p) => [p.id, p.name]));
  const today = startOfDay(new Date());
  const canPlan = can("approve") || can("publish");
  const openDay = (d: Date) => { setAnchor(d); setView("day"); };
  const switchBrand = (id: string) => { setBrand(id); api.putPreference("activeProfile", id).catch(noop); };

  const Entry = ({ e, compact }: { e: CalendarEntry; compact?: boolean }) => {
    const st = entryState(e);
    return (
      <a href={entryHref(base(), e)} title={`${STATE_LABEL[st]} · ${formatInZone(e.at, e.timezone)}${brand === "all" ? ` · ${names[e.profileId] ?? ""}` : ""}`}
        className={cn("flex min-w-0 items-center gap-1.5 rounded border-l-[3px] px-1.5 py-0.5 text-[12px] leading-snug hover:brightness-95", STATE_STYLE[st])}>
        {st === "sent" && <Lock className="h-3 w-3 shrink-0 opacity-60" aria-label="Sent, read-only" />}
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{clock(e.at)}</span>
        <span className={cn("min-w-0 truncate", !compact && "whitespace-normal")}>{e.title || "Untitled"}</span>
      </a>
    );
  };
  const addButton = (d: Date, hour?: number) => canPlan && (d >= today) && (
    <button type="button" aria-label={`Schedule on ${dayKey(d)}${hour !== undefined ? ` at ${hour}:00` : ""}`} onClick={(ev) => { ev.stopPropagation(); setScheduling({ day: d, hour }); }}
      className="grid h-5 w-5 cursor-pointer place-items-center rounded text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100">
      <Plus className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <>
      <Toaster theme={theme} />
      <Shell area="calendar" brands={data.profiles} activeId={brand === "all" ? data.activeId : brand} colors={data.colors} onSwitchBrand={switchBrand} theme={theme} onToggleTheme={toggleTheme}>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-6">
          <h1 className="mr-2 text-xl font-semibold tracking-tight">{viewTitle(view, anchor)}</h1>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Earlier" onClick={() => setAnchor((a) => step(view, a, -1))}><ChevronLeft /></Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(startOfDay(new Date()))}>Today</Button>
            <Button variant="ghost" size="icon-sm" aria-label="Later" onClick={() => setAnchor((a) => step(view, a, 1))}><ChevronRight /></Button>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" />}
          <div className="flex-1" />
          {data.profiles.length > 1 && (
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger className="h-8 w-[150px]" aria-label="Brand"><SelectValue /></SelectTrigger>
              <SelectContent>
                {data.profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                <SelectItem value="all">All brands</SelectItem>
              </SelectContent>
            </Select>
          )}
          {canPlan && (
            <Button variant="outline" size="sm" onClick={() => setScheduling({ day: anchor < today ? today : anchor })}>
              <CalendarClock /> Ready to schedule <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums">{ready.length}</span>
            </Button>
          )}
          <div className="flex rounded-md border border-border bg-card p-0.5" role="group" aria-label="View">
            {(["month", "week", "day"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                className={cn("cursor-pointer rounded px-2.5 py-1 text-xs font-medium capitalize", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{v}</button>
            ))}
          </div>
        </div>
        {error && <p role="alert" className="px-6 py-2 text-sm text-destructive">{error}</p>}

        {view === "month" && (
          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-[auto_repeat(6,minmax(0,1fr))] overflow-hidden">
            {days.slice(0, 7).map((d) => (
              <div key={`h${d.getDay()}`} className="border-b border-r border-border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground last:border-r-0">
                {new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d)}
              </div>
            ))}
            {days.map((d) => {
              const list = grouped.get(dayKey(d)) ?? [];
              const out = d.getMonth() !== anchor.getMonth();
              return (
                <div key={dayKey(d)} className={cn("group flex min-h-0 flex-col gap-0.5 overflow-hidden border-b border-r border-border p-1 [&:nth-child(7n)]:border-r-0", out && "bg-muted/30")}>
                  <div className="flex items-center justify-between">
                    <button type="button" onClick={() => openDay(d)} aria-label={`Open ${dayKey(d)}`}
                      className={cn("grid h-6 min-w-6 cursor-pointer place-items-center rounded-full px-1 text-xs hover:bg-muted", sameDay(d, today) && "bg-primary text-primary-foreground hover:bg-primary", out && "text-muted-foreground")}>
                      {d.getDate()}
                    </button>
                    {addButton(d)}
                  </div>
                  {list.slice(0, 3).map((e) => <Entry key={e.type + e.id} e={e} compact />)}
                  {list.length > 3 && <button type="button" onClick={() => openDay(d)} className="cursor-pointer px-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground">+{list.length - 3} more</button>}
                </div>
              );
            })}
          </div>
        )}

        {view === "week" && (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto sm:grid-cols-7">
            {days.map((d) => {
              const list = grouped.get(dayKey(d)) ?? [];
              return (
                <section key={dayKey(d)} className="group flex flex-col gap-1 border-b border-r border-border p-2 sm:min-h-full sm:last:border-r-0">
                  <div className="flex items-center justify-between">
                    <button type="button" onClick={() => openDay(d)} className={cn("cursor-pointer rounded px-1.5 py-0.5 text-left text-xs font-semibold hover:bg-muted", sameDay(d, today) && "bg-primary text-primary-foreground hover:bg-primary")}>
                      {new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(d)}
                    </button>
                    {addButton(d)}
                  </div>
                  {list.length === 0 && <p className="px-1.5 text-[11px] text-muted-foreground">Nothing</p>}
                  {list.map((e) => <Entry key={e.type + e.id} e={e} />)}
                </section>
              );
            })}
          </div>
        )}

        {view === "day" && <DayView day={days[0]} list={grouped.get(dayKey(days[0])) ?? []} Entry={Entry} addButton={addButton} />}

        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-6 py-2 text-[11px] text-muted-foreground">
          {(Object.keys(STATE_LABEL) as (keyof typeof STATE_LABEL)[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5"><span className={cn("h-3 w-3 rounded-sm border-l-[3px]", STATE_STYLE[k])} />{STATE_LABEL[k]}</span>
          ))}
          <span>Times are in your time zone ({defaultTimezone()}).</span>
        </div>
      </main>

      <ScheduleDialog at={scheduling} ready={ready} names={brand === "all" ? names : undefined} onClose={() => setScheduling(null)} onDone={() => { setScheduling(null); void load(); }} />
      </Shell>
    </>
  );
}

/** One day by the hour, scrolled to the working day; articles planned for the day are listed at the top. */
function DayView({ day, list, Entry, addButton }: {
  day: Date; list: CalendarEntry[];
  Entry: (p: { e: CalendarEntry; compact?: boolean }) => React.ReactNode;
  addButton: (d: Date, hour?: number) => React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector("[data-hour='8']")?.scrollIntoView({ block: "start" }); }, [day]);
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const at = (h: number) => list.filter((e) => new Date(e.at).getHours() === h);
  return (
    <div ref={box} className="min-h-0 flex-1 overflow-y-auto">
      {hours.map((h) => (
        <div key={h} data-hour={h} className="group flex min-h-12 border-b border-border">
          <div className="w-16 shrink-0 border-r border-border px-2 py-1 text-right font-mono text-[11px] text-muted-foreground">{String(h).padStart(2, "0")}:00</div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 p-1">
            {at(h).map((e) => <Entry key={e.type + e.id} e={e} />)}
          </div>
          <div className="p-1">{addButton(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h), h)}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Put an approved item on the calendar. An article gets a planned date here (nothing is sent). A post is scheduled from
 * its preview in the studio, where its card is drawn and the post confirmed.
 */
function ScheduleDialog({ at, ready, names, onClose, onDone }: {
  at: { day: Date; hour?: number } | null; ready: ReadyItem[]; names?: Record<string, string>; onClose: () => void; onDone: () => void;
}) {
  const { can } = useSession();
  const [pick, setPick] = useState<ReadyItem | null>(null);
  const [tz, setTz] = useState(defaultTimezone());
  const [local, setLocal] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!at) return;
    setPick(null);
    const d = new Date(at.day.getFullYear(), at.day.getMonth(), at.day.getDate(), at.hour ?? 9, 0);
    setLocal(toLocalInput(d.getTime() < Date.now() ? new Date(Date.now() + 3600_000) : d, tz));
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps
  const sched = resolveSchedule(local, tz);
  const plan = async () => {
    if (!pick || !sched.at) return;
    setBusy(true);
    try {
      await api.planDraft(pick.id, { scheduledAt: sched.at.toISOString().replace(/\.\d{3}Z$/, "Z"), timezone: tz });
      toast.success("Planned", { description: `${pick.title} · ${formatInZone(sched.at.toISOString(), tz)}` });
      onDone();
    } catch (e) { toast.error(message(e)); } finally { setBusy(false); }
  };
  const studio = (it: ReadyItem) => `${base()}studio/?brand=${encodeURIComponent(it.profileId)}&draft=${encodeURIComponent(it.id)}&open=preview`;

  return (
    <Dialog open={!!at} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{pick ? (pick.kind === "article" ? "Plan the article" : "Schedule the post") : "Ready to schedule"}</DialogTitle>
          <DialogDescription>{pick ? pick.title : "Approved posts and articles without a date."}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[55dvh] overflow-y-auto px-5 py-4">
          {!pick && (ready.length === 0
            ? <p className="text-sm text-muted-foreground">Nothing is waiting. Approve a post or an article first.</p>
            : <ul className="divide-y divide-border rounded-md border border-border">
                {ready.map((it) => (
                  <li key={it.id}>
                    <button type="button" onClick={() => setPick(it)} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-muted">
                      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{it.kind}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{it.title || "Untitled"}</span>
                      {names && <span className="text-xs text-muted-foreground">{names[it.profileId]}</span>}
                    </button>
                  </li>
                ))}
              </ul>)}
          {pick?.kind === "article" && (
            <div className="space-y-2">
              <ScheduleFields verb="Planned for" idPrefix="cal-plan" local={local} tz={tz} onLocal={setLocal} onTz={setTz} />
              <p className="text-xs text-muted-foreground">A planned date is for you: nothing is sent to a network.</p>
            </div>
          )}
          {pick?.kind === "post" && (
            <p className="text-sm">A post is scheduled from its preview, where its card is drawn and you confirm what goes out. The preview opens in the studio.</p>
          )}
        </div>
        <DialogFooter>
          {pick && <Button variant="ghost" size="sm" className="mr-auto" onClick={() => setPick(null)}><ChevronLeft /> Back</Button>}
          <Button variant="cancel" size="sm" onClick={onClose}>Cancel</Button>
          {pick?.kind === "article" && <Button variant="brand" size="sm" disabled={busy || !!sched.problem || !sched.at || !can("approve")} onClick={() => void plan()}>{busy ? <Loader2 className="animate-spin" /> : <CalendarClock />} Save date</Button>}
          {pick?.kind === "post" && <Button asChild variant="brand" size="sm"><a href={studio(pick)}><CalendarClock /> Open preview</a></Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
