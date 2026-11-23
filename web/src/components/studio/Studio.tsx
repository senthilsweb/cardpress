import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import JSZip from "jszip";
import { Check, Copy, Download, Eye, LayoutGrid, Loader2, Moon, Palette as PaletteIcon, PackageOpen, Shuffle, Square, Sun, Type, User, MessageSquareText, PanelLeftClose, PanelLeftOpen, Settings as SettingsIcon } from "lucide-react";
import { Card } from "@/card/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ContentPanel, DesignPanel, ProfilePanel } from "./panels";
import { Composer } from "./Composer";
import { SocialSettings } from "./SocialSettings";
import { FeedFrame, ScaledCard } from "./preview";
import { DEFAULT_DESIGN, DEFAULT_PROFILES } from "@/lib/profiles";
import { NETWORKS, SIZES, sizeById, type Size } from "@/lib/sizes";
import type { Design, Profile } from "@/lib/types";
import { useSyncedState } from "@/lib/store";
import { useDrafts } from "@/lib/useDrafts";
import { useJobs } from "@/lib/useJobs";
import { serializeDraft } from "@/lib/linkedin";
import { api } from "@/lib/api";
import { useBoot, type Loaded } from "@/lib/boot";
import { hydrateCustomFonts } from "@/lib/fonts";
import { LayoutContext, type Layout } from "@/lib/layout";
import { BootScreen } from "./BootScreen";
import { cardToBlob, copyBlob, downloadBlob } from "@/lib/export";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="14" height="14" viewBox="0 0 10 10"><path d="M5 0.6 9.4 5 5 9.4 0.6 5Z" className="fill-brand" /></svg>
      <span className="font-mono text-[12.5px] font-bold uppercase tracking-[0.14em]">CardPress</span>
    </div>
  );
}

function useTheme(saved?: "light" | "dark") {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    saved ?? (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light")
  );
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    api.putPreference("theme", next).catch(() => undefined); // a failed save only means the choice is not remembered
  };
  return [theme, toggle] as const;
}

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
  const { boot, retry, submitToken, importLegacy, discardLegacy } = useBoot();
  if (boot.status !== "ready") return <BootScreen boot={boot} retry={retry} submitToken={submitToken} importLegacy={importLegacy} discardLegacy={discardLegacy} />;
  return <Workspace initial={boot.data} />;
}

function Workspace({ initial }: { initial: Loaded }) {
  const [theme, toggleTheme] = useTheme(initial.theme);
  useState(() => { hydrateCustomFonts(initial.customFonts, (list) => { api.putPreference("customFonts", list).catch(() => undefined); }); });
  const [profiles, setProfiles] = useSyncedState<Profile[]>(initial.profiles, (v) => api.putProfiles(v));
  // designs are keyed by profile id
  const [designs, setDesigns, saveError] = useSyncedState<Record<string, Design>>(initial.designs, (v) => api.putDesigns(v));
  const profile = profiles[0] ?? DEFAULT_PROFILES[0];
  const design: Design = useMemo(() => {
    const d = { ...DEFAULT_DESIGN, ...(designs[profile.id] ?? {}) };
    if (!profile.palettes.some((p) => p.id === d.paletteId)) d.paletteId = profile.palettes[0].id;
    return d;
  }, [designs, profile]);
  const store = useDrafts(profile.id, initial.drafts);
  const jobs = useJobs(profile.id);
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [editorHost, setEditorHost] = useState<HTMLDivElement | null>(null);
  const caption = useMemo(() => (store.current ? serializeDraft(store.current).text : ""), [store.current]);
  const palette = profile.palettes.find((p) => p.id === design.paletteId) ?? profile.palettes[0];
  const size = sizeById(design.sizeId);

  const set = useCallback((patch: Partial<Design>) => setDesigns((all) => ({ ...all, [profile.id]: { ...design, ...patch } })), [design, profile.id, setDesigns]);
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
  const resetProfiles = () => setProfiles(DEFAULT_PROFILES);
  const importProfiles = (list: Profile[]) => { setProfiles(list.slice(0, 1)); flash("Imported profile"); };

  /* ---------- canvas size ---------- */
  const [canvasRef, box] = useBox<HTMLDivElement>();
  const maxW = Math.max(200, box.w - 64), maxH = Math.max(200, box.h - 72);

  const cardProps = { design, profile, palette };

  return (
    <TooltipProvider delayDuration={250}>
     <LayoutContext.Provider value={layoutCtx}>
      <div className="flex h-dvh flex-col">
        {/* header – mirrors senthilsweb.com: mono wordmark, thin bar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={toggleSidebar} aria-label={sidebarHidden ? "Show sidebar" : "Hide sidebar"} aria-pressed={sidebarHidden}>
                {sidebarHidden ? <PanelLeftOpen /> : <PanelLeftClose />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{sidebarHidden ? "Show sidebar" : "Hide sidebar"} (Ctrl/⌘ + \)</TooltipContent>
          </Tooltip>
          <Logo />
          <span className="hidden text-xs text-muted-foreground md:inline">Social media cards for LinkedIn, X and more</span>
          <div className="flex-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={() => setSettingsOpen(true)} aria-label="Social accounts"><SettingsIcon /></Button>
            </TooltipTrigger>
            <TooltipContent>Social accounts</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label="Toggle theme">{theme === "dark" ? <Sun /> : <Moon />}</Button>
            </TooltipTrigger>
            <TooltipContent>{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
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
            <Tabs defaultValue="design" onValueChange={(v) => { if (v !== "post") setEditorExpanded(false); }} className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-border px-3 py-2.5">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="design"><PaletteIcon /> Design</TabsTrigger>
                  <TabsTrigger value="content"><Type /> Text</TabsTrigger>
                  <TabsTrigger value="post"><MessageSquareText /> Post</TabsTrigger>
                  <TabsTrigger value="profile"><User /> Profile</TabsTrigger>
                </TabsList>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <TabsContent value="design" className="mt-0"><DesignPanel design={design} set={set} profile={profile} palette={palette} /></TabsContent>
                <TabsContent value="content" className="mt-0"><ContentPanel design={design} set={set} /></TabsContent>
                <TabsContent value="post" className="mt-0"><Composer store={store} jobs={jobs} renderPng={async (s) => (await render([s]))[0].blob} onOpenSettings={() => setSettingsOpen(true)} design={design} profile={profile} palette={palette} size={size} expanded={editorExpanded} setExpanded={setEditorExpanded} host={editorHost} /></TabsContent>
                <TabsContent value="profile" className="mt-0">
                  <ProfilePanel
                    profile={profile}
                    profiles={profiles}
                    paletteId={palette.id}
                    updateProfile={updateProfile}
                    setPaletteId={(id) => set({ paletteId: id })}
                    resetProfiles={resetProfiles}
                    importProfiles={importProfiles}
                  />
                </TabsContent>
              </div>
            </Tabs>
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
                    return (
                      <Tooltip key={s.id}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => { set({ sizeId: s.id }); setView("one"); }}
                            className={cn("cursor-pointer rounded px-2 py-1 text-xs", on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
                          >
                            {s.name}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{s.w} × {s.h}</TooltipContent>
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
              <span className="eyebrow ml-2 hidden md:inline">{view === "one" ? `${size.net} · ${size.name} · ${size.w}×${size.h}` : `${SIZES.length} sizes`}</span>
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
                  {feed ? (
                    <FeedFrame {...cardProps} size={size} caption={caption} width={Math.min(maxW, size.w / size.h < 1 ? 470 : 560)} />
                  ) : (
                    <ScaledCard {...cardProps} size={size} maxW={maxW} maxH={maxH} />
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-center gap-6 p-8">
                  {SIZES.map((s) => (
                    <button key={s.id} type="button" className="group cursor-pointer text-left" onClick={() => { set({ sizeId: s.id }); setView("one"); }}>
                      <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground group-hover:text-brand">
                        <b className="text-foreground">{s.net}</b> · {s.name} · {s.w}×{s.h}
                      </div>
                      {feed ? <FeedFrame {...cardProps} size={s} caption={caption} width={320} /> : <ScaledCard {...cardProps} size={s} maxW={330} maxH={420} />}
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
      <SocialSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
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
