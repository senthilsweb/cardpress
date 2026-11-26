// The guide inside the app: the same page files as the web build (web/guide/pages), found at build time.
import { PAGES } from "../../guide/content.mjs";

const files = import.meta.glob<string>("../../guide/pages/*.html", { eager: true, query: "?raw", import: "default" });
const images = import.meta.glob<string>("../../guide/img/*", { eager: true, query: "?url", import: "default" });

export const TITLES: Record<string, string> = Object.fromEntries(PAGES);
const known = (page: string | null | undefined): page is string => !!page && Object.hasOwn(TITLES, page);

/** A page's contents, its pictures pointing at where the app serves them. */
export const pageHtml = (slug: string): string =>
  (files[`../../guide/pages/${slug}.html`] ?? "").replace(/src="img\/([^"]+)"/g, (all, name) => {
    const url = images[`../../guide/img/${name}`];
    return url ? `src="${url}" loading="lazy"` : all;
  });

export interface Place { page: string; anchor: string }

/** The page and section an address names; the first page when it names none, or one there is no such page. */
export function helpPlace(search: string, hash: string): Place {
  const page = new URLSearchParams(search).get("page");
  return known(page) ? { page, anchor: hash.replace(/^#/, "") } : { page: PAGES[0][0], anchor: "" };
}

/** Where a link inside a page leads, if it stays in the guide: `brands.html`, `social.html#x` or `#x`. */
export function linkTarget(href: string | null | undefined, current: string): Place | null {
  const m = /^(?:([a-z]+)\.html)?(?:#([a-z0-9-]+))?$/.exec(href ?? "");
  if (!href || !m) return null;
  const page = m[1] ?? current;
  return known(page) ? { page, anchor: m[2] ?? "" } : null;
}
