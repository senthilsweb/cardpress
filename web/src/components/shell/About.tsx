import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogoMark } from "@/components/studio/Logo";
import { aboutParts, aboutText } from "@/lib/about";
import { api, type ApiInfo } from "@/lib/api";
import { DOCS_URL, helpHref } from "@/lib/nav";

const SOURCE = "https://github.com/senthilsweb/cardpress";

/** Which CardPress and which assistant this is: a small card, with a button to copy it into a problem report. */
export function About({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [info, setInfo] = useState<ApiInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // closing goes back to what opened it: it has no Dialog trigger of its own
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null); setCopied(false);
    api.info().then(setInfo).catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }, [open]);
  const parts = info ? aboutParts(info) : [];
  const copy = async () => { try { await navigator.clipboard.writeText(aboutText(parts)); setCopied(true); } catch { setError("Could not copy"); } };
  const link = "flex items-center gap-1.5 text-brand hover:underline [&_svg]:h-3.5 [&_svg]:w-3.5";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={() => { opener.current = document.activeElement as HTMLElement | null; }}
        onCloseAutoFocus={(e) => { if (opener.current?.isConnected) { e.preventDefault(); opener.current.focus(); } }}
        className="max-w-md"
      >
        <DialogHeader className="flex items-center gap-3">
          <LogoMark size={32} />
          <div>
            <DialogTitle>About CardPress</DialogTitle>
            <DialogDescription className="mt-0.5">Social cards, posts and articles. Open source, self-hosted.</DialogDescription>
          </div>
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto p-5">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {!info && !error && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
          {parts.map((p) => (
            <section key={p.title} aria-label={p.title} className="rounded-lg border border-border bg-card p-3">
              <h3 className="eyebrow mb-1.5">{p.title}</h3>
              <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
                {p.lines.map(([n, v]) => (
                  <div key={n} className="contents"><dt className="text-muted-foreground">{n}</dt><dd className="min-w-0 break-words">{v}</dd></div>
                ))}
              </dl>
            </section>
          ))}
          <nav aria-label="Links" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <a href={helpHref()} className={link}><BookOpen /> User guide</a>
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className={link}>Documentation <ExternalLink /></a>
            <a href={SOURCE} target="_blank" rel="noopener noreferrer" className={link}>Source code <ExternalLink /></a>
            <a href={`${SOURCE}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer" className={link}>MIT licence <ExternalLink /></a>
          </nav>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => void copy()} disabled={!info}>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}</Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
