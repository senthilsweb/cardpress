import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePicker } from "@/components/auth/AuthPage";
import { api, type ApiKey } from "@/lib/api";
import { formatInZone } from "@/lib/jobs";
import { joinDate, roleLabel, splitDate, useSession } from "@/lib/session";

/** Your own details and password. Email and role are changed by an administrator. */
export function AccountSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, setUser } = useSession();
  const [tab, setTab] = useState("profile");
  const [f, setF] = useState({ firstName: "", lastName: "", phone: "" });
  const [dob, setDob] = useState({ y: "", m: "", d: "" });
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // start from what is saved each time the drawer opens
  useEffect(() => {
    if (!open || !user) return;
    setF({ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? "" });
    setDob(splitDate(user.birthDate));
    setPw({ current: "", next: "", again: "" });
    setError(null);
  }, [open, user]);
  if (!user) return null;

  const saveProfile = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.updateMe({ ...f, birthDate: joinDate(dob.y, dob.m, dob.d) });
      setUser(r.user);
      toast.success("Saved");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); }
  };
  const changePassword = async () => {
    if (pw.next !== pw.again) return setError("The two new passwords are not the same.");
    setBusy(true); setError(null);
    try {
      await api.changePassword(pw.current, pw.next);
      setPw({ current: "", next: "", again: "" });
      toast.success("Password changed", { description: "You were signed out on your other devices." });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not change the password"); } finally { setBusy(false); }
  };
  const profileReady = f.firstName.trim() !== "" && f.lastName.trim() !== "";
  const pwReady = pw.current !== "" && pw.next.length >= 10 && pw.again !== "";

  return (
    <Drawer
      open={open} onClose={onClose} title="Account settings" resizeKey="account"
      subheader={
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setError(null); }} className="px-3 py-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="keys">API keys</TabsTrigger>
          </TabsList>
        </Tabs>
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          {error && <p role="alert" className="mr-auto text-xs text-destructive">{error}</p>}
          {tab === "profile" && <Button variant="brand" size="sm" onClick={() => void saveProfile()} disabled={busy || !profileReady}>{busy && <Loader2 className="animate-spin" />} Save</Button>}
          {tab === "password" && <Button variant="brand" size="sm" onClick={() => void changePassword()} disabled={busy || !pwReady}>{busy && <Loader2 className="animate-spin" />} Change password</Button>}
        </div>
      }
    >
      <Tabs value={tab} className="space-y-4 p-4">
        <TabsContent value="profile" className="mt-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="as-first">First name</Label><Input id="as-first" data-autofocus value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="as-last">Last name</Label><Input id="as-last" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="as-email">Email</Label><Input id="as-email" value={user.email} readOnly disabled /></div>
          <div className="space-y-1.5"><Label htmlFor="as-phone">Phone</Label><Input id="as-phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Optional" /></div>
          <div className="space-y-1.5"><Label htmlFor="as-dob-day">Date of birth</Label><DatePicker idPrefix="as-dob" {...dob} onChange={setDob} /></div>
          <p className="text-xs text-muted-foreground">Role: {roleLabel(user)}. An administrator can change your email or role.</p>
        </TabsContent>
        <TabsContent value="password" className="mt-0 space-y-4">
          <div className="space-y-1.5"><Label htmlFor="as-cur">Current password</Label><Input id="as-cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="as-new">New password</Label><Input id="as-new" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /><p className="text-xs text-muted-foreground">At least 10 characters.</p></div>
          <div className="space-y-1.5"><Label htmlFor="as-again">New password again</Label><Input id="as-again" type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></div>
        </TabsContent>
        <TabsContent value="keys" className="mt-0"><KeysPanel open={open && tab === "keys"} /></TabsContent>
      </Tabs>
    </Drawer>
  );
}

/** Keys for programs (an MCP client, a script) that act as you, with the editor scope. The secret is shown once. */
function KeysPanel({ open }: { open: boolean }) {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ key: ApiKey; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => { try { setKeys((await api.apiKeys()).keys); } catch (e) { setError(e instanceof Error ? e.message : "Could not load the keys"); } };
  useEffect(() => { if (open) { setFresh(null); setError(null); void load(); } }, [open]);
  useEffect(() => { if (!confirm) return; const t = window.setTimeout(() => setConfirm(null), 4000); return () => window.clearTimeout(t); }, [confirm]);

  const create = async () => {
    setBusy(true); setError(null);
    try { const r = await api.createApiKey(name); setFresh(r); setName(""); setCopied(false); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not make the key"); } finally { setBusy(false); }
  };
  const revoke = async (k: ApiKey) => {
    if (confirm !== k.id) return setConfirm(k.id);
    setBusy(true); setError(null);
    try { await api.revokeApiKey(k.id); setConfirm(null); if (fresh?.key.id === k.id) setFresh(null); await load(); toast.success("Key revoked"); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not revoke"); } finally { setBusy(false); }
  };
  const copy = async () => { if (!fresh) return; try { await navigator.clipboard.writeText(fresh.secret); setCopied(true); } catch { setError("Could not copy. Select the key and copy it by hand."); } };

  return (
    <div className="space-y-4">
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="key-name">New key</Label>
          <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, such as My agent" maxLength={60} />
        </div>
        <Button type="submit" variant="brand" size="sm" className="mb-0.5" disabled={busy || !name.trim()}>{busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Create</Button>
      </form>
      <p className="text-xs text-muted-foreground">Scope: Editor. A key acts as you, on your own work.</p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {fresh && (
        <div className="space-y-2 rounded-md border border-brand/40 bg-brand/5 p-3" role="status">
          <p className="text-xs font-medium">Copy the key now. It is not shown again.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all rounded bg-muted px-2 py-1.5 text-xs">{fresh.secret}</code>
            <Button size="sm" variant="outline" onClick={() => void copy()}>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}</Button>
          </div>
          <p className="text-xs text-muted-foreground">MCP address: <code>{window.location.origin}/mcp</code> with the header <code>Authorization: Bearer …</code></p>
        </div>
      )}
      {!keys ? <p className="text-sm text-muted-foreground">Loading…</p> : keys.length === 0 ? <p className="text-sm text-muted-foreground">No keys yet.</p> : (
        <ul className="divide-y divide-border rounded-md border border-border" aria-label="Your keys">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{k.name}</p>
                <p className="truncate text-xs text-muted-foreground"><code>{k.prefix}…</code> · {k.scope} · made {formatInZone(k.createdAt)} · {k.lastUsedAt ? `used ${formatInZone(k.lastUsedAt)}` : "never used"}</p>
              </div>
              <Button size="sm" variant={confirm === k.id ? "destructive" : "ghost"} disabled={busy} onClick={() => void revoke(k)}><Trash2 /> {confirm === k.id ? "Confirm" : "Revoke"}</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
