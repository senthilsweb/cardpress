import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { bgById, categoryOf, CATEGORIES, groupsIn } from "@/card/backgrounds";
import { findBackgrounds, type Scope } from "@/card/search";
import type { Design, Palette, Profile } from "@/lib/types";
import { sizeById } from "@/lib/sizes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SwitchField } from "./fields";
import { ScaledCard } from "./preview";

const SEP = "/";
const keyOf = (s: Scope) => [s.category ?? "", s.group ?? ""].join(SEP);
const scopeOf = (key: string): Scope => {
  const [category, group] = key.split(SEP);
  return { category: category || undefined, group: group || undefined };
};
/** The left list: all, each category, and the groups inside it. */
const places = () => [
  { key: keyOf({}), name: "All", sub: false },
  ...CATEGORIES.flatMap((c) => [
    { key: keyOf({ category: c }), name: c, sub: false },
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[88dvh] max-w-6xl max-sm:h-dvh max-sm:max-h-dvh max-sm:w-screen max-sm:rounded-none">
        <DialogHeader>
          <DialogTitle>Backgrounds</DialogTitle>
          <DialogDescription className="sr-only">Search or pick a category, select a background, then press Use.</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 max-sm:flex-col">
          <div className="flex w-56 shrink-0 flex-col gap-2 border-r border-border p-3 max-sm:w-full max-sm:border-b max-sm:border-r-0">
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus type="search" aria-label="Search backgrounds" placeholder="Search" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <nav aria-label="Categories" className="min-h-0 flex-1 overflow-y-auto max-sm:hidden">
              {places().map((p) => {
                const on = !query && place === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-current={on || undefined}
                    onClick={() => choose(p.key)}
                    className={cn("block w-full cursor-pointer truncate rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring", p.sub && "pl-6 text-muted-foreground", on && "bg-accent font-medium text-foreground")}
                  >
                    {p.name}
                  </button>
                );
              })}
            </nav>
            <div className="sm:hidden">
              <Select value={place} onValueChange={choose}>
                <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {places().map((p) => <SelectItem key={p.key} value={p.key}>{p.sub ? `· ${p.name}` : p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {!sections.length && <p role="status" className="py-10 text-center text-sm text-muted-foreground">Nothing matches “{query}”.</p>}
            {sections.map((s) => (
              <section key={`${s.category}${SEP}${s.group}`} className="mb-5">
                <h3 className="mb-2 text-[12px] font-medium text-muted-foreground">{s.group || s.category}</h3>
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
          </div>
        </div>
        <DialogFooter className="justify-between">
          <div className="min-w-0">
            {suggested ? <SwitchField id="match-colours" label={`Use matching colours (${suggested.name})`} checked={match} onChange={setMatch} /> : <span className="text-xs text-muted-foreground">{bgById(picked).name}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => use()}>Use</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
