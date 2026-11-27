import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Pane } from "@/components/ui/pane";
import { useUnsaved } from "@/components/settings/guard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { ROLES, roleLabel, useSession, type User } from "@/lib/session";

const select = "h-8 cursor-pointer rounded-md border border-input bg-card px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/** People and roles. Administrators only; the server refuses anyone else. */
export function UsersSettings() {
  const { user: me } = useSession();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", role: "editor" });

  const load = useCallback(() => api.users().then(setUsers).catch((e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);
  useUnsaved((adding && !!(form.firstName || form.lastName || form.email || form.password)) || !!pw);

  const act = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key); setError(null);
    try { await fn(); if (done) toast.success(done); await load(); } catch (e) { setError(message(e)); } finally { setBusy(null); }
  };

  return (
    <Pane
      footer={
        <div className="flex items-center justify-between gap-2">
          {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : <span className="text-xs text-muted-foreground">{users ? `${users.length} ${users.length === 1 ? "person" : "people"}` : ""}</span>}
          <Button size="sm" variant="brand" onClick={() => setAdding((v) => !v)}><Plus /> Add a user</Button>
        </div>
      }>
      <div className="space-y-4">
        {adding && (
          <form className="space-y-3 rounded-md border border-border bg-card p-3" onSubmit={(e) => { e.preventDefault(); void act("add", async () => { await api.addUser(form); setForm({ firstName: "", lastName: "", email: "", password: "", role: "editor" }); setAdding(false); }, "User added"); }}>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label htmlFor="nu-first">First name</Label><Input id="nu-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></div>
              <div className="space-y-1"><Label htmlFor="nu-last">Last name</Label><Input id="nu-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></div>
            </div>
            <div className="space-y-1"><Label htmlFor="nu-email">Email</Label><Input id="nu-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
            <div className="grid grid-cols-[1fr_8rem] items-end gap-2">
              <div className="space-y-1"><Label htmlFor="nu-pw">Password</Label><Input id="nu-pw" type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 10 characters" required /></div>
              <select aria-label="Role" className={`${select} h-9`} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
            </div>
            <div className="flex justify-end"><Button type="submit" size="sm" variant="brand" disabled={busy === "add" || form.password.length < 10}>{busy === "add" && <Loader2 className="animate-spin" />} Add</Button></div>
          </form>
        )}
        {!users ? <p className="text-sm text-muted-foreground">Loading…</p> : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {users.map((u) => {
              const self = u.id === me?.id;
              return (
                <li key={u.id} className="space-y-2 p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{u.fullName}{self && <span className="ml-1.5 text-xs font-normal text-muted-foreground">you</span>}{u.status === "disabled" && <span className="ml-1.5 text-xs font-normal text-destructive">disabled</span>}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}{u.phone ? ` · ${u.phone}` : ""}</p>
                    </div>
                    <select aria-label={`Role of ${u.fullName}`} className={select} value={u.roles[0] ?? "editor"} disabled={busy === u.id} title={roleLabel(u)}
                      onChange={(e) => void act(u.id, () => api.updateUser(u.id, { role: e.target.value }))}>
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => { setPwFor(pwFor === u.id ? null : u.id); setPw(""); }}><KeyRound /> New password</Button>
                    {!self && (u.status === "active"
                      ? <Button size="sm" variant="ghost" disabled={busy === u.id} onClick={() => void act(u.id, () => api.updateUser(u.id, { status: "disabled" }), "Disabled")}><UserX /> Disable</Button>
                      : <Button size="sm" variant="ghost" disabled={busy === u.id} onClick={() => void act(u.id, () => api.updateUser(u.id, { status: "active" }), "Enabled")}><UserCheck /> Enable</Button>)}
                  </div>
                  {pwFor === u.id && (
                    <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void act(u.id, async () => { await api.setUserPassword(u.id, pw); setPwFor(null); setPw(""); }, "Password set"); }}>
                      <Input aria-label="New password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 10 characters" className="h-8" />
                      <Button type="submit" size="sm" variant="brand" disabled={pw.length < 10 || busy === u.id}>Set</Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">Setting a password signs that person out everywhere.</p>
      </div>
    </Pane>
  );
}
