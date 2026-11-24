import { api, type ApiInfo } from "./api";
import { loginUrl, signupUrl, type Session } from "./session";

/**
 * Before any page of the app shows anything: with no account yet, go to the first-run sign-up; with no sign-in, go to
 * sign-in (and come back after). Returns the session, or null while the browser is being sent elsewhere.
 * A server without accounts (the older setup) has no session to speak of.
 */
export async function requireSession(info?: ApiInfo): Promise<Session | null> {
  const i = info ?? (await api.info());
  if (!i.accounts) return { perms: ["write", "approve", "publish", "social", "users"] };
  if (i.needsSetup) { window.location.assign(signupUrl()); return null; }
  if (!i.signedIn || !i.user) { window.location.assign(loginUrl(window.location.pathname + window.location.search)); return null; }
  return { user: i.user, perms: i.perms ?? [] };
}
