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
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body) });
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
import type { LibraryFilter, LibraryPage } from "./library";
import type { AgentInfo, ChatMessage, Conversation, Proposal, ProposalEdit } from "./chat";

export interface ApiInfo {
  name: string; version: string; db: string; authRequired: boolean; agent?: AgentInfo;
  /** Accounts are on: the app needs a first (admin) account, then people sign in. */
  accounts?: boolean; needsSetup?: boolean; signupOpen?: boolean; signedIn?: boolean; user?: User; perms?: Perm[];
}
/** A saved state of a draft (text only when one is fetched on its own). */
export interface DraftVersion {
  id: string; draftId: string; seq: number; label: "created" | "auto" | "manual" | "approved" | "sent" | "restored";
  note?: string; kind: string; title: string; createdBy?: string; createdByName?: string; createdAt: string; preview?: string;
  doc?: import("./draft").DocNode; hashtags?: string[]; altText?: string;
}
/** An API key as listed. The secret is shown once, when the key is made, and never again. */
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
  onProposal?: (p: Proposal) => void;
  onMessage?: (m: ChatMessage) => void;
}

/**
 * Send a chat message and read the reply as it is written (server-sent events over a POST, so the token can go in a
 * header, which EventSource cannot do). Resolves when the reply is complete; throws with the reason if it fails.
 */
async function streamMessage(id: string, content: string, h: ChatStreamHandlers, signal?: AbortSignal): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/chat/conversations/${encodeURIComponent(id)}/messages`, { method: "POST", headers, body: JSON.stringify({ content }), signal });
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
  updateDraft: (id: string, input: DraftInput) => call<Draft>("PUT", `/drafts/${encodeURIComponent(id)}`, input),
  deleteDraft: (id: string) => call<void>("DELETE", `/drafts/${encodeURIComponent(id)}`),
  getDraft: (id: string) => call<Draft>("GET", `/drafts/${encodeURIComponent(id)}`),
  /** Put an approved item's page on the public web. `cover` is the card as a PNG, used as the preview image. */
  publishPage: (id: string, meta: { slug?: string; summary?: string }, cover?: Blob) => {
    const form = new FormData();
    form.set("meta", JSON.stringify(meta));
    if (cover) form.set("cover", cover, "cover.png");
    return call<Draft>("POST", `/drafts/${encodeURIComponent(id)}/page`, form);
  },
  unpublishPage: (id: string) => call<Draft>("DELETE", `/drafts/${encodeURIComponent(id)}/page`),
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
  createJob: (meta: NewJob, image: Blob) => {
    const form = new FormData();
    form.set("meta", JSON.stringify(meta));
    form.set("image", image, "card.png");
    return call<Job>("POST", "/publish/jobs", form);
  },
  getJob: (id: string) => call<Job>("GET", `/publish/jobs/${encodeURIComponent(id)}`),
  library: (f: LibraryFilter, activeId: string, page: number, pageSize: number) => {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (f.brand === "all") q.set("scope", "all"); else q.set("profileId", f.brand || activeId);
    if (f.kind) q.set("kind", f.kind);
    if (f.status) q.set("status", f.status);
    if (f.q.trim()) q.set("q", f.q.trim());
    return call<LibraryPage>("GET", `/library?${q}`);
  },
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
  listConversations: (profileId: string) => call<{ conversations: Conversation[]; agent: AgentInfo }>("GET", `/chat/conversations?profileId=${encodeURIComponent(profileId)}`),
  startConversation: (profileId: string, input: { url?: string; text?: string }) => call<Conversation>("POST", "/chat/conversations", { profileId, ...input }),
  getConversation: (id: string) => call<Conversation>("GET", `/chat/conversations/${encodeURIComponent(id)}`),
  deleteConversation: (id: string) => call<void>("DELETE", `/chat/conversations/${encodeURIComponent(id)}`),
  streamMessage,
  /** Record a person's answer. Approving does not save or publish anything: the browser applies the content to a draft. */
  decideProposal: (id: string, body: { status: "approved" | "rejected"; draftId?: string; edited?: ProposalEdit }) =>
    call<Proposal>("POST", `/chat/proposals/${encodeURIComponent(id)}/decision`, body),
  importLegacy: (body: { profiles: unknown[]; designs: Record<string, unknown>; preferences: Record<string, unknown> }) =>
    call<void>("POST", "/import/legacy", body),
};
