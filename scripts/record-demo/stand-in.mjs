// A scripted stand-in for the Managed Agents API, so a recording costs nothing and says the same words every time.
// Like the real writer it saves through the app's MCP server, with an API key of the person recording. No AI is used.
import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

const POST = {
  body: "Happy Thanksgiving from TemplrPress.\n\nThank you for reading, testing and telling us what to fix. This year's templates are better because of you.\n\nWishing you and your family a good day.",
  hashtags: ["HappyThanksgiving", "TemplrPress", "GivingThanks"],
  card: { eyebrow: "Happy", headline: "Thanksgiving!", subtitle: "With thanks to every reader and contributor.", signature: "From all of us\nat TemplrPress" },
  altText: "A Thanksgiving greeting card from TemplrPress with autumn leaves.",
};

export function startStandIn({ app, key, port }) {
  const sessions = new Map();

  // one MCP call: a fresh session each time keeps this short
  async function rpc(method, params, session, notify = false) {
    const res = await fetch(`${app}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${key()}`, ...(session ? { "mcp-session-id": session } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, ...(notify ? {} : { id: 1 }) }),
    });
    const raw = await res.text();
    if (notify || !raw) return { session: res.headers.get("mcp-session-id") };
    const data = raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5));
    return { session: res.headers.get("mcp-session-id"), body: JSON.parse(data.at(-1) ?? raw) };
  }
  async function tool(name, args) {
    const { session } = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "stand-in", version: "1" } });
    await rpc("notifications/initialized", {}, session, true);
    const { body } = await rpc("tools/call", { name, arguments: args }, session);
    if (body.error || body.result?.isError) throw new Error(`${name}: ${JSON.stringify(body).slice(0, 300)}`);
    return body.result.structuredContent ?? JSON.parse(body.result.content[0].text);
  }

  function emit(s, event) {
    const ev = { id: `sevt_${s.id}_${++s.n}`, processed_at: "2026-01-01T00:00:00Z", ...event };
    s.events.push(ev);
    for (const send of s.listeners) send(ev);
    return ev;
  }

  async function run(s, text, outcome) {
    const block = text.split("<studio>\n")[1].split("\n</studio>")[0];
    const studio = Object.fromEntries(block.split("\n").map((l) => [l.slice(0, l.indexOf(": ")), l.slice(l.indexOf(": ") + 2)]));
    const used = (name) => emit(s, { type: "agent.mcp_tool_use", name, input: {}, mcp_server_name: "cardpress" });
    try {
      // "ask me" shows a question with buttons, and writes nothing
      if (text.includes("ask me")) {
        const ask = {
          conversationId: studio.conversationId, outcome: "needs_answer", message: "The article draft is ready; the post is not written yet.",
          question: "Write the post as well?", answers: ["Yes", "No", "Only a short one, for later this week"],
        };
        const use = emit(s, { type: "agent.mcp_tool_use", name: "report_reply", input: ask, mcp_server_name: "cardpress" });
        await tool("report_reply", ask);
        emit(s, { type: "agent.mcp_tool_result", mcp_tool_use_id: use.id, is_error: false });
        if (outcome) {
          emit(s, { type: "session.status_idle", stop_reason: { type: "end_turn" } });
          emit(s, { type: "span.outcome_evaluation_start", iteration: 0 });
          emit(s, { type: "span.outcome_evaluation_end", result: "satisfied", iteration: 0, explanation: "ok" });
        }
        emit(s, { type: "session.status_idle", stop_reason: { type: "end_turn" } });
        return;
      }
      emit(s, { type: "session.thread_created", agent_name: "greetings-writer", session_thread_id: "t" });
      await sleep(600);
      used("get_draft");
      const draft = await tool("get_draft", { id: studio.post });
      used("update_draft");
      await tool("update_draft", { draftId: studio.post, revision: draft.revision, body: POST.body, hashtags: POST.hashtags, altText: POST.altText });
      used("update_card_text");
      await tool("update_card_text", { draftId: studio.post, changes: POST.card });
      used("offer_choices");
      await tool("offer_choices", {
        conversationId: studio.conversationId, draftId: studio.post,
        fields: [{ field: "headline", options: [{ value: "Thanksgiving!" }, { value: "Giving Thanks", note: "quieter" }, { value: "With Gratitude", note: "formal" }] }],
      });
      const report = {
        conversationId: studio.conversationId, outcome: "done", message: "The greeting post and the words on its card are saved.",
        points: ["Thanks readers and contributors", "Signed from the team"], next: "Pick a headline, or ask for more.",
      };
      const use = emit(s, { type: "agent.mcp_tool_use", name: "report_reply", input: report, mcp_server_name: "cardpress" });
      await tool("report_reply", report);
      emit(s, { type: "agent.mcp_tool_result", mcp_tool_use_id: use.id, is_error: false });
    } catch (e) {
      console.error("stand-in:", e.message);
      emit(s, { type: "agent.message", content: [{ type: "text", text: `The stand-in failed: ${e.message}` }] });
    }
    s.cents += 4;
    if (outcome) {
      emit(s, { type: "session.status_idle", stop_reason: { type: "end_turn" } });
      emit(s, { type: "span.outcome_evaluation_start", iteration: 0 });
      await sleep(400);
      emit(s, { type: "span.outcome_evaluation_end", result: "satisfied", iteration: 0, explanation: "ok" });
    }
    emit(s, { type: "session.status_idle", stop_reason: { type: "end_turn" } });
  }

  const server = createServer(async (req, res) => {
    const path = req.url.split("?")[0];
    const reply = (body, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    let raw = "";
    for await (const chunk of req) raw += chunk;
    if (req.method === "POST" && path === "/v1/sessions") {
      const id = `sesn_${sessions.size + 1}`;
      sessions.set(id, { id, events: [], listeners: new Set(), n: 0, cents: 0 });
      return reply({ id, type: "session" });
    }
    const s = sessions.get(/^\/v1\/sessions\/([^/]+)/.exec(path)?.[1]);
    if (!s) return reply({ type: "error", error: { type: "not_found_error", message: "no session" } }, 404);
    if (req.method === "POST") {
      const sent = (JSON.parse(raw || "{}").events ?? []).map((e) => {
        const ev = emit(s, e);
        if (e.type === "user.message") void run(s, e.content[0].text, false);
        if (e.type === "user.define_outcome") void run(s, e.description, true);
        return ev;
      });
      return reply({ data: sent });
    }
    if (path.endsWith("/stream")) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.flushHeaders();
      const send = (e) => res.write(`event: message\ndata: ${JSON.stringify(e)}\n\n`);
      s.listeners.add(send);
      res.on("close", () => s.listeners.delete(send));
      return;
    }
    if (path.endsWith("/events")) return reply({ data: s.events, next_page: null });
    reply({ id: s.id, usage: { list_cost: { amount: String(s.cents), currency: "USD" }, active_seconds: 5 } });
  });
  server.listen(port, "127.0.0.1");
  return () => { server.closeAllConnections(); server.close(); };
}
