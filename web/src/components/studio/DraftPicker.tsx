import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { Draft, DraftKind } from "@/lib/draft";
import { draftName, searchDrafts } from "@/lib/draftSearch";
import { cn } from "@/lib/utils";

const SHOWN = 50; // more than this is not read; typing narrows it
const STATUS = { draft: "Draft", approved: "Approved", scheduled: "Scheduled", published: "Published" } as const;
const KINDS: { value: DraftKind | "all"; text: string }[] = [{ value: "all", text: "All" }, { value: "post", text: "Posts" }, { value: "article", text: "Articles" }];
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

/** Choose the item to work on by typing part of its name or text. */
export function DraftPicker({ drafts, currentId, onPick }: { drafts: Draft[]; currentId: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<DraftKind | "all">("all");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = drafts.find((d) => d.id === currentId);
  // searched only while open: the list is not worked out on every keystroke in the editor
  const found = useMemo(() => (open ? searchDrafts(drafts, query, kind) : []), [open, drafts, query, kind]);
  const shown = found.slice(0, SHOWN);

  const show = () => { setQuery(""); setActive(0); setOpen(true); };
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const pick = (d: Draft) => { close(); if (d.id !== currentId) onPick(d.id); };

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => setActive(0), [query, kind]);
  useEffect(() => { list.current?.children[active]?.scrollIntoView({ block: "nearest" }); }, [active]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, Math.min(shown.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))); }
    else if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); if (shown[active]) pick(shown[active]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label="Choose a draft" onClick={() => (open ? close() : show())}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); show(); } }}
        className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0 flex-1 truncate">{current ? `${current.kind === "article" ? "Article" : "Post"} · ${draftName(current)}` : "Choose a draft"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div role="dialog" aria-label="Find a draft" className="off-head absolute right-0 top-full z-50 mt-1 w-[min(420px,90vw)] overflow-hidden rounded-lg border border-border bg-card shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} placeholder="Search posts and articles" role="combobox" aria-expanded="true"
              aria-controls={id} aria-activedescendant={shown[active] ? `${id}-${shown[active].id}` : undefined} aria-label="Search posts and articles"
              className="h-10 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground" />
          </div>
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
            {KINDS.map((k) => (
              <button key={k.value} type="button" aria-pressed={kind === k.value} onClick={() => setKind(k.value)}
                className={cn("cursor-pointer rounded px-2 py-0.5 text-xs font-medium", kind === k.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{k.text}</button>
            ))}
            <span className="flex-1" />
            <span role="status" className="text-[11px] text-muted-foreground">{found.length > SHOWN ? `${SHOWN} of ${found.length} · type to narrow` : `${found.length}`}</span>
          </div>
          <ul ref={list} id={id} role="listbox" aria-label="Drafts" className="max-h-[min(360px,50vh)] overflow-y-auto p-1">
            {shown.map((d, i) => (
              <li key={d.id} id={`${id}-${d.id}`} role="option" aria-selected={d.id === currentId} onPointerMove={() => setActive(i)} onClick={() => pick(d)}
                className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5", i === active && "bg-accent")}>
                <Check className={cn("h-3.5 w-3.5 shrink-0 text-brand", d.id !== currentId && "invisible")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{draftName(d)}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{d.kind === "article" ? "Article" : "Post"} · {STATUS[d.status]} · {day(d.updatedAt)}</span>
                </span>
              </li>
            ))}
          </ul>
          {!shown.length && <p className="px-3 py-4 text-center text-xs text-muted-foreground">Nothing matches.</p>}
        </div>
      )}
    </div>
  );
}
