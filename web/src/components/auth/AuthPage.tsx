import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type ApiInfo } from "@/lib/api";
import { BuiltWith, Logo } from "@/components/studio/Logo";
import { base, daysIn, joinDate, loginUrl, MONTHS, signupUrl } from "@/lib/session";

const select = "flex h-9 w-full cursor-pointer rounded-md border border-input bg-card px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Where to go after signing in: a page of this app only. */
function nextPage(): string {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith(base()) && !n.startsWith("//") && !/\/(login|signup)\/?$/.test(n) ? n : `${base()}studio/`;
}

function Card({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7"><Logo stacked /></div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {lead && <p className="mt-1 text-sm text-muted-foreground">{lead}</p>}
          <div className="mt-5">{children}</div>
        </div>
        <BuiltWith className="mt-6 text-center" />
      </div>
    </main>
  );
}

function Password({ id, label, value, onChange, hint, autoComplete }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; autoComplete: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} type={shown ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} className="pr-9" required />
        <button type="button" onClick={() => setShown((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={shown ? "Hide the password" : "Show the password"}>
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Day, month and year as three drop-downs, all optional. */
export function DatePicker({ y, m, d, onChange, idPrefix }: { y: string; m: string; d: string; onChange: (v: { y: string; m: string; d: string }) => void; idPrefix: string }) {
  const thisYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: thisYear - 1899 }, (_, i) => String(thisYear - i)), [thisYear]);
  const days = Array.from({ length: daysIn(y, m) }, (_, i) => String(i + 1));
  const set = (patch: Partial<{ y: string; m: string; d: string }>) => {
    const next = { y, m, d, ...patch };
    if (next.d && Number(next.d) > daysIn(next.y, next.m)) next.d = ""; // 31 February is not offered
    onChange(next);
  };
  return (
    <div className="grid grid-cols-[4.5rem_1fr_5.5rem] gap-2">
      <select id={`${idPrefix}-day`} aria-label="Day" className={select} value={d} onChange={(e) => set({ d: e.target.value })}>
        <option value="">Day</option>{days.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <select aria-label="Month" className={select} value={m} onChange={(e) => set({ m: e.target.value })}>
        <option value="">Month</option>{MONTHS.map((x, i) => <option key={x} value={String(i + 1)}>{x}</option>)}
      </select>
      <select aria-label="Year" className={select} value={y} onChange={(e) => set({ y: e.target.value })}>
        <option value="">Year</option>{years.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  );
}

/** Sign in, or create an account. The first account on a server becomes its admin. */
export default function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const [info, setInfo] = useState<ApiInfo | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    api.info().then((i) => {
      if (i.signedIn) { window.location.assign(nextPage()); return; }
      if (mode === "login" && i.needsSetup) { window.location.assign(signupUrl()); return; }
      setInfo(i);
    }).catch((e) => setFailed(e instanceof Error ? e.message : "Cannot reach the server"));
  }, [mode]);

  if (failed) return <Card title="Cannot reach the server"><p className="text-sm text-muted-foreground">{failed}</p></Card>;
  if (!info) return <Card title=" "><p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p></Card>;
  if (!info.accounts) return <Card title="Nothing to sign in to"><p className="text-sm text-muted-foreground">This server does not use accounts. <a className="text-brand hover:underline" href={`${base()}studio/`}>Open the editor</a>.</p></Card>;
  return mode === "login" ? <Login info={info} /> : <Signup info={info} />;
}

function Login({ info }: { info: ApiInfo }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.login(email, password); window.location.assign(nextPage()); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not sign in"); setBusy(false); }
  };
  return (
    <Card title="Sign in">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
        </div>
        <Password id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" variant="brand" className="w-full" disabled={busy || !email || !password}>{busy && <Loader2 className="animate-spin" />} Sign in</Button>
      </form>
      {info.signupOpen && <p className="mt-5 text-center text-sm text-muted-foreground">New here? <a className="text-brand hover:underline" href={signupUrl()}>Create an account</a></p>}
    </Card>
  );
}

function Signup({ info }: { info: ApiInfo }) {
  const first = !!info.needsSetup;
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", password: "", phone: "" });
  const [dob, setDob] = useState({ y: "", m: "", d: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const ready = f.firstName.trim() && f.lastName.trim() && f.email.trim() && f.password.length >= 10;

  if (!info.signupOpen) {
    return <Card title="Sign-up is closed"><p className="text-sm text-muted-foreground">Ask an administrator to add you, then <a className="text-brand hover:underline" href={loginUrl()}>sign in</a>.</p></Card>;
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.signup({ ...f, birthDate: joinDate(dob.y, dob.m, dob.d) });
      window.location.assign(nextPage());
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create the account"); setBusy(false); }
  };
  return (
    <Card title={first ? "Create the admin account" : "Create an account"} lead={first ? "This is the first account. It manages everyone else." : undefined}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label htmlFor="first">First name</Label><Input id="first" value={f.firstName} onChange={set("firstName")} autoComplete="given-name" autoFocus required /></div>
          <div className="space-y-1.5"><Label htmlFor="last">Last name</Label><Input id="last" value={f.lastName} onChange={set("lastName")} autoComplete="family-name" required /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={f.email} onChange={set("email")} autoComplete="email" required /></div>
        <Password id="password" label="Password" value={f.password} onChange={(v) => setF((x) => ({ ...x, password: v }))} hint="At least 10 characters. A few words work well." autoComplete="new-password" />
        <details className="group rounded-md border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm text-muted-foreground group-open:mb-3">Optional details</summary>
          <div className="space-y-3 pb-1">
            <div className="space-y-1.5"><Label htmlFor="phone">Phone</Label><Input id="phone" type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" /></div>
            <div className="space-y-1.5"><Label htmlFor="dob-day">Date of birth</Label><DatePicker idPrefix="dob" {...dob} onChange={setDob} /></div>
          </div>
        </details>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" variant="brand" className="w-full" disabled={busy || !ready}>{busy && <Loader2 className="animate-spin" />} {first ? "Create the admin account" : "Create account"}</Button>
      </form>
      {!first && <p className="mt-5 text-center text-sm text-muted-foreground">Have an account? <a className="text-brand hover:underline" href={loginUrl()}>Sign in</a></p>}
    </Card>
  );
}
