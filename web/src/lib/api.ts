/** Client for the Go API. The base URL is same-origin by default and can point at a separate host. */

const env = import.meta.env as Record<string, string | undefined>;
export const API_BASE = (env.PUBLIC_API_BASE || "/api/v1").replace(/\/+$/, "");

// A token typed into the prompt is kept for this tab only. A build-time PUBLIC_API_TOKEN is visible to anyone who
// can load the app, so use it only on a private network.
const TOKEN_KEY = "cardpress.apiToken";
export const getToken = (): string => {
  try { return sessionStorage.getItem(TOKEN_KEY) || env.PUBLIC_API_TOKEN || ""; } catch { return env.PUBLIC_API_TOKEN || ""; }
};
export const setToken = (t: string) => { try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } };
export const clearToken = () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData; // the browser sets the multipart boundary itself
  const isFile = typeof Blob !== "undefined" && body instanceof Blob; // a picture, sent as it is
  if (isFile) headers["Content-Type"] = "application/octet-stream";
  else if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: body === undefined ? undefined : isForm || isFile ? (body as FormData | Blob) : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "network", `Cannot reach the API at ${API_BASE}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown;
  try { json = text ? JSON.parse(text) : undefined; } catch { /* not JSON */ }
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string }; requestId?: string } | undefined) ?? {};
    // a session that has ended (not a wrong password) sends the person to sign in again
    if (res.status === 401 && !path.startsWith("/auth/login") && typeof window !== "undefined" && !/\/(login|signup)\/?$/.test(window.location.pathname)) {
      window.location.assign(`${import.meta.env.BASE_URL}login/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
    throw new ApiError(res.status, e.error?.code ?? "http", e.error?.message ?? `Request failed (${res.status})`, e.requestId);
  }
  return json as T;
}

import type { Draft, DraftInput } from "./draft";
import type { Perm, User } from "./session";
import type { Attempt, Job, NewJob } from "./jobs";
import type { LibraryFilter, LibraryPage, LibrarySort } from "./library";
import type { CalendarEntry, ReadyItem } from "./calendar";
import type { AgentInfo, ChatMessage, ChatRequest, ChatSource, Conversation, Proposal, ProposalEdit } from "./chat";
import type { Attachment } from "./compose";

export interface ApiInfo {
  name: string; version: string; db: string; authRequired: boolean; agent?: AgentInfo;
  /** Accounts are on: the app needs a first (admin) account, then people sign in. */
  accounts?: boolean; needsSetup?: boolean; signupOpen?: boolean; signedIn?: boolean; user?: User; perms?: Perm[];
}
/** A saved state of a draft (text only when one is fetched on its own). */
export interface DraftVersion {
  id: string; draftId: string; seq: number; revision: number; label: "created" | "auto" | "manual" | "approved" | "sent" | "restored" | "assistant";
  note?: string; kind: string; title: string; createdBy?: string; createdByName?: string; createdAt: string; preview?: string;
  doc?: import("./draft").DocNode; hashtags?: string[]; altText?: string;
}
/** An API key as listed. The secret is shown once, when the key is made, and never again. */
/** A note the assistant keeps about a brand. */
export interface BrandNote { key: string; content: string; updatedAt: string }
export interface ApiKey { id: string; name: string; prefix: string; scope: string; createdAt: string; lastUsedAt?: string }
export interface SignupInput { firstName: string; lastName: string; email: string; password: string; phone?: string; birthDate?: string }
/** One credential field as the server lets the browser see it: a secret is only ever its last four characters. */
export interface SettingsField {
  key: string; label: string; hint?: string; secret: boolean; set: boolean;
  source?: "stored" | "env"; value?: string; locked: boolean; unreadable: boolean;
}
export interface NetworkSettings {
  id: string; name: string; portalUrl: string; testable: boolean; complete: boolean; fields: SettingsField[];
}
export interface SettingsView { networks: NetworkSettings[]; canStore: boolean; keySource?: "env" | "file" }
export type TestStatus = "valid" | "invalid" | "expired" | "incomplete" | "error";
export interface TestResult { status: TestStatus; message: string; expiresAt?: string; checks?: { ok: boolean; message: string }[] }

export interface ApiState {
  profiles: unknown[];
  /** Brands hidden from the studio but kept with their history. */
  archived?: unknown[];
  designs: Record<string, unknown>;
  preferences: Record<string, unknown>;
}

/** Events of a streamed chat reply, in the order they arrive. */
export interface ChatStreamHandlers {
  onUser?: (m: ChatMessage) => void;
  onDelta?: (text: string) => void;
  /** What the assistant is doing, while it works. */
  onProgress?: (text: string) => void;
  onProposal?: (p: Proposal) => void;
  onMessage?: (m: ChatMessage) => void;
}

/** Something of a brand changed on the server. */
export interface ServerEvent { type: string; profileId: string; draftId: string; revision: number }

/**
 * Listen for a brand's changes. `onOpen` runs once the server is listening. Resolves when the stream ends; the caller
 * decides whether to listen again. (Read with fetch, so the token can go in a header.)
 */
async function listen(profileId: string, onEvent: (e: ServerEvent) => void, onOpen: () => void, signal: AbortSignal): Promise<void> {
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/events?profileId=${encodeURIComponent(profileId)}`, { headers, signal });
  if (!res.ok || !res.body) throw new ApiError(res.status, "events", `Live updates are not available (${res.status})`);
  onOpen();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    buf += decoder.decode(value, { stream: !done });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const data = buf.slice(0, i).split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("");
      buf = buf.slice(i + 2);
      if (data) onEvent(JSON.parse(data) as ServerEvent);
    }
    if (done) return;
  }
}

/**
 * Send a chat message and read the reply as it is written (server-sent events over a POST, so the token can go in a
 * header, which EventSource cannot do). Resolves when the reply is complete; throws with the reason if it fails.
 */
async function streamMessage(id: string, content: string, h: ChatStreamHandlers, signal?: AbortSignal, request?: ChatRequest): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/chat/conversations/${encodeURIComponent(id)}/messages`, { method: "POST", headers, body: JSON.stringify({ content, ...request }), signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "network", `Cannot reach the API at ${API_BASE}`);
  }
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => undefined)) as { error?: { code?: string; message?: string }; requestId?: string } | undefined;
    throw new ApiError(res.status, j?.error?.code ?? "http", j?.error?.message ?? `Request failed (${res.status})`, j?.requestId);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const dispatch = (block: string) => {
    let name = "", data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) name = line.slice(7);
      else if (line.startsWith("data: ")) data += line.slice(6);
    }
    if (!name) return;
    const v = data ? JSON.parse(data) : {};
    if (name === "user") h.onUser?.(v);
    else if (name === "delta") h.onDelta?.(v.text ?? "");
    else if (name === "progress") h.onProgress?.(v.text ?? "");
    else if (name === "proposal") h.onProposal?.(v);
    else if (name === "message") h.onMessage?.(v);
    else if (name === "error") throw new ApiError(502, v.code ?? "agent_error", v.message ?? "The reply failed");
  };
  for (;;) {
    const { value, done } = await reader.read();
    buf += decoder.decode(value, { stream: !done });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) { dispatch(buf.slice(0, i)); buf = buf.slice(i + 2); }
    if (done) break;
  }
  if (buf.trim()) dispatch(buf);
}

export const api = {
  info: () => call<ApiInfo>("GET", "/info"),
  signup: (input: SignupInput) => call<{ user: User; perms: Perm[] }>("POST", "/auth/signup", input),
  login: (email: string, password: string) => call<{ user: User; perms: Perm[] }>("POST", "/auth/login", { email, password }),
  logout: () => call<void>("POST", "/auth/logout"),
  updateMe: (input: { firstName: string; lastName: string; phone: string; birthDate: string }) => call<{ user: User; perms: Perm[] }>("PUT", "/auth/me", input),
  changePassword: (current: string, next: string) => call<void>("PUT", "/auth/password", { current, new: next }),
  apiKeys: () => call<{ keys: ApiKey[]; scopes: string[] }>("GET", "/api-keys"),
  createApiKey: (name: string, scope = "editor") => call<{ key: ApiKey; secret: string }>("POST", "/api-keys", { name, scope }),
  revokeApiKey: (id: string) => call<void>("DELETE", `/api-keys/${encodeURIComponent(id)}`),
  users: () => call<{ users: User[] }>("GET", "/users").then((r) => r.users),
  addUser: (input: SignupInput & { role: string }) => call<User>("POST", "/users", input),
  updateUser: (id: string, change: { role?: string; status?: "active" | "disabled" }) => call<User>("PUT", `/users/${encodeURIComponent(id)}`, change),
  setUserPassword: (id: string, password: string) => call<void>("PUT", `/users/${encodeURIComponent(id)}/password`, { password }),
  versions: (id: string) => call<{ versions: DraftVersion[] }>("GET", `/drafts/${encodeURIComponent(id)}/versions`).then((r) => r.versions),
  version: (id: string, seq: number) => call<DraftVersion>("GET", `/drafts/${encodeURIComponent(id)}/versions/${seq}`),
  saveVersion: (id: string, note: string) => call<DraftVersion>("POST", `/drafts/${encodeURIComponent(id)}/versions`, { note }),
  restoreVersion: (id: string, seq: number) => call<Draft>("POST", `/drafts/${encodeURIComponent(id)}/versions/${seq}/restore`),
  state: () => call<ApiState>("GET", "/state"),
  putProfiles: (profiles: unknown[]) => call<void>("PUT", "/profiles", { profiles }),
  createProfile: (profile: unknown) => call<void>("POST", "/profiles", profile),
  orderProfiles: (ids: string[]) => call<void>("PUT", "/profiles/order", { ids }),
  /** How many of the brand's posts are still scheduled: archiving does not cancel them. */
  archiveProfile: (id: string) => call<{ scheduled: number }>("POST", `/profiles/${encodeURIComponent(id)}/archive`),
  restoreProfile: (id: string) => call<void>("POST", `/profiles/${encodeURIComponent(id)}/restore`),
  deleteProfile: (id: string) => call<void>("DELETE", `/profiles/${encodeURIComponent(id)}`),
  putDesigns: (designs: Record<string, unknown>) => call<void>("PUT", "/designs", { designs }),
  putPreference: (key: "theme" | "customFonts" | "layout" | "activeProfile", value: unknown) => call<void>("PUT", `/preferences/${key}`, value),
  listDrafts: (profileId: string) => call<{ drafts: Draft[] }>("GET", `/drafts?profileId=${encodeURIComponent(profileId)}`).then((r) => r.drafts),
  createDraft: (input: DraftInput) => call<Draft>("POST", "/drafts", input),
  updateDraft: (id: string, input: DraftInput & { revision?: number }) => call<Draft>("PUT", `/drafts/${encodeURIComponent(id)}`, input),
  /** Change the named planning fields; allowed at any status. */
  setPlanning: (id: string, fields: Partial<Pick<Draft, "audience" | "topic" | "campaign" | "reviewNotes">>) => call<Draft>("PATCH", `/drafts/${encodeURIComponent(id)}/planning`, fields),
  /** Change the address and description of an item's page. An approved item goes back to draft. */
  setPageFields: (id: string, fields: Partial<Pick<Draft, "slug" | "summary">>) => call<Draft>("PATCH", `/drafts/${encodeURIComponent(id)}/page-fields`, fields),
  deleteDraft: (id: string) => call<void>("DELETE", `/drafts/${encodeURIComponent(id)}`),
  listen,
  getDraft: (id: string) => call<Draft>("GET", `/drafts/${encodeURIComponent(id)}`),
  /** Put an approved item's page on the public web. `cover` is the card as a PNG, used as the preview image. */
  publishPage: (id: string, meta: { slug?: string; summary?: string }, cover?: Blob) => {
    const form = new FormData();
    form.set("meta", JSON.stringify(meta));
    if (cover) form.set("cover", cover, "cover.png");
    return call<Draft>("POST", `/drafts/${encodeURIComponent(id)}/page`, form);
  },
  unpublishPage: (id: string) => call<Draft>("DELETE", `/drafts/${encodeURIComponent(id)}/page`),
  /** Give a post a file of its own in place of the card (a PNG or JPEG picture, or a PDF), or go back to the card. */
  setAttachment: (id: string, file: Blob, name = "") => call<Draft>("PUT", `/drafts/${encodeURIComponent(id)}/attachment?name=${encodeURIComponent(name)}`, file),
  setAttachmentTitle: (id: string, title: string) => call<Draft>("PUT", `/drafts/${encodeURIComponent(id)}/attachment/title`, { title }),
  setVideo: (id: string, url: string) => call<Draft>("PUT", `/drafts/${encodeURIComponent(id)}/video`, { url }),
  clearAttachment: (id: string) => call<Draft>("DELETE", `/drafts/${encodeURIComponent(id)}/attachment`),
  attachmentImage: async (id: string): Promise<Blob> => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/drafts/${encodeURIComponent(id)}/attachment`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new ApiError(res.status, "http", `Could not load the file (${res.status})`);
    return res.blob();
  },
  /** A post's set of pictures: add one, describe one, order them, remove one. Each returns the draft. */
  addImage: (id: string, file: Blob) => call<Draft>("POST", `/drafts/${encodeURIComponent(id)}/images`, file),
  setImageAlt: (id: string, imageId: string, altText: string) => call<Draft>("PUT", `/drafts/${encodeURIComponent(id)}/images/${encodeURIComponent(imageId)}`, { altText }),
  orderImages: (id: string, ids: string[]) => call<Draft>("PUT", `/drafts/${encodeURIComponent(id)}/images/order`, { ids }),
  removeImage: (id: string, imageId: string) => call<Draft>("DELETE", `/drafts/${encodeURIComponent(id)}/images/${encodeURIComponent(imageId)}`),
  draftImage: async (id: string, imageId: string): Promise<Blob> => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/drafts/${encodeURIComponent(id)}/images/${encodeURIComponent(imageId)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new ApiError(res.status, "http", `Could not load the image (${res.status})`);
    return res.blob();
  },
  approveDraft: (id: string) => call<Draft>("POST", `/drafts/${encodeURIComponent(id)}/approve`),
  unapproveDraft: (id: string) => call<Draft>("POST", `/drafts/${encodeURIComponent(id)}/unapprove`),
  /** An approved article's planned date; leave both out to clear it. */
  planDraft: (id: string, plan: { scheduledAt?: string; timezone?: string }) => call<Draft>("PUT", `/drafts/${encodeURIComponent(id)}/plan`, plan),
  getSettings: (profileId: string) => call<SettingsView>("GET", `/profiles/${encodeURIComponent(profileId)}/settings`),
  /** `fields`: a string stores it, "" removes it, null (or leaving it out) keeps it. */
  putNetwork: (profileId: string, id: string, fields: Record<string, string | null>) => call<NetworkSettings>("PUT", `/profiles/${encodeURIComponent(profileId)}/settings/${encodeURIComponent(id)}`, { fields }),
  testNetwork: (profileId: string, id: string) => call<TestResult>("POST", `/profiles/${encodeURIComponent(profileId)}/settings/${encodeURIComponent(id)}/test`),
  /** One brand's posts, or every brand's with `scope: "all"`. */
  listJobs: (profileId: string, scope: "brand" | "all" = "brand") => call<{ jobs: Job[] }>("GET", scope === "all" ? "/publish/jobs?scope=all" : `/publish/jobs?profileId=${encodeURIComponent(profileId)}`).then((r) => r.jobs),
  /** Confirms a post: publish now (no `scheduledAt`) or later. The image is the card as a PNG. */
  /** `image` is the card; a post with a picture of its own sends none (the server uses the picture it holds). */
  createJob: (meta: NewJob, image?: Blob) => {
    const form = new FormData();
    form.set("meta", JSON.stringify(meta));
    if (image) form.set("image", image, "card.png");
    return call<Job>("POST", "/publish/jobs", form);
  },
  getJob: (id: string) => call<Job>("GET", `/publish/jobs/${encodeURIComponent(id)}`),
  library: (f: LibraryFilter, activeId: string, page: number, pageSize: number, sort?: LibrarySort) => {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (sort) { q.set("sort", sort.sort); q.set("order", sort.order); }
    if (f.brand === "all") q.set("scope", "all"); else q.set("profileId", f.brand || activeId);
    if (f.kind) q.set("kind", f.kind);
    if (f.status) q.set("status", f.status);
    if (f.q.trim()) q.set("q", f.q.trim());
    return call<LibraryPage>("GET", `/library?${q}`);
  },
  calendar: (brand: string, from: string, to: string) => {
    const q = new URLSearchParams({ from, to });
    if (brand === "all") q.set("scope", "all"); else q.set("profileId", brand);
    return call<{ entries: CalendarEntry[] }>("GET", `/calendar?${q}`).then((r) => r.entries);
  },
  calendarReady: (brand: string) =>
    call<{ items: ReadyItem[] }>("GET", brand === "all" ? "/calendar/ready?scope=all" : `/calendar/ready?profileId=${encodeURIComponent(brand)}`).then((r) => r.items),
  jobAttempts: (id: string) => call<{ attempts: Attempt[] }>("GET", `/publish/jobs/${encodeURIComponent(id)}/attempts`).then((r) => r.attempts),
  publishJobNow: (id: string, acceptDuplicate = false) => call<Job>("POST", `/publish/jobs/${encodeURIComponent(id)}/publish-now`, { acceptDuplicate }),
  rescheduleJob: (id: string, scheduledAt: string, timezone: string) => call<Job>("PUT", `/publish/jobs/${encodeURIComponent(id)}/schedule`, { scheduledAt, timezone }),
  cancelJob: (id: string) => call<Job>("POST", `/publish/jobs/${encodeURIComponent(id)}/cancel`),
  deleteJob: (id: string) => call<void>("DELETE", `/publish/jobs/${encodeURIComponent(id)}`),
  /** The image is fetched with the token (an <img> tag could not send it) and shown from a blob URL. */
  jobImage: async (id: string): Promise<Blob> => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/publish/jobs/${encodeURIComponent(id)}/image`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new ApiError(res.status, "http", `Could not load the image (${res.status})`);
    return res.blob();
  },
  listConversations: (profileId: string, q = "") => call<{ conversations: Conversation[]; agent: AgentInfo }>("GET", `/chat/conversations?profileId=${encodeURIComponent(profileId)}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  /** The conversations changed before this one. */
  olderConversations: (profileId: string, after: string) => call<{ conversations: Conversation[] }>("GET", `/chat/conversations?profileId=${encodeURIComponent(profileId)}&after=${encodeURIComponent(after)}`).then((r) => r.conversations),
  listNotes: (profileId: string) => call<{ notes: BrandNote[] }>("GET", `/chat/memories?profileId=${encodeURIComponent(profileId)}`).then((r) => r.notes),
  deleteNote: (profileId: string, key: string) => call<void>("DELETE", `/chat/memories/${encodeURIComponent(key)}?profileId=${encodeURIComponent(profileId)}`),
  startConversation: (profileId: string, input: { url?: string; text?: string; draftId?: string }) => call<Conversation>("POST", "/chat/conversations", { profileId, ...input }),
  addSource: (conversationId: string, a: Attachment) => {
    let body: FormData | { url: string } | { text: string };
    if (a.kind === "file") { body = new FormData(); body.set("file", a.file, a.file.name); }
    else body = a.kind === "url" ? { url: a.url } : { text: a.text };
    return call<ChatSource>("POST", `/chat/conversations/${encodeURIComponent(conversationId)}/sources`, body);
  },
  removeSource: (conversationId: string, sourceId: string) => call<void>("DELETE", `/chat/conversations/${encodeURIComponent(conversationId)}/sources/${encodeURIComponent(sourceId)}`),
  getConversation: (id: string) => call<Conversation>("GET", `/chat/conversations/${encodeURIComponent(id)}`),
  deleteConversation: (id: string) => call<void>("DELETE", `/chat/conversations/${encodeURIComponent(id)}`),
  streamMessage,
  /** Record a person's answer. Approving does not save or publish anything: the browser applies the content to a draft. */
  /** Save what a reply changed as versions, with the picked options. No assistant is called. */
  saveReply: (id: string, messageId: string, body: { picks: { choiceId: string; option: number }[]; revisions: Record<string, number> }) =>
    call<Conversation>("POST", `/chat/conversations/${encodeURIComponent(id)}/replies/${encodeURIComponent(messageId)}/save`, body),
  undoReply: (id: string, messageId: string) => call<Conversation>("POST", `/chat/conversations/${encodeURIComponent(id)}/replies/${encodeURIComponent(messageId)}/undo`),
  decideProposal: (id: string, body: { status: "approved" | "rejected"; draftId?: string; edited?: ProposalEdit }) =>
    call<Proposal>("POST", `/chat/proposals/${encodeURIComponent(id)}/decision`, body),
  importLegacy: (body: { profiles: unknown[]; designs: Record<string, unknown>; preferences: Record<string, unknown> }) =>
    call<void>("POST", "/import/legacy", body),
};
