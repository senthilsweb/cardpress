import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CircleAlert, Info, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DateRangeTab } from "./DateRange";
import { Toaster } from "@/components/ui/sonner";
import { Shell } from "@/components/shell/Rail";
import { BootScreen } from "@/components/studio/BootScreen";
import { SessionProvider } from "@/components/studio/SessionProvider";
import { CostChart } from "./CostChart";
import { api } from "@/lib/api";
import { duration, money, periodLabel, PERIODS, readPeriod, statusRows, toDay, writePeriod, type Counts, type Dashboard as Figures, type DashboardItem, type Period } from "@/lib/dashboard";
import { defaultTimezone, formatInZone } from "@/lib/jobs";
import { libraryHref, studioHref } from "@/lib/nav";
import { useLibraryBoot, type LibraryBoot } from "@/lib/useLibraryBoot";
import { useTheme } from "@/lib/useTheme";
import { cn } from "@/lib/utils";

const noop = () => undefined;
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
const PERIOD_KEY = "cardpress.dashboard.days";
/** The day so many days before today. */
const dayAgo = (back: number) => { const d = new Date(); d.setDate(d.getDate() - back); return toDay(d); };

export default function Dashboard() {
  const { boot, retry, submitToken } = useLibraryBoot();
  if (boot.status !== "ready") return <BootScreen boot={boot} retry={retry} submitToken={submitToken} importLegacy={noop} discardLegacy={noop} />;
  return <SessionProvider initial={boot.data.session}><Page data={boot.data} /></SessionProvider>;
}

function Block({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Card role="region" aria-label={title} className={className}>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** What stands in for the figures while the first ones are on their way. */
function Loading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-52" /><Skeleton className="h-52" /></div>
      <Skeleton className="h-64" />
    </div>
  );
}

function Page({ data }: { data: LibraryBoot }) {
  const [theme, toggleTheme] = useTheme();
  const [brand, setBrand] = useState(data.activeId);
  // with no brand saved yet there is nothing to ask about one: the figures of "all", which are empty, are shown
  const [all, setAll] = useState(() => data.noBrand || new URLSearchParams(window.location.search).get("scope") === "all");
  const [period, setPeriod] = useState<Period>(() => { try { return readPeriod(localStorage.getItem(PERIOD_KEY)); } catch { return { days: 30 }; } });
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

  const custom = "from" in period ? period : undefined;
  // the calendar starts from the days on screen
  const onScreen = { from: figures?.period.from ?? dayAgo(29), to: figures?.period.to ?? dayAgo(0) };
  // the days the figures on screen cover, which the Library is given so that a count and its list agree
  const covered = figures?.period.from ? `&from=${figures.period.from}&to=${figures.period.to}` : "";
  const allTime = "days" in period && period.days === 0;

  const counts = (kind: "post" | "article", c: Counts) => (
    <Block title={`${kind === "post" ? "Posts" : "Articles"}${allTime ? "" : " · created in the period"}`}>
      {c.total === 0 ? (
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>{allTime ? `No ${kind}s yet.` : `No ${kind}s created in this period.`}</p>
          <Button asChild variant="link" className="h-auto p-0"><a href={studioHref()}><Plus /> Write one in the studio</a></Button>
        </div>
      ) : (
        <>
          <p className="text-4xl font-semibold tracking-tight">{all ? c.total : <Button asChild variant="link" className="h-auto p-0 text-4xl font-semibold text-foreground"><a href={`${libraryHref(kind)}${covered}`}>{c.total}</a></Button>}</p>
          <ul className="mt-3 divide-y divide-border text-sm">
            {statusRows(kind, c).map((r) => {
              const row = <><span className="text-muted-foreground">{r.label}</span><span className="font-medium tabular-nums">{r.count}</span></>;
              return <li key={r.label} className="py-0.5">{all ? <span className="flex h-8 items-center justify-between">{row}</span> : <Button asChild variant="ghost" className="h-8 w-full justify-between px-0 font-normal hover:px-2"><a href={`${libraryHref(kind)}${r.status ? `&status=${r.status}` : ""}${covered}`}>{row}</a></Button>}</li>;
            })}
          </ul>
        </>
      )}
    </Block>
  );
  const list = (title: string, items: DashboardItem[], empty: string) => (
    <Block title={title}>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <ul className="divide-y divide-border">
          {items.map((it) => (
            <li key={`${it.type}-${it.id}`}>
              {link(it.profileId, itemHref(it), <>
                <span className="block truncate text-sm font-medium">{it.title || "Untitled"}</span>
                <span className="block truncate text-xs text-muted-foreground">{it.kind === "article" ? "Article" : "Post"} · {formatInZone(it.at)}{all ? ` · ${nameOf(it.profileId)}` : ""}</span>
              </>, "block rounded-md py-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
            </li>
          ))}
        </ul>
      )}
    </Block>
  );

  const tile = (name: string, value: string, note: string) => (
    <Card role="group" aria-label={name}>
      <CardHeader><CardTitle>{name}</CardTitle></CardHeader>
      <CardContent className="pt-1">
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
  const u = figures?.usage;
  const group = "rounded-lg border border-border bg-card p-0.5";

  return (
    <>
      <Toaster theme={theme} />
      <Shell area="dashboard" brands={data.profiles} activeId={brand} colors={data.colors} onSwitchBrand={switchBrand} theme={theme} onToggleTheme={toggleTheme}>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 max-sm:basis-full">
                <h1 className="truncate text-2xl font-semibold tracking-tight">{data.noBrand ? "Dashboard" : all ? "All brands" : nameOf(brand)}</h1>
                <p className="text-sm text-muted-foreground">What is written, what is waiting, and what the assistant has cost.</p>
              </div>
              {data.profiles.length > 1 && !data.noBrand && (
                <ToggleGroup type="single" aria-label="Brands shown" className={group} value={all ? "all" : "one"} onValueChange={(v) => { if (v) { setAll(v === "all"); setFigures(null); } }}>
                  <ToggleGroupItem value="one">This brand</ToggleGroupItem>
                  <ToggleGroupItem value="all">All brands</ToggleGroupItem>
                </ToggleGroup>
              )}
              {/* Custom only opens its calendar; the period changes when a range is applied */}
              <ToggleGroup type="single" aria-label="Period" className={cn(group, "max-w-full max-sm:gap-0.5")} value={custom ? "custom" : String("days" in period ? period.days : "")} onValueChange={(v) => { if (v && v !== "custom") setPeriod({ days: Number(v) }); }}>
                {PERIODS.map((p) => <ToggleGroupItem key={p.days} value={String(p.days)} aria-label={p.label} className="max-sm:px-2"><span className="max-sm:hidden">{p.label}</span><span className="sm:hidden">{p.short}</span></ToggleGroupItem>)}
                <DateRangeTab value={custom} start={onScreen} onApply={setPeriod} />
              </ToggleGroup>
              <Button asChild variant="brand" size="sm"><a href={studioHref()}><Plus /> Write</a></Button>
            </div>

            {data.noBrand && (
              <Alert role="status">
                <Info aria-hidden />
                <AlertDescription>No brand yet. <Button asChild variant="link" className="h-auto p-0"><a href={studioHref()}>Open the studio</a></Button> to start your first one.</AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <CircleAlert aria-hidden />
                <AlertDescription>{error}</AlertDescription>
                <Button size="sm" variant="outline" onClick={load}>Try again</Button>
              </Alert>
            )}
            {!figures && !error && <Loading />}

            {figures && u && (
              <>
                <div role="group" aria-label="Totals" className={cn("grid grid-cols-2 gap-4", figures.totals.users !== undefined && "sm:grid-cols-3 max-sm:[&>*:last-child]:col-span-2")}>
                  {tile("Brands", String(figures.totals.brands), "Yours to open")}
                  {figures.totals.users !== undefined && tile("Users", String(figures.totals.users), figures.totals.disabledUsers ? `Active · ${figures.totals.disabledUsers} disabled` : "Active")}
                  {tile("LLM cost", money(figures.totals.costCents), `All brands · ${periodLabel(period)}`)}
                </div>

                <div className="grid gap-4 md:grid-cols-2">{counts("post", figures.posts)}{counts("article", figures.articles)}</div>

                <Block title={`Assistant · ${periodLabel(period)}`}>
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {([["Cost", money(u.costCents)], ["Sessions", String(u.sessions)], ["Replies", String(u.replies)], ["Working time", duration(u.activeSeconds)], ["Average session", u.sessions ? money(Math.round(u.costCents / u.sessions)) : "–"]] as const).map(([name, value]) => (
                      <div key={name}><dt className="text-xs text-muted-foreground">{name}</dt><dd className="mt-0.5 text-2xl font-semibold tracking-tight">{value}</dd></div>
                    ))}
                  </dl>
                  <div className="mt-4">{u.replies === 0 ? <p className="text-sm text-muted-foreground">No assistant cost is recorded in this period.</p> : <CostChart series={u.series} bucket={u.bucket} />}</div>
                  <p className="mt-3 text-xs text-muted-foreground">List price of replies in the chat, in US dollars; not an invoice. Sessions started outside CardPress and deleted conversations are not counted.</p>
                </Block>

                {u.largest.length > 0 && (
                  <Block title="Largest sessions">
                    <Table className="min-w-[32rem]">
                      <TableHeader><TableRow><TableHead>Conversation</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Replies</TableHead><TableHead className="text-right">Working time</TableHead><TableHead className="text-right">Last reply</TableHead></TableRow></TableHeader>
                      <TableBody className="tabular-nums">
                        {u.largest.map((s) => (
                          <TableRow key={`${s.conversationId}-${s.lastAt}`}>
                            <TableCell className="max-w-0 truncate">{link(s.profileId, studioHref(`?conversation=${encodeURIComponent(s.conversationId)}`), s.title || "Conversation", "font-medium text-brand underline-offset-4 hover:underline")}{all && <span className="text-xs text-muted-foreground"> · {nameOf(s.profileId)}</span>}</TableCell>
                            <TableCell className="text-right">{money(s.costCents)}</TableCell>
                            <TableCell className="text-right">{s.replies}</TableCell>
                            <TableCell className="text-right">{duration(s.activeSeconds)}</TableCell>
                            <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">{formatInZone(s.lastAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Block>
                )}

                {all && figures.brands.length > 0 && (
                  <Block title="By brand">
                    <Table className="min-w-[30rem]">
                      <TableHeader><TableRow><TableHead>Brand</TableHead><TableHead className="text-right">Posts</TableHead><TableHead className="text-right">Articles</TableHead><TableHead className="text-right">Sessions</TableHead><TableHead className="text-right">Cost</TableHead></TableRow></TableHeader>
                      <TableBody className="tabular-nums">
                        {figures.brands.map((b) => (
                          <TableRow key={b.id}>
                            <TableCell><Button variant="link" className="h-auto p-0" onClick={() => switchBrand(b.id)}>{nameOf(b.id) || b.id}</Button></TableCell>
                            <TableCell className="text-right">{b.posts.total}</TableCell><TableCell className="text-right">{b.articles.total}</TableCell><TableCell className="text-right">{b.sessions}</TableCell><TableCell className="text-right">{money(b.costCents)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Block>
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
