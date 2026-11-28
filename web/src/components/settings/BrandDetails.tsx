import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { countries, detailsProblem, EMPTY_DETAILS, KIND_LABEL, sameDetails, type BrandDetails } from "@/lib/brandDetails";
import { FormSection } from "./form";

const PRIVATE = "Address and contact are private: never on a card or a public page, and not sent to the assistant.";

/** The fields of who a brand is, in sections. `website` is the brand's own field, shown among them where it can be set here. */
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
    <>
      <FormSection title="Who it is" optional about={PRIVATE}>
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
      </FormSection>
      <FormSection title="Address" optional>
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
      </FormSection>
      <FormSection title="Contact" optional about={website ? "A website can show in a card's footer." : undefined}>
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
      </FormSection>
    </>
  );
}

/** A saved brand's details as a page edits them: nothing is saved until the page says so. */
export function useBrandDetails(profileId: string) {
  const [saved, setSaved] = useState<BrandDetails | null>(null);
  const [draft, setDraft] = useState<BrandDetails>(EMPTY_DETAILS);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api.brandDetails(profileId).then((d) => { setSaved(d); setDraft(d); }).catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }, [profileId]);
  useEffect(load, [load]);
  const changed = !!saved && !sameDetails(saved, draft);
  const save = async () => { const d = await api.saveBrandDetails(profileId, draft); setSaved(d); setDraft(d); };
  const reset = () => { if (saved) setDraft(saved); };
  return { loaded: !!saved, draft, setDraft, changed, problem: detailsProblem(draft), error, load, save, reset };
}
