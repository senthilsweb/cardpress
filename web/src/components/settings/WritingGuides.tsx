import { useCallback, useEffect, useState } from "react";
import { ChevronRight, CircleAlert, History } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Pane } from "@/components/ui/pane";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { GUIDE_LABELS, guideLength, guideProblem, tidyGuide, type Guide, type GuidesView, type GuideVersion } from "@/lib/guides";
import { formatInZone } from "@/lib/jobs";
import { cn } from "@/lib/utils";
import { attempt, FormSection, reason, SaveBar } from "./form";
import { useUnsaved } from "./guard";
import { MarkdownPreview } from "./MarkdownPreview";

/** The open brand's writing guides: Markdown that replaces our house style, one for each kind, with a preview and history. */
export function WritingGuides({ profileId, brandName }: { profileId: string; brandName: string }) {
  const [data, setData] = useState<GuidesView | null>(null);
  const [kind, setKind] = useState<Guide["kind"]>("post");
  // what is typed and not yet saved, by kind, so that looking at another loses nothing
  const [edits, setEdits] = useState<Partial<Record<Guide["kind"], string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GuideVersion[] | null>(null);
  const [seen, setSeen] = useState<number | null>(null);

  const load = useCallback(() => api.guides(profileId).then(setData).catch((e) => setError(reason(e))), [profileId]);
  useEffect(() => { void load(); }, [load]);
  const changed = (g: Guide) => edits[g.kind] !== undefined && tidyGuide(edits[g.kind]!) !== g.body;
  useUnsaved(!!data?.guides.some(changed));

  const guide = data?.guides.find((g) => g.kind === kind);
  if (!data || !guide) {
    return <Pane>{error ? <Alert variant="destructive"><CircleAlert aria-hidden /><AlertDescription>{error}</AlertDescription></Alert> : <p className="text-sm text-muted-foreground">Loading…</p>}</Pane>;
  }
  const text = edits[kind] ?? guide.body;
  const dirty = changed(guide);
  const problem = dirty ? guideProblem(text, data.maxChars) : null;
  const type = (v: string | undefined) => { setError(null); setEdits((e) => ({ ...e, [kind]: v })); };
  const change = async (work: () => Promise<GuidesView>, done: string, failed: string) => {
    setBusy(true);
    const why = await attempt(async () => { setData(await work()); setEdits((e) => ({ ...e, [kind]: undefined })); }, done, failed);
    setError(why ?? null); setBusy(false);
  };
  const openHistory = () => api.guideVersions(profileId, kind).then((v) => { setHistory(v); setSeen(v[0]?.version ?? null); }).catch((e) => setError(reason(e)));
  const shown = history?.find((v) => v.version === seen);

  return (
    <Pane footer={
      <SaveBar dirty={dirty} busy={busy} problem={problem ?? error}
        onSave={() => { if (!problem) void change(() => api.saveGuide(profileId, kind, text), "Guide saved", "Guide not saved"); }}
        onCancel={() => type(undefined)}
        extra={guide.body && !dirty ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void change(() => api.saveGuide(profileId, kind, ""), "Our style is used again", "Not changed")}>Use our style</Button> : undefined} />
    }>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">For <span className="font-medium text-foreground">{brandName}</span>.</p>
        <Tabs value={kind} onValueChange={(v) => { setError(null); setKind(v as Guide["kind"]); }}>
          <TabsList aria-label="Kind of writing">
            {data.guides.map((g) => <TabsTrigger key={g.kind} value={g.kind}>{GUIDE_LABELS[g.kind]}{changed(g) && <span aria-label="unsaved">•</span>}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          {guide.body ? <Badge>Your guide</Badge> : <Badge variant="outline">Our style</Badge>}
          {guide.updatedAt && <span className="text-xs text-muted-foreground">Saved {formatInZone(guide.updatedAt)}{guide.updatedBy ? ` by ${guide.updatedBy}` : ""}</span>}
          <span className="mr-auto" />
          {guide.ours && !tidyGuide(text) && <Button type="button" size="sm" variant="gold" onClick={() => type(guide.ours)}>Start from ours</Button>}
          {guide.version > 0 && <Button type="button" size="sm" variant="outline" onClick={() => void openHistory()}><History /> History</Button>}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="guide-text">Your guide (Markdown)</Label>
            <Textarea id="guide-text" className="h-80 resize-y font-mono text-xs" spellCheck value={text} onChange={(e) => type(e.target.value)}
              placeholder={"## Audience\n…\n\n## Voice\n…"} />
            <p className={cn("text-right text-xs", guideLength(text) > data.maxChars ? "text-destructive" : "text-muted-foreground")}>{guideLength(text)} / {data.maxChars}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Preview</p>
            <div role="region" aria-label="Preview" className="h-80 overflow-y-auto rounded-md border border-border bg-card px-3 py-2">
              {tidyGuide(text) ? <MarkdownPreview text={text} /> : <p className="text-sm text-muted-foreground">Empty: our house style is used.</p>}
            </div>
          </div>
        </div>
        {data.checked && <p className="text-xs text-muted-foreground">A saved guide is checked: it may only say how to write.</p>}
        {(guide.ours || guide.fixed) && (
          <FormSection title="Ours">
            {guide.ours && <Peek label="Our house style, which your guide replaces" text={guide.ours} />}
            {guide.fixed && <Peek label="Rules that always apply" text={guide.fixed} />}
          </FormSection>
        )}
      </div>

      <Dialog open={!!history} onOpenChange={(open) => { if (!open) setHistory(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>History: {GUIDE_LABELS[kind]}</DialogTitle>
            <DialogDescription>Restoring makes a version the newest one.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {history?.map((v) => (
                <li key={v.version}>
                  <Button type="button" variant={v.version === seen ? "secondary" : "ghost"} className="h-auto w-full flex-col items-start gap-0 py-1" aria-pressed={v.version === seen} onClick={() => setSeen(v.version)}>
                    <span className="text-sm">Version {v.version}{v.body ? "" : " · our style"}</span>
                    <span className="text-xs font-normal text-muted-foreground">{formatInZone(v.createdAt)}</span>
                  </Button>
                </li>
              ))}
            </ul>
            <div className="max-h-72 overflow-y-auto rounded-md border border-border px-3 py-2">
              {shown?.body ? <MarkdownPreview text={shown.body} /> : <p className="text-sm text-muted-foreground">Our house style.</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="cancel" onClick={() => setHistory(null)}>Close</Button>
            <Button type="button" size="sm" variant="brand" disabled={busy || !shown || shown.version === guide.version}
              onClick={() => { const v = shown!.version; setHistory(null); void change(() => api.restoreGuide(profileId, kind, v), `Version ${v} restored`, "Not restored"); }}>Restore</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Pane>
  );
}

/** Something of ours to read, folded away. */
function Peek({ label, text }: { label: string; text: string }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex cursor-pointer items-center gap-1 text-sm font-medium"><ChevronRight aria-hidden className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" /> {label}</CollapsibleTrigger>
      <CollapsibleContent><MarkdownPreview text={text} className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border bg-muted/40 px-3 py-2" /></CollapsibleContent>
    </Collapsible>
  );
}
