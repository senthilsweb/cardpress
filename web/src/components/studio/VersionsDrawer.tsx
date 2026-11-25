import { useCallback, useEffect, useState } from "react";
import { History, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { api, type DraftVersion } from "@/lib/api";
import type { Draft } from "@/lib/draft";
import { lockReason } from "@/lib/lock";
import { formatInZone } from "@/lib/jobs";
import { DocView } from "./DocView";

const LABEL: Record<DraftVersion["label"], string> = { created: "Created", auto: "Auto-saved", manual: "Saved", approved: "Approved", sent: "Sent", restored: "Restored", assistant: "Assistant" };
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/**
 * An item's versions: each change the assistant saves, and what it said at the moments that mattered (created, approved,
 * sent, saved by hand, and after a stretch of editing). Open one to read it and make it current, which saves it as a new
 * version, so nothing is lost.
 */
export function VersionsDrawer({ open, onClose, draft, onRestore, statusKey }: {
  open: boolean; onClose: () => void; draft?: Draft;
  /** Put a version back. The editor reloads the text. */
  onRestore: (seq: number) => Promise<void>;
  /** Changes when the item's status changes, so the list is read again (an approval adds a version). */
  statusKey: string;
}) {
  const [list, setList] = useState<DraftVersion[] | null>(null);
  const [shown, setShown] = useState<DraftVersion | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = draft?.id;

  const load = useCallback(async () => {
    if (!id) return;
    try { setList(await api.versions(id)); setError(null); } catch (e) { setError(message(e)); }
  }, [id]);
  useEffect(() => { if (open) { setShown(null); setConfirm(false); void load(); } }, [open, load, statusKey]);
  useEffect(() => { if (!confirm) return; const t = window.setTimeout(() => setConfirm(false), 4000); return () => window.clearTimeout(t); }, [confirm]);

  if (!draft) return null;
  const view = async (v: DraftVersion) => {
    setBusy(`v${v.seq}`); setConfirm(false);
    try { setShown(await api.version(draft.id, v.seq)); } catch (e) { setError(message(e)); } finally { setBusy(null); }
  };
  const save = async () => {
    setBusy("save");
    try { await api.saveVersion(draft.id, note); setNote(""); toast.success("Version saved"); await load(); } catch (e) { setError(message(e)); } finally { setBusy(null); }
  };
  const restore = async () => {
    if (!shown) return;
    if (!confirm) return setConfirm(true);
    setBusy("restore");
    try { await onRestore(shown.seq); toast.success(`Version ${shown.seq} is current again, saved as a new version`); setShown(null); setConfirm(false); await load(); } catch (e) { setError(message(e)); } finally { setBusy(null); }
  };

  return (
    <Drawer open={open} onClose={onClose} title="Versions" resizeKey="history">
      <div className="space-y-4 p-4">
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={120} aria-label="Note for the version" className="h-9" />
          <Button type="submit" size="sm" variant="outline" disabled={busy === "save"}>{busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save a version</Button>
        </form>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        {!list ? <p className="text-sm text-muted-foreground">Loading…</p> : list.length === 0 ? <p className="text-sm text-muted-foreground">No versions yet.</p> : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {list.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => void view(v)} aria-current={shown?.seq === v.seq} className={`flex w-full flex-col gap-0.5 p-3 text-left hover:bg-muted ${shown?.seq === v.seq ? "bg-muted" : ""}`}>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-mono text-[11px] font-semibold">v{v.seq}</span>
                    <Badge variant={v.label === "approved" || v.label === "sent" ? "brand" : "outline"}>{LABEL[v.label]}</Badge>
                    {v.seq === draft.version && v.revision === draft.revision && <Badge variant="brand">Current</Badge>}
                    <span className="text-muted-foreground">{formatInZone(v.createdAt)}</span>
                    {v.createdByName && <span className="text-muted-foreground">· {v.createdByName}</span>}
                    {busy === `v${v.seq}` && <Loader2 className="h-3 w-3 animate-spin" />}
                  </span>
                  {v.note && <span className="text-xs font-medium">{v.note}</span>}
                  <span className="line-clamp-2 text-xs text-muted-foreground">{v.preview || "Empty"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {shown?.doc && (
          <div className="space-y-3 rounded-md border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <p className="flex items-center gap-1.5 text-xs font-medium"><History className="h-3.5 w-3.5" /> Version {shown.seq}</p>
              <span className="flex-1" />
              {lockReason(draft)
                ? <span className="text-[11px] text-muted-foreground">{lockReason(draft)}</span>
                : <Button size="sm" variant={confirm ? "brand" : "outline"} disabled={busy === "restore"} onClick={() => void restore()}>{busy === "restore" ? <Loader2 className="animate-spin" /> : <RotateCcw />} {confirm ? "Confirm: make current" : "Make current"}</Button>}
            </div>
            {shown.title && <p className="text-sm font-semibold">{shown.title}</p>}
            <div className="max-h-[50vh] overflow-y-auto"><DocView doc={shown.doc} kind={shown.kind === "article" ? "article" : "post"} /></div>
            {shown.hashtags && shown.hashtags.length > 0 && <p className="text-xs text-brand">{shown.hashtags.map((h) => `#${h}`).join(" ")}</p>}
            {confirm && <p className="text-xs text-muted-foreground">An approved item goes back to draft. What it says now is kept too.</p>}
          </div>
        )}
      </div>
    </Drawer>
  );
}
