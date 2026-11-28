import { useCallback, useEffect, useRef, useState } from "react";
import { SecuritySettings } from "./SecuritySettings";
import { Bot, BotMessageSquare, CircleUser, KeyRound, Loader2, Paintbrush, Palette, Plug, ShieldCheck, SwatchBook, Users } from "lucide-react";
import { toast } from "sonner";
import { PanelDialog } from "@/components/ui/panel-dialog";
import { Pane } from "@/components/ui/pane";
import { Button } from "@/components/ui/button";
import { AccountSettings } from "@/components/studio/AccountSettings";
import { ManageBrands, NewBrand } from "@/components/studio/Brands";
import { SocialSettings } from "@/components/studio/SocialSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { BrandAssistant } from "./BrandAssistant";
import { BrandLook } from "./BrandLook";
import { UsersSettings } from "./UsersSettings";
import { Guard } from "./guard";
import { copyPictures } from "@/lib/assetRefs";
import { api, type ApiInfo } from "@/lib/api";
import { blankDesign, brandColor, move, pickActive } from "@/lib/brands";
import { Holds } from "@/lib/holds";
import type { BrandDetails } from "@/lib/brandDetails";
import { findSections, SETTINGS_GROUPS, settingsHref, settingsPlace, studioHref, visibleSections, type SettingsSection } from "@/lib/nav";
import { completeProfiles, DEFAULT_DESIGN, withStandardPalettes } from "@/lib/profiles";
import { fullDesign } from "@/lib/cardDesign";
import { useSession } from "@/lib/session";
import type { Design, Profile } from "@/lib/types";

const ICONS: Record<SettingsSection, React.ReactNode> = {
  account: <CircleUser aria-hidden />, appearance: <SwatchBook aria-hidden />, "api-keys": <KeyRound aria-hidden />, brands: <Palette aria-hidden />,
  look: <Paintbrush aria-hidden />, social: <Plug aria-hidden />, "brand-assistant": <BotMessageSquare aria-hidden />, users: <Users aria-hidden />, security: <ShieldCheck aria-hidden />, assistant: <Bot aria-hidden />,
};

/** Where the dialog is: a page, and what its address asked for (a new brand, or whose look). */
interface At { section?: SettingsSection; adding?: boolean; look?: string }

const placeOf = (url: URL): At | null => {
  const p = settingsPlace(url.pathname, url.search);
  return p && { section: p.section, adding: p.query.get("new") === "1", look: p.query.get("look") ?? undefined };
};
/** Marks the history entry the dialog added, so closing can take it away again. */
const MARK = { cardpressSettings: true };
const OPEN = "cardpress:settings";

/** Open the settings over the page in use, from code. Links to a settings address do this by themselves. */
export function openSettings(href: string) {
  window.dispatchEvent(new CustomEvent(OPEN, { detail: href }));
}

/**
 * Settings, over whatever page is in use. It takes the settings address while open, so links and the browser's Back
 * button work, and gives the page's own address back when closed. A change that the page behind shows (a brand, its
 * accounts) loads that page again on closing.
 */
export function SettingsHost({ onLeave }: { onLeave?: () => void }) {
  const [at, setAt] = useState<At | null>(() => (typeof window === "undefined" ? null : placeOf(new URL(window.location.href))));
  const [asking, setAsking] = useState<{ question: string; go: () => void } | null>(null);
  const [query, setQuery] = useState("");
  // the page is drawn again for every move, so a form starts fresh
  const [visit, setVisit] = useState(0);
  const holds = useRef(new Holds()).current;
  // the page on screen, for the Back button
  const current = useRef<SettingsSection | undefined>(undefined);
  const changed = useRef(false);
  const open = useRef(at !== null);
  open.current = at !== null;
  const leaveRef = useRef(onLeave);
  leaveRef.current = onLeave;
  const { user, can } = useSession();
  const sections = visibleSections(!!user, can);
  const shown = sections.find((s) => s.id === at?.section) ?? sections[0];
  current.current = shown?.id;

  /** Do `go` once nothing would be lost: ask about what is unsaved, and save what is waiting to be saved. */
  const leaving = useCallback((go: () => void) => {
    const save = () => holds.flush().then(go, () => { toast.error("Not saved"); });
    const question = holds.question();
    if (question) setAsking({ question, go: () => { setAsking(null); holds.agreed = true; void save(); } });
    else void save();
  }, [holds]);

  const show = useCallback((next: At, url: string) => {
    window.history.replaceState(window.history.state, "", url);
    setAt(next);
    setVisit((v) => v + 1);
  }, []);

  const start = useCallback((url: URL) => {
    const next = placeOf(url);
    if (!next) return;
    if (!open.current) {
      leaveRef.current?.();
      window.history.pushState(MARK, "", url);
      setQuery("");
      setAt(next);
      setVisit((v) => v + 1);
    } else leaving(() => show(next, url.href));
  }, [leaving, show]);

  const finish = useCallback(() => {
    // an address visited directly has no page behind it: the studio is where closing goes
    if (!window.history.state?.cardpressSettings) { window.location.href = studioHref(); return; }
    if (changed.current) window.addEventListener("popstate", () => window.location.reload(), { once: true });
    setAt(null);
    window.history.back();
  }, []);

  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== window.location.origin || !placeOf(new URL(a.href))) return;
      e.preventDefault();
      start(new URL(a.href));
    };
    const asked = (e: Event) => start(new URL((e as CustomEvent<string>).detail, window.location.href));
    // Back closes the dialog; Forward opens it again
    const moved = () => {
      const next = placeOf(new URL(window.location.href));
      if (next) { setAt(next); setVisit((v) => v + 1); return; }
      if (!open.current) return;
      if (holds.question()) {
        // stay, and ask
        window.history.pushState(MARK, "", settingsHref(current.current));
        leaving(finish);
        return;
      }
      void holds.flush().then(() => { setAt(null); if (changed.current) window.location.reload(); }, () => { toast.error("Not saved"); });
    };
    document.addEventListener("click", click);
    window.addEventListener(OPEN, asked);
    window.addEventListener("popstate", moved);
    return () => { document.removeEventListener("click", click); window.removeEventListener(OPEN, asked); window.removeEventListener("popstate", moved); };
  }, [start, finish, leaving, holds]);

  // the address names the page on screen: `/settings/` alone, or a page this person may not open, shows the first one
  useEffect(() => {
    if (!at || !shown || at.section === shown.id) return;
    window.history.replaceState(window.history.state, "", settingsHref(shown.id));
  }, [at, shown]);

  if (!at || !shown) return null;
  const go = (next: At, query = "") => leaving(() => show(next, settingsHref(next.section, query)));
  const found = findSections(sections, query);

  return (
    <PanelDialog
      open
      onOpenChange={(o) => { if (!o) leaving(finish); }}
      title="Settings"
      description="Search or pick a page of settings."
      search={{ value: query, onChange: setQuery, label: "Search settings", onEnter: () => { if (found[0]) { setQuery(""); go({ section: found[0].id }); } } }}
      groups={SETTINGS_GROUPS.map((name) => ({ name: name as string, items: found.filter((s) => s.group === name).map((s) => ({ key: s.id as string, name: s.label, icon: ICONS[s.id] })) })).filter((g) => g.items.length)}
      picked={shown.id}
      onPick={(key) => go({ section: key as SettingsSection })}
      listLabel="Settings pages"
      heading={shown.label}
      subline={shown.about}
      fill
      asking={asking ? { question: asking.question, onKeep: () => setAsking(null), onDiscard: asking.go } : undefined}
    >
      <Guard.Provider value={holds}>
        <div key={`${shown.id} ${visit}`} className="h-full">
          {shown.id === "account" && <AccountSettings parts={["profile", "password"]} />}
          {shown.id === "appearance" && <AppearanceSettings />}
          {shown.id === "api-keys" && <AccountSettings parts={["keys"]} />}
          {(shown.id === "brands" || shown.id === "look" || shown.id === "social" || shown.id === "brand-assistant") && (
            <BrandPages section={shown.id} at={at} go={go} onChanged={() => { changed.current = true; }} />
          )}
          {shown.id === "users" && <UsersSettings />}
          {shown.id === "security" && <SecuritySettings />}
          {shown.id === "assistant" && <AssistantPage />}
        </div>
      </Guard.Provider>
    </PanelDialog>
  );
}

interface Brands { profiles: Profile[]; archived: Profile[]; designs: Record<string, Design>; activeId: string }

async function readBrands(): Promise<Brands> {
  const st = await api.state();
  const profiles = withStandardPalettes(st.profiles as Profile[]);
  return {
    profiles,
    archived: Array.isArray(st.archived) ? completeProfiles(st.archived as Profile[]) : [],
    designs: st.designs as Record<string, Design>,
    activeId: pickActive(st.preferences.activeProfile, profiles) ?? profiles[0].id,
  };
}

/** The pages about brands. They read the brands from the server, and again after each change. */
function BrandPages({ section, at, go, onChanged }: { section: "brands" | "look" | "social" | "brand-assistant"; at: At; go: (next: At, query?: string) => void; onChanged: () => void }) {
  const [brands, setBrands] = useState<Brands | null>(null);
  const [error, setError] = useState<string | null>(null);
  // a copy started from the list
  const [adding, setAdding] = useState(!!at.adding);
  const [copyOf, setCopyOf] = useState<Profile | undefined>(undefined);
  const sync = useCallback(async () => { setBrands(await readBrands()); }, []);
  const [kinds, setKinds] = useState<Record<string, BrandDetails["kind"]>>({});
  // the list shows each brand's type; one that cannot be read simply has none
  const ids = section === "brands" ? brands?.profiles.map((p) => p.id).join(" ") : undefined;
  useEffect(() => {
    if (!ids) return;
    let gone = false;
    void Promise.all(ids.split(" ").map((id) => api.brandDetails(id).then((d) => [id, d.kind] as const, () => [id, ""] as const)))
      .then((all) => { if (!gone) setKinds(Object.fromEntries(all)); });
    return () => { gone = true; };
  }, [ids]);
  const load = useCallback(() => { setError(null); sync().catch((e) => setError(e instanceof Error ? e.message : "Could not load")); }, [sync]);
  useEffect(load, [load]);

  if (!brands) {
    return (
      <Pane>
        {error
          ? <div role="alert" className="space-y-2 text-sm"><p className="text-destructive">{error}</p><Button variant="outline" size="sm" onClick={load}>Try again</Button></div>
          : <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
      </Pane>
    );
  }
  const current = brands.profiles.find((p) => p.id === brands.activeId) ?? brands.profiles[0];

  if (section === "social") return <SocialSettings profileId={current.id} brandName={current.name} onChanged={onChanged} />;
  if (section === "brand-assistant") return <BrandAssistant key={current.id} profileId={current.id} brandName={current.name} />;
  if (section === "look") {
    const id = brands.profiles.some((p) => p.id === at.look) ? at.look! : current.id;
    return <BrandLook key={id} profiles={brands.profiles} id={id} design={brands.designs[id]} onBack={() => go({ section: "brands" })} onChanged={() => { onChanged(); void sync(); }} />;
  }

  const changing = async (work: () => Promise<unknown>) => { await work(); onChanged(); await sync(); };
  const setActive = (id: string) => changing(() => api.putPreference("activeProfile", id));
  const done = () => { setAdding(false); setCopyOf(undefined); window.history.replaceState(window.history.state, "", settingsHref("brands")); };
  const create = async (p: Profile, from?: Profile, details?: BrandDetails) => {
    await api.createProfile(p);
    // the brand exists by now: details that cannot be saved are said, and can be typed again under Brand look
    if (details) await api.saveBrandDetails(p.id, details).catch((e) => toast.error("The brand is made; its details were not saved", { description: e instanceof Error ? e.message : undefined }));
    // a copy starts from the other brand's card, a blank one from the default card without footer text
    const copied = from && brands.designs[from.id];
    let base = from ? (copied ? fullDesign(DEFAULT_DESIGN, copied) : DEFAULT_DESIGN) : blankDesign(DEFAULT_DESIGN);
    if (from) {
      // its pictures go into its own library
      await copyPictures(from.id, p.id, { profile: p, design: base })
        .then(async (own) => { await api.saveProfile(own.profile); base = own.design; })
        .catch((e) => { base = { ...base, photos: [], screenshot: undefined, bgImage: undefined }; toast.error("The brand is made; its pictures were not copied", { description: e instanceof Error ? e.message : undefined }); });
    }
    await api.putDesigns({ ...brands.designs, [p.id]: base });
    await setActive(p.id);
    done();
  };

  if (adding) return <NewBrand onClose={done} brands={brands.profiles} current={current} source={copyOf} onCreate={create} />;
  const colors = Object.fromEntries([...brands.profiles, ...brands.archived].map((p) => [p.id, brandColor(p, brands.designs[p.id])]));
  return (
    <ManageBrands kinds={kinds} active={brands.profiles} archived={brands.archived} activeId={current.id} colors={colors}
      onOpen={setActive}
      onRename={(id, name) => changing(async () => {
        // the saved brand as the server has it, so that only its name changes
        const saved = ((await api.state()).profiles as Profile[]).find((b) => b.id === id);
        if (!saved) throw new Error("That brand no longer exists.");
        await api.putProfiles([{ ...saved, name }]);
      })}
      onLook={(id) => go({ section: "look", look: id }, `?look=${encodeURIComponent(id)}`)}
      onMove={(id, dir) => changing(() => api.orderProfiles(move(brands.profiles.map((b) => b.id), id, dir)))}
      onDuplicate={(p) => { setCopyOf(p); setAdding(true); }}
      onArchive={async (id) => {
        const r = await api.archiveProfile(id);
        if (id === current.id) { const next = brands.profiles.find((b) => b.id !== id); if (next) await api.putPreference("activeProfile", next.id); }
        onChanged();
        await sync();
        return r;
      }}
      onRestore={(id) => changing(() => api.restoreProfile(id))}
      onDelete={(id) => changing(() => api.deleteProfile(id))}
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
    <Pane>
      <div className="space-y-3 text-sm">
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
    </Pane>
  );
}
