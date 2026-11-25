import { useEffect, useRef, useState } from "react";
import { History, Info, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Conversation, Proposal, ProposalEdit } from "@/lib/chat";
import type { ChatStore } from "@/lib/useChat";
import { ProposalCard } from "./ProposalCard";
import { ChatInput, SourceChip } from "./ChatInput";
import { costText } from "@/lib/history";

const host = (u?: string) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : ""; } catch { return ""; } };

function AgentBadge({ chat, conv }: { chat: ChatStore; conv?: Conversation }) {
  if (conv?.sourceKind === "mcp") return <Badge variant="warn" title="Sent by a program through MCP. Name not verified.">Outside agent</Badge>;
  if (!chat.agent) return null;
  return chat.agent.ai
    ? <Badge variant="brand">{chat.agent.name}</Badge>
    : <Badge variant="warn" title="Built-in demo, not an AI model.">{chat.agent.name} · no AI model</Badge>;
}

/** What shows before a conversation: how to begin. Earlier ones are under History. */
function Welcome({ chat }: { chat: ChatStore }) {
  return (
    <div className="space-y-4 px-4 py-4">
      <h3 className="eyebrow">Prepare content</h3>
      <p className="text-xs leading-snug text-muted-foreground">
        Say what to write about, or attach a file, a link or text. It drafts; you approve.
      </p>
      {chat.agent && !chat.agent.ai && (
        <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] leading-snug">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p><b>Demo agent</b>: simple rules, not an AI model.</p>
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

function Thread({ conv, chat, onApply, onShow }: {
  conv: Conversation; chat: ChatStore;
  onApply: (content: ProposalEdit, opts: { useTitle: boolean }) => Promise<string>;
  onShow: (draftId?: string) => void;
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
    return <ProposalCard key={p.id} p={p} onApprove={approve(p)} onReject={() => chat.decide(p, { status: "rejected" })} onOpenPost={() => onShow(p.draftId)} />;
  });

  return (
    <div className="space-y-3 px-3 py-3">
      {messages.map((m) => (
        <div key={m.id} className="space-y-2">
          <Bubble role={m.role}>{m.content}</Bubble>
          {(conv.sources ?? []).some((x) => x.messageId === m.id) && (
            <div className="flex flex-wrap justify-end gap-1.5" aria-label="Sent with this message">
              {(conv.sources ?? []).filter((x) => x.messageId === m.id).map((x) => <SourceChip key={x.id} source={x} />)}
            </div>
          )}
          {m.role === "assistant" && cards(m.id)}
        </div>
      ))}
      {/* a proposal that arrives just before its reply is stored */}
      {proposals.filter((p) => !placed.has(p.id)).map((p) => (
        <ProposalCard key={p.id} p={p} onApprove={approve(p)} onReject={() => chat.decide(p, { status: "rejected" })} onOpenPost={() => onShow(p.draftId)} />
      ))}
      {chat.streaming !== null && (
        <Bubble role="assistant">{chat.streaming || <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing…</span>}</Bubble>
      )}
      <div ref={end} />
    </div>
  );
}

/**
 * The chat that prepares content, turn by turn. It proposes; the person decides. Approving a proposal hands its content
 * to `onApply`, which copies it into a draft and returns the draft's id. The chat itself cannot publish or schedule anything.
 */
export function ChatPanel({ chat, onApply, onShow, draftId, onHistory }: {
  chat: ChatStore;
  onApply: (content: ProposalEdit, opts: { useTitle: boolean }) => Promise<string>;
  /** Put an item an approved proposal went into on the canvas. */
  onShow: (draftId?: string) => void;
  /** The item on screen. */
  draftId?: string;
  /** Open the list of earlier conversations and the notes. */
  onHistory: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const conv = chat.current;

  if (!chat.loaded) return <p className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
  const demo = !(conv?.agent ?? chat.agent)?.ai;
  const sources = conv?.sources ?? [];
  const waiting = sources.filter((s) => !s.messageId);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-1.5 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <AgentBadge chat={chat} conv={conv ?? undefined} />
          <span className="flex-1" />
          <Button variant="ghost" size="icon-sm" title="Conversations and notes" aria-label="Conversations and notes" onClick={onHistory}><History /></Button>
          <Button variant="ghost" size="icon-sm" title="Start a new conversation about the item on screen" aria-label="New conversation" disabled={chat.busy || !conv} onClick={chat.newConversation}><Plus /></Button>
          {conv && (
            <Button variant={confirmDelete ? "destructive" : "ghost"} size={confirmDelete ? "sm" : "icon-sm"} title="Delete this conversation" aria-label="Delete this conversation" disabled={chat.busy}
              onClick={() => { if (!confirmDelete) { setConfirmDelete(true); window.setTimeout(() => setConfirmDelete(false), 3000); } else { setConfirmDelete(false); void chat.remove(conv.id); } }}>
              {confirmDelete ? "Confirm delete" : <Trash2 />}
            </Button>
          )}
        </div>
        {conv && (
          <>
            <p className="truncate text-xs font-medium" title={conv.title}>{conv.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {conv.sourceKind === "mcp"
                ? `Proposed by “${conv.sourceTitle ?? "an outside agent"}” (a name it gave itself, not verified)`
                : sources.length === 0 ? "No sources" : `${sources.length} ${sources.length === 1 ? "source" : "sources"} · ${conv.sourceChars.toLocaleString()} characters`}
              {conv.costCents !== undefined && ` · ${costText(conv.costCents)}`}
            </p>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        {conv ? <Thread conv={conv} chat={chat} onApply={onApply} onShow={onShow} /> : <Welcome chat={chat} />}
      </div>

      {chat.error && <p role="alert" className="border-t border-border px-3 py-1.5 text-xs text-destructive">{chat.error}</p>}
      {conv?.sourceKind === "mcp" ? (
        <div className="border-t border-border bg-card px-3 py-2.5 text-[11px] leading-snug text-muted-foreground">
          Approve, edit or reject. To change it, ask the agent that sent it.
        </div>
      ) : (
        <ChatInput
          placeholder={!conv ? "Message the assistant" : demo ? "Try: shorter, longer, make it an article…" : "Ask for changes…"}
          replying={chat.streaming !== null} busy={chat.busy && chat.streaming === null}
          waiting={waiting} onRemoveWaiting={(id) => { if (conv) void chat.removeSource(conv.id, id); }}
          onSend={(text, attachments) => chat.submit(text, attachments, draftId)} onStop={chat.stop}
        />
      )}
    </div>
  );
}
