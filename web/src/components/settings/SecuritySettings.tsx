import { useCallback, useEffect, useState } from "react";
import { CircleAlert, LogOut } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pane } from "@/components/ui/pane";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { IDLE_CHOICES, MAX_CHOICES, minutesLabel, securityProblem, withValue, type Security, type SecuritySettings as Settings } from "@/lib/security";
import { attempt, FormSection, reason, SaveBar } from "./form";
import { useUnsaved } from "./guard";

/** Who may join and how signing in behaves. Administrators only; the server refuses anyone else. */
export function SecuritySettings() {
  const [data, setData] = useState<Security | null>(null);
  const [edit, setEdit] = useState<Partial<Settings>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false); // signing everyone out is confirmed

  const load = useCallback(() => api.security().then(setData).catch((e) => setError(reason(e))), []);
  useEffect(() => { void load(); }, [load]);
  const value = data && { ...data.settings, ...edit };
  const dirty = !!data && !!value && (Object.keys(value) as (keyof Settings)[]).some((k) => value[k] !== data.settings[k]);
  useUnsaved(dirty);

  if (!data || !value) {
    return <Pane>{error ? <Alert variant="destructive"><CircleAlert aria-hidden /><AlertDescription>{error}</AlertDescription></Alert> : <p className="text-sm text-muted-foreground">Loading…</p>}</Pane>;
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => { setError(null); setEdit((e) => ({ ...e, [k]: v })); };
  const change = async (work: () => Promise<Security>, done: string, failed: string) => {
    setBusy(true);
    const why = await attempt(async () => { setData(await work()); setEdit({}); }, done, failed);
    setError(why ?? null); setBusy(false);
  };
  const signOut = async () => {
    setBusy(true);
    const why = await attempt(async () => { await api.signOutEveryone(); await load(); }, "Everyone else is signed out", "Not signed out");
    setError(why ?? null); setBusy(false); setAsking(false);
  };
  const number = (id: string, k: "minPassword" | "attempts" | "pauseMinutes", label: string) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" inputMode="numeric" className="w-28" value={Number.isNaN(value[k]) ? "" : value[k]} onChange={(e) => set(k, e.target.value === "" ? Number.NaN : Number(e.target.value))} />
    </div>
  );
  const time = (id: string, k: "idleMinutes" | "maxMinutes", label: string, choices: readonly number[]) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Select value={String(value[k])} onValueChange={(v) => set(k, Number(v))}>
        <SelectTrigger id={id} className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>{withValue(choices, value[k]).map((m) => <SelectItem key={m} value={String(m)}>{minutesLabel(m)}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  const problem = dirty ? securityProblem(value) : null;

  return (
    <Pane footer={
      <SaveBar dirty={dirty} busy={busy} problem={problem ?? error}
        onSave={() => { if (!problem) void change(() => api.saveSecurity(value), "Security saved", "Security not saved"); }}
        onCancel={() => { setEdit({}); setError(null); }}
        extra={data.saved && !dirty ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void change(api.resetSecurity, "Defaults restored", "Not restored")}>Use defaults</Button> : undefined} />
    }>
      <div className="space-y-4">
        <FormSection title="Sign-up">
          <div className="flex items-center gap-3">
            <Switch id="sec-signup" checked={value.signupOpen} onCheckedChange={(v) => set("signupOpen", v)} />
            <Label htmlFor="sec-signup">Anyone can create an account</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sec-role">Role of a new account</Label>
            <Select value={value.defaultRole} disabled={!value.signupOpen} onValueChange={(v) => set("defaultRole", v as Settings["defaultRole"])}>
              <SelectTrigger id="sec-role" className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="editor">Editor</SelectItem><SelectItem value="writer">Writer</SelectItem></SelectContent>
            </Select>
          </div>
        </FormSection>
        <FormSection title="Sessions" about="How long a sign-in lasts.">
          <div className="flex flex-wrap gap-4">
            {time("sec-idle", "idleMinutes", "Sign out after no use for", IDLE_CHOICES)}
            {time("sec-max", "maxMinutes", "Always sign out after", MAX_CHOICES)}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="mr-auto text-xs text-muted-foreground">{data.activeSessions} active {data.activeSessions === 1 ? "session" : "sessions"}</span>
            {asking ? (
              <>
                <span role="alert" className="text-xs text-destructive">Sign out everyone but you?</span>
                <Button type="button" size="sm" variant="cancel" disabled={busy} onClick={() => setAsking(false)}>Cancel</Button>
                <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void signOut()}>Sign out</Button>
              </>
            ) : <Button type="button" size="sm" variant="outline" onClick={() => setAsking(true)}><LogOut /> Sign out everyone</Button>}
          </div>
        </FormSection>
        <FormSection title="Passwords and sign-in" about="Common passwords are always refused.">
          {number("sec-min", "minPassword", "Shortest password")}
          <div className="flex flex-wrap gap-4">
            {number("sec-attempts", "attempts", "Failed sign-ins before a pause")}
            {number("sec-pause", "pauseMinutes", "Pause (minutes)")}
          </div>
        </FormSection>
      </div>
    </Pane>
  );
}
