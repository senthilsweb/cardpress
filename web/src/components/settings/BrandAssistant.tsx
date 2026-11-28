import { useCallback, useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pane } from "@/components/ui/pane";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { ALERT_CHOICES, amountCents, amountText, assistantProblem, ROUND_CHOICES, type BrandAssistant as Settings, type BrandAssistantView } from "@/lib/brandAssistant";
import { withValue } from "@/lib/security";
import { attempt, FormSection, reason, SaveBar } from "./form";
import { useUnsaved } from "./guard";

/** How the assistant works for the open brand: its tier, checks and budget. Administrators only; the server refuses anyone else. */
export function BrandAssistant({ profileId, brandName }: { profileId: string; brandName: string }) {
  const [data, setData] = useState<BrandAssistantView | null>(null);
  const [edit, setEdit] = useState<Partial<Settings>>({});
  // the amount as typed, so that "25." can be on the way to "25.50"
  const [amount, setAmount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.brandAssistant(profileId).then(setData).catch((e) => setError(reason(e))), [profileId]);
  useEffect(() => { void load(); }, [load]);
  const value = data && { ...data.settings, ...edit, ...(amount === null ? {} : { monthCents: amountCents(amount) }) };
  const dirty = !!data && !!value && (Object.keys(value) as (keyof Settings)[]).some((k) => !Object.is(value[k], data.settings[k]));
  useUnsaved(dirty);

  if (!data || !value) {
    return <Pane>{error ? <Alert variant="destructive"><CircleAlert aria-hidden /><AlertDescription>{error}</AlertDescription></Alert> : <p className="text-sm text-muted-foreground">Loading…</p>}</Pane>;
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => { setError(null); setEdit((e) => ({ ...e, [k]: v })); };
  const clear = () => { setEdit({}); setAmount(null); setError(null); };
  const change = async (work: () => Promise<BrandAssistantView>, done: string, failed: string) => {
    setBusy(true);
    const why = await attempt(async () => { setData(await work()); setEdit({}); setAmount(null); }, done, failed);
    setError(why ?? null); setBusy(false);
  };
  const problem = dirty ? assistantProblem(value) : null;
  const tier = data.tiers.find((t) => t.id === value.tier);

  return (
    <Pane footer={
      <SaveBar dirty={dirty} busy={busy} problem={problem ?? error}
        onSave={() => { if (!problem) void change(() => api.saveBrandAssistant(profileId, value), "Assistant saved", "Assistant not saved"); }}
        onCancel={clear}
        extra={data.saved && !dirty ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void change(() => api.resetBrandAssistant(profileId), "Defaults restored", "Not restored")}>Use defaults</Button> : undefined} />
    }>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">For <span className="font-medium text-foreground">{brandName}</span>.</p>
        {data.tierGone && <Alert><CircleAlert aria-hidden /><AlertDescription>The saved tier is no longer offered. {tier?.name ?? "The first"} is used.</AlertDescription></Alert>}
        <FormSection title="Tier" about="Stronger models cost more. New conversations use it.">
          <div className="space-y-1">
            <Label htmlFor="ba-tier">Tier</Label>
            <Select value={value.tier} onValueChange={(v) => set("tier", v)}>
              <SelectTrigger id="ba-tier" className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>{data.tiers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!!tier?.models?.length && (
            <dl className="grid grid-cols-[9rem_1fr] gap-y-1 text-xs">
              {tier.models.map((m) => [<dt key={`${m.role} role`} className="text-muted-foreground">{m.role}</dt>, <dd key={m.role}>{m.model}</dd>])}
            </dl>
          )}
        </FormSection>
        <FormSection title="Checks" about="A grader reads each first draft and may send it back.">
          <div className="flex items-center gap-3">
            <Switch id="ba-checks" checked={value.checks} onCheckedChange={(v) => set("checks", v)} />
            <Label htmlFor="ba-checks">Check first drafts</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ba-rounds">Rounds at most</Label>
            <Select value={String(value.rounds)} disabled={!value.checks} onValueChange={(v) => set("rounds", Number(v))}>
              <SelectTrigger id="ba-rounds" className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{ROUND_CHOICES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </FormSection>
        <FormSection title="Budget" optional about="What the assistant may cost in a calendar month.">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label htmlFor="ba-month">Monthly budget (USD)</Label>
              <Input id="ba-month" inputMode="decimal" className="w-32" placeholder="None" value={amount ?? amountText(value.monthCents)} onChange={(e) => { setError(null); setAmount(e.target.value); }} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ba-alert">Alert at</Label>
              <Select value={String(value.alertPercent)} disabled={!(value.monthCents > 0)} onValueChange={(v) => set("alertPercent", Number(v))}>
                <SelectTrigger id="ba-alert" className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{withValue(ALERT_CHOICES, value.alertPercent).map((n) => <SelectItem key={n} value={String(n)}>{n}%</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </FormSection>
      </div>
    </Pane>
  );
}
