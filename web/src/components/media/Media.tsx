import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { readPref, savePref } from "@/lib/prefs";
import { CircleAlert, Download, ExternalLink, LayoutGrid, Link2, List, Loader2, MoreHorizontal, Pencil, Search, Trash2, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pager } from "@/components/ui/pager";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Shell } from "@/components/shell/Rail";
import { BootScreen } from "@/components/studio/BootScreen";
import { SessionProvider } from "@/components/studio/SessionProvider";
import { Thumb } from "./Thumb";
import { api } from "@/lib/api";
import { formatInZone } from "@/lib/jobs";
import { ACCEPT, ASSET_PAGE_SIZES, fileProblem, fileSize, KIND_LABEL, nameFromFile, prepareUpload, splitTags, type Asset, type AssetKind, type Assets } from "@/lib/assets";
import { libraryHref } from "@/lib/nav";
import { useLibraryBoot, type LibraryBoot } from "@/lib/useLibraryBoot";
import { useTheme } from "@/lib/useTheme";
import { cn } from "@/lib/utils";
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
const VIEW_KEY = "media.view";
const SIZE_KEY = "media.pageSize";
const savedSize = () => { const n = Number(readPref(SIZE_KEY)); return (ASSET_PAGE_SIZES as readonly number[]).includes(n) ? n : 24; };

export default function Media() {
  const { boot, retry, submitToken } = useLibraryBoot();
  if (boot.status !== "ready") return <BootScreen boot={boot} retry={retry} submitToken={submitToken} />;
  return <SessionProvider initial={boot.data.session}><Page data={boot.data} /></SessionProvider>;
}

const about = (a: Asset) => [KIND_LABEL[a.kind], a.size ? fileSize(a.size) : "", a.width ? `${a.width} × ${a.height}` : ""].filter(Boolean).join(" · ");

function Page({ data }: { data: LibraryBoot }) {
  const [theme, toggleTheme] = useTheme();
  const [brand, setBrand] = useState(data.activeId);
  const [library, setLibrary] = useState<Assets | null>(null);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");
  // what the server is asked for; a new filter starts at the first page
  const [query, setQuery] = useState(() => ({ text: "", kind: "" as "" | AssetKind, tag: "", page: 1, pageSize: savedSize() }));
  const ask = useCallback((change: Partial<typeof query>) => setQuery((q) => ({ ...q, page: 1, ...change })), []);
  const [view, setView] = useState<"grid" | "list">(() => (readPref(VIEW_KEY) === "list" ? "list" : "grid"));
  const [sending, setSending] = useState<{ name: string; at: number; of: number } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const run = useRef(0);

  const load = useCallback(() => {
    const mine = ++run.current;
    setError("");
    api.assets(brand, query).then((l) => {
      if (mine !== run.current) return;
      setLibrary(l);
      if (l.page !== query.page) setQuery((q) => ({ ...q, page: l.page })); // the page asked for was past the end
    }, (e) => { if (mine === run.current) { setLibrary(null); setError(message(e)); } });
  }, [brand, query]);
  useEffect(load, [load]);
  // search waits for a pause in typing
  useEffect(() => {
    const t = window.setTimeout(() => setQuery((q) => (q.text === typed ? q : { ...q, text: typed, page: 1 })), 300);
    return () => window.clearTimeout(t);
  }, [typed]);
  /** After adding: the newest are first, so show the first page. */
  const showNewest = () => { if (query.page === 1) load(); else ask({}); };

  const changeView = (v: "grid" | "list") => { setView(v); savePref(VIEW_KEY, v); };
  const switchBrand = (id: string) => { void api.putPreference("activeProfile", id).then(() => { setLibrary(null); ask({ tag: "" }); setBrand(id); }, (e) => toast.error("Could not switch", { description: message(e) })); };

  /** Files go one at a time, which a small server can hold. */
  const upload = async (files: File[]) => {
    if (!files.length || sending) return;
    const failed: string[] = [];
    let added = 0;
    for (const [n, f] of files.entries()) {
      setSending({ name: f.name, at: n + 1, of: files.length });
      try {
        const problem = fileProblem(f);
        if (problem) throw new Error(problem);
        const ready = await prepareUpload(f);
        const form = new FormData();
        form.set("name", nameFromFile(f.name));
        form.set("file", ready.file, f.name);
        if (ready.thumb) form.set("thumb", ready.thumb, "thumb");
        await api.addAsset(brand, form);
        added++;
      } catch (e) {
        failed.push(`${f.name}: ${message(e)}`);
      }
    }
    setSending(null);
    if (added) toast.success(added === 1 ? "Added" : `Added ${added}`);
    if (failed.length) toast.error(failed.length === 1 ? "Not added" : `${failed.length} were not added`, { description: failed.join("\n"), duration: 8000 });
    showNewest();
  };

  const save = async (a: Asset, name: string, tags: string[]) => { await api.updateAsset(a.profileId, a.id, { name, tags }); load(); };
  const remove = async (a: Asset) => {
    try { await api.deleteAsset(a.profileId, a.id); toast.success("Deleted"); }
    catch (e) { toast.error("Not deleted", { description: message(e), duration: 12_000 }); }
    setDeleting(null); load();
  };
  const download = async (a: Asset) => {
    try {
      const url = URL.createObjectURL(await api.assetBlob(a.profileId, a.id, "file"));
      const link = document.createElement("a");
      link.href = url; link.download = `${a.name}.${(a.mime ?? "").split("/")[1] ?? "bin"}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) { toast.error("Could not download", { description: message(e) }); }
  };

  const shown = library?.items ?? [];
  const tags = library?.tags ?? [];
  const name = data.profiles.find((p) => p.id === brand)?.name ?? "";
  const full = library ? Math.min(100, (library.usedBytes / library.limitBytes) * 100) : 0;

  const actions = (a: Asset) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${a.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {a.link
          ? <DropdownMenuItem asChild><a href={a.link} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open the video</a></DropdownMenuItem>
          : <DropdownMenuItem onSelect={() => void download(a)}><Download /> Download</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => setEditing(a)}><Pencil /> Name and tags…</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setDeleting(a)} className="text-destructive"><Trash2 /> Delete…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const chips = (a: Asset) => a.tags.map((t) => <Badge key={t} variant="outline" className="normal-case tracking-normal">{t}</Badge>);
  const group = "rounded-lg border border-border bg-card p-0.5";

  return (
    <>
      <Toaster theme={theme} />
      <Shell area="library" sub="media" brands={data.profiles} activeId={brand} colors={data.colors} onSwitchBrand={switchBrand} theme={theme} onToggleTheme={toggleTheme}>
        <main
          className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto", dropping && "outline-2 -outline-offset-8 outline-dashed outline-brand")}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDropping(true); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false); }}
          onDrop={(e) => { e.preventDefault(); setDropping(false); void upload([...e.dataTransfer.files]); }}
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 max-sm:basis-full">
                <h1 className="text-2xl font-semibold tracking-tight">Media</h1>
                <p className="text-sm text-muted-foreground">Pictures, documents and video links of {name}.</p>
              </div>
              <Button asChild variant="ghost" size="sm" className="lg:hidden"><a href={libraryHref()}>Posts and articles</a></Button>
              <AddVideo brand={brand} onAdded={showNewest} />
              <Button variant="gold" size="sm" disabled={!!sending} onClick={() => input.current?.click()}><Upload /> Upload</Button>
              <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" aria-label="Choose files to upload" onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ""; }} />
            </div>

            {library?.diskPercent && (
              <Alert role="status" className="border-amber-500/40 bg-amber-500/10">
                <TriangleAlert aria-hidden />
                <AlertDescription>The server’s disk is {library.diskPercent}% full. Delete what you no longer need, or ask your administrator for more room.</AlertDescription>
              </Alert>
            )}
            {error && <Alert variant="destructive"><CircleAlert aria-hidden /><AlertDescription>{error}</AlertDescription><Button size="sm" variant="outline" onClick={load}>Try again</Button></Alert>}
            {sending && <Alert role="status"><Loader2 aria-hidden className="animate-spin" /><AlertDescription>Adding {sending.name}{sending.of > 1 ? ` (${sending.at} of ${sending.of})` : ""}…</AlertDescription></Alert>}
            {!library && !error && (
              <div role="status" aria-label="Loading" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{[0, 1, 2, 3].map((n) => <Skeleton key={n} className="h-48" />)}</div>
            )}

            {library && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[180px] flex-1">
                    <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search" aria-label="Search the media library" className="pl-8" />
                  </div>
                  <ToggleGroup type="single" aria-label="Type" className={group} value={query.kind || "all"} onValueChange={(v) => { if (v) ask({ kind: v === "all" ? "" : (v as AssetKind) }); }}>
                    <ToggleGroupItem value="all">All</ToggleGroupItem>
                    <ToggleGroupItem value="image">Images</ToggleGroupItem>
                    <ToggleGroupItem value="pdf">PDFs</ToggleGroupItem>
                    <ToggleGroupItem value="video">Videos</ToggleGroupItem>
                  </ToggleGroup>
                  {(tags.length > 0 || query.tag) && (
                    <Select value={query.tag || "*"} onValueChange={(v) => ask({ tag: v === "*" ? "" : v })}>
                      <SelectTrigger className="w-[150px]" aria-label="Tag"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="*">Any tag</SelectItem>
                        {/* the chosen tag stays listed when its last entry goes */}
                        {[...new Set([...tags, ...(query.tag ? [query.tag] : [])])].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  <ToggleGroup type="single" aria-label="View" className={group} value={view} onValueChange={(v) => { if (v) changeView(v as "grid" | "list"); }}>
                    <ToggleGroupItem value="grid" aria-label="Grid"><LayoutGrid /></ToggleGroupItem>
                    <ToggleGroupItem value="list" aria-label="List"><List /></ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {library.count === 0 ? (
                  <Card className="grid place-items-center gap-3 border-dashed p-10 text-center">
                    <p className="text-sm text-muted-foreground">Nothing here yet. Drop pictures or PDFs on this page.</p>
                    <Button variant="outline" size="sm" disabled={!!sending} onClick={() => input.current?.click()}><Upload /> Choose files</Button>
                  </Card>
                ) : shown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing matches.</p>
                ) : view === "grid" ? (
                  <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {shown.map((a) => (
                      <li key={a.id}>
                        <Card className="h-full overflow-hidden">
                          <Thumb asset={a} className="aspect-4/3 w-full" />
                          <div className="flex items-start gap-1 p-3 pr-1">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium" title={a.name}>{a.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{about(a)}</p>
                              {a.tags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{chips(a)}</div>}
                            </div>
                            {actions(a)}
                          </div>
                        </Card>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Card className="px-4 py-1">
                    <Table className="min-w-[36rem]">
                      <TableHeader><TableRow><TableHead className="w-14"><span className="sr-only">Thumbnail</span></TableHead><TableHead>Name</TableHead><TableHead>Details</TableHead><TableHead>Tags</TableHead><TableHead>Added</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
                      <TableBody>
                        {shown.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell><Thumb asset={a} className="h-10 w-12 rounded" /></TableCell>
                            <TableCell className="max-w-64 truncate font-medium">{a.name}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{about(a)}</TableCell>
                            <TableCell><div className="flex flex-wrap gap-1">{chips(a)}</div></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatInZone(a.createdAt)}{a.createdBy?.trim() ? ` · ${a.createdBy}` : ""}</TableCell>
                            <TableCell className="text-right">{actions(a)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}

                <Pager label="Pages of the media library" page={library.page} pages={library.pages} pageSize={library.pageSize} total={library.total} sizes={ASSET_PAGE_SIZES}
                  onPage={(page) => { setQuery((q) => ({ ...q, page })); document.querySelector("main")?.scrollTo(0, 0); }}
                  onSize={(pageSize) => { savePref(SIZE_KEY, pageSize); ask({ pageSize }); }} />

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div role="meter" aria-label="Library space used" aria-valuemin={0} aria-valuemax={library.limitBytes} aria-valuenow={library.usedBytes} className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${library.usedBytes ? Math.max(2, full) : 0}%` }} />
                  </div>
                  <span>{fileSize(library.usedBytes)} of {fileSize(library.limitBytes)} used</span>
                </div>
              </>
            )}
          </div>
        </main>
      </Shell>

      {editing && <Edit asset={editing} onClose={() => setEditing(null)} onSave={save} />}
      <Dialog open={!!deleting} onOpenChange={(v) => { if (!v) setDeleting(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>It leaves this brand’s library for good.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="cancel" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleting && void remove(deleting)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A video is only its address: a small form in a pop-up. */
function AddVideo({ brand, onAdded }: { brand: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setProblem("");
    const form = new FormData();
    form.set("link", link.trim()); form.set("name", name.trim()); form.set("tags", splitTags(tags).join(","));
    try { await api.addAsset(brand, form); setOpen(false); setLink(""); setName(""); setTags(""); toast.success("Added"); onAdded(); }
    catch (err) { setProblem(message(err)); }
    finally { setBusy(false); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="outline" size="sm"><Link2 /> Add video link</Button></PopoverTrigger>
      <PopoverContent align="end" aria-label="Add a video link" className="w-80">
        <form onSubmit={add} className="space-y-3">
          <div className="space-y-1"><Label htmlFor="video-link">Web address</Label><Input id="video-link" type="url" required placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="video-name">Name</Label><Input id="video-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="video-tags">Tags (optional)</Label><Input id="video-tags" placeholder="events, launch" value={tags} onChange={(e) => setTags(e.target.value)} /></div>
          {problem && <p role="alert" className="text-xs text-destructive">{problem}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="cancel" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" variant="brand" disabled={busy}>Add</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function Edit({ asset, onClose, onSave }: { asset: Asset; onClose: () => void; onSave: (a: Asset, name: string, tags: string[]) => Promise<void> }) {
  const [name, setName] = useState(asset.name);
  const [tags, setTags] = useState(asset.tags.join(", "));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setProblem("");
    try { await onSave(asset, name, splitTags(tags)); onClose(); }
    catch (err) { setProblem(message(err)); setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>Name and tags</DialogTitle>
            <DialogDescription className="sr-only">Change what this entry is called and how it is tagged.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-5 py-4">
            <div className="space-y-1"><Label htmlFor="asset-name">Name</Label><Input id="asset-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="asset-tags">Tags, separated by commas</Label><Input id="asset-tags" value={tags} onChange={(e) => setTags(e.target.value)} /></div>
            {problem && <p role="alert" className="text-xs text-destructive">{problem}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="cancel" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="brand" disabled={busy}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
