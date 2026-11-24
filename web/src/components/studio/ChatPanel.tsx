import { useEffect, useRef, useState } from "react";
import { Info, Link2, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Conversation, Proposal, ProposalEdit } from "@/lib/chat";
import type { ChatStore } from "@/lib/useChat";
import { ProposalCard } from "./ProposalCard";

const host = (u?: string) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : ""; } catch { return ""; } };

function AgentBadge({ chat, conv }: { chat: ChatStore; conv?: Conversation }) {
  if (conv?.sourceKind === "mcp") return <Badge variant="warn" title="This was proposed by a program that connected through MCP. Its name is what it called itself and is not verified.">Outside agent</Badge>;
  if (!chat.agent) return null;
  return chat.agent.ai
    ? <Badge variant="brand">{chat.agent.name}</Badge>
    : <Badge variant="warn" title="Replies come from a simple built-in demo, not an AI model.">{chat.agent.name} · no AI model</Badge>;
}

/** Where a conversation starts: a web address or pasted text, plus older conversations to reopen. */
function StartView({ chat }: { chat: ChatStore }) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const ready = (url.trim() !== "") !== (text.trim() !== ""); // exactly one
  const go = () => { if (ready) void chat.start(url.trim() ? { url: url.trim() } : { text }); };
  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="eyebrow">Prepare content</h3>
        <span className="flex-1" />
        <AgentBadge chat={chat} />
      </div>
      <p className="text-xs leading-snug text-muted-foreground">
        Give the chat an article to work from. It drafts a post or an article for you to approve, then you can ask for changes. Nothing is published or saved until you approve it, and publishing stays your own step.
      </p>
      {chat.agent && !chat.agent.ai && (
        <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] leading-snug">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p>The chat is using a built-in <b>demo agent</b>: it picks sentences from the article by simple rules and understands only a few instructions. It is not an AI model. A real one can be connected (see docs/cma-agent.md).</p>
        </div>
      )}
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <div className="space-y-1">
          <Label htmlFor="chat-url" className="flex items-center gap-1"><Link2 className="h-3 w-3" /> Web address</Label>
          <Input id="chat-url" type="url" inputMode="url" placeholder="https://example.com/article" value={url} onChange={(e) => setUrl(e.target.value)} disabled={chat.busy || text.trim() !== ""} autoComplete="off" />
        </div>
        <p className="text-center text-[11px] text-muted-foreground">or</p>
        <div className="space-y-1">
          <Label htmlFor="chat-text">Paste the text</Label>
          <Textarea id="chat-text" rows={7} placeholder="Paste the article or your notes here…" value={text} onChange={(e) => setText(e.target.value)} disabled={chat.busy || url.trim() !== ""} />
        </div>
        {chat.error && <p role="alert" className="text-xs text-destructive">{chat.error}</p>}
        <Button type="submit" variant="brand" size="sm" disabled={!ready || chat.busy}>{chat.busy ? <Loader2 className="animate-spin" /> : <Send />} Draft from this</Button>
      </form>

      {chat.list.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <h3 className="eyebrow">Earlier conversations</h3>
          <ul className="space-y-1">
            {chat.list.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => void chat.open(c.id)} className="w-full cursor-pointer rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-xs hover:bg-accent">
                  <span className="block truncate font-medium">{c.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {c.sourceKind === "url" ? host(c.sourceUrl) : c.sourceKind === "mcp" ? `Outside agent: ${c.sourceTitle ?? "unknown"}` : "Pasted text"} · {new Date(c.updatedAt).toLocaleDateString()}
                    {c.pending > 0 && <b className="ml-1 text-brand">· {c.pending} waiting</b>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  return (
    <div className={role === "user" ? "flex justify-end" : "flex justify-start"}>
      <div className={role === "user"
        ? "max-w-[88%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-primary px-3 py-2 text-[13px] leading-snug text-primary-foreground"
        : "max-w-[92%] whitespace-pre-wrap rounded-lg rounded-bl-sm border border-border bg-card px-3 py-2 text-[13px] leading-snug"}>
        {children}
      </div>
    </div>
  );
}

function Thread({ conv, chat, onApply, onOpenPost }: {
  conv: Conversation; chat: ChatStore;
  onApply: (content: ProposalEdit, opts: { useTitle: boolean }) => Promise<string>;
  onOpenPost: () => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  const messages = conv.messages ?? [];
  const proposals = conv.proposals ?? [];
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length, proposals.length, chat.streaming]);

  const approve = (p: Proposal) => async (content: ProposalEdit, opts: { useTitle: boolean; edited: boolean }) => {
    const draftId = await onApply(content, { useTitle: opts.useTitle });
    try {
      await chat.decide(p, { status: "approved", draftId, edited: opts.edited ? content : undefined });
    } catch (e) {
      throw new Error(`Copied into a draft, but the decision could not be recorded: ${e instanceof Error ? e.message : "try again"}`);
    }
  };
  const placed = new Set<string>();
  const cards = (messageId: string) => proposals.filter((p) => p.messageId === messageId).map((p) => {
    placed.add(p.id);
    return <ProposalCard key={p.id} p={p} onApprove={approve(p)} onReject={() => chat.decide(p, { status: "rejected" })} onOpenPost={onOpenPost} />;
  });

  return (
    <div className="space-y-3 px-3 py-3">
      {messages.map((m) => (
        <div key={m.id} className="space-y-2">
          <Bubble role={m.role}>{m.content}</Bubble>
          {m.role === "assistant" && cards(m.id)}
        </div>
      ))}
      {/* a proposal that arrives just before its reply is stored */}
      {proposals.filter((p) => !placed.has(p.id)).map((p) => (
        <ProposalCard key={p.id} p={p} onApprove={approve(p)} onReject={() => chat.decide(p, { status: "rejected" })} onOpenPost={onOpenPost} />
      ))}
      {chat.streaming !== null && (
        <Bubble role="assistant">{chat.streaming || <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing…</span>}</Bubble>
      )}
      <div ref={end} />
    </div>
  );
}

/**
 * The chat that prepares content. It proposes; the person decides. Approving a proposal hands its content to `onApply`,
 * which copies it into a draft and returns the draft's id. The chat itself cannot publish or schedule anything.
 */
export function ChatPanel({ chat, onApply, onOpenPost }: {
  chat: ChatStore;
  onApply: (content: ProposalEdit, opts: { useTitle: boolean }) => Promise<string>;
  onOpenPost: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const conv = chat.current;

  if (!chat.loaded) return <p className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
  if (!conv) return <StartView chat={chat} />;

  const send = () => {
    const text = draft.trim();
    if (!text || chat.busy) return;
    setDraft("");
    void chat.send(conv.id, text);
  };
  const demo = !conv.agent.ai;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-1.5 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <AgentBadge chat={chat} conv={conv} />
          <span className="flex-1" />
          <Button variant="ghost" size="icon-sm" title="Start a new conversation" aria-label="New conversation" onClick={chat.newConversation}><Plus /></Button>
          <Button variant={confirmDelete ? "destructive" : "ghost"} size={confirmDelete ? "sm" : "icon-sm"} title="Delete this conversation" aria-label="Delete this conversation"
            onClick={() => { if (!confirmDelete) { setConfirmDelete(true); window.setTimeout(() => setConfirmDelete(false), 3000); } else { setConfirmDelete(false); void chat.remove(conv.id); } }}>
            {confirmDelete ? "Confirm delete" : <Trash2 />}
          </Button>
        </div>
        <p className="truncate text-xs font-medium" title={conv.title}>{conv.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {conv.sourceKind === "mcp"
            ? `Proposed by “${conv.sourceTitle ?? "an outside agent"}” (a name it gave itself, not verified)`
            : <>{conv.sourceKind === "url" ? <a href={conv.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{host(conv.sourceUrl)}</a> : "Pasted text"} · {conv.sourceChars.toLocaleString()} characters{conv.sourceTruncated ? " (cut short)" : ""}</>}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        <Thread conv={conv} chat={chat} onApply={onApply} onOpenPost={onOpenPost} />
      </div>

      {conv.sourceKind === "mcp" ? (
        <div className="border-t border-border bg-card px-3 py-2.5 text-[11px] leading-snug text-muted-foreground">
          Review the proposal above: approve it, edit it first, or reject it. To change it further, ask the agent that sent it; it can send a revised version here. Nothing is applied until you approve.
        </div>
      ) : (
      <div className="space-y-1.5 border-t border-border bg-card px-3 py-2.5">
        {chat.error && <p role="alert" className="text-xs text-destructive">{chat.error}</p>}
        <div className="flex items-end gap-1.5">
          <Textarea
            rows={2} value={draft} disabled={chat.busy} aria-label="Message"
            placeholder={demo ? "Try: shorter, longer, make it an article…" : "Ask for changes…"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          />
          <Button variant="brand" size="icon" aria-label="Send" disabled={chat.busy || !draft.trim()} onClick={send}>{chat.busy ? <Loader2 className="animate-spin" /> : <Send />}</Button>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {demo ? "The demo understands: shorter · longer · make it an article · make it a post · no hashtags · add #Tag · no question." : "Enter sends, Shift+Enter adds a line."}
        </p>
      </div>
      )}
    </div>
  );
}
