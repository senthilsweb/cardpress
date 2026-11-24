import { useRef, useState } from "react";
import {
  AlignCenter, BookOpen, FileDown, FileUp, Hash, LayoutPanelLeft, Plus, Quote, RotateCcw, Shuffle, Trash2, UserRound,
} from "lucide-react";
import type { BackgroundId, Design, LayoutId, MarkKind, Palette, Profile } from "@/lib/types";
import { BACKGROUNDS } from "@/card/backgrounds";
import { LAYOUTS } from "@/card/Card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { addGoogleFont, FONT_ROLES, resolveFonts, useFonts, ensureFont } from "@/lib/fonts";
import { AreaField, ColorField, Field, ImageField, Section, SliderField, SwitchField, TextField } from "./fields";
import { MiniBackground } from "./preview";
import { cn } from "@/lib/utils";
import { downloadBlob } from "@/lib/export";

type SetDesign = (patch: Partial<Design>) => void;

const LAYOUT_ICONS: Record<LayoutId, typeof LayoutPanelLeft> = {
  hero: LayoutPanelLeft, center: AlignCenter, cover: BookOpen, quote: Quote, stat: Hash, split: UserRound,
};

/* ======================================================= Content */
export function ContentPanel({ design, set }: { design: Design; set: SetDesign }) {
  const L = design.layout;
  return (
    <>
      <Section title="Text">
        {L === "cover" && <TextField id="tag" label="Series tag" value={design.tag} onChange={(v) => set({ tag: v })} placeholder="Part 3 · AI-DLC" />}
        {L !== "quote" && <TextField id="eyebrow" label="Eyebrow" value={design.eyebrow} onChange={(v) => set({ eyebrow: v })} />}
        {L === "stat" && <TextField id="stat" label="Big number" value={design.statValue} onChange={(v) => set({ statValue: v })} placeholder="10x" />}
        <AreaField id="title" label={L === "quote" ? "Quote" : L === "stat" ? "What the number means" : "Title"} value={design.title} onChange={(v) => set({ title: v })} hint="Press Enter for a new line." rows={L === "quote" ? 4 : 2} />
        {L === "quote" ? (
          <TextField id="author" label="Author" value={design.quoteAuthor} onChange={(v) => set({ quoteAuthor: v })} />
        ) : (
          <TextField id="subtitle" label="Subtitle" value={design.subtitle} onChange={(v) => set({ subtitle: v })} hint="Use | to split into points." />
        )}
        <div className="grid grid-cols-2 gap-2">
          <TextField id="footerl" label="Footer, left" value={design.footerLeft ?? ""} onChange={(v) => set({ footerLeft: v })} placeholder="your website" hint="Empty = your website." />
          <TextField id="footer" label="Footer, right" value={design.footer} onChange={(v) => set({ footer: v })} placeholder="your handle" hint="Bottom right. Empty = your handle." />
        </div>
      </Section>
      <Section title="Images">
        <ImageField
          label="Photos for the mosaic"
          hint="For Photo mosaic. The first one also stands in as the headshot."
          values={design.photos}
          onChange={(v) => set({ photos: v })}
          multiple
          max={12}
          maxPx={700}
        />
        <ImageField label="App screenshot" hint="Shown inside the Browser frame background." values={design.screenshot ? [design.screenshot] : []} onChange={(v) => set({ screenshot: v[0] })} maxPx={1800} />
        <ImageField label="Background image" hint="For the Own image background." values={design.bgImage ? [design.bgImage] : []} onChange={(v) => set({ bgImage: v[0] })} maxPx={2000} />
      </Section>
    </>
  );
}

/* ======================================================= Design */
export function DesignPanel({ design, set, profile, palette }: { design: Design; set: SetDesign; profile: Profile; palette: Palette }) {
  return (
    <>
      <Section title="Layout">
        <div className="grid grid-cols-3 gap-2">
          {LAYOUTS.map((l) => {
            const Icon = LAYOUT_ICONS[l.id];
            const on = design.layout === l.id;
            return (
              <button
                key={l.id}
                type="button"
                title={l.hint}
                onClick={() => set({ layout: l.id })}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1.5 rounded-md border px-2 py-2.5 text-[11.5px] transition-colors",
                  on ? "border-brand bg-accent text-foreground" : "border-border bg-card text-muted-foreground hover:border-brand/50 hover:text-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4", on && "text-brand")} />
                {l.name}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Background"
        action={
          <Button variant="ghost" size="sm" onClick={() => set({ seed: 1 + Math.floor(Math.random() * 99999) })}>
            <Shuffle /> Shuffle
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          {BACKGROUNDS.map((b) => {
            const on = design.background === b.id;
            const missing =
              (b.needs === "photos" && !design.photos.length) ||
              (b.needs === "screenshot" && !design.screenshot) ||
              (b.needs === "image" && !design.bgImage);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => set({ background: b.id as BackgroundId })}
                className={cn("group cursor-pointer overflow-hidden rounded-md border text-left transition-colors", on ? "border-brand ring-1 ring-brand" : "border-border hover:border-brand/50")}
              >
                <div className="aspect-video w-full">
                  <MiniBackground id={b.id} palette={palette} seed={design.seed} photos={design.photos} screenshot={design.screenshot} image={design.bgImage} />
                </div>
                <div className="bg-card px-2 py-1.5">
                  <div className="flex items-center justify-between gap-1 text-[12px] font-medium">
                    {b.name}
                    {missing && <Badge variant="warn">add</Badge>}
                  </div>
                  <div className="truncate text-[10.5px] text-muted-foreground">{b.hint}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Colours">
        <div className="grid grid-cols-2 gap-2">
          {profile.palettes.map((p) => {
            const on = design.paletteId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => set({ paletteId: p.id })}
                className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[12px]", on ? "border-brand ring-1 ring-brand" : "border-border hover:border-brand/50")}
              >
                <span className="flex h-6 w-10 shrink-0 overflow-hidden rounded border border-border">
                  <span className="flex-[2]" style={{ background: p.base }} />
                  <span className="flex-1" style={{ background: p.accent }} />
                  <span className="flex-1" style={{ background: p.sub }} />
                </span>
                <span className="truncate">{p.name}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">Edit colour sets in Profile.</p>
      </Section>

      <Section title="Fonts (this card)">
        <p className="text-[11px] leading-snug text-muted-foreground">This card only. Default uses the profile fonts.</p>
        <div className="grid grid-cols-2 gap-2">
          {FONT_ROLES.map((r) => {
            const inherited = resolveFonts(profile)[r.id];
            return (
              <Field key={r.id} label={r.label}>
                <FontSelect inherit={inherited} value={design.fonts?.[r.id]} onChange={(v) => {
                  const next = { ...(design.fonts ?? {}) };
                  if (v) next[r.id] = v; else delete next[r.id];
                  set({ fonts: Object.keys(next).length ? next : undefined });
                }} />
              </Field>
            );
          })}
        </div>
      </Section>

      <Section title="Fine tune">
        <SliderField label="Title size" value={design.titleScale} min={0.6} max={1.5} step={0.05} onChange={(v) => set({ titleScale: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <SliderField label="Background strength" value={design.intensity} min={0} max={1} step={0.05} onChange={(v) => set({ intensity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <SliderField label="Bottom fade" value={design.bottomFade} min={0} max={1} step={0.05} onChange={(v) => set({ bottomFade: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <SwitchField id="logo" label="Show logo" checked={design.showLogo} onChange={(v) => set({ showLogo: v })} />
        <SwitchField id="foot" label="Show footer" checked={design.showFooter} onChange={(v) => set({ showFooter: v })} />
      </Section>
    </>
  );
}

/* ======================================================= Fonts */
const DEFAULT_VALUE = "__default";
const CATEGORY_LABEL = { sans: "Sans", serif: "Serif", display: "Display", mono: "Mono" } as const;

/** Font picker. With `inherit`, an empty value means "use the profile / built-in default". */
function FontSelect({ value, onChange, inherit }: { value?: string; onChange: (v: string | undefined) => void; inherit?: string }) {
  const fonts = useFonts();
  const label = (f: string) => f.replace(" Variable", "");
  return (
    <Select
      value={value || (inherit ? DEFAULT_VALUE : fonts[0].family)}
      onValueChange={(v) => { if (v !== DEFAULT_VALUE) void ensureFont(v); onChange(v === DEFAULT_VALUE ? undefined : v); }}
    >
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {inherit !== undefined && <SelectItem value={DEFAULT_VALUE}>Default ({label(inherit)})</SelectItem>}
        {(["sans", "serif", "display", "mono"] as const).map((cat) => {
          const list = fonts.filter((f) => f.category === cat);
          return list.length ? (
            <SelectGroup key={cat}>
              <SelectLabel>{CATEGORY_LABEL[cat]}</SelectLabel>
              {list.map((f) => <SelectItem key={f.family} value={f.family}>{label(f.family)}</SelectItem>)}
            </SelectGroup>
          ) : null;
        })}
      </SelectContent>
    </Select>
  );
}

function AddGoogleFont() {
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    const err = await addGoogleFont(name);
    setMsg(err);
    if (!err) setName("");
    setBusy(false);
  };
  return (
    <Field label="Add a Google font" hint={msg || "A name from fonts.google.com, e.g. Lexend."} >
      <div className="flex gap-1.5">
        <Input value={name} onChange={(e) => { setName(e.target.value); setMsg(""); }} placeholder="Lexend" onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
        <Button variant="outline" size="sm" onClick={() => void add()} disabled={busy}>{busy ? "…" : "Add"}</Button>
      </div>
    </Field>
  );
}

/* ======================================================= Profile */

export function ProfilePanel(props: {
  profile: Profile;
  profiles: Profile[];
  paletteId: string;
  updateProfile: (patch: Partial<Profile>) => void;
  setPaletteId: (id: string) => void;
  resetProfiles: () => void;
  importProfiles: (list: Profile[]) => void;
}) {
  const { profile: pr, updateProfile: up } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  const pal = pr.palettes.find((p) => p.id === props.paletteId) ?? pr.palettes[0];
  const setPal = (patch: Partial<Palette>) => up({ palettes: pr.palettes.map((p) => (p.id === pal.id ? { ...p, ...patch } : p)) });

  const addPalette = () => {
    const id = `custom-${Date.now().toString(36)}`;
    up({ palettes: [...pr.palettes, { ...pal, id, name: `${pal.name} copy` }] });
    props.setPaletteId(id);
  };
  const removePalette = () => {
    if (pr.palettes.length < 2) return;
    const rest = pr.palettes.filter((p) => p.id !== pal.id);
    up({ palettes: rest });
    props.setPaletteId(rest[0].id);
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ kind: "cardpress/profiles", version: 1, profiles: props.profiles }, null, 2)], { type: "application/json" });
    downloadBlob(blob, "cardpress-profiles.json");
  };
  const importJson = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const list: Profile[] = Array.isArray(data) ? data : data.profiles;
      if (Array.isArray(list) && list.every((p) => p.id && Array.isArray(p.palettes) && p.palettes.length)) props.importProfiles(list);
    } catch {
      /* ignore bad files */
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      <Section title="Profile">
        <TextField id="pname" label="Profile name" value={pr.name} onChange={(v) => up({ name: v })} />
        <div className="grid grid-cols-2 gap-2">
          <TextField id="dname" label="Display name" value={pr.displayName} onChange={(v) => up({ displayName: v })} />
          <TextField id="handle" label="Handle" value={pr.handle} onChange={(v) => up({ handle: v })} />
        </div>
        <TextField id="web" label="Website" value={pr.website} onChange={(v) => up({ website: v })} />
      </Section>

      <Section title="Logo">
        <div className="grid grid-cols-2 gap-2">
          <TextField id="ltext" label="Logo text" value={pr.logoText} onChange={(v) => up({ logoText: v })} />
          <TextField id="lsub" label="Small line" value={pr.logoSub} onChange={(v) => up({ logoSub: v })} />
        </div>
        <Field label="Small line position">
          <ToggleGroup type="single" value={pr.logoSubPos === "below" ? "below" : "above"} onValueChange={(v) => { if (v) up({ logoSubPos: v as "above" | "below" }); }}>
            <ToggleGroupItem value="above">Above</ToggleGroupItem>
            <ToggleGroupItem value="below">Below</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field label="Mark">
          <Select value={pr.mark} onValueChange={(v) => up({ mark: v as MarkKind })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="diamond">Diamond</SelectItem>
              <SelectItem value="initial">First letter in a box</SelectItem>
              <SelectItem value="image">Logo image</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {pr.mark === "image" && (
          <ImageField label="Logo image" hint="PNG or SVG with transparent background works best." values={pr.logoImage ? [pr.logoImage] : []} onChange={(v) => up({ logoImage: v[0] })} maxPx={600} keepPng />
        )}
        <ImageField label="Headshot" hint="For the Headshot layout and feed preview." values={pr.headshot ? [pr.headshot] : []} onChange={(v) => up({ headshot: v[0] })} maxPx={800} />
      </Section>

      <Section title="Fonts">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Titles"><FontSelect value={pr.displayFont} onChange={(v) => v && up({ displayFont: v })} /></Field>
          <Field label="Body"><FontSelect value={pr.bodyFont} onChange={(v) => v && up({ bodyFont: v })} /></Field>
          <Field label="Labels"><FontSelect inherit={resolveFonts(pr).label} value={pr.labelFont} onChange={(v) => up({ labelFont: v })} /></Field>
          <Field label="Logo text"><FontSelect inherit={resolveFonts(pr).logo} value={pr.logoFont} onChange={(v) => up({ logoFont: v })} /></Field>
          <Field label="Big number"><FontSelect inherit={resolveFonts(pr).stat} value={pr.statFont} onChange={(v) => up({ statFont: v })} /></Field>
        </div>
        <AddGoogleFont />
      </Section>

      <Section
        title="Colour set"
        action={
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" title="Copy this colour set" onClick={addPalette}><Plus /></Button>
            <Button variant="ghost" size="icon-sm" title="Delete this colour set" onClick={removePalette} disabled={pr.palettes.length < 2}><Trash2 /></Button>
          </div>
        }
      >
        <Field label="Editing">
          <Select value={pal.id} onValueChange={props.setPaletteId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{pr.palettes.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <TextField id="palname" label="Name" value={pal.name} onChange={(v) => setPal({ name: v })} />
        <div className="grid grid-cols-3 gap-2">
          <ColorField label="Background" value={pal.base} onChange={(v) => setPal({ base: v })} />
          <ColorField label="Text" value={pal.text} onChange={(v) => setPal({ text: v })} />
          <ColorField label="Accent" value={pal.accent} onChange={(v) => setPal({ accent: v })} />
          <ColorField label="Highlight" value={pal.sub} onChange={(v) => setPal({ sub: v })} />
          <ColorField label="Fade" value={pal.fade} onChange={(v) => setPal({ fade: v })} />
        </div>
      </Section>

      <Section title="Backup">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportJson}><FileDown /> Export JSON</Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><FileUp /> Import JSON</Button>
          <Button variant="ghost" size="sm" onClick={props.resetProfiles}><RotateCcw /> Reset</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Saved in this browser. Export to move them.</p>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => importJson(e.target.files?.[0])} />
      </Section>
    </>
  );
}

/* ======================================================= Post */
