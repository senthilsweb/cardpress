import { BookOpen, ChevronsUpDown, ExternalLink, LogOut, Moon, Sun } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/brands";
import { DOCS_URL } from "@/lib/nav";
import { initialsOf, roleLabel, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export { DOCS_URL, libraryHref, studioHref } from "@/lib/nav";

interface Props {
  /** The open brand's name, shown when the server has no accounts. */
  name: string;
  color: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  /** "row" is the full-width entry of the open navigation; "avatar" is the circle of the folded one and the bottom bar. */
  variant?: "row" | "avatar";
}

/** The person at the bottom of the navigation, and their short menu: who they are, the theme, Docs and Sign out. */
export function AccountMenu({ name, color, theme, onToggleTheme, variant = "avatar" }: Props) {
  const { user, signOut } = useSession();
  const shown = user?.fullName ?? name;
  const badge = (
    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: color }}>
      {user ? initialsOf(user) : initials(shown)}
    </span>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Menu for ${shown}`} title={variant === "avatar" ? shown : undefined}
          className={cn("flex cursor-pointer items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted",
            variant === "row" ? "w-full px-2 py-1.5 hover:bg-muted" : "rounded-full")}>
          {badge}
          {variant === "row" && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium leading-tight">{shown}</span>
                {user && <span className="block truncate text-xs leading-tight text-muted-foreground">{roleLabel(user)}</span>}
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={10} className="min-w-[230px] max-lg:mb-2">
        <DropdownMenuLabel className="truncate">
          {shown}
          {user && <span className="block text-xs font-normal text-muted-foreground">{user.email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onToggleTheme}>
          {theme === "dark" ? <Sun /> : <Moon />} {theme === "dark" ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer"><BookOpen /> Docs <ExternalLink className="ml-auto opacity-60" /></a>
        </DropdownMenuItem>
        {user && <DropdownMenuItem onSelect={() => void signOut()}><LogOut /> Sign out</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
