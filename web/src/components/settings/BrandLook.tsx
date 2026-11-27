import { useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ProfilePanel } from "@/components/studio/panels";
import { ScaledCard } from "@/components/studio/preview";
import { api } from "@/lib/api";
import { DEFAULT_DESIGN, DEFAULT_PROFILES } from "@/lib/profiles";
import { fullDesign } from "@/lib/cardDesign";
import { sizeById } from "@/lib/sizes";
import { useSyncedState } from "@/lib/store";
import { useFlush } from "./guard";
import { BrandDetailsSection } from "./BrandDetails";
import type { Design, Profile } from "@/lib/types";

/** A brand's logo, fonts and colour sets, with its card beside them. Saved as it is changed. */
export function BrandLook({ profiles, id, design: saved, onBack, onChanged }: { profiles: Profile[]; id: string; design?: Design; onBack: () => void; onChanged: () => void }) {
  const [all, setAll, error] = useSyncedState<Profile[]>(profiles, (v) => api.putProfiles(v));
  const changed = useRef(false);
  const latest = useRef(all);
  latest.current = all;
  // leaving does not wait out the pause before saving, so the last change is saved first
  useFlush(async () => { if (changed.current) await api.putProfiles(latest.current); });
  const profile = all.find((p) => p.id === id) ?? all[0];
  const design: Design = saved ? fullDesign(DEFAULT_DESIGN, saved) : DEFAULT_DESIGN;
  // which colour set is being edited, and shown on the card
  const [paletteId, setPaletteId] = useState(design.paletteId);
  const palette = profile.palettes.find((p) => p.id === paletteId) ?? profile.palettes[0];
  const update = (patch: Partial<Profile>) => { changed.current = true; onChanged(); setAll((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p))); };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 pb-3 max-sm:px-4">
        <button type="button" onClick={onBack} className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Brands</button>
        <h4 className="truncate text-sm font-semibold">{profile.name}</h4>
        <span className="flex-1" />
        {error && <span role="status" className="text-xs text-destructive">Not saved</span>}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-full max-w-md shrink-0 overflow-y-auto lg:w-[26rem] lg:border-r lg:border-border">
          <ProfilePanel profile={profile} profiles={[profile]} paletteId={palette.id} updateProfile={update} setPaletteId={setPaletteId}
            resetProfiles={() => update({ ...DEFAULT_PROFILES[0], id: profile.id, name: profile.name, displayName: profile.displayName, handle: profile.handle, website: profile.website, logoText: profile.logoText })}
            importProfiles={(list) => update({ ...list[0], id: profile.id, name: profile.name })} />
          <BrandDetailsSection profileId={profile.id} />
        </div>
        <div className="canvas-grid hidden min-w-0 flex-1 items-center justify-center overflow-auto p-8 lg:flex">
          <ScaledCard design={{ ...design, paletteId: palette.id }} profile={profile} palette={palette} size={sizeById(design.sizeId)} maxW={400} maxH={440} />
        </div>
      </div>
    </div>
  );
}
