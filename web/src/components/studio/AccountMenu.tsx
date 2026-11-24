import { BookOpen, ChevronUp, ExternalLink, KeyRound, Library, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/brands";

export const DOCS_URL = "https://www.senthilsweb.com/cardpress/";

/** Where the studio and the library live. */
export const studioHref = (query = "") => `${import.meta.env.BASE_URL}studio/${query}`;
export const libraryHref = () => `${import.meta.env.BASE_URL}library/`;

interface Props {
  name: string;
  handle?: string;
  color: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  /** Which page this menu is on, so its own link is marked. */
  page: "studio" | "library";
  /** Open Social accounts / Manage brands. Where the page has no such drawer these are left out and the menu links to the studio. */
  onAccounts?: () => void;
  onManageBrands?: () => void;
  /** "footer" is the wide button at the bottom of the sidebar; "avatar" is the small button for the header. */
  variant?: "footer" | "avatar";
}

/** The person (today, the open brand) and a menu of where to go. It is the place sign-in will join later. */
export function AccountMenu({ name, handle, color, theme, onToggleTheme, page, onAccounts, onManageBrands, variant = "footer" }: Props) {
  const badge = (
    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: color }}>{initials(name)}</span>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "avatar" ? (
          <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label={`Menu for ${name}`}>{badge}</Button>
        ) : (
          <button type="button" aria-label={`Menu for ${name}`} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted">
            {badge}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium leading-tight">{name}</span>
              {handle && <span className="block truncate text-xs leading-tight text-muted-foreground">{handle}</span>}
            </span>
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align={variant === "avatar" ? "start" : "center"} className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[230px]">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href={libraryHref()} aria-current={page === "library" ? "page" : undefined}><Library /> Library</a>
        </DropdownMenuItem>
        {onAccounts
          ? <DropdownMenuItem onSelect={onAccounts}><KeyRound /> Social accounts</DropdownMenuItem>
          : <DropdownMenuItem asChild><a href={studioHref("?open=accounts")}><KeyRound /> Social accounts</a></DropdownMenuItem>}
        {onManageBrands
          ? <DropdownMenuItem onSelect={onManageBrands}><SlidersHorizontal /> Manage brands</DropdownMenuItem>
          : <DropdownMenuItem asChild><a href={studioHref("?open=brands")}><SlidersHorizontal /> Manage brands</a></DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onToggleTheme}>
          {theme === "dark" ? <Sun /> : <Moon />} {theme === "dark" ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer"><BookOpen /> Docs <ExternalLink className="ml-auto opacity-60" /></a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
