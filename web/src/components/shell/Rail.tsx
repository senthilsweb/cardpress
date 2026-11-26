import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronsUpDown, FileText, PanelLeftClose, PanelLeftOpen, PenLine, Plus, Settings, SlidersHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AccountMenu } from "@/components/studio/AccountMenu";
import { LogoMark } from "@/components/studio/Logo";
import { initials } from "@/lib/brands";
import { libraryHref, settingsHref, studioHref, visibleSections, type Area } from "@/lib/nav";
import { useSession } from "@/lib/session";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface RailProps {
  area: Area;
  /** The entry under the area that is open: a settings section, or the library's "post" or "article" ("" for all). */
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
  /** An entry under the area already open is handled on the page instead of loading it again. */
  onSub?: (sub: string) => void;
}

interface Entry { id: string; label: string; href: string }
interface Item { id: Area; label: string; href: string; icon: React.ReactNode; children?: Entry[] }

const FOLD_KEY = "cardpress.nav.folded";
function useFolded() {
  const [folded, setFolded] = useState(() => { try { return localStorage.getItem(FOLD_KEY) === "1"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(FOLD_KEY, folded ? "1" : "0"); } catch { /* only not remembered */ } }, [folded]);
  return [folded, () => setFolded((f) => !f)] as const;
}

/** The brand's square: its colour and initials. */
function BrandTile({ name, color }: { name: string; color: string }) {
  return (
    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[12px] font-bold text-white" style={{ background: color }}>
      {initials(name)}
    </span>
  );
}

/**
 * The navigation on the left of every signed-in page. Open, it shows the CardPress mark with the open brand under it
 * (a menu to switch brand), the areas with their pages nested under them, and the person. Folded, only icons are left,
 * and an area's pages open in a small menu beside it. On narrow screens it is a bar along the bottom.
 */
export function Rail({ area, sub, brands, activeId, colors, switching = false, onSwitchBrand, theme, onToggleTheme, panel, onLeave, onSub }: RailProps) {
  const { user, can } = useSession();
  const [folded, toggleFold] = useFolded();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const active = brands.find((b) => b.id === activeId) ?? brands[0];
  const color = colors[active?.id] ?? "#888";
  const go = (href: string) => { onLeave?.(); window.location.href = href; };

  const items: Item[] = [
    { id: "studio", label: "Studio", href: studioHref(), icon: <PenLine /> },
    { id: "library", label: "Library", href: libraryHref(), icon: <FileText />, children: [
      { id: "", label: "All", href: libraryHref() },
      { id: "post", label: "Posts", href: libraryHref("post") },
      { id: "article", label: "Articles", href: libraryHref("article") },
    ] },
    { id: "settings", label: "Settings", href: settingsHref(), icon: <Settings />,
      children: visibleSections(!!user, can).map((s) => ({ id: s.id, label: s.label, href: settingsHref(s.id) })) },
  ];
  /** Follow an entry: on its own area's page the page handles it, elsewhere the page is loaded. */
  const follow = (e: React.MouseEvent, it: Item, entry: Entry) => {
    if (it.id === area && onSub) { e.preventDefault(); onSub(entry.id); window.history.replaceState(null, "", entry.href); return; }
    onLeave?.();
  };

  const brandMenu = (trigger: React.ReactNode, side: "bottom" | "right" | "top") => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="start" sideOffset={8} className="w-[280px]">
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
        <DropdownMenuItem onSelect={() => go(settingsHref("brands", "?new=1"))}><Plus /> New brand…</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go(settingsHref("brands"))}><SlidersHorizontal /> Manage brands…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const row = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:shrink-0";
  const tool = "grid h-9 w-9 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:h-[18px] [&_svg]:w-[18px]";
  const tip = (label: string, node: React.ReactNode) => (
    <Tooltip>
      <TooltipTrigger asChild>{node}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
  const brandLabel = `CardPress, brand ${active?.name ?? ""}. Switch brand`;

  return (
    <TooltipProvider delayDuration={250}>
      {/* narrow screens: a bar along the bottom */}
      <nav aria-label="Main" className="order-last flex shrink-0 items-center gap-1 border-t border-border bg-card px-2 py-1.5 lg:hidden">
        {brandMenu(
          <button type="button" aria-label={brandLabel} className="cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <LogoMark size={30} />
          </button>, "top")}
        <ul className="flex flex-1 items-center justify-around">
          {items.map((it) => (
            <li key={it.id}>
              <a href={it.href} onClick={onLeave} aria-current={it.id === area ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 rounded-md px-3 py-1 text-[10.5px] font-medium [&_svg]:h-[18px] [&_svg]:w-[18px]", it.id === area ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                {it.icon}{it.label}
              </a>
            </li>
          ))}
        </ul>
        <AccountMenu name={active?.name ?? ""} color={color} theme={theme} onToggleTheme={onToggleTheme} />
      </nav>

      {/* wide screens: the column on the left, open or folded */}
      <nav aria-label="Main" className={cn("hidden shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 motion-reduce:transition-none lg:flex", folded ? "w-16 items-center px-2" : "w-60 px-3")}>
        <div className={cn("flex h-16 w-full shrink-0 items-center", folded && "justify-center")}>
          {brandMenu(folded ? (
            <button type="button" aria-label={brandLabel} title={active?.name} className="cursor-pointer rounded-lg p-1 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted">
              <LogoMark size={32} />
            </button>
          ) : (
            <button type="button" aria-label={brandLabel} className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted">
              <LogoMark size={34} />
              <span className="min-w-0 flex-1 leading-none">
                <span className="block text-[19px] font-bold tracking-tight">CardPress</span>
                <span className="mt-1 flex items-center gap-1 text-[11.5px] text-muted-foreground">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="truncate">{switching ? "Opening…" : active?.name}</span>
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          ), folded ? "right" : "bottom")}
        </div>

        <ul className={cn("mt-2 flex w-full flex-col gap-0.5", folded && "items-center")}>
          {items.map((it) => {
            const here = it.id === area;
            if (folded) {
              const icon = <span className={cn(tool, here && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground")}>{it.icon}</span>;
              return (
                <li key={it.id}>
                  {it.children?.length ? (
                    <DropdownMenu>
                      {tip(it.label, <DropdownMenuTrigger asChild><button type="button" aria-label={it.label} aria-current={here ? "page" : undefined} className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">{icon}</button></DropdownMenuTrigger>)}
                      <DropdownMenuContent side="right" align="start" sideOffset={8} className="min-w-[200px]">
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{it.label}</DropdownMenuLabel>
                        {it.children.map((c) => (
                          <DropdownMenuItem key={c.id || "all"} asChild className={cn(here && sub === c.id && "bg-muted font-medium")}>
                            <a href={c.href} onClick={(e) => follow(e, it, c)}>{c.label}</a>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : tip(it.label, <a href={it.href} aria-label={it.label} aria-current={here ? "page" : undefined} onClick={onLeave} className="block rounded-md">{icon}</a>)}
                </li>
              );
            }
            const open = !!it.children?.length && (openGroups[it.id] ?? here);
            return (
              <li key={it.id}>
                <div className="flex items-center">
                  <a href={it.href} aria-current={here && !it.children ? "page" : undefined} onClick={onLeave}
                    className={cn(row, here ? (it.children ? "font-semibold text-foreground hover:bg-muted" : "bg-primary font-medium text-primary-foreground") : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                    {it.icon}<span className="flex-1">{it.label}</span>
                  </a>
                  {!!it.children?.length && (
                    <button type="button" aria-label={`${open ? "Fold" : "Show"} ${it.label}`} aria-expanded={open} onClick={() => setOpenGroups((g) => ({ ...g, [it.id]: !open }))}
                      className="ml-0.5 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                      <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
                    </button>
                  )}
                </div>
                {open && (
                  <ul className="mb-1 ml-[19px] mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2.5">
                    {it.children!.map((c) => {
                      const on = here && sub === c.id;
                      return (
                        <li key={c.id || "all"}>
                          <a href={c.href} aria-current={on ? "page" : undefined} onClick={(e) => follow(e, it, c)}
                            className={cn("block rounded-md px-2.5 py-1.5 text-[13.5px]", on ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                            {c.label}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex-1" />
        <div className={cn("flex w-full flex-col gap-0.5 border-t border-border py-2", folded && "items-center")}>
          {panel && (folded
            ? tip(`${panel.hidden ? "Show" : "Hide"} the work column (Ctrl/⌘ + \\)`,
                <button type="button" onClick={panel.toggle} aria-pressed={panel.hidden} aria-label={panel.hidden ? "Show the work column" : "Hide the work column"} className={tool}>{panel.hidden ? <PanelLeftOpen /> : <PanelLeftClose />}</button>)
            : <button type="button" onClick={panel.toggle} aria-pressed={panel.hidden} title="Ctrl/⌘ + \" className={cn(row, "cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground")}>{panel.hidden ? <PanelLeftOpen /> : <PanelLeftClose />} {panel.hidden ? "Show work column" : "Hide work column"}</button>)}
          {folded
            ? tip("Expand the navigation", <button type="button" onClick={toggleFold} aria-label="Expand the navigation" className={tool}><ChevronsUpDown className="rotate-90" /></button>)
            : <button type="button" onClick={toggleFold} className={cn(row, "cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground")}><ChevronsUpDown className="rotate-90" /> Collapse</button>}
          <div className={cn("pt-1", !folded && "w-full")}>
            <AccountMenu variant={folded ? "avatar" : "row"} name={active?.name ?? ""} color={color} theme={theme} onToggleTheme={onToggleTheme} />
          </div>
        </div>
      </nav>
    </TooltipProvider>
  );
}

/** The heading of a page's own list (Settings on a narrow screen). */
export function SecondaryHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
      <h2 className="flex-1 truncate font-mono text-[12.5px] font-bold uppercase tracking-[0.14em]">{title}</h2>
      {children}
    </div>
  );
}

/** One entry of a page's own list. */
export function SecondaryLink({ href, onClick, current, children }: { href?: string; onClick?: () => void; current: boolean; children: React.ReactNode }) {
  const cls = cn("flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm [&_svg]:h-4 [&_svg]:w-4",
    current ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground");
  return href
    ? <a href={href} aria-current={current ? "page" : undefined} className={cls}>{children}</a>
    : <button type="button" aria-pressed={current} onClick={onClick} className={cls}>{children}</button>;
}
