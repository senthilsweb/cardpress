import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import JSZip from "jszip";
import { Check, Copy, Download, Eye, LayoutGrid, Loader2, Palette as PaletteIcon, PackageOpen, Shuffle, Square, Type, User, MessageSquareText, Sparkles, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Card } from "@/card/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ContentPanel, DesignPanel, ProfilePanel } from "./panels";
import { Composer } from "./Composer";
import { SocialSettings } from "./SocialSettings";
import { BrandSwitcher, ManageBrandsDrawer, NewBrandDrawer } from "./Brands";
import { ChatPanel } from "./ChatPanel";
import { Drawer } from "@/components/ui/drawer";
import { FeedFrame, ScaledCard } from "./preview";
import { DEFAULT_DESIGN, DEFAULT_PROFILES, completeProfiles, withStandardPalettes } from "@/lib/profiles";
import { blankDesign, brandColor, move } from "@/lib/brands";
import { NETWORKS, SIZES, sizeById, type Network, type Size } from "@/lib/sizes";
import type { Design, Profile } from "@/lib/types";
import { useSyncedState } from "@/lib/store";
import { useTheme } from "@/lib/useTheme";
import { AccountMenu } from "./AccountMenu";
import { AccountSettings } from "./AccountSettings";
import { UsersDrawer } from "./UsersDrawer";
import { VersionsDrawer } from "./VersionsDrawer";
import { flushPendingEdits } from "@/lib/pendingEdits";
import { SessionProvider } from "./SessionProvider";
import { BuiltWith, Logo } from "./Logo";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useDrafts } from "@/lib/useDrafts";
import { usePostMedia } from "@/lib/usePostMedia";
import { leftOut, whyNot } from "@/lib/media";
import { useJobs } from "@/lib/useJobs";
import { useChat } from "@/lib/useChat";
import { docFromAgentText, type ProposalEdit } from "@/lib/chat";
import { serializeDraft } from "@/lib/linkedin";
import { api } from "@/lib/api";
import { useBoot, type Loaded } from "@/lib/boot";
import { hydrateCustomFonts } from "@/lib/fonts";
import { LayoutContext, type Layout } from "@/lib/layout";
import { BootScreen } from "./BootScreen";
import { cardToBlob, copyBlob, downloadBlob } from "@/lib/export";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 800, h: 600 });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

export default function Studio() {
  const { boot, retry, submitToken, importLegacy, discardLegacy, openBrand } = useBoot();
  if (boot.status !== "ready") return <BootScreen boot={boot} retry={retry} submitToken={submitToken} importLegacy={importLegacy} discardLegacy={discardLegacy} />;
  // keyed by brand: opening another brand starts the whole studio over for it, so nothing of the last one is left on screen
  return <SessionProvider initial={boot.data.session}><Workspace key={boot.data.activeId} initial={boot.data} openBrand={openBrand} /></SessionProvider>;
}

function Workspace({ initial, openBrand }: { initial: Loaded; openBrand: (id: string) => Promise<void> }) {
  const [theme, toggleTheme] = useTheme(initial.theme);
  useState(() => { hydrateCustomFonts(initial.customFonts, (list) => { api.putPreference("customFonts", list).catch(() => undefined); }); });
  const [profiles, setProfiles, , replaceProfiles] = useSyncedState<Profile[]>(initial.profiles, (v) => api.putProfiles(v));
  const [archived, setArchived] = useState<Profile[]>(initial.archived);
  // designs are keyed by profile id
  const [designs, setDesigns, saveError] = useSyncedState<Record<string, Design>>(initial.designs, (v) => api.putDesigns(v));
  const profile = profiles.find((p) => p.id === initial.activeId) ?? profiles[0] ?? DEFAULT_PROFILES[0];
  // the brand's design is where a new item starts; each item then keeps its own (see Draft.design)
  const brandDesign: Design = useMemo(() => {
    const d = { ...DEFAULT_DESIGN, ...(designs[profile.id] ?? {}) };
    if (!profile.palettes.some((p) => p.id === d.paletteId)) d.paletteId = profile.palettes[0].id;
    return d;
  }, [designs, profile]);
  const store = useDrafts(profile.id, initial.drafts, () => brandDesign);
  const design: Design = useMemo(() => {
    const own = store.current?.design;
    if (!own) return brandDesign;
    const d = { ...DEFAULT_DESIGN, ...own };
    if (!profile.palettes.some((p) => p.id === d.paletteId)) d.paletteId = profile.palettes[0].id;
    return d;
  }, [brandDesign, store.current?.design, profile]);
  const jobs = useJobs(profile.id);
  const chat = useChat(profile.id);
  const [tab, setTab] = useState("design");
  const [layout, setLayout] = useSyncedState<Layout>(initial.layout, (v) => api.putPreference("layout", v));
  const layoutCtx = useMemo(() => ({
    isCollapsed: (id: string) => layout.collapsed[id] === true,
    toggle: (id: string) => setLayout((l) => ({ ...l, collapsed: { ...l.collapsed, [id]: !l.collapsed[id] } })),
    editorHeight: layout.editorHeight,
    setEditorHeight: (h: number) => setLayout((l) => ({ ...l, editorHeight: h })),
  }), [layout.collapsed, layout.editorHeight, setLayout]);
  const sidebarHidden = layout.sidebarCollapsed;
  const toggleSidebar = useCallback(() => setLayout((l) => ({ ...l, sidebarCollapsed: !l.sidebarCollapsed })), [setLayout]);
  // Ctrl/Cmd + \ hides or shows the sidebar (Ctrl/Cmd + B is bold in the editor)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "\\") { e.preventDefault(); toggleSidebar(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);
  // the right-hand drawers share one edge, so only one is open at a time
  const [panel, setPanel] = useState<"assistant" | "accounts" | "newBrand" | "manage" | "account" | "users" | "history" | null>(null);
  // the library can send someone straight to a draft's Full preview (to schedule it)
  const [previewRequested, setPreviewRequested] = useState(false);
  // another page (the library) can ask for a drawer or a draft: /studio/?open=accounts|brands, /studio/?draft=<id>
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const want = q.get("open"), draft = q.get("draft");
    if (want === "accounts" || want === "brands") setPanel(want === "accounts" ? "accounts" : "manage");
    if (want === "account" || want === "users") setPanel(want);
    if (want === "preview") setPreviewRequested(true);
    if (draft) { void store.select(draft); setTab("post"); }
    if (want || draft || q.get("brand")) window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const settingsOpen = panel === "accounts", assistantOpen = panel === "assistant";
  const setSettingsOpen = (o: boolean) => setPanel(o ? "accounts" : null);
  const setAssistantOpen = (o: boolean) => setPanel(o ? "assistant" : null);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [editorHost, setEditorHost] = useState<HTMLDivElement | null>(null);
  const caption = useMemo(() => (store.current ? serializeDraft(store.current).text : ""), [store.current]);
  /**
   * Copy an approved proposal into a draft. An empty current draft is filled in; if it already has text, a new draft is
   * made instead, so the person's own writing is never overwritten. Returns the draft's id.
   */
  const applyProposal = async (c: ProposalEdit, opts: { useTitle: boolean }): Promise<string> => {
    const content = { kind: c.kind, doc: docFromAgentText(c.body, c.kind), hashtags: c.kind === "post" ? c.hashtags : [], altText: c.altText };
    const cur = store.current;
    let id: string;
    if (cur && !serializeDraft(cur).text.trim()) { store.update(content); id = cur.id; }
    else id = await store.createFrom(content);
    if (opts.useTitle && c.title) set({ title: c.title });
    flash(cur && id === cur.id ? "Copied into your draft" : "Copied into a new draft");
    return id;
  };

  /* ---------- brands ---------- */
  const brandNames = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p.name])), [profiles]);
  const brandColors = useMemo(() => Object.fromEntries([...profiles, ...archived].map((p) => [p.id, brandColor(p, designs[p.id])])), [profiles, archived, designs]);
  const [switching, setSwitching] = useState(false);
  const [copyOf, setCopyOf] = useState<Profile | undefined>(undefined);
  const switchBrand = async (id: string) => {
    if (switching || id === profile.id) return;
    setSwitching(true);
    try { await openBrand(id); } // the studio is replaced when this succeeds
    catch (e) { flash(`Could not open the brand: ${(e as Error).message}`); setSwitching(false); }
  };
  /** Read the brand list again, so what is shown is what the server has. */
  const syncBrands = async () => {
    const st = await api.state();
    replaceProfiles(withStandardPalettes(st.profiles as Profile[]));
    setArchived(Array.isArray(st.archived) ? completeProfiles(st.archived as Profile[]) : []);
  };
  const createBrand = async (p: Profile, from: Profile | undefined, open: boolean) => {
    await api.createProfile(p);
    // the new brand's card: a copy starts from the other brand's card, a blank one from the default card without footer text
    const base = from ? { ...DEFAULT_DESIGN, ...(designs[from.id] ?? {}) } : blankDesign(DEFAULT_DESIGN);
    await api.putDesigns({ ...designs, [p.id]: base });
    if (open) await openBrand(p.id); else await syncBrands();
  };
  const duplicateBrand = async (p: Profile) => { setCopyOf(p); setPanel("newBrand"); };
  const moveBrand = async (id: string, dir: -1 | 1) => {
    await api.orderProfiles(move(profiles.map((b) => b.id), id, dir));
    await syncBrands();
  };
  const archiveBrand = async (id: string) => {
    const res = await api.archiveProfile(id);
    if (id === profile.id) {
      const next = profiles.find((b) => b.id !== id);
      if (next) await openBrand(next.id);
    } else await syncBrands();
    return res;
  };
  const restoreBrand = async (id: string) => { await api.restoreProfile(id); await syncBrands(); };
  const deleteBrand = async (id: string) => { await api.deleteProfile(id); await syncBrands(); };

  const palette = profile.palettes.find((p) => p.id === design.paletteId) ?? profile.palettes[0];
  const size = sizeById(design.sizeId);

  const waiting = store.current?.status === "scheduled";
  const set = useCallback((patch: Partial<Design>) => {
    if (waiting) { toast("A post is waiting to be sent from this draft", { description: "Cancel it in the queue to change the card." }); return; }
    const next = { ...design, ...patch };
    setDesigns((all) => ({ ...all, [profile.id]: next })); // the brand's starting point follows the latest card
    store.update({ design: next });
  }, [design, profile.id, setDesigns, store, waiting]);
  const updateProfile = (patch: Partial<Profile>) => setProfiles((all) => all.map((p) => (p.id === profile.id ? { ...p, ...patch } : p)));

  const [view, setView] = useState<"one" | "all">("one");
  const [feed, setFeed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const flash = (m: string) => { setNote(m); window.setTimeout(() => setNote(null), 2600); };

  /* ---------- export: render native-size cards off screen, then capture ---------- */
  const [stage, setStage] = useState<Size[]>([]);
  const stageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const render = async (sizes: Size[]) => {
    flushSync(() => setStage(sizes));
    await nextFrame();
    const out: { size: Size; blob: Blob }[] = [];
    for (const s of sizes) {
      const node = stageRefs.current[s.id];
      if (node) out.push({ size: s, blob: await cardToBlob(node, s.w, s.h) });
    }
    setStage([]);
    return out;
  };
  const fileBase = slugify(design.title || design.statValue || "card");
  const fileName = (s: Size) => `${fileBase}-${slugify(s.net)}-${slugify(s.name)}-${s.w}x${s.h}.png`;

  const run = async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(label);
    try { await fn(); } catch (e) { flash(`Could not export: ${(e as Error).message}`); } finally { setBusy(null); }
  };
  const doDownload = () => run("download", async () => {
    const [r] = await render([size]);
    downloadBlob(r.blob, fileName(size));
    flash(`Saved ${fileName(size)}`);
  });
  const doCopy = () => run("copy", async () => {
    const [r] = await render([size]);
    await copyBlob(r.blob);
    flash("Image copied – paste it into your post");
  });
  const doZip = () => run("zip", async () => {
    const zip = new JSZip();
    for (const s of SIZES) {
      const [r] = await render([s]);
      zip.file(fileName(s), r.blob);
    }
    downloadBlob(await zip.generateAsync({ type: "blob" }), `${fileBase}-all-sizes.zip`);
    flash(`Saved ${SIZES.length} sizes as zip`);
  });

  /* ---------- profiles ---------- */
  // reset and import act on the open brand's look; its id and name stay
  const resetBrand = () => updateProfile({ ...DEFAULT_PROFILES[0], id: profile.id, name: profile.name, displayName: profile.displayName, handle: profile.handle, website: profile.website, logoText: profile.logoText });
  const importBrand = (list: Profile[]) => { const src = list[0]; updateProfile({ ...src, id: profile.id, name: profile.name }); flash("Imported"); };

  /* ---------- canvas size ---------- */
  const [canvasRef, box] = useBox<HTMLDivElement>();
  const maxW = Math.max(200, box.w - 64), maxH = Math.max(200, box.h - 72);

  const cardProps = { design, profile, palette };
  // a feed preview shows what the post carries, and only for the networks that can take it
  const media = usePostMedia(store.current);
  const cannot = (net: Network) => (feed ? whyNot(net, media.media) : null);
  const excluded = feed ? leftOut(media.media) : [];

  return (
    <TooltipProvider delayDuration={250}>
     <LayoutContext.Provider value={layoutCtx}>
      <Toaster theme={theme} />
      <div className="flex h-dvh flex-col">
        {/* header – mirrors senthilsweb.com: mono wordmark, thin bar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border app-header px-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={toggleSidebar} aria-label={sidebarHidden ? "Show sidebar" : "Hide sidebar"} aria-pressed={sidebarHidden}>
                {sidebarHidden ? <PanelLeftOpen /> : <PanelLeftClose />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{sidebarHidden ? "Show sidebar" : "Hide sidebar"} (Ctrl/⌘ + \)</TooltipContent>
          </Tooltip>
          {sidebarHidden && <AccountMenu variant="avatar" page="studio" name={profile.name} handle={profile.handle} color={brandColors[profile.id] ?? "#888"} theme={theme} onToggleTheme={toggleTheme} onAccounts={() => setSettingsOpen(true)} onManageBrands={() => setPanel("manage")} onSettings={() => setPanel("account")} onUsers={() => setPanel("users")} />}
          <Logo />
          <div className="flex-1" />
          <BrandSwitcher brands={profiles} activeId={profile.id} colors={brandColors} busy={switching} onSwitch={(id) => void switchBrand(id)} onNew={() => { setCopyOf(undefined); setPanel("newBrand"); }} onManage={() => setPanel("manage")} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={assistantOpen ? "secondary" : "ghost"} size="icon-sm" className="relative" onClick={() => setAssistantOpen(!assistantOpen)} aria-label={chat.pendingCount > 0 ? `Assistant, ${chat.pendingCount} proposals waiting for your decision` : "Assistant"} aria-expanded={assistantOpen}>
                <Sparkles />
                {chat.pendingCount > 0 && <span aria-hidden className="absolute -right-1 -top-1 min-w-4 rounded-full bg-brand px-1 text-[10px] font-semibold leading-4 text-white">{chat.pendingCount}</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Assistant: draft a post from an article</TooltipContent>
          </Tooltip>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* sidebar */}
          <aside
            inert={sidebarHidden}
            className={cn(
              "flex shrink-0 flex-col overflow-hidden border-border bg-card transition-[width] duration-200 ease-out motion-reduce:transition-none",
              sidebarHidden ? "hidden lg:flex lg:w-0 lg:border-r-0" : "w-full border-b lg:w-[380px] lg:border-b-0 lg:border-r",
            )}
          >
           <div className="flex min-h-0 flex-1 flex-col lg:w-[380px]">
            <Tabs value={tab} onValueChange={(v) => { setTab(v); if (v !== "post") setEditorExpanded(false); }} className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-border px-3 py-2.5">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="design" className="gap-1 px-1 text-[12.5px]"><PaletteIcon /> Design</TabsTrigger>
                  <TabsTrigger value="content" className="gap-1 px-1 text-[12.5px]"><Type /> Text</TabsTrigger>
                  <TabsTrigger value="post" className="gap-1 px-1 text-[12.5px]"><MessageSquareText /> Post</TabsTrigger>
                  <TabsTrigger value="profile" className="gap-1 px-1 text-[12.5px]"><User /> Brand</TabsTrigger>
                </TabsList>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <TabsContent value="design" className="mt-0"><DesignPanel design={design} set={set} profile={profile} palette={palette} /></TabsContent>
                <TabsContent value="content" className="mt-0"><ContentPanel design={design} set={set} /></TabsContent>
                <TabsContent value="post" className="mt-0"><Composer media={media} onOpenHistory={() => setPanel("history")} openPreview={previewRequested} store={store} jobs={jobs} brandNames={brandNames} renderPng={async (s) => (await render([s]))[0].blob} onOpenSettings={() => setSettingsOpen(true)} design={design} profile={profile} palette={palette} size={size} expanded={editorExpanded} setExpanded={setEditorExpanded} host={editorHost} /></TabsContent>
                <TabsContent value="profile" className="mt-0">
                  <ProfilePanel
                    profile={profile}
                    profiles={[profile]}
                    paletteId={palette.id}
                    updateProfile={updateProfile}
                    setPaletteId={(id) => set({ paletteId: id })}
                    resetProfiles={resetBrand}
                    importProfiles={importBrand}
                  />
                </TabsContent>
              </div>
            </Tabs>
            <div className="shrink-0 border-t border-border p-2">
              <AccountMenu page="studio" name={profile.name} handle={profile.handle} color={brandColors[profile.id] ?? "#888"} theme={theme} onToggleTheme={toggleTheme} onAccounts={() => setSettingsOpen(true)} onManageBrands={() => setPanel("manage")} onSettings={() => setPanel("account")} onUsers={() => setPanel("users")} />
              <BuiltWith className="px-2 pb-1 pt-2" />
            </div>
           </div>
          </aside>

          {/* canvas */}
          <main className="relative flex min-h-[70vh] min-w-0 flex-1 flex-col lg:min-h-0">
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2.5">
              <div className="flex rounded-md border border-border bg-card p-0.5">
                <button type="button" onClick={() => setView("one")} className={cn("flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium", view === "one" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}><Square className="h-3.5 w-3.5" /> One</button>
                <button type="button" onClick={() => setView("all")} className={cn("flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium", view === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}><LayoutGrid className="h-3.5 w-3.5" /> All sizes</button>
              </div>
              {NETWORKS.map((net) => (
                <div key={net} className="flex items-center gap-0.5 rounded-md border border-border bg-card py-0.5 pl-2.5 pr-0.5">
                  <span className="mr-1 text-xs font-semibold">{net}</span>
                  {SIZES.filter((s) => s.net === net).map((s) => {
                    const on = view === "one" && s.id === size.id;
                    const why = cannot(net);
                    return (
                      <Tooltip key={s.id}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-disabled={!!why}
                            onClick={() => { if (why) return; set({ sizeId: s.id }); setView("one"); }}
                            className={cn("rounded px-2 py-1 text-xs", why ? "cursor-not-allowed text-muted-foreground/45 line-through" : on ? "cursor-pointer bg-primary text-primary-foreground" : "cursor-pointer text-muted-foreground hover:bg-accent hover:text-foreground")}
                          >
                            {s.name}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{why ? `${net}: ${why}` : `${s.w} × ${s.h}`}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2">
              <div className="flex items-center gap-2">
                <Switch id="feed" checked={feed} onCheckedChange={setFeed} />
                <Label htmlFor="feed" className="flex items-center gap-1 text-foreground"><Eye className="h-3.5 w-3.5" /> Feed preview</Label>
              </div>
              <span className="eyebrow ml-2 hidden md:inline">{view === "one" ? `${size.net} · ${size.name} · ${size.w}×${size.h}` : `${SIZES.filter((s) => !cannot(s.net)).length} sizes`}</span>
              <div className="flex-1" />
              {note && <span className="flex items-center gap-1 text-xs text-brand"><Check className="h-3.5 w-3.5" />{note}</span>}
              {saveError && <span className="text-xs text-destructive">Could not save to the server – will retry on your next change</span>}
              <Button variant="outline" size="sm" onClick={() => set({ seed: 1 + Math.floor(Math.random() * 99999) })}><Shuffle /> Shuffle</Button>
              <Button variant="outline" size="sm" onClick={doCopy} disabled={!!busy || view === "all"}>{busy === "copy" ? <Loader2 className="animate-spin" /> : <Copy />} Copy</Button>
              <Button variant="outline" size="sm" onClick={doZip} disabled={!!busy}>{busy === "zip" ? <Loader2 className="animate-spin" /> : <PackageOpen />} All sizes .zip</Button>
              <Button variant="brand" size="sm" onClick={doDownload} disabled={!!busy || view === "all"}>{busy === "download" ? <Loader2 className="animate-spin" /> : <Download />} Download PNG</Button>
            </div>

            <div ref={canvasRef} className="canvas-grid min-h-0 flex-1 overflow-auto">
              {view === "one" ? (
                <div className="flex min-h-full items-center justify-center p-8">
                  {cannot(size.net) ? (
                    <p role="status" className="max-w-sm rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No {size.net} preview: {cannot(size.net)}.</p>
                  ) : feed ? (
                    <FeedFrame {...cardProps} {...media.frame} size={size} caption={caption} width={Math.min(maxW, size.w / size.h < 1 ? 470 : 560)} />
                  ) : (
                    <ScaledCard {...cardProps} size={size} maxW={maxW} maxH={maxH} />
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-center gap-6 p-8">
                  {excluded.length > 0 && <p role="status" className="w-full text-center text-xs text-muted-foreground">Left out: {excluded.map((l) => `${l.net} (${l.why})`).join(", ")}</p>}
                  {SIZES.filter((s) => !cannot(s.net)).map((s) => (
                    <button key={s.id} type="button" className="group cursor-pointer text-left" onClick={() => { set({ sizeId: s.id }); setView("one"); }}>
                      <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground group-hover:text-brand">
                        <b className="text-foreground">{s.net}</b> · {s.name} · {s.w}×{s.h}
                      </div>
                      {feed ? <FeedFrame {...cardProps} {...media.frame} size={s} caption={caption} width={320} /> : <ScaledCard {...cardProps} size={s} maxW={330} maxH={420} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* the expanded editor is drawn here, on top of the canvas */}
            <div ref={setEditorHost} className={cn("absolute inset-0 z-20", !editorExpanded && "hidden")} />
          </main>
        </div>
      </div>
      <AccountSettings open={panel === "account"} onClose={() => setPanel(null)} />
      <UsersDrawer open={panel === "users"} onClose={() => setPanel(null)} />
      <VersionsDrawer open={panel === "history"} onClose={() => setPanel(null)} draft={store.current} onRestore={async (seq) => { flushPendingEdits(); await store.restoreVersion(seq); }} statusKey={`${store.current?.id}:${store.current?.status}`} />
      <SocialSettings open={settingsOpen} onOpenChange={setSettingsOpen} profileId={profile.id} brandName={profile.name} />
      <NewBrandDrawer
        open={panel === "newBrand"} onClose={() => setPanel(null)} brands={profiles} current={profile} source={copyOf}
        onCreate={(p, from) => createBrand(p, from, true)}
      />
      <ManageBrandsDrawer
        open={panel === "manage"} onClose={() => setPanel(null)} active={profiles} archived={archived} activeId={profile.id} colors={brandColors}
        onOpen={switchBrand} onMove={moveBrand} onDuplicate={(p) => void duplicateBrand(p)} onArchive={archiveBrand} onRestore={restoreBrand} onDelete={deleteBrand}
      />
      <Drawer open={assistantOpen} onClose={() => setAssistantOpen(false)} title={`Assistant · ${profile.name}`} resizeKey="assistant">
        <ChatPanel chat={chat} onApply={applyProposal} onOpenPost={() => { setTab("post"); if (sidebarHidden) toggleSidebar(); setAssistantOpen(false); }} />
      </Drawer>
     </LayoutContext.Provider>

      {/* off-screen export stage: full-size cards, no transforms */}
      <div aria-hidden style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none" }}>
        {stage.map((s) => (
          <Card key={s.id} ref={(el) => { stageRefs.current[s.id] = el; }} {...cardProps} size={s} />
        ))}
      </div>
    </TooltipProvider>
  );
}
