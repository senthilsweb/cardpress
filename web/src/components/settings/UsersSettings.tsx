import { useCallback, useEffect, useState } from "react";
import { CircleAlert, KeyRound, Loader2, Plus, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Pane } from "@/components/ui/pane";
import { useUnsaved } from "@/components/settings/guard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { ROLES, roleLabel, useSession, type User } from "@/lib/session";

const EMPTY = { firstName: "", lastName: "", email: "", password: "", role: "editor" };
const roleOptions = ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>);
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
  const [form, setForm] = useState(EMPTY);
  const [discard, setDiscard] = useState(false); // closing would lose what was typed

  const load = useCallback(() => api.users().then(setUsers).catch((e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);
  const typed = !!(form.firstName || form.lastName || form.email || form.password);
  useUnsaved((adding && typed) || !!pw);

  const act = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key); setError(null);
    try { await fn(); if (done) toast.success(done); await load(); } catch (e) { setError(message(e)); } finally { setBusy(null); }
  };

  const openForm = () => { setError(null); setForm(EMPTY); setDiscard(false); setAdding(true); };
  /** Esc, the cross or a press outside: asks first when something was typed. */
  const closeForm = () => { if (typed && !discard) setDiscard(true); else { setAdding(false); setForm(EMPTY); setDiscard(false); } };
  const add = () => act("add", async () => { await api.addUser(form); setForm(EMPTY); setAdding(false); }, "User added");

  return (
    <Pane>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{users ? `${users.length} ${users.length === 1 ? "person" : "people"}` : ""}</p>
          <Button size="sm" variant="brand" onClick={openForm}><Plus /> Add user</Button>
        </div>
        {error && !adding && <Alert variant="destructive"><CircleAlert aria-hidden /><AlertDescription>{error}</AlertDescription></Alert>}
        <Dialog open={adding} onOpenChange={(o) => { if (!o) closeForm(); }}>
          <DialogContent className="max-w-md">
            <form className="flex min-h-0 flex-col" onSubmit={(e) => { e.preventDefault(); void add(); }}>
              <DialogHeader>
                <DialogTitle>Add user</DialogTitle>
                <DialogDescription>Give them the password yourself; they can change it later.</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 space-y-3 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label htmlFor="nu-first">First name</Label><Input id="nu-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></div>
                  <div className="space-y-1"><Label htmlFor="nu-last">Last name</Label><Input id="nu-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></div>
                </div>
                <div className="space-y-1"><Label htmlFor="nu-email">Email</Label><Input id="nu-email" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
                <div className="space-y-1"><Label htmlFor="nu-pw">Password</Label><Input id="nu-pw" type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 10 characters" required /></div>
                <div className="space-y-1">
                  <Label htmlFor="nu-role">Role</Label>
                  <Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}>
                    <SelectTrigger id="nu-role"><SelectValue /></SelectTrigger>
                    <SelectContent>{roleOptions}</SelectContent>
                  </Select>
                </div>
                {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                {discard && <p role="alert" className="mr-auto text-xs text-destructive">Discard what you typed?</p>}
                <Button type="button" size="sm" variant={discard ? "destructive" : "ghost"} onClick={closeForm}>{discard ? "Discard" : "Cancel"}</Button>
                {discard
                  ? <Button type="button" size="sm" variant="outline" onClick={() => setDiscard(false)}>Keep editing</Button>
                  : <Button type="submit" size="sm" variant="brand" disabled={busy === "add" || form.password.length < 10}>{busy === "add" && <Loader2 className="animate-spin" />} Add user</Button>}
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
                    <Select value={u.roles[0] ?? "editor"} disabled={busy === u.id} onValueChange={(role) => void act(u.id, () => api.updateUser(u.id, { role }))}>
                      <SelectTrigger aria-label={`Role of ${u.fullName}`} title={roleLabel(u)} className="h-8 w-32 shrink-0 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{roleOptions}</SelectContent>
                    </Select>
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
