import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Search } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pager } from "@/components/ui/pager";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Thumb } from "./Thumb";
import { api } from "@/lib/api";
import { fileSize, type Asset, type AssetKind, type Assets } from "@/lib/assets";
import { mediaHref } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Choose from a brand's library: pictures, or pictures and PDFs. `max` above 1 lets several be marked. */
export function AssetPicker({ brand, open, onOpenChange, kinds = ["image"], max = 1, onPick }: {
  brand: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kinds?: ("image" | "pdf")[];
  max?: number;
  onPick: (assets: Asset[]) => void;
}) {
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState({ text: "", kind: kinds[0] as AssetKind, tag: "", page: 1, pageSize: 12 });
  const [library, setLibrary] = useState<Assets | null>(null);
  const [error, setError] = useState("");
  const [marked, setMarked] = useState<Asset[]>([]);
  const run = useRef(0);

  // each opening starts afresh
  useEffect(() => { if (open) { setTyped(""); setMarked([]); setLibrary(null); setQuery((q) => ({ ...q, text: "", kind: kinds[0], page: 1 })); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const load = useCallback(() => {
    if (!open) return;
    const mine = ++run.current;
    setError("");
    api.assets(brand, query).then((l) => { if (mine === run.current) setLibrary(l); }, (e) => { if (mine === run.current) setError(e instanceof Error ? e.message : "Could not load the library"); });
  }, [brand, query, open]);
  useEffect(load, [load]);
  useEffect(() => {
    const t = window.setTimeout(() => setQuery((q) => (q.text === typed ? q : { ...q, text: typed, page: 1 })), 300);
    return () => window.clearTimeout(t);
  }, [typed]);

  const toggle = (a: Asset) => setMarked((m) => {
    if (m.some((x) => x.id === a.id)) return m.filter((x) => x.id !== a.id);
    // one choice replaces another; a PDF goes alone
    if (max === 1 || a.kind === "pdf" || m[0]?.kind === "pdf") return [a];
    return m.length < max ? [...m, a] : m;
  });
  const use = () => { onPick(marked); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[80dvh] max-w-3xl">
        <DialogHeader>
          <DialogTitle>From the library</DialogTitle>
          <DialogDescription>{max > 1 ? `Choose up to ${max}.` : "Choose one."} <a className="text-brand hover:underline" href={mediaHref()} target="_blank" rel="noreferrer">Open Media</a></DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
          <div className="relative min-w-[180px] flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search" aria-label="Search the library" className="pl-8" />
          </div>
          {kinds.length > 1 && (
            <ToggleGroup type="single" aria-label="Type" className="rounded-lg border border-border bg-card p-0.5" value={query.kind} onValueChange={(v) => { if (v) setQuery((q) => ({ ...q, kind: v as AssetKind, page: 1 })); }}>
              <ToggleGroupItem value="image">Images</ToggleGroupItem>
              <ToggleGroupItem value="pdf">PDFs</ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {error && <Alert variant="destructive"><CircleAlert aria-hidden /><AlertDescription>{error}</AlertDescription><Button size="sm" variant="outline" onClick={load}>Try again</Button></Alert>}
          {!library && !error && <div role="status" aria-label="Loading" className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((n) => <Skeleton key={n} className="h-32" />)}</div>}
          {library && library.items.length === 0 && <p className="text-sm text-muted-foreground">{query.text ? "Nothing matches." : query.kind === "pdf" ? "No PDFs in the library yet." : "No pictures in the library yet."}</p>}
          {library && library.items.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {library.items.map((a) => {
                const on = marked.some((x) => x.id === a.id);
                return (
                  <li key={a.id}>
                    <button type="button" aria-pressed={on} onClick={() => toggle(a)} onDoubleClick={() => { if (max === 1) { onPick([a]); onOpenChange(false); } }}
                      className={cn("relative block w-full cursor-pointer overflow-hidden rounded-lg border bg-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-brand ring-2 ring-brand" : "border-border hover:border-brand/50")}>
                      <Thumb asset={a} className="aspect-4/3 w-full" />
                      {on && <span aria-hidden className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-brand text-on-brand"><Check className="h-3 w-3" /></span>}
                      <span className="block truncate px-2 pt-1.5 text-[13px] font-medium">{a.name}</span>
                      <span className="block truncate px-2 pb-1.5 text-[11px] text-muted-foreground">{a.width ? `${a.width} × ${a.height} · ` : ""}{fileSize(a.size ?? 0)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {library && library.pages > 1 && <div className="px-5 pb-2"><Pager label="Pages of the library" page={library.page} pages={library.pages} pageSize={library.pageSize} total={library.total} sizes={[12, 24, 48]} onPage={(page) => setQuery((q) => ({ ...q, page }))} onSize={(pageSize) => setQuery((q) => ({ ...q, pageSize, page: 1 }))} /></div>}
        <DialogFooter>
          <span className="mr-auto text-xs text-muted-foreground" aria-live="polite">{marked.length ? `${marked.length} chosen` : ""}</span>
          <Button size="sm" variant="cancel" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" variant="brand" disabled={!marked.length} onClick={use}>Use</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
