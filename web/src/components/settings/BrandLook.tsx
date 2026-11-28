import { useState } from "react";
import { ArrowLeft, CircleAlert, Loader2 } from "lucide-react";
import { ProfilePanel } from "@/components/studio/panels";
import { ScaledCard } from "@/components/studio/preview";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { DEFAULT_DESIGN, DEFAULT_PROFILES } from "@/lib/profiles";
import { fullDesign } from "@/lib/cardDesign";
import { sizeById } from "@/lib/sizes";
import { DetailsFields, useBrandDetails } from "./BrandDetails";
import { attempt, SaveBar } from "./form";
import { useUnsaved } from "./guard";
import type { Design, Profile } from "@/lib/types";

/** A brand's logo, fonts, colour sets and details, with its card beside them. Nothing is saved until Save. */
export function BrandLook({ profiles, id, design: savedDesign, onBack, onChanged }: { profiles: Profile[]; id: string; design?: Design; onBack: () => void; onChanged: () => void }) {
  const [saved, setSaved] = useState(() => profiles.find((p) => p.id === id) ?? profiles[0]);
  const [profile, setProfile] = useState(saved);
  const details = useBrandDetails(saved.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lookChanged = profile !== saved;
  const dirty = lookChanged || details.changed;
  useUnsaved(dirty);

  const design: Design = savedDesign ? fullDesign(DEFAULT_DESIGN, savedDesign) : DEFAULT_DESIGN;
  // which colour set is being edited, and shown on the card
  const [paletteId, setPaletteId] = useState(design.paletteId);
  const palette = profile.palettes.find((p) => p.id === paletteId) ?? profile.palettes[0];
  const update = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }));
  const problem = !profile.name.trim() ? "Give the brand a name." : details.changed ? details.problem : null;

  const save = async () => {
    if (problem || busy) return;
    setBusy(true); setError(null);
    const failed = await attempt(async () => {
      // this brand only, so that nothing of another brand is written
      if (lookChanged) { await api.saveProfile(profile); setSaved(profile); onChanged(); }
      if (details.changed) await details.save();
    }, "Brand saved", "Brand not saved");
    setError(failed ?? null); setBusy(false);
  };
  const cancel = () => { setProfile(saved); details.reset(); setError(null); };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 pb-3 max-sm:px-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-3 text-muted-foreground"><ArrowLeft /> Brands</Button>
        <h4 className="truncate text-sm font-semibold">{saved.name}</h4>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-full max-w-md shrink-0 overflow-y-auto lg:w-[26rem] lg:border-r lg:border-border">
          <ProfilePanel profile={profile} profiles={[profile]} paletteId={palette.id} updateProfile={update} setPaletteId={setPaletteId}
            resetProfiles={() => update({ ...DEFAULT_PROFILES[0], id: profile.id, name: profile.name, displayName: profile.displayName, handle: profile.handle, website: profile.website, logoText: profile.logoText })}
            importProfiles={(list) => update({ ...list[0], id: profile.id, name: profile.name })} />
          <div className="space-y-4 border-t border-border p-4">
            {!details.loaded && !details.error && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
            {details.error && <Alert variant="destructive"><CircleAlert aria-hidden /><AlertDescription>{details.error}</AlertDescription><Button variant="outline" size="sm" onClick={details.load}>Try again</Button></Alert>}
            {details.loaded && <DetailsFields value={details.draft} onChange={details.setDraft} />}
          </div>
        </div>
        <div className="canvas-grid hidden min-w-0 flex-1 items-center justify-center overflow-auto p-8 lg:flex">
          <ScaledCard design={{ ...design, paletteId: palette.id }} profile={profile} palette={palette} size={sizeById(design.sizeId)} maxW={400} maxH={440} />
        </div>
      </div>
      <div className="shrink-0 border-t border-border px-5 py-3 max-sm:px-4">
        <SaveBar dirty={dirty} busy={busy} problem={(dirty ? problem : null) ?? error} onSave={() => void save()} onCancel={cancel} />
      </div>
    </div>
  );
}
