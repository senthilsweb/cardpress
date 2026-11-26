import { useEffect, useRef, useState } from "react";
import { Check, CircleHelp, FileText, PanelLeftClose, PanelLeftOpen, PenLine, Plus, Settings, SlidersHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AccountMenu } from "@/components/studio/AccountMenu";
import { LogoMark } from "@/components/studio/Logo";
import { initials } from "@/lib/brands";
import { DOCS_URL, libraryHref, settingsHref, studioHref, visibleSections, type Area } from "@/lib/nav";
import { useSession } from "@/lib/session";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface RailProps {
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
}

interface Entry { id: string; label: string; href: string; external?: boolean }
interface Group { title?: string; entries: Entry[] }
interface Item { id: Area | "help"; label: string; href?: string; icon: React.ReactNode; groups?: Group[] }

const REPO = "https://github.com/senthilsweb/cardpress";

/** The brand's square: its colour and initials. */
function BrandTile({ name, color }: { name: string; color: string }) {
  return (
    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[12px] font-bold text-white" style={{ background: color }}>
      {initials(name)}
    </span>
  );
}

/**
 * The navigation: a narrow dark bar on the left of every signed-in page. The CardPress mark at the top opens the brand
 * menu. An area with pages (Library, Settings, Help) opens a panel beside the bar listing them; Studio goes straight to
 * the studio. The person is at the bottom. On narrow screens it is a bar along the bottom.
 */
export function Rail({ area, sub, brands, activeId, colors, switching = false, onSwitchBrand, theme, onToggleTheme, panel, onLeave, onSub }: RailProps) {
  const { user, can } = useSession();
  const [open, setOpen] = useState<Item["id"] | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const active = brands.find((b) => b.id === activeId) ?? brands[0];
  const color = colors[active?.id] ?? "#888";
  const go = (href: string) => { onLeave?.(); window.location.href = href; };

  const settings = visibleSections(!!user, can);
  const pick = (ids: string[]) => settings.filter((s) => ids.includes(s.id)).map((s) => ({ id: s.id, label: s.label, href: settingsHref(s.id) }));
  const items: Item[] = [
    { id: "studio", label: "Studio", href: studioHref(), icon: <PenLine /> },
    { id: "library", label: "Library", icon: <FileText />, groups: [{ entries: [
      { id: "", label: "All", href: libraryHref() },
      { id: "post", label: "Posts", href: libraryHref("post") },
      { id: "article", label: "Articles", href: libraryHref("article") },
    ] }] },
    { id: "settings", label: "Settings", icon: <Settings />, groups: [
      { entries: pick(["account", "api-keys"]) },
      { title: "Brands", entries: pick(["brands", "social"]) },
      { title: "Administration", entries: pick(["users", "assistant"]) },
    ].filter((g) => g.entries.length) },
    { id: "help", label: "Help", icon: <CircleHelp />, groups: [
      { entries: [
        { id: "docs", label: "Docs", href: DOCS_URL, external: true },
      ] },
      { title: "Support", entries: [
        { id: "issue", label: "Report a problem", href: `${REPO}/issues/new`, external: true },
        { id: "repo", label: "Source code", href: REPO, external: true },
      ] },
    ] },
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

  const brandMenu = (trigger: React.ReactNode, side: "right" | "top") => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="start" sideOffset={10} className="w-[280px]">
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

  const icon = (on: boolean) => cn(
    "grid h-11 w-11 cursor-pointer place-items-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#8fd3c2] [&_svg]:h-[21px] [&_svg]:w-[21px]",
    on ? "bg-white/10 text-white" : "text-[#8fd3c2] hover:bg-white/5 hover:text-white",
  );
  const tip = (label: string, node: React.ReactNode, hide = false) => (
    <Tooltip open={hide ? false : undefined}>
      <TooltipTrigger asChild>{node}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={200}>
      {/* narrow screens: a bar along the bottom */}
      <nav aria-label="Main" className="order-last flex shrink-0 items-center gap-1 bg-[#0b2a24] px-2 py-1.5 lg:hidden">
        {brandMenu(<button type="button" aria-label={`Brand ${active?.name ?? ""}. Switch brand`} className="cursor-pointer rounded-lg p-0.5"><LogoMark size={30} /></button>, "top")}
        <ul className="flex flex-1 items-center justify-around">
          {items.filter((i) => i.id !== "help").map((it) => {
            const href = it.href ?? (it.id === "library" ? libraryHref() : settingsHref());
            return (
              <li key={it.id}>
                <a href={href} onClick={onLeave} aria-current={it.id === area ? "page" : undefined}
                  className={cn("flex flex-col items-center gap-0.5 rounded-md px-3 py-1 text-[10.5px] font-medium [&_svg]:h-[18px] [&_svg]:w-[18px]", it.id === area ? "bg-white/10 text-white" : "text-[#8fd3c2]")}>
                  {it.icon}{it.label}
                </a>
              </li>
            );
          })}
        </ul>
        <AccountMenu name={active?.name ?? ""} color={color} theme={theme} onToggleTheme={onToggleTheme} />
      </nav>

      {/* wide screens: the dark bar, and the panel of the area pressed */}
      <div ref={root} className="relative z-40 hidden shrink-0 lg:flex">
        <nav aria-label="Main" className="flex w-16 flex-col items-center gap-1.5 bg-[#0b2a24] py-4">
          {brandMenu(
            <button type="button" aria-label={`CardPress, brand ${active?.name ?? ""}. Switch brand`} title={`Brand: ${active?.name ?? ""}`}
              className="mb-4 cursor-pointer rounded-lg p-1 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[#8fd3c2] data-[state=open]:bg-white/10">
              <LogoMark size={34} />
            </button>, "right")}
          {items.map((it) => {
            const here = it.id === area;
            return (
              <div key={it.id}>
                {it.groups ? tip(it.label,
                  <button type="button" aria-label={it.label} aria-expanded={open === it.id} aria-current={here ? "page" : undefined}
                    onClick={() => setOpen(open === it.id ? null : it.id)} className={icon(here || open === it.id)}>{it.icon}</button>, open === it.id)
                  : tip(it.label, <a href={it.href} aria-label={it.label} aria-current={here ? "page" : undefined} onClick={() => { setOpen(null); onLeave?.(); }} className={icon(here)}>{it.icon}</a>)}
              </div>
            );
          })}
          <div className="flex-1" />
          {panel && tip(`${panel.hidden ? "Show" : "Hide"} the work column (Ctrl/⌘ + \\)`,
            <button type="button" onClick={panel.toggle} aria-pressed={panel.hidden} aria-label={panel.hidden ? "Show the work column" : "Hide the work column"} className={icon(false)}>
              {panel.hidden ? <PanelLeftOpen /> : <PanelLeftClose />}
            </button>)}
          <div className="mt-2"><AccountMenu name={active?.name ?? ""} color={color} theme={theme} onToggleTheme={onToggleTheme} /></div>
        </nav>

        {shown?.groups && (
          <div role="region" aria-label={shown.label}
            className="absolute inset-y-0 left-16 w-72 overflow-y-auto border-l border-white/5 bg-[#06201b] px-5 py-6 text-[#8fd3c2] shadow-[8px_0_30px_rgba(0,0,0,0.25)]">
            <h2 className="mb-3 text-[17px] font-semibold text-white">{shown.label}</h2>
            {shown.groups.map((g, i) => (
              <div key={i} className={cn(i > 0 && "mt-6")}>
                {g.title && <h3 className="mb-2 text-[15px] font-semibold text-white">{g.title}</h3>}
                <ul className="flex flex-col">
                  {g.entries.map((e) => {
                    const on = shown.id === area && sub === e.id;
                    return (
                      <li key={e.id || "all"}>
                        <a href={e.href} onClick={(ev) => follow(ev, shown, e)} aria-current={on ? "page" : undefined}
                          {...(e.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                          className={cn("block rounded-md px-3 py-2 text-[14.5px] hover:bg-white/5 hover:text-white", on && "bg-white/10 font-medium text-white")}>
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
