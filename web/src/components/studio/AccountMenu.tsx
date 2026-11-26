import { BookOpen, ExternalLink, LogOut, Moon, Sun } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/brands";
import { DOCS_URL } from "@/lib/nav";
import { initialsOf, roleLabel, useSession } from "@/lib/session";

export { DOCS_URL, libraryHref, studioHref } from "@/lib/nav";

interface Props {
  /** The open brand: its name and colour, for a server without accounts and for the badge's colour. */
  name: string;
  color: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

/**
 * The person at the bottom of the rail. Their menu is short: who they are, Docs and Sign out. On narrow screens, where
 * the rail has no room for its own theme button, it also switches the theme.
 */
export function AccountMenu({ name, color, theme, onToggleTheme }: Props) {
  const { user, signOut } = useSession();
  const shown = user?.fullName ?? name;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Menu for ${shown}`} title={shown}
          className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-[11px] font-semibold text-white outline-none ring-offset-2 ring-offset-card focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:ring-2 data-[state=open]:ring-brand"
          style={{ background: color }}>
          {user ? initialsOf(user) : initials(name)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={10} className="min-w-[230px] max-lg:mb-2">
        <DropdownMenuLabel className="truncate">
          {shown}
          {user && <span className="block text-xs font-normal text-muted-foreground">{user.email}</span>}
          {user && <span className="block text-xs font-normal text-muted-foreground">{roleLabel(user)}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onToggleTheme} className="lg:hidden">
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
