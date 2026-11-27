import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { countries, detailsProblem, EMPTY_DETAILS, KIND_LABEL, sameDetails, type BrandDetails } from "@/lib/brandDetails";
import { useUnsaved } from "./guard";

/** The fields of who a brand is. `website` is the brand's own field, shown among them where it can be set here. */
export function DetailsFields({ value, onChange, website }: { value: BrandDetails; onChange: (v: BrandDetails) => void; website?: { value: string; onChange: (v: string) => void } }) {
  const id = useId();
  const all = useMemo(() => countries(), []);
  const field = (key: keyof BrandDetails, label: string, more: React.ComponentProps<"input"> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input id={`${id}-${key}`} value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })} autoComplete="off" {...more} />
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-kind`}>Type</Label>
        {/* a drop-down line cannot be empty, so "not set" has a name of its own */}
        <Select value={value.kind || "none"} onValueChange={(v) => onChange({ ...value, kind: (v === "none" ? "" : v) as BrandDetails["kind"] })}>
          <SelectTrigger id={`${id}-kind`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not set</SelectItem>
            {Object.entries(KIND_LABEL).map(([k, name]) => <SelectItem key={k} value={k}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {field("legalName", value.kind === "individual" ? "Full name" : value.kind === "company" ? "Company name" : "Name (company or person)", { maxLength: 160 })}
      {field("line1", "Address line 1", { maxLength: 160 })}
      {field("line2", "Address line 2", { maxLength: 160 })}
      <div className="grid grid-cols-2 gap-3">
        {field("city", "City", { maxLength: 80 })}
        {field("region", "State or region", { maxLength: 80 })}
        {field("postalCode", "Postal code", { maxLength: 20 })}
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-country`}>Country</Label>
          <Combobox id={`${id}-country`} searchLabel="Search countries" value={value.country} onChange={(country) => onChange({ ...value, country })}
            options={[{ value: "", label: "Not set" }, ...all.map((c) => ({ value: c.code, label: c.name }))]} />
        </div>
      </div>
      {website && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-website`}>Website</Label>
          <Input id={`${id}-website`} value={website.value} onChange={(e) => website.onChange(e.target.value)} autoComplete="off" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {field("mobile", "Mobile", { type: "tel", maxLength: 31, placeholder: "+1 555 010 0000" })}
        {field("email", "Email", { type: "email", maxLength: 254 })}
      </div>
    </div>
  );
}

/** A saved brand's details, with their own Save. */
export function BrandDetailsSection({ profileId }: { profileId: string }) {
  const [saved, setSaved] = useState<BrandDetails | null>(null);
  const [draft, setDraft] = useState<BrandDetails>(EMPTY_DETAILS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api.brandDetails(profileId).then((d) => { setSaved(d); setDraft(d); }).catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }, [profileId]);
  useEffect(load, [load]);
  const changed = !!saved && !sameDetails(saved, draft);
  useUnsaved(changed);
  const problem = detailsProblem(draft);

  const save = async () => {
    setBusy(true); setError(null);
    try { const d = await api.saveBrandDetails(profileId, draft); setSaved(d); setDraft(d); toast.success("Details saved"); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); }
  };

  return (
    <section aria-label="Details" className="space-y-3 border-t border-border px-4 py-4">
      <div>
        <h4 className="eyebrow">Details</h4>
        <p className="mt-1 text-xs text-muted-foreground">Private: never on a card or a public page, and not sent to the assistant.</p>
      </div>
      {!saved && !error && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
      {saved && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (changed && !problem) void save(); }}>
          <DetailsFields value={draft} onChange={setDraft} />
          <div className="flex items-center justify-end gap-2">
            {(problem || error) && <p role="alert" className="mr-auto text-xs text-destructive">{problem ?? error}</p>}
            <Button type="submit" size="sm" variant="brand" disabled={!changed || !!problem || busy}>{busy && <Loader2 className="animate-spin" />} Save details</Button>
          </div>
        </form>
      )}
      {!saved && error && <div role="alert" className="space-y-2 text-sm"><p className="text-destructive">{error}</p><Button variant="outline" size="sm" onClick={load}>Try again</Button></div>}
    </section>
  );
}
