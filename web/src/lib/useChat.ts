import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { AgentInfo, ChatMessage, Conversation, Proposal, ProposalEdit } from "./chat";

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
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

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

  const patch = (id: string, fn: (c: Conversation) => Conversation) => setCurrent((c) => (c && c.id === id ? fn(c) : c));

  /** Send a message and show the reply as it arrives. An empty message starts the first draft. */
  const send = useCallback(async (convId: string, content: string) => {
    setBusy(true); setError(null); setStreaming("");
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      await api.streamMessage(convId, content, {
        onUser: (m: ChatMessage) => patch(convId, (c) => ({ ...c, messages: [...(c.messages ?? []), m] })),
        onDelta: (t) => setStreaming((s) => (s ?? "") + t),
        onProposal: (p: Proposal) => patch(convId, (c) => ({
          ...c,
          proposals: [...(c.proposals ?? []).map((x) => (x.status === "pending" ? { ...x, status: "superseded" as const } : x)), p],
        })),
        onMessage: (m) => { patch(convId, (c) => ({ ...c, messages: [...(c.messages ?? []), m] })); setStreaming(null); },
      }, ctl.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(message(e));
    } finally {
      setStreaming(null); setBusy(false);
      refreshList().catch(() => undefined);
    }
  }, [refreshList]);

  const start = useCallback(async (input: { url?: string; text?: string }) => {
    setBusy(true); setError(null);
    try {
      const c = await api.startConversation(profileId, input);
      setCurrent(c);
      refreshList().catch(() => undefined);
      await send(c.id, ""); // writes the first draft straight away
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }, [profileId, send, refreshList]);

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
  }, []);

  return { agent, list, current, loaded, streaming, busy, error, setError, start, send, open, remove, decide, newConversation: () => { setCurrent(null); setError(null); } };
}

export type ChatStore = ReturnType<typeof useChat>;
