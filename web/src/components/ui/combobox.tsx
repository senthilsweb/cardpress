import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { findOptions, type Option } from "@/lib/options";
import { cn } from "@/lib/utils";

/** A drop-down for a long list: it opens with a search box. Arrows move, Enter picks, Esc closes. */
export function Combobox({ id, value, options, onChange, placeholder = "Choose", searchLabel = "Search" }: {
  id?: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const shown = useMemo(() => (open ? findOptions(options, query) : []), [open, options, query]);
  const current = options.find((o) => o.value === value);

  const change = (o: boolean) => { if (o) { setQuery(""); setActive(Math.max(0, options.findIndex((x) => x.value === value))); } setOpen(o); };
  const pick = (o: Option) => { setOpen(false); if (o.value !== value) onChange(o.value); };
  useEffect(() => { list.current?.children[active]?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  const keys = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, Math.min(shown.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))); }
    else if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); if (shown[active]) pick(shown[active]); }
  };

  return (
    <Popover open={open} onOpenChange={change} modal>
      <PopoverTrigger id={id} type="button" role="combobox" aria-expanded={open}
        className="flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <span className={cn("truncate", !current?.value && "text-muted-foreground")}>{current?.label ?? placeholder}</span>
        <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={searchLabel} className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={keys} placeholder="Search" aria-label={searchLabel}
            aria-controls={listId} aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
            className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        </div>
        <ul ref={list} id={listId} role="listbox" aria-label={searchLabel} className="max-h-[min(16rem,40vh)] overflow-y-auto p-1">
          {shown.map((o, i) => (
            <li key={o.value} id={`${listId}-${i}`} role="option" aria-selected={o.value === value} onPointerMove={() => setActive(i)} onClick={() => pick(o)}
              className={cn("flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm", i === active && "bg-accent text-accent-foreground")}>
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              <Check aria-hidden className={cn("h-4 w-4 shrink-0", o.value !== value && "invisible")} />
            </li>
          ))}
        </ul>
        {!shown.length && <p className="px-3 py-3 text-center text-xs text-muted-foreground">Nothing matches.</p>}
      </PopoverContent>
    </Popover>
  );
}
