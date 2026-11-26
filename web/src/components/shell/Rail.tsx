import { FileText, Moon, PanelLeftClose, PanelLeftOpen, PenLine, Settings, Sun } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AccountMenu } from "@/components/studio/AccountMenu";
import { LogoMark } from "@/components/studio/Logo";
import { libraryHref, settingsHref, studioHref, type Area } from "@/lib/nav";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface RailProps {
  area: Area;
  brands: Profile[];
  activeId: string;
  colors: Record<string, string>;
  switching?: boolean;
  onSwitchBrand: (id: string) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  /** The area's own column, which can be hidden (Ctrl/⌘ + \). */
  panel?: { hidden: boolean; toggle: () => void };
  /** Called before going to another area, to save what is being typed. */
  onLeave?: () => void;
}

const AREAS: { id: Area; label: string; href: () => string; icon: React.ReactNode }[] = [
  { id: "studio", label: "Studio", href: () => studioHref(), icon: <PenLine /> },
  { id: "library", label: "Library", href: libraryHref, icon: <FileText /> },
  { id: "settings", label: "Settings", href: () => settingsHref(), icon: <Settings /> },
];

/**
 * The primary navigation: a narrow column on the far left of every signed-in page (a bar along the bottom on narrow
 * screens). The brand at the top, the areas, and the person at the bottom. Nothing is put along the top of the window.
 */
export function Rail({ area, brands, activeId, colors, switching = false, onSwitchBrand, theme, onToggleTheme, panel, onLeave }: RailProps) {
  const icon = "flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10.5px] font-medium [&_svg]:h-[18px] [&_svg]:w-[18px]";
  return (
    <TooltipProvider delayDuration={250}>
    <nav aria-label="Main" className="order-last flex shrink-0 items-center gap-1 border-t border-border bg-card px-2 py-1.5 lg:order-first lg:w-[60px] lg:flex-col lg:border-r lg:border-t-0 lg:px-1.5 lg:py-3">
      <a href={studioHref()} aria-label="CardPress" onClick={onLeave} className="mb-1 hidden flex-col items-center gap-1 lg:flex">
        <LogoMark size={30} />
        <span className="text-[10.5px] font-bold tracking-tight text-foreground">CardPress</span>
      </a>
      <div className="hidden h-px w-8 bg-border lg:my-2 lg:block" />
      <ul className="flex flex-1 items-center justify-around gap-1 lg:w-full lg:flex-none lg:flex-col lg:justify-start">
        {AREAS.map((a) => {
          const here = a.id === area;
          return (
            <li key={a.id} className="lg:w-full">
              <a href={a.href()} aria-current={here ? "page" : undefined} onClick={onLeave}
                className={cn(icon, here ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                {a.icon}<span>{a.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <div className="hidden flex-1 lg:block" />
      <div className="flex items-center gap-1 lg:flex-col lg:gap-2">
        {panel && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={panel.toggle} aria-pressed={panel.hidden} aria-label={panel.hidden ? "Show the side column" : "Hide the side column"}
                className="hidden h-8 w-8 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:grid [&_svg]:h-[18px] [&_svg]:w-[18px]">
                {panel.hidden ? <PanelLeftOpen /> : <PanelLeftClose />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{panel.hidden ? "Show" : "Hide"} the side column (Ctrl/⌘ + \)</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onToggleTheme} aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
              className="hidden h-8 w-8 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:grid [&_svg]:h-[18px] [&_svg]:w-[18px]">
              {theme === "dark" ? <Sun /> : <Moon />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
        </Tooltip>
        <AccountMenu brands={brands} activeId={activeId} colors={colors} switching={switching} onSwitchBrand={onSwitchBrand}
          onNewBrand={() => { onLeave?.(); window.location.href = settingsHref("brands", "?new=1"); }}
          onManageBrands={() => { onLeave?.(); window.location.href = settingsHref("brands"); }}
          theme={theme} onToggleTheme={onToggleTheme} />
      </div>
    </nav>
    </TooltipProvider>
  );
}

/** The heading of the column beside the rail: the area's name. */
export function SecondaryHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
      <h2 className="flex-1 truncate font-mono text-[12.5px] font-bold uppercase tracking-[0.14em]">{title}</h2>
      {children}
    </div>
  );
}

/** One entry of the column beside the rail. */
export function SecondaryLink({ href, onClick, current, children, count }: { href?: string; onClick?: () => void; current: boolean; children: React.ReactNode; count?: number }) {
  const cls = cn("flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm [&_svg]:h-4 [&_svg]:w-4",
    current ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground");
  const inner = <>{children}{count !== undefined && <span className="ml-auto text-xs tabular-nums text-muted-foreground">{count}</span>}</>;
  return href
    ? <a href={href} aria-current={current ? "page" : undefined} className={cls}>{inner}</a>
    : <button type="button" aria-pressed={current} onClick={onClick} className={cls}>{inner}</button>;
}
