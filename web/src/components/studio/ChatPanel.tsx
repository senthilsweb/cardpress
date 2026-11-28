import { useEffect, useRef, useState } from "react";
import { ChevronDown, Info, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Conversation, Proposal, ProposalEdit } from "@/lib/chat";
import type { ChatStore } from "@/lib/useChat";
import type { Attachment } from "@/lib/compose";
import type { Draft, DraftKind } from "@/lib/draft";
import { ChatHistory } from "./ChatHistory";
import { ReplyCard, ReplyWords } from "./ReplyCard";
import { ProposalCard } from "./ProposalCard";
import { ReplyActions } from "./Choices";
import { ChatInput, SourceChip } from "./ChatInput";
import { cn } from "@/lib/utils";
import { costText } from "@/lib/history";
import { answered } from "@/lib/reply";

const host = (u?: string) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : ""; } catch { return ""; } };

function AgentBadge({ chat, conv }: { chat: ChatStore; conv?: Conversation }) {
  if (conv?.sourceKind === "mcp") return <Badge variant="warn" title="Sent by a program through MCP. Name not verified.">Outside agent</Badge>;
  if (!chat.agent) return null;
  return chat.agent.ready ? <Badge variant="brand">{chat.agent.name}</Badge> : <Badge variant="outline">No assistant</Badge>;
}

/** What shows before a conversation: how to begin. Earlier ones are listed from its name above. */
function Welcome({ chat }: { chat: ChatStore }) {
  return (
    <div className="space-y-4 px-4 py-4">
      <h3 className="eyebrow">Prepare content</h3>
      {chat.agent?.ready === false ? (
        <div role="status" className="flex gap-2 rounded-md border border-border bg-card p-2.5 text-xs leading-snug">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p><b>No assistant is set up</b> on this server. Writing, design and publishing work as usual.</p>
        </div>
      ) : (
        <p className="text-xs leading-snug text-muted-foreground">
          Say what to write about, or attach a file, a link or text. Tick <b>Post</b>, <b>Article</b> or both.
        </p>
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

function Thread({ conv, chat, drafts, onApply, onShow, onVersion, onAnswer }: {
  conv: Conversation; chat: ChatStore; drafts: Draft[];
  /** Send a pressed answer; absent while none can be sent. */
  onAnswer?: (text: string) => void;
  onVersion: (draftId: string, version: number) => void;
  onApply: (content: ProposalEdit, opts: { useTitle: boolean }) => Promise<string>;
  onShow: (draftId?: string) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  const messages = conv.messages ?? [];
  const proposals = conv.proposals ?? [];
  // a conversation opens at its end
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [conv.id, messages.length, proposals.length, conv.changes?.length, conv.choices?.length, chat.streaming]);

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
      {messages.map((m, i) => (
        <div key={m.id} className="space-y-2">
          {/* a failed or stopped reply may have no words of its own */}
          {m.content && m.status !== "stopped" && <Bubble role={m.role}>{m.detail?.reports?.length ? (
            <ReplyWords reports={m.detail.reports} answering={{
              chosen: answered(messages, i, m.detail.reports.at(-1)?.answers ?? []),
              onAnswer: i === messages.length - 1 ? onAnswer : undefined,
            }} />
          ) : m.content}</Bubble>}
          {m.role === "assistant" && <ReplyCard message={m} onVersion={onVersion} />}
          {m.role === "assistant" && <ReplyActions conv={conv} messageId={m.id} drafts={drafts} onVersion={onVersion} onShow={onShow} />}
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
        <Bubble role="assistant">{chat.streaming}
          <span role="status" className={`flex items-center gap-1.5 text-muted-foreground ${chat.streaming ? "mt-2" : ""}`}><Loader2 className="h-3.5 w-3.5 animate-spin" /> {chat.progress ?? "Working"}…</span></Bubble>
      )}
      <div ref={end} />
    </div>
  );
}

/**
 * The chat that prepares content, turn by turn. It proposes; the person decides. Approving a proposal hands its content
 * to `onApply`, which copies it into a draft and returns the draft's id. The chat itself cannot publish or schedule anything.
 */
export function ChatPanel({ chat, onApply, onShow, onVersion, draftId, viewing, profileId, drafts, onOpen, onDelete }: {
  chat: ChatStore;
  onApply: (content: ProposalEdit, opts: { useTitle: boolean }) => Promise<string>;
  /** Put an item an approved proposal went into on the canvas. */
  onShow: (draftId?: string) => void;
  /** Open a version a reply saved. */
  onVersion: (draftId: string, version: number) => void;
  /** The item on screen, and its kind. */
  draftId?: string;
  viewing?: DraftKind;
  profileId: string;
  drafts: Draft[];
  /** Open an earlier conversation, with the item it is about. */
  onOpen: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  // the list of conversations takes the thread's place until one is chosen
  const [listing, setListing] = useState(false);
  useEffect(() => setListing(false), [chat.current?.id]);
  const conv = chat.current;
  // what to write with the next message: a new conversation starts on what is on screen, later ones with nothing ticked
  const [chosen, setChosen] = useState<DraftKind[] | null>(null);
  useEffect(() => setChosen(null), [conv?.id]);
  const write: DraftKind[] = chosen ?? (conv?.messages?.length ? [] : [viewing ?? "post"]);
  const toggle = (k: DraftKind) => setChosen(write.includes(k) ? write.filter((x) => x !== k) : [...write, k]);

  if (!chat.loaded) return <p className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
  const off = chat.agent?.ready === false;
  const sources = conv?.sources ?? [];
  const waiting = sources.filter((s) => !s.messageId);

  const send = async (text: string, attachments: Attachment[]) => {
    const sent = await chat.submit(text, attachments, draftId, { write, viewing });
    if (sent) setChosen([]);
    return sent;
  };
  // a pressed answer goes as a typed message would
  const onAnswer = off || chat.busy || conv?.sourceKind === "mcp" ? undefined : (text: string) => void send(text, []);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-1.5 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <button type="button" aria-expanded={listing} onClick={() => setListing((v) => !v)} title="Conversations and notes"
            className="-ml-1 flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded px-1 py-1 text-left text-xs font-medium hover:bg-accent">
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", !listing && "-rotate-90")} />
            <span className="truncate" title={conv?.title}>{listing ? "Conversations" : conv?.title ?? "New conversation"}</span>
          </button>
          <AgentBadge chat={chat} conv={conv ?? undefined} />
          {conv && !listing && (
            <Button variant={confirmDelete ? "destructive" : "ghost"} size={confirmDelete ? "sm" : "icon-sm"} title="Delete this conversation" aria-label="Delete this conversation" disabled={chat.busy}
              onClick={() => { if (!confirmDelete) { setConfirmDelete(true); window.setTimeout(() => setConfirmDelete(false), 3000); } else { setConfirmDelete(false); onDelete(conv.id); } }}>
              {confirmDelete ? "Confirm delete" : <Trash2 />}
            </Button>
          )}
        </div>
        {conv && !listing && (
            <p className="truncate text-[11px] text-muted-foreground">
              {conv.sourceKind === "mcp"
                ? `Proposed by “${conv.sourceTitle ?? "an outside agent"}” (a name it gave itself, not verified)`
                : sources.length === 0 ? "No sources" : `${sources.length} ${sources.length === 1 ? "source" : "sources"} · ${conv.sourceChars.toLocaleString()} characters`}
              {conv.costCents !== undefined && ` · ${costText(conv.costCents)}`}
            </p>
        )}
      </div>

      {listing && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChatHistory profileId={profileId} recent={chat.list} currentId={conv?.id} drafts={drafts} busy={chat.busy} onOpen={(id) => { setListing(false); onOpen(id); }} />
        </div>
      )}
      {/* the thread and the box stay mounted, so an unsent message is not lost */}
      <div className={cn("min-h-0 flex-1 overflow-y-auto", listing && "hidden")} aria-live="polite">
        {conv ? <Thread conv={conv} chat={chat} drafts={drafts} onApply={onApply} onShow={onShow} onVersion={onVersion} onAnswer={onAnswer} /> : <Welcome chat={chat} />}
      </div>

      {chat.error && <p role="alert" className="border-t border-border px-3 py-1.5 text-xs text-destructive">{chat.error}</p>}
      <div className={cn(listing && "hidden")}>
      {conv?.sourceKind === "mcp" ? (
        <div className="border-t border-border bg-card px-3 py-2.5 text-[11px] leading-snug text-muted-foreground">
          Approve, edit or reject. To change it, ask the agent that sent it.
        </div>
      ) : (
        <ChatInput
          placeholder={off ? "No assistant is set up" : !conv?.messages?.length ? "Message the assistant" : "Ask for changes…"}
          disabled={off}
          ticks={off ? undefined : (
            <div className="flex gap-1" role="group" aria-label="What to write">
              {(["post", "article"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={write.includes(k)} onClick={() => toggle(k)}
                  className={cn("cursor-pointer rounded-md border px-2 py-0.5 text-[11.5px] font-medium", write.includes(k) ? "border-brand bg-accent text-brand" : "border-border text-muted-foreground hover:text-foreground")}>
                  {k === "post" ? "Post" : "Article"}
                </button>
              ))}
            </div>
          )}
          replying={chat.streaming !== null} busy={chat.busy && chat.streaming === null}
          waiting={waiting} onRemoveWaiting={(id) => { if (conv) void chat.removeSource(conv.id, id); }}
          onSend={send} onStop={chat.stop}
        />
      )}
      </div>
    </div>
  );
}
