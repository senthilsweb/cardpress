import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ExternalLink, Eye, EyeOff, Loader2, Lock, PlugZap, Trash2, X } from "lucide-react";
import { Pane } from "@/components/ui/pane";
import { useUnsaved } from "@/components/settings/guard";
import { SaveBar } from "@/components/settings/form";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError, type NetworkSettings, type SettingsField, type SettingsView, type TestResult } from "@/lib/api";

const errMsg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

/** What the user typed for one network: field key -> text. Present only for fields they touched. */
type Edits = Record<string, string>;

const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

/** A field counts as changed when typed text differs from what the server showed. Secrets are shown masked, so any text counts. */
const baseline = (f: SettingsField) => (f.secret ? "" : f.value ?? "");
const changedFields = (net: NetworkSettings, edits: Edits) => net.fields.filter((f) => !f.locked && f.key in edits && edits[f.key] !== baseline(f));

function ResultView({ r }: { r: TestResult }) {
  const good = r.status === "valid";
  const left = r.expiresAt ? daysLeft(r.expiresAt) : undefined;
  return (
    <div role="status" className={good ? "rounded-md border border-brand/40 bg-accent p-3 text-xs" : "rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs"}>
      <p className="flex items-start gap-1.5 font-medium">
        {good ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
        {r.message}
      </p>
      {r.expiresAt && (
        <p className={left !== undefined && left < 14 ? "mt-1 text-amber-700 dark:text-amber-400" : "mt-1 text-muted-foreground"}>
          Token {left !== undefined && left < 0 ? "expired" : "expires"} {new Date(r.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          {left !== undefined && left >= 0 ? ` (in ${left} day${left === 1 ? "" : "s"})` : ""}
        </p>
      )}
      {r.checks && r.checks.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {r.checks.map((c, i) => (
            <li key={i} className="flex gap-1.5 text-muted-foreground">
              {c.ok ? <Check className="mt-0.5 h-3 w-3 shrink-0 text-brand" /> : <X className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />}
              <span>{c.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One network's fields. The Save and Test actions live in the page's footer. */
function NetworkFields({ net, edits, setEdit, canStore, busy, onRemove }: {
  net: NetworkSettings; edits: Edits; setEdit: (key: string, value: string) => void; canStore: boolean; busy: boolean;
  onRemove: (f: SettingsField) => Promise<void>;
}) {
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const status = net.complete ? "Ready" : net.fields.some((f) => f.set) ? "Incomplete" : "Not set up";

  const remove = async (f: SettingsField) => {
    if (confirmRemove !== f.key) { setConfirmRemove(f.key); window.setTimeout(() => setConfirmRemove((c) => (c === f.key ? null : c)), 3000); return; }
    setConfirmRemove(null);
    await onRemove(f);
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={net.complete ? "brand" : "outline"}>{status}</Badge>
        {!net.testable && <Badge variant="outline">Publishing not yet supported</Badge>}
        <span className="flex-1" />
        <a href={net.portalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-brand hover:underline">
          Developer portal <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {net.fields.map((f) => {
        const id = `${net.id}-${f.key}`;
        const typed = f.key in edits;
        const value = typed ? edits[f.key] : f.secret ? "" : f.value ?? "";
        const shown = reveal[f.key] && f.secret;
        return (
          <div key={f.key} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor={id}>{f.label}</Label>
              {f.locked && <Badge variant="outline" className="gap-1"><Lock className="h-2.5 w-2.5" /> Set by environment</Badge>}
              {f.unreadable && <Badge variant="warn">Cannot be read – enter it again</Badge>}
            </div>
            <div className="flex gap-1">
              <Input
                id={id}
                type={f.secret && !shown ? "password" : "text"}
                value={f.locked ? f.value ?? "" : value}
                disabled={f.locked}
                placeholder={f.secret && f.set ? `${f.value} – saved, type to replace` : f.secret ? "Paste it here" : ""}
                autoComplete="off" spellCheck={false} data-1p-ignore data-lpignore="true"
                onChange={(e) => setEdit(f.key, e.target.value)}
              />
              {f.secret && !f.locked && (
                <Button type="button" variant="outline" size="icon" title={shown ? "Hide" : "Show what you typed"} aria-label={`${shown ? "Hide" : "Show"} ${f.label}`} onClick={() => setReveal((r) => ({ ...r, [f.key]: !r[f.key] }))} disabled={!typed}>
                  {shown ? <EyeOff /> : <Eye />}
                </Button>
              )}
              {f.set && !f.locked && f.source === "stored" && (
                <Button type="button" variant={confirmRemove === f.key ? "destructive" : "outline"} size={confirmRemove === f.key ? "sm" : "icon"} aria-label={`Remove ${f.label}`} title="Remove the saved value" disabled={busy} onClick={() => void remove(f)}>
                  {confirmRemove === f.key ? "Confirm" : <Trash2 />}
                </Button>
              )}
            </div>
            {f.hint && <p className="text-[11px] leading-snug text-muted-foreground">{f.hint}</p>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Credentials for each network of one brand, kept encrypted on the server. The networks are tabs, and Save and Test
 * connection stay at the bottom for the selected one.
 */
export function SocialSettings({ profileId, brandName, onChanged }: { profileId: string; brandName: string; onChanged: () => void }) {
  const [view, setView] = useState<SettingsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState("linkedin");
  const [edits, setEdits] = useState<Record<string, Edits>>({});
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [results, setResults] = useState<Record<string, TestResult | null>>({});
  const top = useRef<HTMLSpanElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try { setView(await api.getSettings(profileId)); } catch (e) { setLoadError(errMsg(e)); }
  }, [profileId]);

  useEffect(() => { void load(); }, [load]);

  const net = view?.networks.find((n) => n.id === active) ?? view?.networks[0];
  const dirtyOf = (n: NetworkSettings) => changedFields(n, edits[n.id] ?? {}).length > 0;
  const anyDirty = !!view?.networks.some(dirtyOf);
  const dirty = net ? dirtyOf(net) : false;
  useUnsaved(anyDirty);
  const storingNeedsKey = !!net && !!view && !view.canStore && changedFields(net, edits[net.id] ?? {}).some((f) => (edits[net.id] ?? {})[f.key].trim() !== "");

  const replace = (n: NetworkSettings) => setView((v) => (v ? { ...v, networks: v.networks.map((x) => (x.id === n.id ? n : x)) } : v));
  const setErr = (id: string, e: string | null) => setErrors((x) => ({ ...x, [id]: e }));
  // results and errors appear at the top of the scrolling body, while the buttons are frozen below: bring them into view
  const toTop = () => top.current?.scrollIntoView({ block: "nearest" });

  const save = async () => {
    if (!net) return;
    setBusy("save"); setErr(net.id, null); setResults((r) => ({ ...r, [net.id]: null }));
    try {
      const out: Record<string, string | null> = {};
      for (const f of changedFields(net, edits[net.id] ?? {})) out[f.key] = (edits[net.id] ?? {})[f.key];
      replace(await api.putNetwork(profileId, net.id, out));
      onChanged();
      setEdits((e) => ({ ...e, [net.id]: {} }));
      toast.success(`${net.name} saved`);
    } catch (e) { setErr(net.id, errMsg(e)); toast.error(`${net.name} not saved`, { description: errMsg(e) }); toTop(); } finally { setBusy(null); }
  };

  const test = async () => {
    if (!net) return;
    setBusy("test"); setErr(net.id, null); setResults((r) => ({ ...r, [net.id]: null }));
    try { const res = await api.testNetwork(profileId, net.id); setResults((r) => ({ ...r, [net.id]: res })); }
    catch (e) { setErr(net.id, errMsg(e)); } finally { setBusy(null); toTop(); }
  };

  const removeField = async (n: NetworkSettings, f: SettingsField) => {
    setBusy("remove"); setErr(n.id, null); setResults((r) => ({ ...r, [n.id]: null }));
    try {
      replace(await api.putNetwork(profileId, n.id, { [f.key]: "" }));
      onChanged();
      setEdits((e) => { const { [f.key]: _gone, ...rest } = e[n.id] ?? {}; return { ...e, [n.id]: rest }; });
      toast.success(`${f.label} removed`);
    } catch (e) { setErr(n.id, errMsg(e)); toast.error(`${f.label} not removed`, { description: errMsg(e) }); } finally { setBusy(null); }
  };

  const footer = net && (
    <SaveBar dirty={dirty} busy={busy === "save"} problem={storingNeedsKey ? "Cannot save: no encryption key." : null}
      onSave={() => { if (busy === null && !storingNeedsKey) void save(); }}
      onCancel={() => { setEdits((e) => ({ ...e, [net.id]: {} })); setErr(net.id, null); }}
      extra={net.testable && (
        <Button variant="outline" size="sm" onClick={test} disabled={busy !== null || dirty || !net.complete} title={dirty ? "Save your changes first" : !net.complete ? "Fill in every field first" : undefined}>
          {busy === "test" ? <Loader2 className="animate-spin" /> : <PlugZap />} Test connection
        </Button>
      )} />
  );

  return (
    <Pane
      footer={footer}
      tabs={view && (
        <Tabs value={net?.id} onValueChange={setActive}>
          <TabsList className="grid w-full max-w-sm grid-cols-3">
            {view.networks.map((n) => (
              <TabsTrigger key={n.id} value={n.id}>
                {n.name}
                {dirtyOf(n) && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-label="unsaved changes" />}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
    >
      <div>
        <span ref={top} />
        <p className="text-xs leading-snug text-muted-foreground">
          Accounts for <b className="text-foreground">{brandName}</b>. Stored encrypted; only the last four characters are shown.
        </p>
        {loadError && (
          <div role="alert" className="space-y-2 pt-4 text-sm">
            <p className="text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button>
          </div>
        )}
        {!view && !loadError && <p className="flex items-center gap-2 pt-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
        {view && !view.canStore && (
          <div className="mt-4 flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <p>
              No encryption key. Set <code className="font-mono">CARDPRESS_SECRET_KEY</code> and restart.
            </p>
          </div>
        )}
        {net && errors[net.id] && <p role="alert" className="mt-4 text-xs text-destructive">{errors[net.id]}</p>}
        {net && results[net.id] && <div className="mt-4"><ResultView r={results[net.id]!} /></div>}
        {net && view && (
          <NetworkFields
            key={net.id}
            net={net}
            edits={edits[net.id] ?? {}}
            setEdit={(k, v) => setEdits((e) => ({ ...e, [net.id]: { ...(e[net.id] ?? {}), [k]: v } }))}
            canStore={view.canStore}
            busy={busy !== null}
            onRemove={(f) => removeField(net, f)}
          />
        )}
      </div>
    </Pane>
  );
}
