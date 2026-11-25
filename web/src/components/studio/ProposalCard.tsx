import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Loader2, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { parseHashtagList, type Proposal, type ProposalEdit } from "@/lib/chat";
import type { DraftKind } from "@/lib/draft";

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/**
 * Content the agent suggests. It goes nowhere until the person presses Approve; they can edit it first, reject it, or
 * ask for another version in the chat. Approving copies it into a draft: it never publishes or schedules anything.
 */
export function ProposalCard({ p, onApprove, onReject, onOpenPost }: {
  p: Proposal;
  /** Apply the content to a draft and record the decision. */
  onApprove: (content: ProposalEdit, opts: { useTitle: boolean; edited: boolean }) => Promise<void>;
  onReject: () => Promise<void>;
  onOpenPost: () => void;
}) {
  const open = p.status === "pending" || p.status === "superseded";
  const [expanded, setExpanded] = useState(p.status === "pending");
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<DraftKind>(p.kind);
  const [title, setTitle] = useState(p.title);
  const [body, setBody] = useState(p.body);
  const [tags, setTags] = useState(p.hashtags.join(" "));
  const [alt, setAlt] = useState(p.altText);
  const [useTitle, setUseTitle] = useState(true);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const content = (): ProposalEdit => ({ kind, title: title.trim(), body, hashtags: kind === "post" ? parseHashtagList(tags) : [], altText: alt.trim() });
  const changed = () => {
    const c = content();
    return c.kind !== p.kind || c.title !== p.title || c.body.trim() !== p.body.trim() || c.altText !== p.altText || c.hashtags.join(" ") !== p.hashtags.join(" ");
  };
  const run = async (which: "approve" | "reject", fn: () => Promise<void>) => {
    setBusy(which); setError(null);
    try { await fn(); } catch (e) { setError(message(e)); } finally { setBusy(null); }
  };

  const label = p.status === "approved" ? <Badge variant="brand">Approved</Badge>
    : p.status === "rejected" ? <Badge variant="outline">Rejected</Badge>
    : p.status === "superseded" ? <Badge variant="outline">Earlier draft</Badge>
    : <Badge variant="warn">Needs your approval</Badge>;
  const shownKind = editing ? kind : p.kind;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3" aria-label="Proposed content">
      <div className="flex flex-wrap items-center gap-1.5">
        {label}
        <Badge variant="outline">{shownKind === "article" ? "Article" : "Post"}</Badge>
        {p.edited && <Badge variant="outline">Edited</Badge>}
        <span className="flex-1" />
        {!open ? null : (
          <button type="button" className="flex cursor-pointer items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} {expanded ? "Hide" : "Show"}
          </button>
        )}
      </div>

      {(expanded || !open) && (
        <>
          {editing ? (
            <div className="space-y-2">
              <ToggleGroup type="single" value={kind} onValueChange={(v) => { if (v) setKind(v as DraftKind); }}>
                <ToggleGroupItem value="post">Post</ToggleGroupItem>
                <ToggleGroupItem value="article">Article</ToggleGroupItem>
              </ToggleGroup>
              <div className="space-y-1"><Label htmlFor={`t-${p.id}`}>Card title</Label><Input id={`t-${p.id}`} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor={`b-${p.id}`}>Text</Label><Textarea id={`b-${p.id}`} rows={10} value={body} onChange={(e) => setBody(e.target.value)} /></div>
              {kind === "post" && <div className="space-y-1"><Label htmlFor={`h-${p.id}`}>Hashtags</Label><Input id={`h-${p.id}`} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Go Data OpenSource" /></div>}
              <div className="space-y-1"><Label htmlFor={`a-${p.id}`}>Image alt text</Label><Input id={`a-${p.id}`} value={alt} onChange={(e) => setAlt(e.target.value)} /></div>
            </div>
          ) : (
            <div className="space-y-2">
              {p.title && <p className="text-sm font-semibold leading-snug">{p.title}</p>}
              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-background p-2.5 text-[13px] leading-relaxed">{p.body}</div>
              {p.hashtags.length > 0 && <p className="text-xs text-brand">{p.hashtags.map((h) => `#${h}`).join(" ")}</p>}
              {p.altText && <p className="text-[11px] text-muted-foreground">Alt text: {p.altText}</p>}
              {p.rationale && (
                <details className="text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer">Why this draft</summary>
                  <p className="mt-1 leading-snug">{p.rationale}</p>
                </details>
              )}
            </div>
          )}

          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

          {open && (
            <div className="space-y-2">
              {(editing ? title.trim() : p.title) && (
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input type="checkbox" checked={useTitle} onChange={(e) => setUseTitle(e.target.checked)} className="accent-[var(--brand)]" />
                  Also use the title as the card's title
                </label>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="brand" disabled={busy !== null || (editing && !body.trim())}
                  onClick={() => void run("approve", () => onApprove(editing ? content() : { kind: p.kind, title: p.title, body: p.body, hashtags: p.hashtags, altText: p.altText }, { useTitle, edited: editing && changed() }))}>
                  {busy === "approve" ? <Loader2 className="animate-spin" /> : <Check />} Approve and use
                </Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setEditing((e) => !e)}><Pencil /> {editing ? "Done editing" : "Edit"}</Button>
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void run("reject", onReject)}>{busy === "reject" ? <Loader2 className="animate-spin" /> : <X />} Reject</Button>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">Creates a draft. Nothing is published.</p>
            </div>
          )}

          {p.status === "approved" && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Copied into a draft.</span>
              <Button size="sm" variant="outline" onClick={onOpenPost}>Show the {p.kind === "article" ? "article" : "post"}</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
