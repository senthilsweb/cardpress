import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ProfilePanel } from "@/components/studio/panels";
import { ScaledCard } from "@/components/studio/preview";
import { api } from "@/lib/api";
import { DEFAULT_DESIGN, DEFAULT_PROFILES } from "@/lib/profiles";
import { fullDesign } from "@/lib/cardDesign";
import { sizeById } from "@/lib/sizes";
import { useSyncedState } from "@/lib/store";
import type { Design, Profile } from "@/lib/types";

/** A brand's logo, fonts and colour sets, with its card beside them. Saved as it is changed. */
export function BrandLook({ profiles, id, design: saved, onBack }: { profiles: Profile[]; id: string; design?: Design; onBack: () => void }) {
  const [all, setAll, error] = useSyncedState<Profile[]>(profiles, (v) => api.putProfiles(v));
  const [leaving, setLeaving] = useState(false);
  /** Going back does not wait out the pause before saving, so the last change is saved first. */
  const back = async () => {
    setLeaving(true);
    try { if (all !== profiles) await api.putProfiles(all); onBack(); } catch { setLeaving(false); toast.error("Not saved"); }
  };
  const profile = all.find((p) => p.id === id) ?? all[0];
  const design: Design = saved ? fullDesign(DEFAULT_DESIGN, saved) : DEFAULT_DESIGN;
  // which colour set is being edited, and shown on the card
  const [paletteId, setPaletteId] = useState(design.paletteId);
  const palette = profile.palettes.find((p) => p.id === paletteId) ?? profile.palettes[0];
  const update = (patch: Partial<Profile>) => setAll((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button type="button" onClick={() => void back()} disabled={leaving} className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Brands</button>
        <h1 className="truncate text-sm font-semibold">{profile.name}</h1>
        <span className="flex-1" />
        {error && <span role="status" className="text-xs text-destructive">Not saved</span>}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-full max-w-md shrink-0 overflow-y-auto lg:border-r lg:border-border">
          <ProfilePanel profile={profile} profiles={[profile]} paletteId={palette.id} updateProfile={update} setPaletteId={setPaletteId}
            resetProfiles={() => update({ ...DEFAULT_PROFILES[0], id: profile.id, name: profile.name, displayName: profile.displayName, handle: profile.handle, website: profile.website, logoText: profile.logoText })}
            importProfiles={(list) => update({ ...list[0], id: profile.id, name: profile.name })} />
        </div>
        <div className="canvas-grid hidden min-w-0 flex-1 items-center justify-center overflow-auto p-8 lg:flex">
          <ScaledCard design={{ ...design, paletteId: palette.id }} profile={profile} palette={palette} size={sizeById(design.sizeId)} maxW={520} maxH={520} />
        </div>
      </div>
    </div>
  );
}
