import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pane } from "@/components/ui/pane";
import { api, type ApiInfo } from "@/lib/api";
import { amountCents, amountText, MAX_SERVER_MONTH_CENTS, type AssistantView } from "@/lib/brandAssistant";
import { BudgetBar } from "./BudgetBar";
import { attempt, FormSection, reason, SaveBar } from "./form";
import { useUnsaved } from "./guard";

/** Whether the assistant is connected (set up on the server; read only), and what every brand together may spend. */
export function AssistantSettings() {
  const [info, setInfo] = useState<ApiInfo | null>(null);
  const [data, setData] = useState<AssistantView | null>(null);
  // the amount as typed; null while it is what was saved
  const [amount, setAmount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.info().then(setInfo).catch((e) => setError(reason(e)));
    // a server without accounts has no administrator to set an amount
    api.assistant().then(setData).catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  const cents = data ? (amount === null ? data.settings.monthCents : amountCents(amount)) : 0;
  const dirty = !!data && !Object.is(cents, data.settings.monthCents);
  useUnsaved(dirty);
  const problem = dirty && (!Number.isInteger(cents) || cents < 0 || cents > MAX_SERVER_MONTH_CENTS) ? `Monthly budget: up to ${MAX_SERVER_MONTH_CENTS / 100}, or empty for none.` : null;
  const change = async (work: () => Promise<AssistantView>, done: string, failed: string) => {
    setBusy(true);
    const why = await attempt(async () => { setData(await work()); setAmount(null); }, done, failed);
    setError(why ?? null); setBusy(false);
  };
  const agent = info?.agent;

  return (
    <Pane footer={data ? (
      <SaveBar dirty={dirty} busy={busy} problem={problem ?? error}
        onSave={() => { if (!problem) void change(() => api.saveAssistant({ monthCents: cents }), "Assistant saved", "Assistant not saved"); }}
        onCancel={() => { setAmount(null); setError(null); }}
        extra={data.saved && !dirty ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void change(api.resetAssistant, "Defaults restored", "Not restored")}>Use defaults</Button> : undefined} />
    ) : undefined}>
      <div className="space-y-4 text-sm">
        {error && !data && <p role="alert" className="text-destructive">{error}</p>}
        {!info && !error && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
        {info && (
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
            <dt className="text-muted-foreground">Status</dt>
            <dd>{agent?.ready ? <span className="font-medium text-brand">Connected</span> : "Not set up"}</dd>
            <dt className="text-muted-foreground">Name</dt><dd>{agent?.name ?? "None"}</dd>
            <dt className="text-muted-foreground">Server</dt><dd>{info.name} {info.version}</dd>
          </dl>
        )}
        <p className="text-xs text-muted-foreground">The assistant is set up on the server. It works for administrators, in their own brands.</p>
        {data && (
          <FormSection title="Budget" optional about="What every brand together may cost in a calendar month.">
            <BudgetBar budget={data.budget} />
            <div className="space-y-1">
              <Label htmlFor="as-month">Monthly budget (USD)</Label>
              <Input id="as-month" inputMode="decimal" className="w-32" placeholder="None" value={amount ?? amountText(data.settings.monthCents)} onChange={(e) => { setError(null); setAmount(e.target.value); }} />
            </div>
            <p className="text-xs text-muted-foreground">Each brand's own budget is under Brand assistant.</p>
          </FormSection>
        )}
      </div>
    </Pane>
  );
}
