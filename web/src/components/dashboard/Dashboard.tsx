import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { Shell } from "@/components/shell/Rail";
import { BootScreen } from "@/components/studio/BootScreen";
import { SessionProvider } from "@/components/studio/SessionProvider";
import { CostChart } from "./CostChart";
import { api } from "@/lib/api";
import { duration, money, periodLabel, PERIODS, rangeProblem, readPeriod, statusRows, writePeriod, type Counts, type Dashboard as Figures, type DashboardItem, type Period } from "@/lib/dashboard";
import { defaultTimezone, formatInZone } from "@/lib/jobs";
import { libraryHref, studioHref } from "@/lib/nav";
import { useLibraryBoot, type LibraryBoot } from "@/lib/useLibraryBoot";
import { useTheme } from "@/lib/useTheme";
import { cn } from "@/lib/utils";

const noop = () => undefined;
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
const PERIOD_KEY = "cardpress.dashboard.days";
/** A day of this browser's calendar as YYYY-MM-DD, `back` days before today. */
const dayAgo = (back: number) => { const d = new Date(); d.setDate(d.getDate() - back); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export default function Dashboard() {
  const { boot, retry, submitToken } = useLibraryBoot();
  if (boot.status !== "ready") return <BootScreen boot={boot} retry={retry} submitToken={submitToken} importLegacy={noop} discardLegacy={noop} />;
  return <SessionProvider initial={boot.data.session}><Page data={boot.data} /></SessionProvider>;
}

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("min-w-0 rounded-xl border border-border bg-card p-4", className)}>
      <h2 className="eyebrow mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Page({ data }: { data: LibraryBoot }) {
  const [theme, toggleTheme] = useTheme();
  const [brand, setBrand] = useState(data.activeId);
  // with no brand saved yet there is nothing to ask about one: the figures of "all", which are empty, are shown
  const [all, setAll] = useState(() => data.noBrand || new URLSearchParams(window.location.search).get("scope") === "all");
  const [period, setPeriod] = useState<Period>(() => { try { return readPeriod(localStorage.getItem(PERIOD_KEY)); } catch { return { days: 30 }; } });
  // what is in the two date fields while Custom is chosen; a range that cannot be used is not asked for
  const [range, setRange] = useState(() => ("from" in period ? period : { from: "", to: "" }));
  const [figures, setFigures] = useState<Figures | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);

  const load = useCallback(() => {
    const mine = ++run.current;
    setError(null);
    api.dashboard({ profileId: all ? "" : brand, all, period, tz: defaultTimezone() })
      .then((d) => { if (mine === run.current) setFigures(d); })
      .catch((e) => { if (mine === run.current) { setFigures(null); setError(message(e)); } });
  }, [brand, all, period]);
  useEffect(load, [load]);
  useEffect(() => { try { localStorage.setItem(PERIOD_KEY, writePeriod(period)); } catch { /* not remembered */ } }, [period]);
  useEffect(() => { window.history.replaceState(window.history.state, "", `${window.location.pathname}${all ? "?scope=all" : ""}`); }, [all]);

  const switchBrand = (id: string) => { void api.putPreference("activeProfile", id).then(() => { setBrand(id); setAll(false); setFigures(null); }, (e) => toast.error("Could not switch", { description: message(e) })); };
  /** Go to a page about one brand, opening that brand first. */
  const go = (profileId: string, href: string) => {
    const open = profileId === brand ? Promise.resolve() : api.putPreference("activeProfile", profileId);
    void open.then(() => { window.location.href = href; }, (e) => toast.error("Could not open that brand", { description: message(e) }));
  };
  const nameOf = (id: string) => data.profiles.find((p) => p.id === id)?.name ?? "";
  const link = (profileId: string, href: string, children: ReactNode, className?: string) => (
    <a href={href} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || profileId === brand) return; e.preventDefault(); go(profileId, href); }} className={className}>{children}</a>
  );
  const itemHref = (it: DashboardItem) => (it.type === "draft" ? studioHref(`?draft=${encodeURIComponent(it.id)}`) : `${libraryHref()}?item=job:${encodeURIComponent(it.id)}`);

  const custom = "from" in period;
  const chooseCustom = () => {
    if (custom) return;
    // start from the days on screen, so the figures do not jump
    const next = { from: figures?.period.from ?? dayAgo(29), to: figures?.period.to ?? dayAgo(0) };
    setRange(next); setPeriod(next);
  };
  const changeRange = (next: { from: string; to: string }) => { setRange(next); if (!rangeProblem(next.from, next.to)) setPeriod(next); };
  const problem = custom ? rangeProblem(range.from, range.to) : "";
  // the days the figures on screen cover, which the Library is given so that a count and its list agree
  const covered = figures?.period.from ? `&from=${figures.period.from}&to=${figures.period.to}` : "";
  const allTime = !custom && period.days === 0;

  const counts = (kind: "post" | "article", c: Counts) => (
    <Card title={`${kind === "post" ? "Posts" : "Articles"}${allTime ? "" : " · created in the period"}`}>
      {c.total === 0 ? (
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>{allTime ? `No ${kind}s yet.` : `No ${kind}s created in this period.`}</p>
          <a href={studioHref()} className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline"><Plus className="h-4 w-4" /> Write one in the studio</a>
        </div>
      ) : (
        <>
          <p className="text-4xl font-semibold tracking-tight">{all ? c.total : <a href={`${libraryHref(kind)}${covered}`} className="hover:underline">{c.total}</a>}</p>
          <ul className="mt-3 divide-y divide-border text-sm">
            {statusRows(kind, c).map((r) => {
              const row = <><span className="text-muted-foreground">{r.label}</span><span className="font-medium tabular-nums">{r.count}</span></>;
              const cls = "flex justify-between py-1.5";
              return <li key={r.label}>{all ? <span className={cls}>{row}</span> : <a href={`${libraryHref(kind)}${r.status ? `&status=${r.status}` : ""}${covered}`} className={cn(cls, "rounded hover:bg-muted")}>{row}</a>}</li>;
            })}
          </ul>
        </>
      )}
    </Card>
  );
  const list = (title: string, items: DashboardItem[], empty: string) => (
    <Card title={title}>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <ul className="divide-y divide-border">
          {items.map((it) => (
            <li key={`${it.type}-${it.id}`}>
              {link(it.profileId, itemHref(it), <>
                <span className="block truncate text-sm font-medium">{it.title || "Untitled"}</span>
                <span className="block truncate text-xs text-muted-foreground">{it.kind === "article" ? "Article" : "Post"} · {formatInZone(it.at)}{all ? ` · ${nameOf(it.profileId)}` : ""}</span>
              </>, "block rounded py-2 hover:bg-muted")}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  const tile = (name: string, value: string, note: string) => (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4">
      <dt className="eyebrow">{name}</dt>
      <dd className="mt-1 text-3xl font-semibold tracking-tight">{value}</dd>
      <dd className="mt-0.5 text-xs text-muted-foreground">{note}</dd>
    </div>
  );
  const u = figures?.usage;
  const segment = (on: boolean) => cn("cursor-pointer rounded px-2.5 py-1 text-xs font-medium", on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground");

  return (
    <>
      <Toaster theme={theme} />
      <Shell area="dashboard" brands={data.profiles} activeId={brand} colors={data.colors} onSwitchBrand={switchBrand} theme={theme} onToggleTheme={toggleTheme}>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-semibold tracking-tight">{data.noBrand ? "Dashboard" : all ? "All brands" : nameOf(brand)}</h1>
                <p className="text-sm text-muted-foreground">What is written, what is waiting, and what the assistant has cost.</p>
              </div>
              {data.profiles.length > 1 && !data.noBrand && (
                <div role="group" aria-label="Brands shown" className="flex rounded-md border border-border bg-card p-0.5">
                  <button type="button" aria-pressed={!all} onClick={() => { if (all) { setAll(false); setFigures(null); } }} className={segment(!all)}>This brand</button>
                  <button type="button" aria-pressed={all} onClick={() => { if (!all) { setAll(true); setFigures(null); } }} className={segment(all)}>All brands</button>
                </div>
              )}
              <div role="group" aria-label="Period" className="flex rounded-md border border-border bg-card p-0.5">
                {PERIODS.map((p) => <button key={p.days} type="button" aria-pressed={!custom && period.days === p.days} onClick={() => setPeriod({ days: p.days })} className={segment(!custom && period.days === p.days)}>{p.label}</button>)}
                <button type="button" aria-pressed={custom} onClick={chooseCustom} className={segment(custom)}>Custom</button>
              </div>
              <a href={studioHref()} className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-on-brand hover:opacity-90"><Plus className="h-4 w-4" /> Write</a>
            </div>

            {custom && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:justify-end">
                <label className="flex items-center gap-1.5">From<Input type="date" value={range.from} max={range.to || undefined} onChange={(e) => changeRange({ ...range, from: e.target.value })} className="h-8 w-40" /></label>
                <label className="flex items-center gap-1.5">To<Input type="date" value={range.to} min={range.from || undefined} onChange={(e) => changeRange({ ...range, to: e.target.value })} className="h-8 w-40" /></label>
                {problem && <p role="alert" className="w-full text-destructive sm:text-right">{problem}</p>}
              </div>
            )}

            {data.noBrand && <p className="rounded-md border border-border bg-card p-3 text-sm">No brand yet. <a href={studioHref()} className="font-medium text-brand hover:underline">Open the studio</a> to start your first one.</p>}

            {error && <div role="alert" className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"><span className="flex-1">{error}</span><Button size="sm" variant="outline" onClick={load}>Try again</Button></div>}
            {!figures && !error && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}

            {figures && u && (
              <>
                <dl aria-label="Totals" className={cn("grid grid-cols-2 gap-4", figures.totals.users !== undefined && "sm:grid-cols-3 max-sm:[&>*:last-child]:col-span-2")}>
                  {tile("Brands", String(figures.totals.brands), "Yours to open")}
                  {figures.totals.users !== undefined && tile("Users", String(figures.totals.users), figures.totals.disabledUsers ? `Active · ${figures.totals.disabledUsers} disabled` : "Active")}
                  {tile("LLM cost", money(figures.totals.costCents), `All brands · ${periodLabel(period)}`)}
                </dl>

                <div className="grid gap-4 md:grid-cols-2">{counts("post", figures.posts)}{counts("article", figures.articles)}</div>

                <Card title={`Assistant · ${periodLabel(period)}`}>
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {([["Cost", money(u.costCents)], ["Sessions", String(u.sessions)], ["Replies", String(u.replies)], ["Working time", duration(u.activeSeconds)], ["Average session", u.sessions ? money(Math.round(u.costCents / u.sessions)) : "–"]] as const).map(([name, value]) => (
                      <div key={name}><dt className="text-xs text-muted-foreground">{name}</dt><dd className="mt-0.5 text-2xl font-semibold tracking-tight">{value}</dd></div>
                    ))}
                  </dl>
                  <div className="mt-4">{u.replies === 0 ? <p className="text-sm text-muted-foreground">No assistant cost is recorded in this period.</p> : <CostChart series={u.series} bucket={u.bucket} />}</div>
                  <p className="mt-3 text-xs text-muted-foreground">List price of replies in the chat, in US dollars; not an invoice. Sessions started outside CardPress and deleted conversations are not counted.</p>
                </Card>

                {u.largest.length > 0 && (
                  <Card title="Largest sessions">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[32rem] text-sm">
                        <thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-2 font-medium">Conversation</th><th className="pb-2 text-right font-medium">Cost</th><th className="pb-2 text-right font-medium">Replies</th><th className="pb-2 text-right font-medium">Working time</th><th className="pb-2 text-right font-medium">Last reply</th></tr></thead>
                        <tbody className="tabular-nums">
                          {u.largest.map((s) => (
                            <tr key={`${s.conversationId}-${s.lastAt}`} className="border-t border-border">
                              <td className="max-w-0 truncate py-2 pr-3">{link(s.profileId, studioHref(`?conversation=${encodeURIComponent(s.conversationId)}`), s.title || "Conversation", "font-medium text-brand hover:underline")}{all && <span className="text-xs text-muted-foreground"> · {nameOf(s.profileId)}</span>}</td>
                              <td className="py-2 text-right">{money(s.costCents)}</td>
                              <td className="py-2 text-right">{s.replies}</td>
                              <td className="py-2 text-right">{duration(s.activeSeconds)}</td>
                              <td className="whitespace-nowrap py-2 pl-3 text-right text-xs text-muted-foreground">{formatInZone(s.lastAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}

                {all && figures.brands.length > 0 && (
                  <Card title="By brand">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[30rem] text-sm">
                        <thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-2 font-medium">Brand</th><th className="pb-2 text-right font-medium">Posts</th><th className="pb-2 text-right font-medium">Articles</th><th className="pb-2 text-right font-medium">Sessions</th><th className="pb-2 text-right font-medium">Cost</th></tr></thead>
                        <tbody className="tabular-nums">
                          {figures.brands.map((b) => (
                            <tr key={b.id} className="border-t border-border">
                              <td className="py-2"><button type="button" onClick={() => switchBrand(b.id)} className="cursor-pointer font-medium text-brand hover:underline">{nameOf(b.id) || b.id}</button></td>
                              <td className="py-2 text-right">{b.posts.total}</td><td className="py-2 text-right">{b.articles.total}</td><td className="py-2 text-right">{b.sessions}</td><td className="py-2 text-right">{money(b.costCents)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  {list("Next up", figures.next, "Nothing is scheduled.")}
                  {list("Recently edited", figures.recent, "Nothing has been written yet.")}
                </div>
              </>
            )}
          </div>
        </main>
      </Shell>
    </>
  );
}
