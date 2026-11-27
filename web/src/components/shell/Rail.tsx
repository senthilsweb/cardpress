import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, CircleHelp, FileText, Moon, PanelLeftClose, PanelLeftOpen, PenLine, Plus, Settings, SlidersHorizontal, Sun } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AccountMenu } from "@/components/studio/AccountMenu";
import { openSettings, SettingsHost } from "@/components/settings/SettingsDialog";
import { LogoMark } from "@/components/studio/Logo";
import { initials } from "@/lib/brands";
import { calendarHref, helpHref, libraryHref, SETTINGS_GROUPS, settingsHref, studioHref, visibleSections, type Area } from "@/lib/nav";
import { useSession } from "@/lib/session";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ShellProps {
  area: Area;
  /** The page under the area that is open: a settings section, or the library's "post" or "article" ("" for all). */
  sub?: string;
  brands: Profile[];
  activeId: string;
  colors: Record<string, string>;
  switching?: boolean;
  onSwitchBrand: (id: string) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  /** The studio's work column, which can be hidden (Ctrl/⌘ + \). */
  panel?: { hidden: boolean; toggle: () => void };
  /** Called before going to another page, to save what is being typed. */
  onLeave?: () => void;
  /** A page under the area already open is handled on the page instead of loading it again. */
  onSub?: (sub: string) => void;
  /** The open page's main controls, shown in the middle of the header. */
  header?: React.ReactNode;
  /** The page. */
  children: React.ReactNode;
}

interface Entry { id: string; label: string; href: string; external?: boolean }
interface Group { title?: string; entries: Entry[] }
interface Item { id: Area; label: string; href?: string; icon: React.ReactNode; groups?: Group[] }

/** The brand's square: its colour and initials. */
function BrandTile({ name, color }: { name: string; color: string }) {
  return (
    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[12px] font-bold text-white" style={{ background: color }}>
      {initials(name)}
    </span>
  );
}

const COMPACT = "cardpress.sidebar.compact";

/**
 * The frame of every signed-in page: a header (the logo, the brand, the page's controls, light or dark, the guide and the
 * person), a side bar naming each area, and the page on its own surface. An area with pages (Library, Settings) opens a
 * panel beside the bar listing them; the others go straight to their page. On narrow screens the side bar is along the
 * bottom.
 */
export function Shell({ area, sub, brands, activeId, colors, switching = false, onSwitchBrand, theme, onToggleTheme, panel, onLeave, onSub, header, children }: ShellProps) {
  const { user, can } = useSession();
  const [open, setOpen] = useState<Item["id"] | null>(null);
  const [compact, setCompact] = useState(() => { try { return localStorage.getItem(COMPACT) === "1"; } catch { return false; } });
  const toggleCompact = () => setCompact((v) => { try { localStorage.setItem(COMPACT, v ? "0" : "1"); } catch { /* not remembered */ } return !v; });
  const root = useRef<HTMLDivElement>(null);
  const active = brands.find((b) => b.id === activeId) ?? brands[0];
  const color = colors[active?.id] ?? "#888";

  const settings = visibleSections(!!user, can);
  const items: Item[] = [
    { id: "studio", label: "Studio", href: studioHref(), icon: <PenLine /> },
    { id: "library", label: "Library", icon: <FileText />, groups: [{ entries: [
      { id: "", label: "All", href: libraryHref() },
      { id: "post", label: "Posts", href: libraryHref("post") },
      { id: "article", label: "Articles", href: libraryHref("article") },
    ] }] },
    { id: "calendar", label: "Calendar", href: calendarHref(), icon: <CalendarDays /> },
    { id: "help", label: "Guide", href: helpHref(), icon: <CircleHelp /> },
    { id: "settings", label: "Settings", icon: <Settings />, groups: SETTINGS_GROUPS.map((title) => ({
      title, entries: settings.filter((s) => s.group === title).map((s) => ({ id: s.id, label: s.label, href: settingsHref(s.id) })),
    })).filter((g) => g.entries.length) },
  ];
  const shown = items.find((i) => i.id === open);

  // the panel closes on Esc or a press outside it
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    const down = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(null); };
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", down);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("pointerdown", down); };
  }, [open]);

  const follow = (e: React.MouseEvent, it: Item, entry: Entry) => {
    setOpen(null);
    if (entry.external) return;
    if (it.id === area && onSub) { e.preventDefault(); onSub(entry.id); window.history.replaceState(null, "", entry.href); return; }
    onLeave?.();
  };

  const brandMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Brand ${active?.name ?? ""}. Switch brand`} title="Switch brand"
          className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md border border-head-line py-1 pl-1 pr-2 outline-none hover:bg-head-hover focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-head-hover">
          <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded text-[10px] font-bold text-white" style={{ background: color }}>{initials(active?.name ?? "")}</span>
          <span className="max-w-40 truncate text-[13px] font-semibold max-sm:hidden">{active?.name ?? ""}</span>
          <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" sideOffset={8} className="w-[280px]">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Brands</DropdownMenuLabel>
        {brands.map((b) => (
          <DropdownMenuItem key={b.id} onSelect={() => { if (b.id !== activeId) onSwitchBrand(b.id); }} className={cn("gap-3 py-2", b.id === activeId && "bg-muted")}>
            <BrandTile name={b.name} color={colors[b.id] ?? "#888"} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{b.name}</span>
              {b.handle && <span className="block truncate text-xs text-muted-foreground">{b.handle}</span>}
            </span>
            {b.id === activeId && <Check className="text-brand" aria-label="Open" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openSettings(settingsHref("brands", "?new=1"))}><Plus /> New brand…</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openSettings(settingsHref("brands"))}><SlidersHorizontal /> Manage brands…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const headButton = "grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md outline-none hover:bg-head-hover focus-visible:ring-2 focus-visible:ring-ring [&_svg]:h-[18px] [&_svg]:w-[18px]";
  const entry = (on: boolean) => cn(
    "relative flex w-full cursor-pointer flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11.5px] font-medium leading-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-side-fg [&>svg:first-child]:h-[20px] [&>svg:first-child]:w-[20px]",
    on ? "border-side-muted/40 bg-side-on text-side-fg" : "border-transparent text-side-muted hover:bg-side-hover hover:text-side-fg",
  );
  const labelled = (it: Item) => (
    <>
      {it.icon}
      <span className={cn(compact && "sr-only")}>{it.label}</span>
      {it.groups && <ChevronRight aria-hidden className="absolute right-0.5 top-1/2 h-3 w-3 -translate-y-1/2 opacity-70" />}
    </>
  );
  const small = "grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-side-muted outline-none hover:bg-side-hover hover:text-side-fg focus-visible:ring-2 focus-visible:ring-side-fg [&_svg]:h-[18px] [&_svg]:w-[18px]";
  const tip = (label: string, node: React.ReactNode, hide = false) => (
    <Tooltip open={hide ? false : undefined}>
      <TooltipTrigger asChild>{node}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh flex-col bg-side">
        <header className="on-head relative z-40 flex h-12 shrink-0 items-center gap-2 border-b border-head-line bg-head px-2 lg:h-[52px] lg:px-3">
          <a href={studioHref()} onClick={onLeave} className="flex shrink-0 items-center gap-2 rounded-md pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="CardPress, the studio">
            <LogoMark size={28} />
            <span className="text-[15px] font-bold tracking-tight max-sm:hidden">CardPress</span>
          </a>
          {brandMenu}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{header}</div>
          <button type="button" onClick={onToggleTheme} className={headButton} aria-label={theme === "dark" ? "Light mode" : "Dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}>
            {theme === "dark" ? <Sun /> : <Moon />}
          </button>
          <a href={helpHref()} onClick={onLeave} className={cn(headButton, "max-sm:hidden")} aria-label="User guide" title="User guide"><CircleHelp /></a>
          <AccountMenu name={active?.name ?? ""} color={color} theme={theme} onToggleTheme={onToggleTheme} side="bottom" />
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* wide screens: the side bar, and the panel of the area pressed */}
          <div ref={root} className="relative z-30 hidden shrink-0 lg:flex">
            <nav aria-label="Main" className={cn("flex flex-col items-center gap-1 overflow-y-auto bg-side px-1.5 py-2", compact ? "w-[60px]" : "w-[84px]")}>
              {items.map((it) => {
                const here = it.id === area;
                const node = it.groups
                  ? <button type="button" aria-expanded={open === it.id} aria-current={here ? "page" : undefined} onClick={() => setOpen(open === it.id ? null : it.id)} className={entry(here || open === it.id)}>{labelled(it)}</button>
                  : <a href={it.href} aria-current={here ? "page" : undefined} onClick={() => { setOpen(null); onLeave?.(); }} className={entry(here)}>{labelled(it)}</a>;
                return <div key={it.id} className="w-full">{compact ? tip(it.label, node, open === it.id) : node}</div>;
              })}
              <div className="flex-1" />
              {panel && tip(`${panel.hidden ? "Show" : "Hide"} the work column (Ctrl/⌘ + \\)`,
                <button type="button" onClick={panel.toggle} aria-pressed={panel.hidden} aria-label={panel.hidden ? "Show the work column" : "Hide the work column"} className={small}>
                  {panel.hidden ? <PanelLeftOpen /> : <PanelLeftClose />}
                </button>)}
              {tip(compact ? "Show the names" : "Icons only",
                <button type="button" onClick={toggleCompact} aria-pressed={compact} aria-label={compact ? "Show the names in the side bar" : "Show icons only"} className={small}>
                  {compact ? <ChevronsRight /> : <ChevronsLeft />}
                </button>)}
            </nav>

            {shown?.groups && (
              <div role="region" aria-label={shown.label}
                className="absolute inset-y-0 left-full w-64 overflow-y-auto bg-side-panel px-4 py-5 text-side-muted shadow-[8px_0_30px_rgba(0,0,0,0.25)]">
                <h2 className="mb-3 px-3 text-[16px] font-semibold text-side-fg">{shown.label}</h2>
                {shown.groups.map((g, i) => (
                  <div key={i} className={cn(i > 0 && "mt-5")}>
                    {g.title && <h3 className="mb-1.5 px-3 text-[13px] font-semibold text-side-fg">{g.title}</h3>}
                    <ul className="flex flex-col">
                      {g.entries.map((e) => {
                        const on = shown.id === area && sub === e.id;
                        return (
                          <li key={e.id || "all"}>
                            <a href={e.href} onClick={(ev) => follow(ev, shown, e)} aria-current={on ? "page" : undefined}
                              {...(e.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                              className={cn("block rounded-md px-3 py-2 text-[14px] hover:bg-side-hover hover:text-side-fg", on && "bg-side-on font-medium text-side-fg")}>
                              {e.label}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* the page, on its own surface set into the frame */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:pb-[var(--frame-pad)] lg:pr-[var(--frame-pad)]" aria-busy={switching || undefined}>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground lg:flex-row lg:rounded-xl">{children}</div>
          </div>

          {/* narrow screens: a bar along the bottom */}
          <nav aria-label="Main" className="flex shrink-0 justify-around gap-1 bg-side px-2 py-1.5 lg:hidden">
            {items.filter((i) => i.id !== "help").map((it) => {
              const href = it.href ?? (it.id === "library" ? libraryHref() : settingsHref());
              return (
                <a key={it.id} href={href} onClick={onLeave} aria-current={it.id === area ? "page" : undefined}
                  className={cn("flex flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-1 text-[10.5px] font-medium [&_svg]:h-[18px] [&_svg]:w-[18px]", it.id === area ? "bg-side-on text-side-fg" : "text-side-muted")}>
                  {it.icon}{it.label}
                </a>
              );
            })}
          </nav>
        </div>
      </div>
      <SettingsHost onLeave={onLeave} />
    </TooltipProvider>
  );
}
