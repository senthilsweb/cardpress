import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import JSZip from "jszip";
import { Check, Copy, Download, Eye, LayoutGrid, Loader2, Palette as PaletteIcon, PackageOpen, Shuffle, Square, Type, User, SlidersHorizontal, MessageSquareText, PanelLeftClose, PanelLeftOpen, } from "lucide-react";
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
import { ChatHistoryDrawer } from "./ChatHistoryDrawer";
import { StageBar, type StageView } from "./StageBar";
import { SideGrip } from "./SideGrip";
import { ArticleView } from "./ArticleView";
import { conversationFor, linksDraft, pairFor } from "@/lib/workspace";
import { useMedia } from "@/lib/useMedia";
import { toCardDesign } from "@/lib/cardDesign";
import { lockReason } from "@/lib/lock";
import { FeedFrame, ScaledCard } from "./preview";
import { DEFAULT_DESIGN, DEFAULT_PROFILES, completeProfiles, withStandardPalettes } from "@/lib/profiles";
import { blankDesign, brandColor, move } from "@/lib/brands";
import { NETWORKS, SIZES, sizeById, type Network, type Size } from "@/lib/sizes";
import type { Design, Profile } from "@/lib/types";
import type { Draft } from "@/lib/draft";
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
import { clampSidebar, LayoutContext, SIDEBAR_WIDTH, type Layout } from "@/lib/layout";
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
  /** The card an item is shown with: its own, or the brand's starting card when it has none. */
  const designOf = useCallback((own?: Design): Design => {
    if (!own) return brandDesign;
    const d = { ...DEFAULT_DESIGN, ...own };
    if (!profile.palettes.some((p) => p.id === d.paletteId)) d.paletteId = profile.palettes[0].id;
    return d;
  }, [brandDesign, profile]);
  const design: Design = useMemo(() => designOf(store.current?.design), [designOf, store.current?.design]);
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
  const [panel, setPanel] = useState<"chats" | "accounts" | "newBrand" | "manage" | "account" | "users" | "history" | null>(null);
  // the library can send someone straight to a draft's Full preview (to schedule it)
  const [previewRequested, setPreviewRequested] = useState(false);
  const [editorExpanded, setEditorExpanded] = useState(false);
  // below the large breakpoint one thing is on screen at a time: the left column or the canvas
  const largeScreen = useMedia("(min-width: 1024px)");
  const [phonePreview, setPhonePreview] = useState(false);
  // the left column's width: followed while dragging, saved when let go
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  useEffect(() => { const on = () => setWindowWidth(window.innerWidth); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  const sideWidth = dragWidth ?? clampSidebar(layout.sidebarWidth ?? SIDEBAR_WIDTH, windowWidth);
  const mode = layout.mode;
  const setMode = (m: Layout["mode"]) => { flushPendingEdits(); setEditorExpanded(false); setPhonePreview(false); setLayout((l) => ({ ...l, mode: m, sidebarCollapsed: false })); };
  /** Open the editing tabs on one of them. */
  const showEdit = (t: string) => { flushPendingEdits(); setTab(t); setPhonePreview(false); setLayout((l) => ({ ...l, mode: "edit", sidebarCollapsed: false })); };
  // another page (the library) can ask for a drawer or a draft: /studio/?open=accounts|brands, /studio/?draft=<id>
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const want = q.get("open"), draft = q.get("draft");
    if (want === "accounts" || want === "brands") setPanel(want === "accounts" ? "accounts" : "manage");
    if (want === "account" || want === "users") setPanel(want);
    if (want === "preview") { setPreviewRequested(true); showEdit("post"); }
    if (draft) { void store.select(draft); showEdit("post"); }
    if (want || draft || q.get("brand")) window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const settingsOpen = panel === "accounts";
  const setSettingsOpen = (o: boolean) => setPanel(o ? "accounts" : null);
  useEffect(() => { if (editorExpanded) setPhonePreview(true); }, [editorExpanded]); // the large editor is drawn over the canvas
  const [editorHost, setEditorHost] = useState<HTMLDivElement | null>(null);
  const caption = useMemo(() => (store.current ? serializeDraft(store.current).text : ""), [store.current]);
  /* ---------- what the canvas shows, and the conversation about it ---------- */
  const pair = useMemo(() => pairFor(store.current, store.drafts, chat.list, chat.current?.id), [store.current, store.drafts, chat.list, chat.current?.id]);
  const [unseen, setUnseen] = useState<string[]>([]); // items that changed while another was on screen
  /** Work on another item, and open the conversation about it (or an empty one when there is none). */
  const openItem = async (id: string) => {
    flushPendingEdits();
    await store.select(id);
    if (chat.busy) return;
    const conv = conversationFor(id, chat.list, chat.current?.id);
    if (conv && conv.id !== chat.current?.id) await chat.open(conv.id);
    else if (!conv && chat.current) chat.newConversation();
  };
  /** Whether a conversation is about an item, leaving out one that has just been deleted. */
  const talkedAbout = (without?: string) => (id: string) => chat.list.some((c) => c.id !== without && linksDraft(c, id));
  /** Start fresh: an empty card, empty text and an empty chat. */
  const startFresh = async (deletedChat?: string) => {
    flushPendingEdits();
    try {
      await store.fresh(store.current?.kind ?? "post", talkedAbout(deletedChat));
      setUnseen([]);
      if (!chat.busy) chat.newConversation();
    } catch (e) { toast.error("Could not start a new draft", { description: (e as Error).message }); }
  };
  const deleteChat = async (id: string) => { await chat.remove(id); await startFresh(id); };
  const deleteItem = async (id: string) => {
    const wasOpen = store.current?.id === id;
    await store.remove(id, talkedAbout());
    if (wasOpen && !chat.busy) chat.newConversation();
  };
  /** Open a conversation from the list, with the item it is about. */
  const openConversation = async (id: string) => {
    await chat.open(id);
    // a search can find one older than the list holds
    const conv = chat.list.find((c) => c.id === id) ?? await api.getConversation(id).catch(() => undefined);
    if (!conv || (store.current && linksDraft(conv, store.current.id))) return;
    const about = [conv.postDraftId, conv.articleDraftId].find((d) => d && store.drafts.some((x) => x.id === d));
    if (about) { flushPendingEdits(); await store.select(about); }
  };
  // on arrival, the chat shows the conversation about the item on screen, if there is one
  const matched = useRef(false);
  useEffect(() => {
    if (!chat.loaded || matched.current || !store.current) return;
    matched.current = true;
    const conv = conversationFor(store.current.id, chat.list, chat.current?.id);
    if (conv && conv.id !== chat.current?.id) void chat.open(conv.id);
    // a chat about some other item is not left beside this one (an outside agent's waiting proposal is)
    else if (!conv && chat.current && chat.current.sourceKind !== "mcp") chat.newConversation();
  }, [chat.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Copy an approved proposal into a draft. An empty current draft is filled in; if it already has text, a new draft is
   * made instead, so the person's own writing is never overwritten. A new item of the other kind (an article beside a
   * post) is made without leaving the screen; its view is marked. Returns the draft's id.
   */
  const applyProposal = async (c: ProposalEdit, opts: { useTitle: boolean }): Promise<string> => {
    const content = { kind: c.kind, doc: docFromAgentText(c.body, c.kind), hashtags: c.kind === "post" ? c.hashtags : [], altText: c.altText };
    const cur = store.current;
    const title = opts.useTitle && c.title ? c.title : undefined;
    if (cur && !serializeDraft(cur).text.trim()) {
      store.update({ ...content, ...(title && c.kind === "article" ? { title } : {}) });
      if (title) set({ title });
      flash("Copied into your draft");
      return cur.id;
    }
    const stay = !!cur && cur.kind !== c.kind && !!chat.current && linksDraft(chat.current, cur.id);
    const id = await store.createFrom({
      ...content,
      ...(title && c.kind === "article" ? { title } : {}),
      design: toCardDesign(title ? { ...design, title } : design),
    }, { select: !stay });
    if (stay) setUnseen((u) => [...u, id]);
    flash("Copied into a new draft");
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

  const locked = lockReason(store.current);
  const set = useCallback((patch: Partial<Design>) => {
    if (locked) { toast("The card cannot be changed", { description: locked }); return; }
    const next = { ...design, ...patch };
    setDesigns((all) => ({ ...all, [profile.id]: next })); // the brand's starting point follows the latest card
    store.update({ design: next });
  }, [design, profile.id, setDesigns, store, locked]);
  const updateProfile = (patch: Partial<Profile>) => setProfiles((all) => all.map((p) => (p.id === profile.id ? { ...p, ...patch } : p)));

  const [grid, setGrid] = useState<"one" | "all">("one");
  const one = grid === "one";
  // beside the chat the post's text matters, so the feed preview is on there until the person chooses
  const [feedChoice, setFeed] = useState<boolean | null>(null);
  const feed = feedChoice ?? mode === "chat";
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

  /* ---------- the views ---------- */
  const kind = store.current?.kind ?? "post";
  const designing = mode === "edit" && tab !== "post"; // changing the card: the card is what to look at
  const canBoth = !!pair.post && !!pair.article && box.w >= 900;
  const showBoth = canBoth && layout.both && !designing;
  const reading = !showBoth && kind === "article" && !designing;
  const view: StageView = showBoth ? "both" : kind;
  const views: StageView[] = [...(pair.post ? ["post" as const] : []), ...(pair.article ? ["article" as const] : []), ...(canBoth ? ["both" as const] : [])];
  const changed = (["post", "article"] as const).filter((k) => pair[k] && unseen.includes(pair[k]!.id));
  const showView = (v: StageView) => {
    setLayout((l) => ({ ...l, both: v === "both" }));
    if (v === "both") setTab("post"); // the card tabs show one card, so leave them
    else if (pair[v]) void openItem(pair[v]!.id);
  };
  // an item of this conversation changed by the assistant while another is on screen is marked
  const revisions = useRef(new Map<string, number>());
  useEffect(() => {
    const changed: string[] = [];
    // the list knows the items made for the message being answered, the open conversation may not yet
    const mine = chat.list.find((c) => c.id === chat.current?.id) ?? chat.current;
    for (const d of store.drafts) {
      const was = revisions.current.get(d.id);
      if (chat.busy && was !== undefined && d.revision > was && d.id !== store.current?.id && mine && linksDraft(mine, d.id)) changed.push(d.id);
      revisions.current.set(d.id, d.revision);
    }
    if (changed.length) setUnseen((u) => [...new Set([...u, ...changed])]);
  }, [store.drafts]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // what is on screen has been seen
    const shown = [store.current?.id, ...(showBoth ? [pair.post?.id, pair.article?.id] : [])];
    setUnseen((u) => (u.some((id) => shown.includes(id)) ? u.filter((id) => !shown.includes(id)) : u));
  }, [store.current?.id, showBoth, pair.post?.id, pair.article?.id, unseen.length]);
  // side by side, the pane that is not being worked on needs its own card and file
  const postMedia = usePostMedia(showBoth ? pair.post : undefined);
  const articleView = (d: Draft, width: number) => {
    const own = designOf(d.design);
    return (
      <ArticleView draft={d} design={own} profile={profile} palette={profile.palettes.find((p) => p.id === own.paletteId) ?? profile.palettes[0]} width={width}
        onEdit={() => { void openItem(d.id).then(() => { showEdit("post"); setEditorExpanded(true); }); }}
        onPreview={() => { void openItem(d.id).then(() => { setPreviewRequested(true); showEdit("post"); }); }} />
    );
  };
  const postPane = (d: Draft, width: number) => {
    const own = designOf(d.design), paneSize = sizeById(own.sizeId), why = whyNot(paneSize.net, postMedia.media);
    const pal = profile.palettes.find((p) => p.id === own.paletteId) ?? profile.palettes[0];
    return (
      <div className="flex min-h-full items-start justify-center p-6">
        {why ? <p role="status" className="max-w-sm rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No {paneSize.net} preview: {why}.</p>
          : <FeedFrame design={own} profile={profile} palette={pal} {...postMedia.frame} size={paneSize} caption={serializeDraft(d).text} width={Math.max(240, Math.min(width - 48, 520))} />}
      </div>
    );
  };
  const modeButton = (m: Layout["mode"], text: string, icon: React.ReactNode) => (
    <button type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
      className={cn("flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[13px] font-semibold [&_svg]:h-4 [&_svg]:w-4", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
      {icon} {text}
      {m === "chat" && chat.pendingCount > 0 && <span className="min-w-4 rounded-full bg-brand px-1 text-[10px] leading-4 text-white" title={`${chat.pendingCount} proposals waiting for your decision`}>{chat.pendingCount}</span>}
    </button>
  );

  return (
    <TooltipProvider delayDuration={250}>
     <LayoutContext.Provider value={layoutCtx}>
      <Toaster theme={theme} />
      <div className="flex h-dvh flex-col">
        {/* header – mirrors senthilsweb.com: mono wordmark, thin bar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border app-header px-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="max-lg:hidden" onClick={toggleSidebar} aria-label={sidebarHidden ? "Show sidebar" : "Hide sidebar"} aria-pressed={sidebarHidden}>
                {sidebarHidden ? <PanelLeftOpen /> : <PanelLeftClose />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{sidebarHidden ? "Show sidebar" : "Hide sidebar"} (Ctrl/⌘ + \)</TooltipContent>
          </Tooltip>
          {sidebarHidden && <AccountMenu variant="avatar" page="studio" name={profile.name} handle={profile.handle} color={brandColors[profile.id] ?? "#888"} theme={theme} onToggleTheme={toggleTheme} onAccounts={() => setSettingsOpen(true)} onManageBrands={() => setPanel("manage")} onSettings={() => setPanel("account")} onUsers={() => setPanel("users")} />}
          <Logo />
          <div className="flex-1" />
          <BrandSwitcher brands={profiles} activeId={profile.id} colors={brandColors} busy={switching} onSwitch={(id) => void switchBrand(id)} onNew={() => { setCopyOf(undefined); setPanel("newBrand"); }} onManage={() => setPanel("manage")} />
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* sidebar */}
          <aside
            inert={largeScreen && sidebarHidden}
            className={cn(
              "flex shrink-0 flex-col overflow-hidden border-border bg-card ease-out motion-reduce:transition-none max-lg:min-h-0 max-lg:flex-1",
              dragWidth === null && "transition-[width] duration-200",
              phonePreview && "max-lg:hidden",
              sidebarHidden ? "lg:w-0" : "lg:w-[var(--side)] lg:border-r",
            )}
            style={{ "--side": `${sideWidth}px` } as React.CSSProperties}
          >
           <div className="flex min-h-0 flex-1 flex-col lg:w-[var(--side)]">
            <div className="hidden border-b border-border px-3 py-2 lg:block">
              <div className="flex rounded-md border border-border bg-background p-0.5" role="group" aria-label="Left column">
                {modeButton("chat", "Chat", <MessageSquareText />)}
                {modeButton("edit", "Edit", <SlidersHorizontal />)}
              </div>
            </div>
            {/* the chat stays mounted, so an unsent message is not lost by switching */}
            <div className={cn("min-h-0 flex-1 overflow-y-auto", mode !== "chat" && "hidden")}>
              <ChatPanel chat={chat} onApply={applyProposal} draftId={store.current?.id} viewing={store.current?.kind} onNew={() => void startFresh()} onDelete={(id) => void deleteChat(id)} onHistory={() => setPanel(panel === "chats" ? null : "chats")}
                onShow={(id) => { if (id && store.drafts.some((d) => d.id === id)) { void openItem(id); setPhonePreview(true); } else toast("That draft no longer exists"); }} />
            </div>
            {mode === "edit" && <Tabs value={tab} onValueChange={(v) => { setTab(v); if (v !== "post") setEditorExpanded(false); }} className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-border px-3 py-2.5">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="design" className="gap-1 px-1 text-[12.5px]"><PaletteIcon /> Design</TabsTrigger>
                  <TabsTrigger value="content" className="gap-1 px-1 text-[12.5px]"><Type /> Text</TabsTrigger>
                  <TabsTrigger value="post" className="gap-1 px-1 text-[12.5px]"><MessageSquareText /> Write</TabsTrigger>
                  <TabsTrigger value="profile" className="gap-1 px-1 text-[12.5px]"><User /> Brand</TabsTrigger>
                </TabsList>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <TabsContent value="design" className="mt-0"><DesignPanel design={design} set={set} profile={profile} palette={palette} /></TabsContent>
                <TabsContent value="content" className="mt-0"><ContentPanel design={design} set={set} /></TabsContent>
                <TabsContent value="post" className="mt-0"><Composer media={media} onOpenHistory={() => setPanel("history")} openPreview={previewRequested} onPreviewOpened={() => setPreviewRequested(false)} store={{ ...store, remove: deleteItem }} jobs={jobs} brandNames={brandNames} renderPng={async (s) => (await render([s]))[0].blob} onOpenSettings={() => setSettingsOpen(true)} design={design} profile={profile} palette={palette} size={size} expanded={editorExpanded} setExpanded={setEditorExpanded} host={editorHost} /></TabsContent>
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
            </Tabs>}
            <div className="shrink-0 border-t border-border p-2">
              <AccountMenu page="studio" name={profile.name} handle={profile.handle} color={brandColors[profile.id] ?? "#888"} theme={theme} onToggleTheme={toggleTheme} onAccounts={() => setSettingsOpen(true)} onManageBrands={() => setPanel("manage")} onSettings={() => setPanel("account")} onUsers={() => setPanel("users")} />
              <BuiltWith className="px-2 pb-1 pt-2" />
            </div>
           </div>
          </aside>
          {!sidebarHidden && <SideGrip width={sideWidth} onResize={setDragWidth} onDone={(w) => { setDragWidth(null); setLayout((l) => ({ ...l, sidebarWidth: w })); }} />}

          {/* canvas */}
          <main className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col", !phonePreview && "max-lg:hidden")}>
            <StageBar views={views} view={view} changed={changed} onView={showView} drafts={store.drafts} currentId={store.current?.id ?? ""} onPick={(id) => void openItem(id)} onNew={() => void startFresh()} item={store.current} onVersions={() => setPanel(panel === "history" ? null : "history")} />
            {/* sizes and export belong to the card, so they show with it */}
            <div className={cn("flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2.5", (reading || (showBoth && kind === "article")) && "hidden")}>
              <div className="flex rounded-md border border-border bg-card p-0.5">
                <button type="button" onClick={() => setGrid("one")} className={cn("flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium", one ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}><Square className="h-3.5 w-3.5" /> One</button>
                <button type="button" onClick={() => setGrid("all")} className={cn("flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium", !one ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}><LayoutGrid className="h-3.5 w-3.5" /> All sizes</button>
              </div>
              {NETWORKS.map((net) => (
                <div key={net} className="flex items-center gap-0.5 rounded-md border border-border bg-card py-0.5 pl-2.5 pr-0.5">
                  <span className="mr-1 text-xs font-semibold">{net}</span>
                  {SIZES.filter((s) => s.net === net).map((s) => {
                    const on = one && s.id === size.id;
                    const why = cannot(net);
                    return (
                      <Tooltip key={s.id}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-disabled={!!why}
                            onClick={() => { if (why) return; set({ sizeId: s.id }); setGrid("one"); }}
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
            <div className={cn("flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2", (reading || (showBoth && kind === "article")) && "hidden")}>
              <div className={cn("flex items-center gap-2", showBoth && "hidden")}>
                <Switch id="feed" checked={feed} onCheckedChange={setFeed} />
                <Label htmlFor="feed" className="flex items-center gap-1 text-foreground"><Eye className="h-3.5 w-3.5" /> Feed preview</Label>
              </div>
              <span className="eyebrow ml-2 hidden md:inline">{one ? `${size.net} · ${size.name} · ${size.w}×${size.h}` : `${SIZES.filter((s) => !cannot(s.net)).length} sizes`}</span>
              <div className="flex-1" />
              {note && <span className="flex items-center gap-1 text-xs text-brand"><Check className="h-3.5 w-3.5" />{note}</span>}
              {saveError && <span className="text-xs text-destructive">Could not save to the server – will retry on your next change</span>}
              <Button variant="outline" size="sm" onClick={() => set({ seed: 1 + Math.floor(Math.random() * 99999) })}><Shuffle /> Shuffle</Button>
              <Button variant="outline" size="sm" onClick={doCopy} disabled={!!busy || !one}>{busy === "copy" ? <Loader2 className="animate-spin" /> : <Copy />} Copy</Button>
              <Button variant="outline" size="sm" onClick={doZip} disabled={!!busy}>{busy === "zip" ? <Loader2 className="animate-spin" /> : <PackageOpen />} All sizes .zip</Button>
              <Button variant="brand" size="sm" onClick={doDownload} disabled={!!busy || !one}>{busy === "download" ? <Loader2 className="animate-spin" /> : <Download />} Download PNG</Button>
            </div>

            <div ref={canvasRef} className="canvas-grid min-h-0 flex-1 overflow-auto">
              {showBoth && pair.post && pair.article ? (
                <div className="grid h-full grid-cols-2">
                  {([["post", pair.post], ["article", pair.article]] as const).map(([k, d]) => (
                    // pressing in a pane makes its item the one being worked on
                    <section key={k} aria-label={k === "post" ? "Post preview" : "Article preview"} onPointerDownCapture={() => { if (d.id !== store.current?.id) void openItem(d.id); }}
                      className={cn("min-h-0 overflow-auto border-t-2 border-border [&+&]:border-l", d.id === store.current?.id ? "border-t-brand" : "border-t-transparent")}>
                      {k === "post" ? postPane(d, box.w / 2) : articleView(d, box.w / 2)}
                    </section>
                  ))}
                </div>
              ) : reading && store.current ? articleView(store.current, box.w) : one ? (
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
                    <button key={s.id} type="button" className="group cursor-pointer text-left" onClick={() => { set({ sizeId: s.id }); setGrid("one"); }}>
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
          <nav aria-label="Show" className="flex shrink-0 gap-1 border-t border-border bg-card p-1.5 lg:hidden">
            {([["chat", "Chat"], ["preview", "Preview"], ["edit", "Edit"]] as const).map(([k, text]) => {
              const on = k === "preview" ? phonePreview : !phonePreview && mode === k;
              return <button key={k} type="button" aria-pressed={on} onClick={() => (k === "preview" ? setPhonePreview(true) : setMode(k))}
                className={cn("flex-1 cursor-pointer rounded px-2 py-2 text-[13px] font-semibold", on ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{text}{k === "chat" && chat.pendingCount > 0 ? ` (${chat.pendingCount})` : ""}</button>;
            })}
          </nav>
        </div>
      </div>
      <ChatHistoryDrawer open={panel === "chats"} onClose={() => setPanel(null)} profileId={profile.id} recent={chat.list} currentId={chat.current?.id} drafts={store.drafts} busy={chat.busy}
        onOpen={(id) => { setPanel(null); setMode("chat"); void openConversation(id); }} onNew={() => { setPanel(null); setMode("chat"); void startFresh(); }} />
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
