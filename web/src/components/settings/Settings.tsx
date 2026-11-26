import { useEffect, useState } from "react";
import { ArrowLeft, Bot, CircleUser, KeyRound, Loader2, Palette, Plug, Users } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Drawer, InlineDrawers } from "@/components/ui/drawer";
import { Rail, SecondaryHeader, SecondaryLink } from "@/components/shell/Rail";
import { BootScreen } from "@/components/studio/BootScreen";
import { SessionProvider } from "@/components/studio/SessionProvider";
import { AccountSettings } from "@/components/studio/AccountSettings";
import { ManageBrandsDrawer, NewBrandDrawer } from "@/components/studio/Brands";
import { BrandLook } from "./BrandLook";
import { SocialSettings } from "@/components/studio/SocialSettings";
import { UsersDrawer } from "@/components/studio/UsersDrawer";
import { api, type ApiInfo } from "@/lib/api";
import { blankDesign, brandColor, move } from "@/lib/brands";
import { sectionFromPath, settingsHref, visibleSections, type SettingsSection } from "@/lib/nav";
import { completeProfiles, DEFAULT_DESIGN, withStandardPalettes } from "@/lib/profiles";
import { fullDesign } from "@/lib/cardDesign";
import { useSession } from "@/lib/session";
import type { Design, Profile } from "@/lib/types";
import { useLibraryBoot, type LibraryBoot } from "@/lib/useLibraryBoot";
import { useTheme } from "@/lib/useTheme";
import { cn } from "@/lib/utils";

const ICONS: Record<SettingsSection, React.ReactNode> = {
  account: <CircleUser />, brands: <Palette />, social: <Plug />, "api-keys": <KeyRound />, users: <Users />, assistant: <Bot />,
};
const noop = () => undefined;

export default function Settings() {
  const { boot, retry, submitToken } = useLibraryBoot();
  if (boot.status !== "ready") return <BootScreen boot={boot} retry={retry} submitToken={submitToken} importLegacy={noop} discardLegacy={noop} />;
  return <SessionProvider initial={boot.data.session}><Page data={boot.data} /></SessionProvider>;
}

function Page({ data }: { data: LibraryBoot }) {
  const [theme, toggleTheme] = useTheme(data.theme);
  const { user, can } = useSession();
  const sections = visibleSections(!!user, can);
  const asked = sectionFromPath(window.location.pathname);
  const section = sections.find((s) => s.id === asked)?.id;
  // brands are read again after a change here, so the rail and the list agree with the server
  const [brands, setBrands] = useState({ profiles: data.profiles, archived: [] as Profile[], designs: data.designs, activeId: data.activeId });
  const colors = Object.fromEntries([...brands.profiles, ...brands.archived].map((p) => [p.id, brandColor(p, brands.designs[p.id])]));
  const sync = async () => {
    const st = await api.state();
    setBrands((b) => ({
      ...b,
      profiles: withStandardPalettes(st.profiles as Profile[]),
      archived: Array.isArray(st.archived) ? completeProfiles(st.archived as Profile[]) : [],
      designs: st.designs as Record<string, Design>,
    }));
  };
  useEffect(() => { void sync().catch(noop); }, []);

  // a wide screen always shows a page: /settings/ alone, or a page this person may not open, shows the first one
  const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  useEffect(() => {
    if (!section && (asked || wide) && sections[0]) window.history.replaceState(null, "", settingsHref(sections[0].id));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = section ?? (asked || wide ? sections[0]?.id : undefined);

  const setActive = async (id: string) => {
    await api.putPreference("activeProfile", id);
    setBrands((b) => ({ ...b, activeId: id }));
  };
  const switchBrand = (id: string) => { void setActive(id).then(() => window.location.reload()); };
  const active = brands.profiles.find((p) => p.id === brands.activeId) ?? brands.profiles[0];

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <Toaster theme={theme} />
      <Rail area="settings" sub={shown} brands={brands.profiles} activeId={brands.activeId} colors={colors} onSwitchBrand={switchBrand} theme={theme} onToggleTheme={toggleTheme} />
      <aside className={cn("flex min-h-0 flex-1 flex-col bg-card lg:hidden", shown && "hidden")}>
        <SecondaryHeader title="Settings" />
        <nav aria-label="Settings" className="flex flex-col gap-0.5 p-2">
          {sections.map((s) => (
            <SecondaryLink key={s.id} href={settingsHref(s.id)} current={s.id === shown}>{ICONS[s.id]} {s.label}</SecondaryLink>
          ))}
        </nav>
      </aside>
      <main className={cn("min-h-0 min-w-0 flex-1", !shown && "max-lg:hidden")}>
        <a href={settingsHref()} className="flex items-center gap-1.5 border-b border-border px-4 py-2 text-sm text-muted-foreground lg:hidden"><ArrowLeft className="h-4 w-4" /> Settings</a>
        <InlineDrawers>
          {shown === "account" && <AccountSettings open onClose={noop} parts={["profile", "password"]} title="Account" />}
          {shown === "api-keys" && <AccountSettings open onClose={noop} parts={["keys"]} title="API keys" />}
          {shown === "brands" && <BrandsPage brands={brands} colors={colors} sync={sync} setActive={setActive} />}
          {shown === "social" && active && <SocialSettings open onOpenChange={noop} profileId={active.id} brandName={active.name} />}
          {shown === "users" && <UsersDrawer open onClose={noop} />}
          {shown === "assistant" && <AssistantPage />}
        </InlineDrawers>
      </main>
    </div>
  );
}

function BrandsPage({ brands, colors, sync, setActive }: {
  brands: { profiles: Profile[]; archived: Profile[]; designs: Record<string, Design>; activeId: string };
  colors: Record<string, string>;
  sync: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
}) {
  // ?new=1 (from the brand menu) opens the form at once
  const [adding, setAdding] = useState(() => new URLSearchParams(window.location.search).get("new") === "1");
  const [copyOf, setCopyOf] = useState<Profile | undefined>(undefined);
  const current = brands.profiles.find((p) => p.id === brands.activeId) ?? brands.profiles[0];
  // ?look=<brand> opens that brand for editing
  const [looking, setLooking] = useState(() => new URLSearchParams(window.location.search).get("look"));
  const look = (id: string | null) => { setLooking(id); window.history.replaceState(null, "", settingsHref("brands", id ? `?look=${encodeURIComponent(id)}` : "")); };
  const close = () => { setAdding(false); setCopyOf(undefined); window.history.replaceState(null, "", settingsHref("brands")); };

  const create = async (p: Profile, from?: Profile) => {
    await api.createProfile(p);
    // a copy starts from the other brand's card, a blank one from the default card without footer text
    const copied = from && brands.designs[from.id];
    const base = from ? (copied ? fullDesign(DEFAULT_DESIGN, copied) : DEFAULT_DESIGN) : blankDesign(DEFAULT_DESIGN);
    await api.putDesigns({ ...brands.designs, [p.id]: base });
    await setActive(p.id);
    await sync();
    close();
  };
  const archive = async (id: string) => {
    const r = await api.archiveProfile(id);
    if (id === brands.activeId) { const next = brands.profiles.find((b) => b.id !== id); if (next) await setActive(next.id); }
    await sync();
    return r;
  };

  const shownLook = brands.profiles.find((b) => b.id === looking);
  if (shownLook) return <BrandLook key={shownLook.id} profiles={brands.profiles} id={shownLook.id} design={brands.designs[shownLook.id]} onBack={() => { look(null); void sync(); }} />;
  if (adding && current) return <NewBrandDrawer open onClose={close} brands={brands.profiles} current={current} source={copyOf} onCreate={create} />;
  return (
    <ManageBrandsDrawer open onClose={noop} active={brands.profiles} archived={brands.archived} activeId={brands.activeId} colors={colors}
      onOpen={setActive}
      onRename={async (id, name) => {
        // the saved brand as the server has it, so that only its name changes
        const saved = ((await api.state()).profiles as Profile[]).find((b) => b.id === id);
        if (!saved) throw new Error("That brand no longer exists.");
        await api.putProfiles([{ ...saved, name }]);
        await sync();
      }}
      onLook={look}
      onMove={async (id, dir) => { await api.orderProfiles(move(brands.profiles.map((b) => b.id), id, dir)); await sync(); }}
      onDuplicate={(p) => { setCopyOf(p); setAdding(true); }}
      onArchive={archive}
      onRestore={async (id) => { await api.restoreProfile(id); await sync(); }}
      onDelete={async (id) => { await api.deleteProfile(id); await sync(); }}
      onNew={() => { setCopyOf(undefined); setAdding(true); }} />
  );
}

/** Whether the assistant is connected. Read only: it is set up on the server (see the docs). */
function AssistantPage() {
  const [info, setInfo] = useState<ApiInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.info().then(setInfo).catch((e) => setError(e instanceof Error ? e.message : "Could not load")); }, []);
  const agent = info?.agent;
  return (
    <Drawer open onClose={noop} title="Assistant">
      <div className="space-y-3 px-4 py-4 text-sm">
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {!info && !error && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
        {info && (
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
            <dt className="text-muted-foreground">Status</dt>
            <dd>{agent?.ready ? <span className="font-medium text-brand">Connected</span> : "Not set up"}</dd>
            <dt className="text-muted-foreground">Name</dt><dd>{agent?.name ?? "None"}</dd>
            <dt className="text-muted-foreground">Server</dt><dd>{info.name} {info.version}</dd>
          </dl>
        )}
        <p className="text-xs text-muted-foreground">The assistant is set up on the server. It works for administrators, in their own brands.</p>
      </div>
    </Drawer>
  );
}
