import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, FileText, Loader2, PenLine, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { AccountMenu, studioHref } from "@/components/studio/AccountMenu";
import { Attempts, Thumb } from "@/components/studio/JobQueue";
import { BootScreen } from "@/components/studio/BootScreen";
import { Logo } from "@/components/studio/Logo";
import { api } from "@/lib/api";
import { formatInZone, type Job } from "@/lib/jobs";
import { draftLink, LIBRARY_STATUS_LABEL, STATUS_FILTERS, type LibraryFilter, type LibraryItem } from "@/lib/library";
import { useLibraryBoot, type LibraryBoot } from "@/lib/useLibraryBoot";
import { useTheme } from "@/lib/useTheme";

const base = () => import.meta.env.BASE_URL;
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
const day = (iso: string) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export default function Library() {
  const { boot, retry, submitToken } = useLibraryBoot();
  if (boot.status !== "ready") {
    return <BootScreen boot={boot} retry={retry} submitToken={submitToken} importLegacy={() => undefined} discardLegacy={() => undefined} />;
  }
  return <Page data={boot.data} />;
}

function StatusBadge({ s }: { s: LibraryItem["status"] }) {
  const label = LIBRARY_STATUS_LABEL[s] ?? s;
  if (s === "failed") return <Badge className="border-transparent bg-destructive/15 text-destructive">{label}</Badge>;
  if (s === "missed" || s === "needs_review") return <Badge variant="warn">{label}</Badge>;
  if (s === "published" || s === "scheduled" || s === "publishing") return <Badge variant="brand">{label}</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}

function Page({ data }: { data: LibraryBoot }) {
  const [theme, toggleTheme] = useTheme(data.theme);
  const [filter, setFilter] = useState<LibraryFilter>({ brand: data.activeId, kind: "", status: "", q: "" });
  const [typed, setTyped] = useState("");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [next, setNext] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const run = useRef(0); // only the newest request may fill the list

  const brand = data.profiles.find((p) => p.id === (filter.brand === "all" ? data.activeId : filter.brand)) ?? data.profiles[0];
  const names = Object.fromEntries(data.profiles.map((p) => [p.id, p.name]));

  // search waits for a pause in typing
  useEffect(() => {
    const t = window.setTimeout(() => setFilter((f) => (f.q === typed ? f : { ...f, q: typed })), 300);
    return () => window.clearTimeout(t);
  }, [typed]);

  const load = useCallback(async () => {
    const id = ++run.current;
    setLoading(true); setError(null); setOpenId(null);
    try {
      const page = await api.library(filter, data.activeId);
      if (id !== run.current) return;
      setItems(page.items); setNext(page.next);
    } catch (e) {
      if (id === run.current) setError(message(e));
    } finally {
      if (id === run.current) setLoading(false);
    }
  }, [filter, data.activeId]);
  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (!next) return;
    setMore(true);
    try {
      const page = await api.library(filter, data.activeId, next);
      setItems((l) => [...l, ...page.items]); setNext(page.next);
    } catch (e) { setError(message(e)); } finally { setMore(false); }
  };

  const menu = (variant: "footer" | "avatar") => (
    <AccountMenu variant={variant} page="library" name={brand.name} handle={brand.handle} color={data.colors[brand.id] ?? "#888"} theme={theme} onToggleTheme={toggleTheme} />
  );
  const filtered = filter.kind !== "" || filter.status !== "" || filter.q !== "";

  return (
    <div className="flex h-dvh">
      <Toaster theme={theme} />
      <aside className="hidden w-[260px] shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="px-4 py-3"><Logo /></div>
        <nav className="flex flex-col gap-0.5 px-2 pt-2 text-sm" aria-label="Pages">
          <a href={studioHref()} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"><PenLine className="h-4 w-4" /> Editor</a>
          <a href="" aria-current="page" className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-2 font-medium"><FileText className="h-4 w-4" /> Library</a>
        </nav>
        <div className="flex-1" />
        <div className="border-t border-border p-2">{menu("footer")}</div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            {menu("avatar")}
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filter.brand === "all" ? "Posts and articles for every brand" : `Posts and articles for ${brand.name}`}
          </p>

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

          {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
          {loading ? (
            <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
          ) : items.length === 0 ? (
            <p className="mt-8 text-sm text-muted-foreground">
              {filtered ? "Nothing matches." : <>Nothing yet. Write a post in the <a className="text-brand hover:underline" href={studioHref()}>editor</a>.</>}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {items.map((it) => (
                <Row key={`${it.type}:${it.id}`} item={it} open={openId === it.id} onToggle={() => setOpenId(openId === it.id ? null : it.id)}
                  brandName={filter.brand === "all" ? names[it.profileId] ?? it.profileId : undefined}
                  onDeleted={() => setItems((l) => l.filter((x) => x.id !== it.id))} />
              ))}
            </ul>
          )}
          {next && !loading && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={more}>{more ? <Loader2 className="animate-spin" /> : null} Load more</Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Row({ item, open, onToggle, brandName, onDeleted }: { item: LibraryItem; open: boolean; onToggle: () => void; brandName?: string; onDeleted: () => void }) {
  const isJob = item.type === "job";
  const meta = (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge s={item.status} />
        <Badge variant="outline">{item.kind === "article" ? "Article" : "Post"}</Badge>
        {brandName && <Badge variant="outline" title="The brand this belongs to">{brandName}</Badge>}
        <span className="text-xs text-muted-foreground">{day(item.at)}</span>
      </div>
      <h2 className="mt-1 text-[15px] font-medium leading-snug">{item.title || "Untitled"}</h2>
      {item.excerpt && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{item.excerpt}</p>}
    </>
  );
  return (
    <li className="py-3">
      <div className="flex gap-3">
        {isJob ? <Thumb id={item.id} /> : <div className="grid h-12 w-20 shrink-0 place-items-center rounded border border-dashed border-border text-muted-foreground" aria-hidden><FileText className="h-4 w-4" /></div>}
        {isJob ? (
          <button type="button" onClick={onToggle} aria-expanded={open} className="min-w-0 flex-1 text-left">{meta}</button>
        ) : (
          <a href={draftLink(base(), item)} className="min-w-0 flex-1" title="Open in the editor">{meta}</a>
        )}
        {item.postUrl && item.status === "published" && (
          <a href={item.postUrl} target="_blank" rel="noopener noreferrer" className="hidden shrink-0 items-center gap-1 self-start pt-1 text-xs text-brand hover:underline sm:flex">LinkedIn <ExternalLink className="h-3 w-3" /></a>
        )}
      </div>
      {isJob && open && <Detail id={item.id} onDeleted={onDeleted} />}
    </li>
  );
}

/** The whole record of a post: what was sent, when, and what LinkedIn answered. */
function Detail({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
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

  if (error) return <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>;
  if (!job) return <p className="mt-3 text-sm text-muted-foreground">Loading…</p>;
  const remove = async () => {
    if (!confirm) return setConfirm(true);
    setBusy(true);
    try { await api.deleteJob(id); onDeleted(); } catch (e) { setError(message(e)); setBusy(false); }
  };
  const removable = job.status !== "scheduled" && job.status !== "publishing";
  return (
    <div className="mt-3 space-y-3 rounded-md border border-border bg-card p-3 text-sm">
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
      <div className="flex flex-wrap items-center gap-2">
        {job.postUrl && <a href={job.postUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-brand hover:underline">View on LinkedIn <ExternalLink className="h-3 w-3" /></a>}
        {job.status === "published" && <Check className="h-3.5 w-3.5 text-brand" aria-label="Published" />}
        {removable && (
          <Button size="sm" variant={confirm ? "destructive" : "ghost"} className="ml-auto" disabled={busy} onClick={() => void remove()}
            title="Removes this record. The post stays on LinkedIn.">
            <Trash2 /> {confirm ? "Confirm: delete record" : "Delete record"}
          </Button>
        )}
      </div>
      {confirm && <p className="text-xs text-muted-foreground">This removes the record here. The post stays on LinkedIn.</p>}
    </div>
  );
}
