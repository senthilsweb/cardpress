import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { attempt, FormSection, SaveBar } from "@/components/settings/form";
import { Button } from "@/components/ui/button";
import { Pane } from "@/components/ui/pane";
import { useUnsaved } from "@/components/settings/guard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePicker } from "@/components/auth/AuthPage";
import { api, type ApiKey } from "@/lib/api";
import { formatInZone } from "@/lib/jobs";
import { joinDate, roleLabel, splitDate, useSession } from "@/lib/session";

/** Your own details and password. Email and role are changed by an administrator. */
type Part = "profile" | "password" | "keys";
const PART_LABEL: Record<Part, string> = { profile: "Profile", password: "Password", keys: "API keys" };

/** `parts` picks the tabs: the Account settings page shows profile and password, API keys has its own page. */
export function AccountSettings({ parts }: { parts: Part[] }) {
  const { user, setUser } = useSession();
  const [tab, setTab] = useState<string>(parts[0]);
  const [f, setF] = useState({ firstName: user?.firstName ?? "", lastName: user?.lastName ?? "", phone: user?.phone ?? "" });
  const [dob, setDob] = useState(() => splitDate(user?.birthDate));
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // start from what is saved
  useEffect(() => {
    if (!user) return;
    setF({ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? "" });
    setDob(splitDate(user.birthDate));
    setPw({ current: "", next: "", again: "" });
    setError(null);
  }, [user]);
  // a date is compared part by part, as the fields hold it
  const savedDob = splitDate(user?.birthDate);
  const profileChanged = !!user && (f.firstName !== user.firstName || f.lastName !== user.lastName || f.phone !== (user.phone ?? "") || dob.y !== savedDob.y || dob.m !== savedDob.m || dob.d !== savedDob.d);
  useUnsaved(profileChanged || !!(pw.current || pw.next || pw.again));
  if (!user) return null;

  const saveProfile = async () => {
    setBusy(true); setError(null);
    const failed = await attempt(async () => setUser((await api.updateMe({ ...f, birthDate: joinDate(dob.y, dob.m, dob.d) })).user), "Profile saved", "Profile not saved");
    setError(failed ?? null); setBusy(false);
  };
  const changePassword = async () => {
    setBusy(true); setError(null);
    const failed = await attempt(async () => {
      await api.changePassword(pw.current, pw.next);
      setPw({ current: "", next: "", again: "" });
    }, "Password changed. You were signed out on your other devices.", "Password not changed");
    setError(failed ?? null); setBusy(false);
  };
  const resetProfile = () => { setF({ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? "" }); setDob(splitDate(user.birthDate)); setError(null); };
  const pwTyped = !!(pw.current || pw.next || pw.again);
  // what stands in the way of saving, said once something has been typed
  const profileProblem = profileChanged && !(f.firstName.trim() && f.lastName.trim()) ? "Enter your first and last name." : null;
  const pwProblem = !pwTyped ? null : !pw.current ? "Enter your current password." : pw.next.length < 10 ? "The new password needs at least 10 characters." : pw.next !== pw.again ? "The two new passwords are not the same." : null;

  return (
    <Pane
      tabs={parts.length > 1 && (
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setError(null); }}>
          <TabsList className="grid w-full max-w-sm" style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0, 1fr))` }}>
            {parts.map((p) => <TabsTrigger key={p} value={p}>{PART_LABEL[p]}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      )}
      footer={tab === "profile"
        ? <SaveBar dirty={profileChanged} busy={busy} problem={profileProblem ?? error} onSave={() => { if (!profileProblem) void saveProfile(); }} onCancel={resetProfile} />
        : tab === "password"
          ? <SaveBar label="Save password" dirty={pwTyped} busy={busy} problem={pwProblem ?? error} onSave={() => { if (!pwProblem) void changePassword(); }} onCancel={() => { setPw({ current: "", next: "", again: "" }); setError(null); }} />
          : null}
    >
      <Tabs value={tab}>
        <TabsContent value="profile" className="mt-0 space-y-4">
          <FormSection title="Name" about={`Role: ${roleLabel(user)}. An administrator can change your email or role.`}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="as-first">First name</Label><Input id="as-first" required value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="as-last">Last name</Label><Input id="as-last" required value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="as-email">Email</Label><Input id="as-email" value={user.email} readOnly disabled /></div>
          </FormSection>
          <FormSection title="About you" optional>
            <div className="space-y-1.5"><Label htmlFor="as-phone">Phone</Label><Input id="as-phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="as-dob-day">Date of birth</Label><DatePicker idPrefix="as-dob" {...dob} onChange={setDob} /></div>
          </FormSection>
        </TabsContent>
        <TabsContent value="password" className="mt-0">
          <FormSection title="Change password" about="At least 10 characters.">
            <div className="space-y-1.5"><Label htmlFor="as-cur">Current password</Label><Input id="as-cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="as-new">New password</Label><Input id="as-new" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="as-again">New password again</Label><Input id="as-again" type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></div>
          </FormSection>
        </TabsContent>
        <TabsContent value="keys" className="mt-0"><KeysPanel open={tab === "keys"} /></TabsContent>
      </Tabs>
    </Pane>
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
  useUnsaved(!!fresh && !copied, "The new key is not shown again. Leave without copying it?");
  useEffect(() => { if (!confirm) return; const t = window.setTimeout(() => setConfirm(null), 4000); return () => window.clearTimeout(t); }, [confirm]);

  const create = async () => {
    setBusy(true); setError(null);
    setError((await attempt(async () => { setFresh(await api.createApiKey(name)); setName(""); setCopied(false); await load(); }, "Key created. Copy it now.", "Key not created")) ?? null);
    setBusy(false);
  };
  const revoke = async (k: ApiKey) => {
    if (confirm !== k.id) return setConfirm(k.id);
    setBusy(true); setError(null);
    setError((await attempt(async () => { await api.revokeApiKey(k.id); setConfirm(null); if (fresh?.key.id === k.id) setFresh(null); await load(); }, "Key revoked", "Key not revoked")) ?? null);
    setBusy(false);
  };
  const copy = async () => { if (!fresh) return; try { await navigator.clipboard.writeText(fresh.secret); setCopied(true); } catch { setError("Could not copy. Select the key and copy it by hand."); } };

  return (
    <div className="space-y-4">
      <FormSection title="New key" about="Scope: Editor. A key acts as you, on your own work.">
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="key-name">Name</Label>
            <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Such as My agent" maxLength={60} />
          </div>
          <Button type="submit" variant="gold" size="sm" className="mb-0.5" disabled={busy || !name.trim()}>{busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Create key</Button>
        </form>
      </FormSection>
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
