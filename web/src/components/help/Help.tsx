import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Search } from "lucide-react";
import { Shell } from "@/components/shell/Rail";
import { BootScreen } from "@/components/studio/BootScreen";
import { SessionProvider } from "@/components/studio/SessionProvider";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { api } from "@/lib/api";
import { helpPlace, linkTarget, pageHtml, TITLES, type Place } from "@/lib/help";
import { DOCS_URL, helpHref } from "@/lib/nav";
import { useLibraryBoot, type LibraryBoot } from "@/lib/useLibraryBoot";
import { useTheme } from "@/lib/useTheme";
import { cn } from "@/lib/utils";
import { GROUPS, PAGES, search, searchIndex, sections } from "../../../guide/content.mjs";
import "./guide.css";

const noop = () => undefined;
const REPO = "https://github.com/senthilsweb/cardpress";

/** The user guide, inside the app: contents on the left, the page, and its sections on the right. */
export default function Help() {
  const { boot, retry, submitToken } = useLibraryBoot();
  if (boot.status !== "ready") return <BootScreen boot={boot} retry={retry} submitToken={submitToken} importLegacy={noop} discardLegacy={noop} />;
  return <SessionProvider initial={boot.data.session}><Page data={boot.data} /></SessionProvider>;
}

function Page({ data }: { data: LibraryBoot }) {
  const [theme, toggleTheme] = useTheme();
  const [brand, setBrand] = useState(data.activeId);
  const [place, setPlace] = useState<Place>(() => helpPlace(window.location.search, window.location.hash));
  const [query, setQuery] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const index = useMemo(() => searchIndex(pageHtml), []);
  const hits = search(index, query);
  const at = PAGES.findIndex(([s]) => s === place.page);
  const { body, found } = useMemo(() => sections(pageHtml(place.page)), [place.page]);

  const open = (next: Place) => {
    setQuery("");
    setPlace(next);
    window.history.pushState(null, "", `${helpHref()}?page=${next.page}${next.anchor ? `#${next.anchor}` : ""}`);
  };
  useEffect(() => {
    const back = () => setPlace(helpPlace(window.location.search, window.location.hash));
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  useEffect(() => {
    document.title = `${TITLES[place.page]} · CardPress guide`;
    const target = place.anchor ? document.getElementById(place.anchor) : null;
    if (target) target.scrollIntoView();
    else scroller.current?.scrollTo(0, 0);
  }, [place]);

  /** A link to another page of the guide changes the page here, without loading the app again. */
  const follow = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const to = linkTarget((e.target as Element).closest("a")?.getAttribute("href"), place.page);
    if (!to) return;
    e.preventDefault();
    open(to);
  };
  const switchBrand = (id: string) => { setBrand(id); api.putPreference("activeProfile", id).catch(noop); };
  const step = (i: number, label: string, right?: boolean) => PAGES[i] && (
    <button type="button" onClick={() => open({ page: PAGES[i][0], anchor: "" })} className={cn("w-[48%] cursor-pointer rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:border-brand", right ? "ml-auto text-right" : "text-left")}>
      <span className="block text-xs font-normal text-muted-foreground">{label}</span>{PAGES[i][1]}
    </button>
  );

  return (
    <>
      <Toaster theme={theme} />
      <Shell area="help" brands={data.profiles} activeId={brand} colors={data.colors} onSwitchBrand={switchBrand} theme={theme} onToggleTheme={toggleTheme}>
      <aside className="flex shrink-0 flex-col gap-2 border-b border-border bg-background p-3 lg:w-64 lg:border-b-0 lg:border-r">
        <h2 className="hidden px-1 text-sm font-semibold lg:block">User guide</h2>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Search the guide" placeholder="Search" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) open({ page: hits[0].slug, anchor: hits[0].anchor }); }} />
        </div>
        {query.trim() ? (
          <ul aria-label="Search results" className="max-h-[45dvh] min-h-0 overflow-y-auto lg:max-h-none lg:flex-1">
            {!hits.length && <li role="status" className="px-2 py-2 text-sm text-muted-foreground">Nothing found.</li>}
            {hits.map((h) => (
              <li key={`${h.slug}#${h.anchor}`}>
                <button type="button" onClick={() => open({ page: h.slug, anchor: h.anchor })} className="block w-full cursor-pointer rounded-md px-2 py-1.5 text-left hover:bg-accent">
                  <span className="block text-[13px] font-medium">{h.h ? `${h.p} › ${h.h}` : h.p}</span>
                  <span className="block text-[11.5px] leading-snug text-muted-foreground">{h.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <nav aria-label="Contents" className="hidden min-h-0 flex-1 overflow-y-auto lg:block">
              {GROUPS.map((g) => (
                <div key={g.name} className="mb-3">
                  <h3 className="eyebrow px-2 py-1">{g.name}</h3>
                  {g.pages.map(([slug, title]) => (
                    <button key={slug} type="button" aria-current={slug === place.page ? "page" : undefined} onClick={() => open({ page: slug, anchor: "" })}
                      className={cn("block w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent", slug === place.page && "bg-accent font-medium")}>
                      {title}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            <div className="lg:hidden">
              <Select value={place.page} onValueChange={(page) => open({ page, anchor: "" })}>
                <SelectTrigger aria-label="Page"><SelectValue /></SelectTrigger>
                <SelectContent>{PAGES.map(([slug, title]) => <SelectItem key={slug} value={slug}>{title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </>
        )}
        <div className="hidden flex-col gap-1 border-t border-border px-2 pt-2 text-[12px] text-muted-foreground lg:flex">
          <a className="hover:text-foreground" href={`${REPO}/issues/new`} target="_blank" rel="noopener noreferrer">Report a problem</a>
          <a className="hover:text-foreground" href={DOCS_URL} target="_blank" rel="noopener noreferrer">Technical docs</a>
        </div>
      </aside>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-6xl gap-8 px-5 py-8 sm:px-8">
          <main className="min-w-0 max-w-3xl flex-1">
            <h1 className="mb-4 text-3xl font-semibold tracking-tight">{TITLES[place.page]}</h1>
            {/* the pages are the app's own files, not anything a person typed */}
            <div className="guide" onClick={follow} dangerouslySetInnerHTML={{ __html: body }} />
            <div className="mt-12 flex gap-3">{step(at - 1, "Previous")}{step(at + 1, "Next", true)}</div>
          </main>
          {found.length > 1 && (
            <aside className="sticky top-0 hidden w-52 shrink-0 self-start xl:block" aria-label="On this page">
              <h2 className="eyebrow mb-2">On this page</h2>
              {found.map((h) => <button key={h.id} type="button" onClick={() => open({ page: place.page, anchor: h.id })} className="block w-full cursor-pointer py-1 text-left text-[12.5px] text-muted-foreground hover:text-foreground">{h.text}</button>)}
            </aside>
          )}
        </div>
      </div>
      </Shell>
    </>
  );
}
