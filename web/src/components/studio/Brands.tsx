import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Copy, Loader2, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Pane } from "@/components/ui/pane";
import { useUnsaved } from "@/components/settings/guard";
import { attempt, FormSection } from "@/components/settings/form";
import { DetailsFields } from "@/components/settings/BrandDetails";
import { detailsProblem, EMPTY_DETAILS, KIND_LABEL, sameDetails, type BrandDetails } from "@/lib/brandDetails";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brandProblem, buildBrand } from "@/lib/brands";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

function Dot({ color }: { color: string }) {
  return <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10" style={{ background: color }} />;
}

/** Create a brand: blank, or a copy of another brand's look (never its accounts, drafts or posts). */
export function NewBrand({ onClose, brands, current, source, onCreate }: {
  onClose: () => void;
  brands: Profile[];
  /** The open brand, offered as the thing to copy. */
  current: Profile;
  /** A brand chosen to copy from elsewhere (Duplicate); when set the copy option starts selected. */
  source?: Profile;
  onCreate: (profile: Profile, from?: Profile, details?: BrandDetails) => Promise<void>;
}) {
  const [details, setDetails] = useState<BrandDetails>(EMPTY_DETAILS);
  const [website, setWebsite] = useState("");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [copy, setCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const from = source ?? current;

  const first = { name: source ? `${source.name} copy` : "", handle: source?.handle ?? "" };
  useEffect(() => {
    setName(first.name); setHandle(first.handle); setCopy(!!source); setError(null); setBusy(false);
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps
  // once it is being made there is nothing left to lose
  const filled = !sameDetails(details, EMPTY_DETAILS);

  const problem = brandProblem(name, brands);
  const wrong = detailsProblem(details);
  useUnsaved(!busy && (name !== first.name || handle !== first.handle || filled || website !== ""));
  const submit = async () => {
    if (problem || wrong || busy) return;
    setBusy(true); setError(null);
    const built = buildBrand({ name, handle, from: copy ? from : undefined }, brands.map((b) => b.id));
    const failed = await attempt(() => onCreate(website.trim() ? { ...built, website: website.trim() } : built, copy ? from : undefined, filled ? details : undefined), "Brand created", "Brand not created");
    if (failed) { setError(failed); setBusy(false); }
  };

  return (
    <Pane
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {(wrong || error) && <p role="alert" className="mr-auto text-xs text-destructive">{wrong ?? error}</p>}
          <Button variant="cancel" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="gold" size="sm" onClick={() => void submit()} disabled={!!problem || !!wrong || busy}>{busy ? <Loader2 className="animate-spin" /> : <Plus />} Create brand</Button>
        </div>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <FormSection title="Brand">
        <div className="space-y-1.5">
          <Label htmlFor="nb-name">Brand name (required)</Label>
          <Input id="nb-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" />
          {name.trim() !== "" && problem && <p className="text-xs text-destructive">{problem}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nb-handle">Handle (optional)</Label>
          <Input id="nb-handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@yourbrand" autoComplete="off" />
        </div>
        </FormSection>
        <FormSection title="Start from">
          <RadioGroup aria-label="Start from" value={String(copy)} onValueChange={(v) => setCopy(v === "true")}>
          {([[false, "Blank"], [true, `A copy of “${from.name}”`]] as const).map(([val, label]) => (
            <label key={String(val)} className={cn("flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm", copy === val ? "border-brand bg-accent" : "border-border hover:border-brand/50")}>
              <RadioGroupItem value={String(val)} className="mt-0.5" />
              <span>
                {label}
                {val && <span className="block text-xs text-muted-foreground">Logo, colours and fonts. Not accounts or posts.</span>}
              </span>
            </label>
          ))}
          </RadioGroup>
        </FormSection>
        <DetailsFields value={details} onChange={setDetails} website={{ value: website, onChange: setWebsite }} />
      </form>
    </Pane>
  );
}

/** A brand's name, being changed in its row of the list. */
function RenameBrand({ brand, others, onSave, onClose }: { brand: Profile; others: Profile[]; onSave: (name: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(brand.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = brandProblem(name, others);
  useUnsaved(!busy && name !== brand.name);
  const save = async () => {
    if (problem || busy) return;
    if (name.trim() === brand.name) return onClose();
    setBusy(true); setError(null);
    const failed = await attempt(() => onSave(name.trim()), "Name saved", "Name not saved");
    if (failed) { setError(failed); setBusy(false); } else onClose();
  };
  return (
    <form data-escape="local" className="min-w-0 flex-1 space-y-1.5" onSubmit={(e) => { e.preventDefault(); void save(); }} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <div className="flex items-center gap-1.5">
        <Input autoFocus aria-label="Brand name" value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} maxLength={80} autoComplete="off" className="h-8 min-w-0 flex-1" />
        <Button type="button" size="sm" variant="cancel" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" size="sm" variant="brand" disabled={!!problem || busy}>{busy && <Loader2 className="animate-spin" />} Save</Button>
      </div>
      {(error ?? problem) && <p role="alert" className="text-xs text-destructive">{error ?? problem}</p>}
    </form>
  );
}

type Confirm = { kind: "archive" | "delete"; id: string } | null;

/** Open, reorder, duplicate and archive brands; restore or delete archived ones. */
export function ManageBrands({ kinds = {}, active, archived, activeId, colors, onOpen, onRename, onLook, onMove, onDuplicate, onArchive, onRestore, onDelete, onNew }: {
  /** Each brand's type, where one is set. */
  kinds?: Record<string, BrandDetails["kind"]>;
  active: Profile[];
  archived: Profile[];
  activeId: string;
  colors: Record<string, string>;
  onOpen: (id: string) => Promise<void>;
  /** Give a brand another name. Nothing on its cards or posts changes. */
  onRename?: (id: string, name: string) => Promise<void>;
  /** Edit a brand's name, logo, fonts and colours. */
  onLook?: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => Promise<void>;
  onDuplicate: (p: Profile) => void;
  onArchive: (id: string) => Promise<{ scheduled: number }>;
  onRestore: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onNew: () => void;
}) {
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (key: string, done: string, failed: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null); setNotice(null);
    setError((await attempt(fn, done, failed)) ?? null);
    setBusy(null); setConfirm(null);
  };
  const [renaming, setRenaming] = useState<string | null>(null);
  const nameOf = (id: string) => [...active, ...archived].find((p) => p.id === id)?.name ?? "";

  // a plain function, not a component, so a name being typed is not lost when the list draws again
  const row = (p: Profile, i: number) => {
    const isOpen = p.id === activeId;
    const asking = confirm?.kind === "archive" && confirm.id === p.id;
    return (
      <li key={p.id} className="space-y-2 rounded-md border border-border bg-card p-2.5">
        <div className="flex items-center gap-2">
          <Dot color={colors[p.id] ?? "#888"} />
          {onRename && renaming === p.id ? (
            <RenameBrand brand={p} others={[...active, ...archived].filter((x) => x.id !== p.id)} onSave={(name) => onRename(p.id, name)} onClose={() => setRenaming(null)} />
          ) : (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                {onRename && <Button variant="ghost" size="icon-sm" className="h-6 w-6 shrink-0" title="Rename" aria-label={`Rename ${p.name}`} disabled={!!busy} onClick={() => setRenaming(p.id)}><Pencil /></Button>}
                {kinds[p.id] ? <span className="ml-1 rounded border border-border px-1.5 text-[10.5px] text-muted-foreground">{KIND_LABEL[kinds[p.id] as "company" | "individual"]}</span> : null}
                {isOpen && <span className="ml-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-brand">Open</span>}
              </div>
              {p.handle && <p className="truncate text-xs text-muted-foreground">{p.handle}</p>}
            </div>
          )}
          <Button variant="ghost" size="icon-sm" aria-label={`Move ${p.name} up`} disabled={i === 0 || !!busy} onClick={() => void run(`up-${p.id}`, "Order saved", "Order not saved", () => onMove(p.id, -1))}><ArrowUp /></Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Move ${p.name} down`} disabled={i === active.length - 1 || !!busy} onClick={() => void run(`down-${p.id}`, "Order saved", "Order not saved", () => onMove(p.id, 1))}><ArrowDown /></Button>
        </div>
        {asking ? (
          <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
            <p>Archive <b>{p.name}</b>? It is hidden, and everything is kept. Posts already scheduled still go out.</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="cancel" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button size="sm" variant="brand" disabled={!!busy} onClick={() => void run(`archive-${p.id}`, `${p.name} archived`, "Not archived", async () => {
                const r = await onArchive(p.id);
                if (r.scheduled > 0) setNotice(`${p.name} is archived. ${r.scheduled} scheduled post${r.scheduled === 1 ? "" : "s"} will still go out.`);
              })}>{busy === `archive-${p.id}` ? <Loader2 className="animate-spin" /> : <Archive />} Archive</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {!isOpen && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run(`open-${p.id}`, `${p.name} is open`, "Not opened", () => onOpen(p.id))}>Open</Button>}
            {onLook && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => onLook(p.id)}><Palette /> Edit</Button>}
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => onDuplicate(p)}><Copy /> Duplicate</Button>
            <Button size="sm" variant="ghost" disabled={!!busy || active.length < 2} title={active.length < 2 ? "Keep at least one brand" : undefined} onClick={() => setConfirm({ kind: "archive", id: p.id })}><Archive /> Archive</Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <Pane>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{active.length} {active.length === 1 ? "brand" : "brands"}</p>
          <Button variant="gold" size="sm" onClick={onNew}><Plus /> New brand</Button>
        </div>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
        <ul className="space-y-2">{active.map(row)}</ul>

        {archived.length > 0 && (
          <section className="space-y-2 border-t border-border pt-3">
            <h3 className="eyebrow">Archived</h3>
            <ul className="space-y-2">
              {archived.map((p) => {
                const asking = confirm?.kind === "delete" && confirm.id === p.id;
                return (
                  <li key={p.id} className="space-y-2 rounded-md border border-border bg-card p-2.5">
                    <div className="flex items-center gap-2">
                      <Dot color={colors[p.id] ?? "#888"} />
                      <p className="min-w-0 flex-1 truncate text-sm">{p.name}</p>
                      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void run(`restore-${p.id}`, `${p.name} restored`, "Not restored", () => onRestore(p.id))}>{busy === `restore-${p.id}` ? <Loader2 className="animate-spin" /> : <ArchiveRestore />} Restore</Button>
                      <Button size="sm" variant="ghost" disabled={!!busy} aria-label={`Delete ${p.name} for good`} onClick={() => setConfirm({ kind: "delete", id: p.id })}><Trash2 /></Button>
                    </div>
                    {asking && (
                      <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs">
                        <p>Delete <b>{nameOf(p.id)}</b> for good? Its drafts, posts, conversations and accounts go with it. This cannot be undone.</p>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="cancel" onClick={() => setConfirm(null)}>Cancel</Button>
                          <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => void run(`delete-${p.id}`, `${p.name} deleted`, "Not deleted", () => onDelete(p.id))}>{busy === `delete-${p.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete</Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </Pane>
  );
}
