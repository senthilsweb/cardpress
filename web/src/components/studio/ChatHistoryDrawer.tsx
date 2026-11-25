import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type BrandNote } from "@/lib/api";
import type { Conversation } from "@/lib/chat";
import type { Draft } from "@/lib/draft";
import { draftName } from "@/lib/draftSearch";
import { costText, groupByAge } from "@/lib/history";
import { cn } from "@/lib/utils";

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/** Earlier conversations (find one and carry on) and the notes the assistant keeps about the brand. */
export function ChatHistoryDrawer({ open, onClose, profileId, recent, currentId, drafts, onOpen, onNew, busy }: {
  open: boolean; onClose: () => void; profileId: string;
  /** The brand's conversations as the chat knows them, newest first: shown until something is searched for. */
  recent: Conversation[];
  currentId?: string; drafts: Draft[];
  onOpen: (id: string) => void; onNew: () => void;
  /** A reply is being written, so the conversation cannot be switched. */
  busy: boolean;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Conversation[] | null>(null);
  const [notes, setNotes] = useState<BrandNote[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!open || !q) { setFound(null); return; }
    let live = true;
    const t = window.setTimeout(() => {
      api.listConversations(profileId, q).then((r) => { if (live) { setFound(r.conversations); setError(null); } }).catch((e) => { if (live) setError(message(e)); });
    }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [open, query, profileId, recent]);

  const loadNotes = useCallback(() => { api.listNotes(profileId).then(setNotes).catch((e) => setError(message(e))); }, [profileId]);
  useEffect(() => { if (open) { loadNotes(); setConfirm(null); setError(null); } }, [open, loadNotes]);

  const remove = async (key: string) => {
    if (confirm !== key) { setConfirm(key); window.setTimeout(() => setConfirm((c) => (c === key ? null : c)), 3000); return; }
    setConfirm(null);
    try { await api.deleteNote(profileId, key); loadNotes(); } catch (e) { setError(message(e)); }
  };

  const list = found ?? recent;
  const about = (c: Conversation) => [c.postDraftId, c.articleDraftId].map((id) => drafts.find((d) => d.id === id)).filter((d): d is Draft => !!d);

  return (
    <Drawer open={open} onClose={onClose} title="Conversations" resizeKey="chats">
      <Tabs defaultValue="chats" className="p-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="chats">History</TabsTrigger>
          <TabsTrigger value="notes">Notes{notes?.length ? ` (${notes.length})` : ""}</TabsTrigger>
        </TabsList>
        {error && <p role="alert" className="pt-2 text-xs text-destructive">{error}</p>}
        <TabsContent value="chats" className="space-y-3">
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100} placeholder="Search conversations" aria-label="Search conversations" className="h-9 pl-8" />
            </div>
            <Button variant="brand" size="sm" onClick={onNew} disabled={busy}><Plus /> New</Button>
          </div>
          {list.length === 0 && <p className="text-sm text-muted-foreground">{query.trim() ? "Nothing matches." : "No conversations yet."}</p>}
          {groupByAge(list).map((g) => (
            <section key={g.name} aria-label={g.name} className="space-y-1">
              <h3 className="eyebrow">{g.name}</h3>
              <ul className="space-y-1">
                {g.items.map((c) => (
                  <li key={c.id}>
                    <button type="button" disabled={busy} onClick={() => onOpen(c.id)} aria-current={c.id === currentId}
                      className={cn("w-full cursor-pointer rounded-md border border-border bg-card px-2.5 py-2 text-left text-xs hover:bg-accent disabled:cursor-default disabled:opacity-60", c.id === currentId && "border-brand")}>
                      <span className="block truncate font-medium">{c.title}</span>
                      {about(c).map((d) => <span key={d.id} className="block truncate text-[11px] text-muted-foreground">{d.kind === "article" ? "Article" : "Post"}: {draftName(d)}</span>)}
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {new Date(c.updatedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                        {c.sourceKind === "mcp" && ` · Outside agent: ${c.sourceTitle ?? "unknown"}`}
                        {c.costCents !== undefined && ` · ${costText(c.costCents)}`}
                        {c.pending > 0 && <b className="ml-1 text-brand">· {c.pending} waiting</b>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </TabsContent>
        <TabsContent value="notes" className="space-y-2">
          <p className="text-xs text-muted-foreground">What the assistant remembers about this brand.</p>
          {!notes ? <p className="text-sm text-muted-foreground">Loading…</p> : notes.length === 0 ? <p className="text-sm text-muted-foreground">No notes yet.</p> : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {notes.map((n) => (
                <li key={n.key} className="flex items-start gap-2 p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] text-muted-foreground">{n.key}</p>
                    <p className="whitespace-pre-wrap break-words text-xs">{n.content}</p>
                  </div>
                  <Button variant={confirm === n.key ? "destructive" : "ghost"} size={confirm === n.key ? "sm" : "icon-sm"} aria-label={`Remove the note ${n.key}`} onClick={() => void remove(n.key)}>
                    {confirm === n.key ? "Confirm" : <Trash2 />}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </Drawer>
  );
}
