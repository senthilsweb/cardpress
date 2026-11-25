import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { AgentInfo, ChatMessage, ChatRequest, Conversation, Proposal, ProposalEdit } from "./chat";
import type { Attachment } from "./compose";

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/**
 * The chat that prepares post content. It holds the open conversation, the text of a reply while it is being written,
 * and the person's decisions on proposals. Nothing here saves or publishes: approving a proposal only records the
 * decision; the caller applies the content to a draft.
 */
export function useChat(profileId: string) {
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [list, setList] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null); // the reply so far, while it is written
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null); // what the assistant is doing
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  // read inside timers, which would otherwise see stale values
  const live = useRef({ busy: false, current: null as Conversation | null });
  live.current = { busy, current };

  const refreshList = useCallback(async () => {
    const r = await api.listConversations(profileId);
    setList(r.conversations);
    setAgent(r.agent);
    return r.conversations;
  }, [profileId]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const cs = await refreshList();
        if (live && cs.length) setCurrent(await api.getConversation(cs[0].id)); // continue where you left off
      } catch (e) {
        if (live) setError(message(e));
      } finally {
        if (live) setLoaded(true);
      }
    })();
    return () => { live = false; abort.current?.abort(); };
  }, [refreshList]);

  // An outside agent can leave a proposal at any time, so look for new ones now and then, and when the tab regains focus.
  useEffect(() => {
    const check = async () => {
      if (document.hidden || live.current.busy) return;
      try {
        const cs = await refreshList();
        const cur = live.current.current;
        const item = cur && cs.find((c) => c.id === cur.id);
        if (cur && item && item.updatedAt > cur.updatedAt) setCurrent(await api.getConversation(cur.id)); // new content in the open thread
      } catch { /* the next check will try again */ }
    };
    const t = window.setInterval(() => void check(), 15_000);
    window.addEventListener("focus", check);
    return () => { window.clearInterval(t); window.removeEventListener("focus", check); };
  }, [refreshList]);

  const patch = (id: string, fn: (c: Conversation) => Conversation) => setCurrent((c) => (c && c.id === id ? fn(c) : c));

  /** Send a message and show the reply as it arrives. An empty message sends the waiting sources. */
  const send = useCallback(async (convId: string, content: string, request?: ChatRequest) => {
    setBusy(true); setError(null); setStreaming(""); setProgress(null);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      await api.streamMessage(convId, content, {
        onUser: (m: ChatMessage) => patch(convId, (c) => ({
          ...c, messages: [...(c.messages ?? []), m],
          sources: (c.sources ?? []).map((s) => (s.messageId ? s : { ...s, messageId: m.id })),
        })),
        onDelta: (t) => setStreaming((s) => (s ?? "") + t),
        onProgress: (t) => {
          setProgress(t);
          refreshList().catch(() => undefined); // an item made for this message belongs to the conversation from the start
        },
        onProposal: (p: Proposal) => patch(convId, (c) => ({
          ...c,
          proposals: [...(c.proposals ?? []).map((x) => (x.status === "pending" ? { ...x, status: "superseded" as const } : x)), p],
        })),
        onMessage: (m) => { patch(convId, (c) => ({ ...c, messages: [...(c.messages ?? []), m] })); setStreaming(null); },
      }, ctl.signal, request);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(message(e));
    } finally {
      // what the server kept is the truth; after a stop it takes a moment to note it
      for (let i = 0; i < 6; i++) {
        if (ctl.signal.aborted) await new Promise((r) => window.setTimeout(r, 250));
        try {
          const c = await api.getConversation(convId);
          if (ctl.signal.aborted && i < 5 && c.messages?.[c.messages.length - 1]?.role === "user") continue;
          patch(convId, () => c);
        } catch { /* the next look will do */ }
        break;
      }
      setStreaming(null); setProgress(null); setBusy(false);
      refreshList().catch(() => undefined);
    }
  }, [refreshList]);

  /** Stop the reply being written. What was said is kept, and the conversation goes on. */
  const stop = useCallback(() => abort.current?.abort(), []);

  /**
   * Send words and attachments, starting a conversation about `draftId` if none is open. Resolves true once everything
   * attached was accepted and the message is on its way; false leaves the box as it was, with the reason in `error`.
   */
  const submit = useCallback(async (content: string, attachments: Attachment[], draftId?: string, request?: ChatRequest): Promise<boolean> => {
    setBusy(true); setError(null);
    let conv = live.current.current;
    const created = !conv;
    const added: string[] = [];
    try {
      if (!conv) conv = await api.startConversation(profileId, { draftId });
      for (const a of attachments) added.push((await api.addSource(conv.id, a)).id);
      const fresh = await api.getConversation(conv.id);
      setCurrent(fresh);
    } catch (e) {
      // nothing is left half attached
      if (conv) {
        if (created) await api.deleteConversation(conv.id).catch(() => undefined);
        else for (const id of added) await api.removeSource(conv.id, id).catch(() => undefined);
      }
      setError(message(e));
      setBusy(false);
      return false;
    }
    void send(conv.id, content, request);
    return true;
  }, [profileId, send]);

  const removeSource = useCallback(async (convId: string, sourceId: string) => {
    try {
      await api.removeSource(convId, sourceId);
      patch(convId, (c) => ({ ...c, sources: (c.sources ?? []).filter((s) => s.id !== sourceId) }));
    } catch (e) { setError(message(e)); }
  }, []);

  const open = useCallback(async (id: string) => {
    setError(null); setStreaming(null);
    try { setCurrent(await api.getConversation(id)); } catch (e) { setError(message(e)); }
  }, []);

  const remove = useCallback(async (id: string) => {
    setError(null);
    try {
      await api.deleteConversation(id);
      const cs = await refreshList();
      if (current?.id === id) setCurrent(cs.length ? await api.getConversation(cs[0].id) : null);
    } catch (e) { setError(message(e)); }
  }, [current?.id, refreshList]);

  /** Record the person's answer to a proposal. Throws if it fails so the card can say why. */
  const decide = useCallback(async (p: Proposal, body: { status: "approved" | "rejected"; draftId?: string; edited?: ProposalEdit }) => {
    const updated = await api.decideProposal(p.id, body);
    patch(p.conversationId, (c) => ({ ...c, proposals: (c.proposals ?? []).map((x) => (x.id === updated.id ? updated : x)) }));
    refreshList().catch(() => undefined); // the waiting count on the tab changes
  }, [refreshList]);

  const pendingCount = list.reduce((n, c) => n + (c.pending ?? 0), 0);
  return { agent, list, current, loaded, pendingCount, streaming, progress, busy, error, setError, send, submit, stop, removeSource, open, remove, decide, newConversation: () => { setCurrent(null); setError(null); } };
}

export type ChatStore = ReturnType<typeof useChat>;
