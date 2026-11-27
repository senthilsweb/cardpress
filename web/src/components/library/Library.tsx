import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Check, Columns3, Globe, List, Share2, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Loader2, PenLine, Search, Table2, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Grid } from "./Grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { studioHref } from "@/lib/nav";
import { Shell } from "@/components/shell/Rail";
import { Attempts, Thumb } from "@/components/studio/JobQueue";
import { BootScreen } from "@/components/studio/BootScreen";
import { DocView } from "@/components/studio/DocView";
import { LinkedInArticleDialog } from "@/components/studio/LinkedInArticleDialog";
import { SessionProvider } from "@/components/studio/SessionProvider";
import { useSession } from "@/lib/session";
import { ScaledCard } from "@/components/studio/preview";
import { ScheduleFields, resolveSchedule } from "@/components/studio/ScheduleFields";
import { api } from "@/lib/api";
import type { Draft } from "@/lib/draft";
import { downloadBlob } from "@/lib/export";
import { defaultTimezone, formatInZone, toLocalInput, type Job } from "@/lib/jobs";
import { COLUMNS, DEFAULT_SORT, defaultColumns, deleteSummary, draftLink, LIBRARY_STATUS_LABEL, nextSort, PAGE_SIZES, pageNumbers, pagePath, rowKey, STATUS_FILTERS, type ColumnId, type LibraryFilter, type LibraryItem, type LibraryPage, type LibrarySort } from "@/lib/library";
import { articleHtmlPage, docToMarkdown } from "@/lib/markdown";
import { DEFAULT_DESIGN } from "@/lib/profiles";
import { fullDesign } from "@/lib/cardDesign";
import { sizeById } from "@/lib/sizes";
import { slugify } from "@/lib/slug";
import type { Design, Profile } from "@/lib/types";
import { useLibraryBoot, type LibraryBoot } from "@/lib/useLibraryBoot";
import { useTheme } from "@/lib/useTheme";
import { serializeDraft } from "@/lib/linkedin";

const base = () => import.meta.env.BASE_URL;
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
const day = (iso: string) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const SIZE_KEY = "cardpress.library.pageSize";
const savedSize = (): number => {
  try { const n = Number(localStorage.getItem(SIZE_KEY)); return (PAGE_SIZES as readonly number[]).includes(n) ? n : 20; } catch { return 20; }
};

export default function Library() {
  const { boot, retry, submitToken } = useLibraryBoot();
  if (boot.status !== "ready") {
    return <BootScreen boot={boot} retry={retry} submitToken={submitToken} importLegacy={() => undefined} discardLegacy={() => undefined} />;
  }
  return <SessionProvider initial={boot.data.session}><Page data={boot.data} /></SessionProvider>;
}

function StatusBadge({ s }: { s: LibraryItem["status"] }) {
  const label = LIBRARY_STATUS_LABEL[s] ?? s;
  if (s === "failed") return <Badge className="border-transparent bg-destructive/15 text-destructive">{label}</Badge>;
  if (s === "missed" || s === "needs_review") return <Badge variant="warn">{label}</Badge>;
  if (s === "published" || s === "scheduled" || s === "publishing" || s === "approved") return <Badge variant="brand">{label}</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}

const VIEW_KEY = "cardpress.library.view";
const COLUMNS_KEY = "cardpress.library.columns";
const savedView = (): "grid" | "list" => {
  try { const v = localStorage.getItem(VIEW_KEY); if (v === "grid" || v === "list") return v; } catch { /* not remembered */ }
  return window.matchMedia("(min-width: 1024px)").matches ? "grid" : "list";
};
const savedColumns = (): ColumnId[] => {
  try { const v = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? "null"); if (Array.isArray(v)) return v.filter((c) => COLUMNS.some((x) => x.id === c)); } catch { /* not remembered */ }
  return defaultColumns();
};
const remember = (key: string, value: unknown) => { try { localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value)); } catch { /* not remembered */ } };

function Page({ data }: { data: LibraryBoot }) {
  const [theme, toggleTheme] = useTheme();
  const { can } = useSession();
  // the navigation's Posts and Articles open the library with ?kind=
  const [filter, setFilter] = useState<LibraryFilter>(() => {
    const k = new URLSearchParams(window.location.search).get("kind");
    return { brand: data.activeId, kind: k === "post" || k === "article" ? k : "", status: "", q: "" };
  });
  const [typed, setTyped] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(savedSize);
  const [sort, setSort] = useState<LibrarySort>(DEFAULT_SORT);
  const [view, setView] = useState(savedView);
  const [columns, setColumns] = useState(savedColumns);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // an item opens as its own page, at /library/?item=draft:<id> (or job:<id>), so it has an address and Back returns to the list
  const [viewing, setViewing] = useState<ItemRef | null>(() => itemFromUrl());
  useEffect(() => {
    const back = () => setViewing(itemFromUrl());
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const pushed = useRef(false); // the item was opened from the list here, so Back can simply go back
  const openItem = (it: LibraryItem) => {
    pushed.current = true;
    window.history.pushState(null, "", `${window.location.pathname}?item=${it.type}:${encodeURIComponent(it.id)}`);
    setViewing({ type: it.type, id: it.id, item: it });
    document.querySelector("main")?.scrollTo(0, 0);
  };
  const closeItem = () => {
    if (pushed.current) { pushed.current = false; window.history.back(); return; }
    window.history.replaceState(null, "", window.location.pathname);
    setViewing(null);
  };
  const [asking, setAsking] = useState<LibraryItem[] | null>(null); // rows waiting for a delete to be confirmed
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<LibraryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const run = useRef(0); // only the newest request may fill the list

  const brand = data.profiles.find((p) => p.id === (filter.brand === "all" ? data.activeId : filter.brand)) ?? data.profiles[0];
  const names = Object.fromEntries(data.profiles.map((p) => [p.id, p.name]));

  // search waits for a pause in typing, and any change of filter or order goes back to the first page
  useEffect(() => {
    const t = window.setTimeout(() => setFilter((f) => (f.q === typed ? f : { ...f, q: typed })), 300);
    return () => window.clearTimeout(t);
  }, [typed]);
  useEffect(() => { setPage(1); }, [filter.brand, filter.kind, filter.status, filter.q, pageSize, sort]);

  const load = useCallback(async (quiet = false) => {
    const id = ++run.current;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const r = await api.library(filter, data.activeId, page, pageSize, sort);
      if (id !== run.current) return;
      setResult(r);
      if (r.page !== page) setPage(r.page); // the page asked for was past the end
    } catch (e) {
      if (id === run.current) setError(message(e));
    } finally {
      if (id === run.current) setLoading(false);
    }
  }, [filter, data.activeId, page, pageSize, sort]);
  useEffect(() => { setOpenId(null); setSelected(new Set()); void load(); }, [load]);

  const changeSize = (n: number) => { setPageSize(n); remember(SIZE_KEY, String(n)); };
  const changeView = (v: "grid" | "list") => { setView(v); remember(VIEW_KEY, v); };
  const toggleColumn = (id: ColumnId) => {
    const next = columns.includes(id) ? columns.filter((c) => c !== id) : COLUMNS.map((c) => c.id).filter((c) => c === id || columns.includes(c));
    setColumns(next); remember(COLUMNS_KEY, next);
  };
  const items = result?.items ?? [];
  /** A row changed in place: show it at once, then look again so the list agrees with the server. */
  const patchItem = (id: string, patch: Partial<LibraryItem>) => {
    setResult((r) => (r ? { ...r, items: r.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) } : r));
  };
  const gone = () => { setOpenId(null); if (viewing) closeItem(); void load(true); };

  /** Delete the rows the person confirmed, one by one, each checked by the server as a single delete would be. */
  const confirmDelete = async () => {
    if (!asking) return;
    setDeleting(true);
    const failed: string[] = [];
    for (const it of asking) {
      try { await (it.type === "draft" ? api.deleteDraft(it.id) : api.deleteJob(it.id)); }
      catch (e) { failed.push(`${it.title || "Untitled"}: ${message(e)}`); }
    }
    setDeleting(false); setAsking(null); setSelected(new Set());
    if (viewing && asking.some((x) => rowKey(x) === rowKey(viewing))) closeItem();
    const done = asking.length - failed.length;
    if (done) toast.success(done === 1 ? "Deleted" : `Deleted ${done}`);
    if (failed.length) toast.error(`${failed.length} could not be deleted`, { description: failed.join("\n") });
    void load(true);
  };
  const backToDraft = async (it: LibraryItem) => {
    try { const d = await api.unapproveDraft(it.id); patchItem(it.id, { status: d.status }); toast.success("Back to draft"); }
    catch (e) { toast.error(message(e)); }
  };
  const chosen = items.filter((it) => selected.has(rowKey(it)));

  // the brand at the top of the navigation is the brand the library opens on; switching it shows that brand's items
  const [railBrand, setRailBrand] = useState(data.activeId);
  const switchBrand = (id: string) => {
    setRailBrand(id);
    setFilter((f) => ({ ...f, brand: id }));
    api.putPreference("activeProfile", id).catch(() => undefined); // only means the choice is not remembered
  };
  const filtered = filter.kind !== "" || filter.status !== "" || filter.q !== "";
  const grid = view === "grid";

  return (
    <>
      <Toaster theme={theme} />
      <Shell area="library" sub={filter.kind} onSub={(k) => setFilter((f) => ({ ...f, kind: k === "post" || k === "article" ? k : "" }))} brands={data.profiles} activeId={railBrand} colors={data.colors} onSwitchBrand={switchBrand} theme={theme} onToggleTheme={toggleTheme}>

      <div className="flex min-h-0 min-w-0 flex-1">
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {viewing ? <ItemPage key={`${viewing.type}:${viewing.id}`} at={viewing} data={data} onBack={closeItem} onGone={gone}
          onPatch={(p) => { patchItem(viewing.id, p); setViewing((v) => (v?.item ? { ...v, item: { ...v.item, ...p } } : v)); }} /> : (
        <div className={cn("px-4 py-6 sm:px-6", grid ? "max-w-none" : "mx-auto max-w-3xl")}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {filter.brand === "all" ? "Posts and articles for every brand" : `Posts and articles for ${brand.name}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {grid && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Columns3 /> Columns</Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[190px]">
                    {COLUMNS.map((c) => (
                      <DropdownMenuItem key={c.id} onSelect={(e) => { e.preventDefault(); toggleColumn(c.id); }}>
                        <span className="grid h-4 w-4 place-items-center rounded-sm border border-border">{columns.includes(c.id) && <Check className="h-3 w-3" />}</span> {c.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <div className="flex rounded-md border border-border bg-card p-0.5" role="group" aria-label="Show as">
                {([["grid", "Grid", <Table2 key="g" />], ["list", "List", <List key="l" />]] as const).map(([v, label, icon]) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => changeView(v)}
                    className={cn("flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium [&_svg]:h-3.5 [&_svg]:w-3.5", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {icon} {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search" aria-label="Search the library" className="pl-8" />
            </div>
            {data.profiles.length > 1 && (
              <Select value={filter.brand} onValueChange={(v) => setFilter((f) => ({ ...f, brand: v }))}>
                <SelectTrigger className="w-[150px]" aria-label="Brand"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {data.profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  <SelectItem value="all">All brands</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Select value={filter.kind || "any"} onValueChange={(v) => setFilter((f) => ({ ...f, kind: v === "any" ? "" : (v as "post" | "article") }))}>
              <SelectTrigger className="w-[170px]" aria-label="Kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Posts and articles</SelectItem>
                <SelectItem value="post">Posts</SelectItem>
                <SelectItem value="article">Articles</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filter.status || "any"} onValueChange={(v) => setFilter((f) => ({ ...f, status: v === "any" ? "" : v }))}>
              <SelectTrigger className="w-[140px]" aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => <SelectItem key={s.value || "any"} value={s.value || "any"}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {grid && chosen.length > 0 && (
            <div role="status" className="mt-3 flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
              <span>{chosen.length} selected</span>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              <Button size="sm" variant="destructive" className="ml-auto" onClick={() => setAsking(chosen)}><Trash2 /> Delete {chosen.length}</Button>
            </div>
          )}

          {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
          {loading && !result ? (
            <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
          ) : items.length === 0 ? (
            <p className="mt-8 text-sm text-muted-foreground">
              {filtered ? "Nothing matches." : <>Nothing yet. Write a post in the <a className="text-brand hover:underline" href={studioHref()}>studio</a>.</>}
            </p>
          ) : grid ? (
            <div className="mt-4">
              <Grid items={items} columns={filter.brand === "all" ? columns : columns.filter((c) => c !== "brand")} sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))}
                selected={selected} onSelected={setSelected} loading={loading}
                brandName={(id) => names[id] ?? id} when={day}
                thumb={(it) => (it.type === "job" ? <Thumb id={it.id} /> : <CardThumb design={it.design} profile={data.profiles.find((p) => p.id === it.profileId)} />)}
                badge={(it) => <StatusBadge s={it.status} />}
                onView={openItem} editHref={(it) => draftLink(base(), it)} scheduleHref={(it) => draftLink(base(), it) + "&open=preview"}
                onBackToDraft={(it) => void backToDraft(it)} onDelete={(rows) => setAsking(rows)} />
            </div>
          ) : (
            <ul className={"mt-4 divide-y divide-border border-y border-border" + (loading ? " opacity-60" : "")} aria-busy={loading}>
              {items.map((it) => (
                <Row key={`${it.type}:${it.id}`} item={it} data={data} open={openId === it.id} onToggle={() => setOpenId(openId === it.id ? null : it.id)}
                  brandName={filter.brand === "all" ? names[it.profileId] ?? it.profileId : undefined}
                  onPatch={(p) => patchItem(it.id, p)} onGone={gone} />
              ))}
            </ul>
          )}
          {result && result.total > 0 && <Pager r={result} onPage={setPage} onSize={changeSize} />}
        </div>
        )}
      </main>

      </div>

      <Dialog open={!!asking} onOpenChange={(o) => { if (!o && !deleting) setAsking(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{asking && asking.length > 1 ? `Delete ${asking.length} items?` : `Delete “${asking?.[0]?.title || "Untitled"}”?`}</DialogTitle>
            <DialogDescription>{asking ? deleteSummary(asking).text : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" disabled={deleting} onClick={() => setAsking(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" disabled={deleting || !can("write")} onClick={() => void confirmDelete()}>{deleting ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </Shell>
    </>
  );
}

interface ItemRef { type: "job" | "draft"; id: string; /** The row it was opened from; absent when the page was opened by its address. */ item?: LibraryItem }

/** A title for an item without one: its first line, as the list shows it. */
const firstLine = (text: string) => {
  const line = text.trim().split("\n")[0]?.trim() ?? "";
  return line.length > 80 ? `${line.slice(0, 79).replace(/\s+\S*$/, "")}…` : line;
};

function itemFromUrl(): ItemRef | null {
  const v = new URLSearchParams(window.location.search).get("item");
  const m = v ? /^(job|draft):(.+)$/.exec(v) : null;
  return m ? { type: m[1] as ItemRef["type"], id: m[2] } : null;
}

/** One post or article as a page of its own: its card, its text, its record and what can be done with it. */
function ItemPage({ at, data, onBack, onGone, onPatch }: { at: ItemRef; data: LibraryBoot; onBack: () => void; onGone: () => void; onPatch: (p: Partial<LibraryItem>) => void }) {
  const [item, setItem] = useState<LibraryItem | null>(at.item ?? null);
  const [error, setError] = useState<string | null>(null);
  // opened by its address: read enough of it for the heading and the actions
  useEffect(() => {
    if (item) return;
    let live = true;
    const fill = at.type === "draft"
      ? api.getDraft(at.id).then((d): LibraryItem => ({ type: "draft", id: d.id, profileId: d.profileId, kind: d.kind, status: d.status, title: d.title || firstLine(serializeDraft(d).text), excerpt: "", at: d.updatedAt, draftId: d.id, slug: d.slug, pageAt: d.pageAt }))
      : api.getJob(at.id).then((j): LibraryItem => ({ type: "job", id: j.id, profileId: j.profileId, kind: "post", status: j.status, title: firstLine(j.body), excerpt: "", at: j.publishedAt || j.scheduledAt || j.createdAt, postUrl: j.postUrl, draftId: j.draftId }));
    fill.then((it) => live && setItem(it)).catch((e) => live && setError(message(e)));
    return () => { live = false; };
  }, [at, item]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <button type="button" onClick={onBack} className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" /> Library</button>
      {error && <p role="alert" className="mt-6 text-sm text-destructive">{error}</p>}
      {!item && !error && <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
      {item && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge s={item.status} />
            <Badge variant="outline">{item.kind === "article" ? "Article" : "Post"}</Badge>
            {data.profiles.length > 1 && <Badge variant="outline">{data.profiles.find((p) => p.id === item.profileId)?.name ?? item.profileId}</Badge>}
            {item.at && <span className="text-xs text-muted-foreground">{day(item.at)}</span>}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{item.title || "Untitled"}</h1>
          {item.type === "job"
            ? <JobDetail id={item.id} page={pagePath(item)} onGone={onGone} onStatus={(status) => { setItem((x) => (x ? { ...x, status } : x)); onPatch({ status }); }} />
            : <DraftDetail item={item} data={data} onPatch={(p) => { setItem((x) => (x ? { ...x, ...p } : x)); onPatch(p); }} onGone={onGone} />}
        </>
      )}
    </div>
  );
}

/** Numbered pages with the total, and a choice of how many to show. The server does the paging. */
function Pager({ r, onPage, onSize }: { r: LibraryPage; onPage: (n: number) => void; onSize: (n: number) => void }) {
  const from = (r.page - 1) * r.pageSize + 1, to = Math.min(r.total, r.page * r.pageSize);
  return (
    <nav className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Pages of the list">
      <span className="text-muted-foreground">{from}–{to} of {r.total}</span>
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" aria-label="Previous page" disabled={r.page <= 1} onClick={() => onPage(r.page - 1)}><ChevronLeft /></Button>
        {pageNumbers(r.page, r.pages).map((n, i) => n === "…"
          ? <span key={`gap${i}`} className="px-1 text-muted-foreground" aria-hidden>…</span>
          : <Button key={n} size="sm" variant={n === r.page ? "brand" : "ghost"} className="min-w-8 px-2" aria-current={n === r.page ? "page" : undefined} aria-label={`Page ${n}`} onClick={() => onPage(n)}>{n}</Button>)}
        <Button size="icon-sm" variant="ghost" aria-label="Next page" disabled={r.page >= r.pages} onClick={() => onPage(r.page + 1)}><ChevronRight /></Button>
      </div>
      <Select value={String(r.pageSize)} onValueChange={(v) => onSize(Number(v))}>
        <SelectTrigger className="w-[130px]" aria-label="Rows per page"><SelectValue /></SelectTrigger>
        <SelectContent>{PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n} per page</SelectItem>)}</SelectContent>
      </Select>
    </nav>
  );
}

function Row({ item, data, open, onToggle, brandName, onPatch, onGone }: {
  item: LibraryItem; data: LibraryBoot; open: boolean; onToggle: () => void; brandName?: string;
  onPatch: (p: Partial<LibraryItem>) => void; onGone: () => void;
}) {
  const isJob = item.type === "job";
  return (
    <li className="py-3">
      <div className="flex gap-3">
        {isJob ? <Thumb id={item.id} /> : <CardThumb design={item.design} profile={data.profiles.find((p) => p.id === item.profileId)} />}
        <button type="button" onClick={onToggle} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge s={item.status} />
            <Badge variant="outline">{item.kind === "article" ? "Article" : "Post"}</Badge>
            {pagePath(item) && <Badge variant="outline" title="Has a public page"><Globe className="mr-1 h-3 w-3" />Page</Badge>}
            {brandName && <Badge variant="outline" title="The brand this belongs to">{brandName}</Badge>}
            <span className="text-xs text-muted-foreground">{day(item.at)}</span>
            {item.plannedAt && <span className="text-xs text-brand">Planned {formatInZone(item.plannedAt, item.timezone)}</span>}
          </div>
          <h2 className="mt-1 text-[15px] font-medium leading-snug">{item.title || "Untitled"}</h2>
          {item.excerpt && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{item.excerpt}</p>}
        </button>
        {item.postUrl && item.status === "published" && (
          <a href={item.postUrl} target="_blank" rel="noopener noreferrer" className="hidden shrink-0 items-center gap-1 self-start pt-1 text-xs text-brand hover:underline sm:flex">LinkedIn <ExternalLink className="h-3 w-3" /></a>
        )}
      </div>
      {open && (isJob ? <JobDetail id={item.id} page={pagePath(item)} onGone={onGone} /> : <DraftDetail item={item} data={data} onPatch={onPatch} onGone={onGone} />)}
    </li>
  );
}

/** A small card for a list row, drawn from the design saved with the item (a plain frame when it has none). */
function CardThumb({ design, profile }: { design?: Design; profile?: Profile }) {
  const frame = "h-12 w-20 shrink-0 overflow-hidden rounded border border-border bg-muted";
  if (!design || !profile) return <div className={`${frame} grid place-items-center text-muted-foreground`} aria-hidden><FileText className="h-4 w-4" /></div>;
  const d = fullDesign(DEFAULT_DESIGN, design);
  const palette = profile.palettes.find((p) => p.id === d.paletteId) ?? profile.palettes[0];
  if (!palette) return <div className={frame} aria-hidden />;
  return <div className={`${frame} grid place-items-center`} aria-hidden><ScaledCard design={d} profile={profile} palette={palette} size={sizeById(d.sizeId)} maxW={80} maxH={48} rounded={false} /></div>;
}

/** The card, drawn from the design saved with the item. */
function CardView({ design, profile }: { design?: Design; profile?: Profile }) {
  if (!profile) return null;
  const d = design ? fullDesign(DEFAULT_DESIGN, design) : DEFAULT_DESIGN;
  const palette = profile.palettes.find((p) => p.id === d.paletteId) ?? profile.palettes[0];
  if (!palette) return null;
  return <ScaledCard design={d} profile={profile} palette={palette} size={sizeById(d.sizeId)} maxW={640} maxH={360} />;
}

/** A draft, in full: its card, its text, and what can be done with it. */
function DraftDetail({ item, data, onPatch, onGone }: { item: LibraryItem; data: LibraryBoot; onPatch: (p: Partial<LibraryItem>) => void; onGone: () => void }) {
  const { can } = useSession();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [forLinkedIn, setForLinkedIn] = useState(false);
  const [tz, setTz] = useState(defaultTimezone());
  const [local, setLocal] = useState(() => toLocalInput(new Date(Date.now() + 7 * 24 * 3600_000), defaultTimezone()));
  const profile = useMemo(() => data.profiles.find((p) => p.id === item.profileId), [data.profiles, item.profileId]);
  useEffect(() => {
    let live = true;
    api.getDraft(item.id).then((d) => live && setDraft(d)).catch((e) => live && setError(message(e)));
    return () => { live = false; };
  }, [item.id]);
  useEffect(() => {
    if (!confirm) return;
    const t = window.setTimeout(() => setConfirm(false), 5000);
    return () => window.clearTimeout(t);
  }, [confirm]);

  if (error && !draft) return <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>;
  if (!draft) return <p className="mt-3 text-sm text-muted-foreground">Loading…</p>;

  const act = async (fn: () => Promise<Draft>): Promise<boolean> => {
    setBusy(true); setError(null);
    try {
      const d = await fn();
      setDraft(d);
      onPatch({ status: d.status, plannedAt: d.scheduledAt, timezone: d.timezone });
      return true;
    } catch (e) { setError(message(e)); return false; } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm) return setConfirm(true);
    setBusy(true);
    try { await api.deleteDraft(item.id); onGone(); } catch (e) { setError(message(e)); setBusy(false); }
  };
  const sched = resolveSchedule(local, tz);
  const name = slugify(draft.title || item.title || "article", "article");
  const editable = draft.status !== "scheduled";
  const isArticle = draft.kind === "article";

  return (
    <div className="mt-3 space-y-4 rounded-md border border-border bg-card p-3 text-sm">
      <CardView design={draft.design} profile={profile} />
      <div data-doc><DocView doc={draft.doc} kind={draft.kind} /></div>
      {!isArticle && draft.hashtags.length > 0 && <p className="text-brand">{draft.hashtags.map((h) => `#${h}`).join(" ")}</p>}
      {(draft.createdByName || draft.approvedByName) && (
        <p className="text-xs text-muted-foreground">{draft.createdByName && `Written by ${draft.createdByName}`}{draft.approvedByName && ` · approved by ${draft.approvedByName}`}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {editable && <Button asChild size="sm" variant="brand"><a href={draftLink(base(), item)}><PenLine /> Edit</a></Button>}
        {pagePath(draft) && <Button asChild size="sm" variant="outline"><a href={pagePath(draft)!} target="_blank" rel="noopener noreferrer"><Globe /> View page</a></Button>}
        {draft.status === "draft" && can("approve") && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => api.approveDraft(draft.id))}><Check /> Approve</Button>}
        {draft.status === "approved" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => api.unapproveDraft(draft.id))}><Undo2 /> Back to draft</Button>}
        {draft.status === "approved" && !isArticle && can("publish") && (
          <Button asChild size="sm" variant="outline"><a href={draftLink(base(), item) + "&open=preview"}><CalendarClock /> Schedule…</a></Button>
        )}
        {draft.status === "approved" && isArticle && can("approve") && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setPlanning((v) => !v)}><CalendarClock /> {draft.scheduledAt ? "Change date" : "Plan a date"}</Button>
        )}
        {isArticle && (
          <>
            <Button size="sm" variant="ghost" onClick={() => setForLinkedIn(true)}><Share2 /> For LinkedIn</Button>
            <Button size="sm" variant="ghost" onClick={() => downloadBlob(new Blob([docToMarkdown(draft.doc)], { type: "text/markdown;charset=utf-8" }), `${name}.md`)}><Download /> Markdown</Button>
            <Button size="sm" variant="ghost" onClick={() => downloadBlob(new Blob([articleHtmlPage(draft.title || item.title, document.querySelector<HTMLElement>("[data-doc] .ProseMirror")?.innerHTML ?? "")], { type: "text/html;charset=utf-8" }), `${name}.html`)}><Download /> HTML</Button>
          </>
        )}
        {draft.status === "draft" && (
          <Button size="sm" variant={confirm ? "destructive" : "ghost"} className="ml-auto" disabled={busy} onClick={() => void remove()}>
            <Trash2 /> {confirm ? "Confirm: delete" : "Delete"}
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {draft.status === "scheduled" && <p className="text-xs text-muted-foreground">A post is waiting to be sent from this draft.</p>}
      {planning && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <ScheduleFields verb="Planned for" idPrefix={`plan-${draft.id}`} local={local} tz={tz} onLocal={setLocal} onTz={setTz} />
          <div className="flex justify-end gap-2">
            {draft.scheduledAt && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => api.planDraft(draft.id, {})).then((ok) => ok && setPlanning(false))}><X /> Clear</Button>}
            <Button size="sm" variant="brand" disabled={busy || !!sched.problem || !sched.at}
              onClick={() => sched.at && void act(() => api.planDraft(draft.id, { scheduledAt: sched.at!.toISOString().replace(/\.\d{3}Z$/, "Z"), timezone: tz })).then((ok) => ok && setPlanning(false))}>
              <CalendarClock /> Save date
            </Button>
          </div>
        </div>
      )}
      {isArticle && <LinkedInArticleDialog open={forLinkedIn} onOpenChange={setForLinkedIn} doc={draft.doc} title={draft.title || item.title} />}
      {confirm && <p className="text-xs text-muted-foreground">This deletes the {isArticle ? "article" : "draft"} and its card. It cannot be undone.</p>}
    </div>
  );
}

/** The picture that was posted, larger than the thumbnail. */
function Poster({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | undefined;
    let live = true;
    api.jobImage(id).then((b) => { if (live) { url = URL.createObjectURL(b); setSrc(url); } }).catch(() => undefined);
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return src ? <img src={src} alt="The card that was posted" className="max-h-[360px] max-w-full rounded-md border border-border" /> : null;
}

/** The whole record of a post: what was sent, when, and what LinkedIn answered. */
function JobDetail({ id, page, onGone, onStatus }: { id: string; page: string | null; onGone: () => void; /** The post was moved or cancelled. */ onStatus?: (status: Job["status"]) => void }) {
  const { can } = useSession();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [tz, setTz] = useState(defaultTimezone());
  const [local, setLocal] = useState(() => toLocalInput(new Date(Date.now() + 24 * 3600_000), defaultTimezone()));
  useEffect(() => {
    let live = true;
    api.getJob(id).then((j) => live && setJob(j)).catch((e) => live && setError(message(e)));
    return () => { live = false; };
  }, [id]);
  useEffect(() => {
    if (!confirm) return;
    const t = window.setTimeout(() => setConfirm(false), 5000);
    return () => window.clearTimeout(t);
  }, [confirm]);

  if (error && !job) return <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>;
  if (!job) return <p className="mt-3 text-sm text-muted-foreground">Loading…</p>;
  const remove = async () => {
    if (!confirm) return setConfirm(true);
    setBusy(true);
    try { await api.deleteJob(id); onGone(); } catch (e) { setError(message(e)); setBusy(false); }
  };
  const removable = can("publish") && job.status !== "scheduled" && job.status !== "publishing";
  // a post not yet sent can be moved to another time or cancelled; a sent one is read-only
  const movable = can("publish") && ["scheduled", "missed", "failed", "needs_review"].includes(job.status);
  const cancellable = can("publish") && ["scheduled", "missed", "failed", "needs_review"].includes(job.status);
  const sched = resolveSchedule(local, tz);
  const change = async (fn: () => Promise<Job>, done: string) => {
    setBusy(true); setError(null);
    try { const j = await fn(); setJob(j); onStatus?.(j.status); setMoving(false); setCancelAsk(false); toast.success(done); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 space-y-3 rounded-md border border-border bg-card p-3 text-sm">
      <Poster id={id} />
      <p className="whitespace-pre-wrap leading-relaxed">{job.previewText}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Created</dt><dd>{formatInZone(job.createdAt)}</dd>
        {job.scheduledAt && <><dt className="text-muted-foreground">Scheduled for</dt><dd>{formatInZone(job.scheduledAt, job.timezone)}</dd></>}
        {job.publishedAt && <><dt className="text-muted-foreground">Posted</dt><dd>{formatInZone(job.publishedAt)}</dd></>}
        {job.postUrn && <><dt className="text-muted-foreground">LinkedIn id</dt><dd className="break-all">{job.postUrn}</dd></>}
        {job.altText && <><dt className="text-muted-foreground">Alt text</dt><dd>{job.altText}</dd></>}
        {job.error && <><dt className="text-muted-foreground">Problem</dt><dd className="text-destructive">{job.error}</dd></>}
      </dl>
      <Attempts id={id} />
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {job.postUrl && <a href={job.postUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-brand hover:underline">View on LinkedIn <ExternalLink className="h-3 w-3" /></a>}
        {page && <a href={page} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-brand hover:underline"><Globe className="h-3 w-3" /> Public page</a>}
        {job.status === "published" && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5 text-brand" /> Sent. Read-only.</span>}
        {movable && <Button size="sm" variant="outline" disabled={busy} onClick={() => { setMoving((v) => !v); if (job.scheduledAt) { setTz(job.timezone || defaultTimezone()); setLocal(toLocalInput(new Date(job.scheduledAt), job.timezone || defaultTimezone())); } }}><CalendarClock /> Move…</Button>}
        {cancellable && <Button size="sm" variant={cancelAsk ? "destructive" : "ghost"} disabled={busy} onClick={() => (cancelAsk ? void change(() => api.cancelJob(id), "Cancelled") : setCancelAsk(true))}><X /> {cancelAsk ? "Confirm: cancel the post" : "Cancel post"}</Button>}
        {removable && (
          <Button size="sm" variant={confirm ? "destructive" : "ghost"} className="ml-auto" disabled={busy} onClick={() => void remove()}
            title="Removes this record. The post stays on LinkedIn.">
            <Trash2 /> {confirm ? "Confirm: delete record" : "Delete record"}
          </Button>
        )}
      </div>
      {confirm && <p className="text-xs text-muted-foreground">This removes the record here. The post stays on LinkedIn.</p>}
      {cancelAsk && <p className="text-xs text-muted-foreground">The post will not be sent. Its draft stays approved, so it can be scheduled again.</p>}
      {moving && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <ScheduleFields idPrefix={`move-${id}`} local={local} tz={tz} onLocal={setLocal} onTz={setTz} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMoving(false)}>Keep the time</Button>
            <Button size="sm" variant="brand" disabled={busy || !!sched.problem || !sched.at}
              onClick={() => sched.at && void change(() => api.rescheduleJob(id, sched.at!.toISOString().replace(/\.\d{3}Z$/, "Z"), tz), "Moved")}>
              <CalendarClock /> Move here
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
