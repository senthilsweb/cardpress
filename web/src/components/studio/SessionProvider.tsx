import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { loginUrl, SessionContext, type Perm, type Session } from "@/lib/session";

/** Makes who is signed in, and what their role allows, available to every screen below it. */
export function SessionProvider({ initial, children }: { initial: Session; children: React.ReactNode }) {
  const [user, setUser] = useState(initial.user);
  const value = useMemo(() => ({
    user,
    perms: initial.perms,
    can: (p: Perm) => initial.perms.includes(p),
    setUser,
    signOut: async () => {
      try { await api.logout(); } catch { /* the page goes to sign-in either way */ }
      window.location.assign(loginUrl());
    },
  }), [user, initial.perms]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
