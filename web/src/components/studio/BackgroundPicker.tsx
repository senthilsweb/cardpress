import { useEffect, useState } from "react";
import { Layers, LayoutGrid } from "lucide-react";
import { bgById, categoryOf, CATEGORIES, groupsIn } from "@/card/backgrounds";
import { findBackgrounds, type Scope } from "@/card/search";
import type { Design, Palette, Profile } from "@/lib/types";
import { sizeById } from "@/lib/sizes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PanelDialog, type PanelEntry } from "@/components/ui/panel-dialog";
import { SwitchField } from "./fields";
import { ScaledCard } from "./preview";

const SEP = "/";
const keyOf = (s: Scope) => [s.category ?? "", s.group ?? ""].join(SEP);
const scopeOf = (key: string): Scope => {
  const [category, group] = key.split(SEP);
  return { category: category || undefined, group: group || undefined };
};
/** The left list: all, each category, and the groups inside it. */
const places = (): PanelEntry[] => [
  { key: keyOf({}), name: "All", icon: <LayoutGrid aria-hidden /> },
  ...CATEGORIES.flatMap((c) => [
    { key: keyOf({ category: c }), name: c, icon: <Layers aria-hidden /> },
    ...groupsIn(c).filter((g) => g.group).map((g) => ({ key: keyOf({ category: c, group: g.group }), name: g.group, sub: true })),
  ]),
];

/**
 * Choosing a background: search, categories on the left, and the person's own card drawn with each one. Nothing changes
 * until Use.
 */
export function BackgroundPicker({ open, onOpenChange, design, profile, onUse }: {
  open: boolean; onOpenChange: (open: boolean) => void; design: Design; profile: Profile; onUse: (patch: Partial<Design>) => void;
}) {
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState("");
  const [picked, setPicked] = useState(design.background);
  const [match, setMatch] = useState(true);
  // each opening starts where the card is now
  useEffect(() => {
    if (!open) return;
    const b = bgById(design.background);
    setQuery("");
    setPicked(design.background);
    setPlace(keyOf({ category: categoryOf(b), group: b.group }));
    setMatch(true);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const size = sizeById(design.sizeId);
  const paletteOf = (id?: string): Palette | undefined => profile.palettes.find((p) => p.id === id);
  const current = paletteOf(design.paletteId) ?? profile.palettes[0];
  const suggested = paletteOf(bgById(picked).palette);
  const sections = open ? findBackgrounds(query, scopeOf(place)) : [];
  const tall = size.h > size.w;

  const use = (id = picked) => {
    const colours = match ? paletteOf(bgById(id).palette) : undefined;
    onUse({ background: id, ...(colours ? { paletteId: colours.id } : {}) });
    onOpenChange(false);
  };
  const choose = (p: string) => { setQuery(""); setPlace(p); };
  const [all, ...categories] = places();
  const heading = query ? "Search results" : places().find((p) => p.key === place)?.name ?? all.name;
  const found = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <PanelDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Backgrounds"
      description="Search or pick a category, select a background, then press Use."
      search={{ value: query, onChange: setQuery, label: "Search backgrounds" }}
      groups={[{ items: [all] }, { name: "Categories", items: categories }]}
      picked={query ? "" : place}
      onPick={choose}
      listLabel="Categories"
      heading={heading}
      subline={found ? `${found} ${found === 1 ? "background" : "backgrounds"}` : `Nothing matches “${query}”.`}
      footer={
        <>
          <div className="min-w-0">
            {suggested ? <SwitchField id="match-colours" label={`Use matching colours (${suggested.name})`} checked={match} onChange={setMatch} /> : <span className="text-xs text-muted-foreground">{bgById(picked).name}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => use()}>Use</Button>
          </div>
        </>
      }
    >
      {sections.map((s) => (
        <section key={`${s.category}${SEP}${s.group}`} className="mb-5">
          {(s.group || s.category) !== heading && <h4 className="mb-2 text-[12px] font-medium text-muted-foreground">{s.group || s.category}</h4>}
          <div className={cn("grid gap-3", tall ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3")}>
            {s.items.map((b) => {
              const on = picked === b.id;
              const palette = (match && paletteOf(b.palette)) || current;
              return (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={b.name}
                  onClick={() => setPicked(b.id)}
                  onDoubleClick={() => use(b.id)}
                  className={cn("cursor-pointer overflow-hidden rounded-lg border bg-card text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-brand ring-2 ring-brand" : "border-border hover:border-brand/50")}
                >
                  <Thumb design={{ ...design, background: b.id, paletteId: palette.id }} profile={profile} palette={palette} />
                  <span className="block border-t border-border px-2.5 py-1.5">
                    <span className="block truncate text-[12.5px] font-medium">{b.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {b.needs && !(b.needs === "photos" ? design.photos.length : b.needs === "screenshot" ? design.screenshot : design.bgImage) ? "Add the image in Design" : b.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </PanelDialog>
  );
}

/** The card as large as its tile is wide. */
function Thumb({ design, profile, palette }: { design: Design; profile: Profile; palette: Palette }) {
  const [width, setWidth] = useState(0);
  const [node, setNode] = useState<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!node) return;
    const watch = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    watch.observe(node);
    return () => watch.disconnect();
  }, [node]);
  const size = sizeById(design.sizeId);
  return (
    <span ref={setNode} aria-hidden className="pointer-events-none block w-full" style={{ aspectRatio: `${size.w} / ${size.h}` }}>
      {width > 0 && <ScaledCard design={design} profile={profile} palette={palette} size={size} maxW={width} maxH={(width * size.h) / size.w} rounded={false} />}
    </span>
  );
}
