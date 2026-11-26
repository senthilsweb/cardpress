import { BookOpen, Check, ExternalLink, Loader2, LogOut, Moon, Plus, SlidersHorizontal, Sun } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/brands";
import { DOCS_URL } from "@/lib/nav";
import { initialsOf, roleLabel, useSession } from "@/lib/session";
import type { Profile } from "@/lib/types";

export { DOCS_URL, libraryHref, studioHref } from "@/lib/nav";

interface Props {
  brands: Profile[];
  activeId: string;
  colors: Record<string, string>;
  switching?: boolean;
  onSwitchBrand: (id: string) => void;
  onNewBrand: () => void;
  onManageBrands: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10" style={{ background: color }} />;
}

/**
 * The person at the bottom of the rail, in the open brand's colour. The menu: who they are, the brands (switch, new,
 * manage), Docs and Sign out. On narrow screens, where the rail has no theme button, it also switches the theme.
 */
export function AccountMenu({ brands, activeId, colors, switching = false, onSwitchBrand, onNewBrand, onManageBrands, theme, onToggleTheme }: Props) {
  const { user, signOut } = useSession();
  const active = brands.find((b) => b.id === activeId) ?? brands[0];
  const shown = user?.fullName ?? active?.name ?? "";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Menu for ${shown}, brand ${active?.name ?? ""}`} title={`${shown} · ${active?.name ?? ""}`} disabled={switching}
          className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-[11px] font-semibold text-white outline-none ring-offset-2 ring-offset-card focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:ring-2 data-[state=open]:ring-brand"
          style={{ background: colors[active?.id] ?? "#888" }}>
          {switching ? <Loader2 className="h-4 w-4 animate-spin" /> : user ? initialsOf(user) : initials(shown)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={10} className="min-w-[240px] max-lg:mb-2">
        {user && (
          <>
            <DropdownMenuLabel className="truncate">
              {shown}
              <span className="block text-xs font-normal text-muted-foreground">{user.email}</span>
              <span className="block text-xs font-normal text-muted-foreground">{roleLabel(user)}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Brand</DropdownMenuLabel>
        {brands.map((b) => (
          <DropdownMenuItem key={b.id} onSelect={() => { if (b.id !== activeId) onSwitchBrand(b.id); }}>
            <Dot color={colors[b.id] ?? "#888"} />
            <span className="min-w-0 flex-1 truncate">{b.name}</span>
            {b.id === activeId && <Check className="text-brand" aria-label="Open" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={onNewBrand}><Plus /> New brand…</DropdownMenuItem>
        <DropdownMenuItem onSelect={onManageBrands}><SlidersHorizontal /> Manage brands…</DropdownMenuItem>
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
