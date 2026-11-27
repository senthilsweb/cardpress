import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Search } from "lucide-react";
import { moveTo, tabStop, type PanelGroup, type PanelItem } from "@/lib/panel";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PanelEntry = PanelItem & { icon?: ReactNode };

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

/**
 * The large dialog: a title bar, a left column with search and grouped places, and a right pane with a heading, a line
 * about it, optional actions and tabs, and a footer that stays put. On a phone it fills the screen and the left column
 * becomes a drop-down. Ctrl or ⌘ K goes to the search.
 */
export function PanelDialog({ open, onOpenChange, title, description, search, groups, picked, onPick, listLabel, heading, subline, actions, tabs, footer, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Read by screen readers: what to do here. */
  description: string;
  search: { value: string; onChange: (value: string) => void; label: string };
  groups: PanelGroup<PanelEntry>[];
  /** The marked place; empty while the search spans them all. */
  picked: string;
  onPick: (key: string) => void;
  listLabel: string;
  heading: string;
  subline?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const box = useRef<HTMLInputElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  // the button that opened it, which has no Dialog trigger of its own: closing goes back to it
  const opener = useRef<HTMLElement | null>(null);
  const items = groups.flatMap((g) => g.items);
  const stop = tabStop(groups, picked);

  // another place starts at its top
  useEffect(() => { pane.current?.scrollTo(0, 0); }, [picked]);

  const shortcut = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    box.current?.focus();
    box.current?.select();
  };
  const arrows = (e: KeyboardEvent<HTMLElement>) => {
    const buttons = [...e.currentTarget.querySelectorAll("button")];
    const to = moveTo(e.key, buttons.indexOf(e.target as HTMLButtonElement), buttons.length);
    if (to === null) return;
    e.preventDefault();
    buttons[to].focus();
    onPick(items[to].key);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onKeyDown={shortcut}
        onOpenAutoFocus={(e) => { e.preventDefault(); opener.current = document.activeElement as HTMLElement | null; box.current?.focus(); }}
        onCloseAutoFocus={(e) => { e.preventDefault(); opener.current?.focus(); }}
        className="h-[90dvh] max-h-[90dvh] max-w-[1200px] overflow-hidden max-sm:h-dvh max-sm:max-h-dvh max-sm:w-screen max-sm:rounded-none"
      >
        <DialogHeader className="py-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 max-sm:flex-col">
          <div className="flex w-60 shrink-0 flex-col gap-3 border-r border-border bg-card p-3 max-sm:w-full max-sm:gap-2 max-sm:border-b max-sm:border-r-0">
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input ref={box} type="search" aria-label={search.label} aria-keyshortcuts="Control+K Meta+K" placeholder="Search" className="pl-8 pr-12" value={search.value} onChange={(e) => search.onChange(e.target.value)} />
              {!search.value && <kbd aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 font-sans text-[10.5px] text-muted-foreground max-sm:hidden">{isMac() ? "⌘K" : "Ctrl K"}</kbd>}
            </div>
            <nav aria-label={listLabel} onKeyDown={arrows} className="min-h-0 flex-1 overflow-y-auto max-sm:hidden">
              {groups.map((g, n) => (
                <div key={g.name ?? n} role={g.name ? "group" : undefined} aria-label={g.name} className="mb-3 last:mb-0">
                  {g.name && <p aria-hidden className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.name}</p>}
                  {g.items.map((p) => {
                    const on = picked === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        tabIndex={p.key === stop ? 0 : -1}
                        aria-current={on || undefined}
                        onClick={() => onPick(p.key)}
                        className={cn("flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0", p.sub && "pl-7 text-muted-foreground", on && "bg-accent font-medium text-foreground")}
                      >
                        {p.icon}
                        <span className="truncate">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="sm:hidden">
              <Select value={picked} onValueChange={onPick}>
                <SelectTrigger aria-label={listLabel}><SelectValue placeholder={heading} /></SelectTrigger>
                <SelectContent>
                  {items.map((p) => <SelectItem key={p.key} value={p.key}>{p.sub ? `· ${p.name}` : p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4 max-sm:px-4">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold tracking-tight">{heading}</h3>
                {subline && <p role="status" className="mt-0.5 text-xs text-muted-foreground">{subline}</p>}
              </div>
              {actions && <div className="flex gap-2">{actions}</div>}
            </div>
            {tabs && <div className="px-5 pt-3 max-sm:px-4">{tabs}</div>}
            <div ref={pane} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 max-sm:px-4">{children}</div>
          </div>
        </div>
        {footer && <DialogFooter className="justify-between">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
