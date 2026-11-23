/** Client for the Go API. The base URL is same-origin by default and can point at a separate host. */

const env = import.meta.env as Record<string, string | undefined>;
export const API_BASE = (env.PUBLIC_API_BASE || "/api/v1").replace(/\/+$/, "");

// A token typed into the prompt is kept for this tab only. A build-time PUBLIC_API_TOKEN is visible to anyone who
// can load the app, so use it only on a private network.
const TOKEN_KEY = "scs.apiToken";
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
    throw new ApiError(res.status, e.error?.code ?? "http", e.error?.message ?? `Request failed (${res.status})`, e.requestId);
  }
  return json as T;
}

import type { Draft, DraftInput } from "./draft";
import type { Job, NewJob } from "./jobs";

export interface ApiInfo { name: string; version: string; db: string; authRequired: boolean }
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
  designs: Record<string, unknown>;
  preferences: Record<string, unknown>;
}

export const api = {
  info: () => call<ApiInfo>("GET", "/info"),
  state: () => call<ApiState>("GET", "/state"),
  putProfiles: (profiles: unknown[]) => call<void>("PUT", "/profiles", { profiles }),
  putDesigns: (designs: Record<string, unknown>) => call<void>("PUT", "/designs", { designs }),
  putPreference: (key: "theme" | "customFonts" | "layout", value: unknown) => call<void>("PUT", `/preferences/${key}`, value),
  listDrafts: (profileId: string) => call<{ drafts: Draft[] }>("GET", `/drafts?profileId=${encodeURIComponent(profileId)}`).then((r) => r.drafts),
  createDraft: (input: DraftInput) => call<Draft>("POST", "/drafts", input),
  updateDraft: (id: string, input: DraftInput) => call<Draft>("PUT", `/drafts/${encodeURIComponent(id)}`, input),
  deleteDraft: (id: string) => call<void>("DELETE", `/drafts/${encodeURIComponent(id)}`),
  getSettings: () => call<SettingsView>("GET", "/settings"),
  /** `fields`: a string stores it, "" removes it, null (or leaving it out) keeps it. */
  putNetwork: (id: string, fields: Record<string, string | null>) => call<NetworkSettings>("PUT", `/settings/${encodeURIComponent(id)}`, { fields }),
  testNetwork: (id: string) => call<TestResult>("POST", `/settings/${encodeURIComponent(id)}/test`),
  listJobs: (profileId: string) => call<{ jobs: Job[] }>("GET", `/publish/jobs?profileId=${encodeURIComponent(profileId)}`).then((r) => r.jobs),
  /** Confirms a post: publish now (no `scheduledAt`) or later. The image is the card as a PNG. */
  createJob: (meta: NewJob, image: Blob) => {
    const form = new FormData();
    form.set("meta", JSON.stringify(meta));
    form.set("image", image, "card.png");
    return call<Job>("POST", "/publish/jobs", form);
  },
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
  importLegacy: (body: { profiles: unknown[]; designs: Record<string, unknown>; preferences: Record<string, unknown> }) =>
    call<void>("POST", "/import/legacy", body),
};
