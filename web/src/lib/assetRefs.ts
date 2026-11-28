// A card or a brand may point at a picture of the brand's media library ("asset:<id>") instead of holding a copy of
// it. These pictures are fetched here, once, and given to what draws them as data URLs, which an exported image can
// hold.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { api } from "./api";
import { addToLibrary } from "./assets";
import type { Design, Profile } from "./types";

const PREFIX = "asset:";
export const assetRef = (id: string) => `${PREFIX}${id}`;
export const isAssetRef = (v: unknown): v is string => typeof v === "string" && v.startsWith(PREFIX);

type Entry = { url?: string; failed?: boolean; wait?: Promise<void> };
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => { version++; listeners.forEach((l) => l()); };

const toDataUrl = (blob: Blob) => new Promise<string>((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = () => fail(new Error("The picture could not be read."));
  r.readAsDataURL(blob);
});

/** Fetch a library picture unless it is here or on its way. A failed one is tried again when asked again. */
function load(brand: string, ref: string): Promise<void> {
  const key = `${brand}/${ref}`;
  const have = cache.get(key);
  if (have?.url) return Promise.resolve();
  if (have?.wait) return have.wait;
  const entry: Entry = {};
  cache.set(key, entry);
  entry.wait = api.assetBlob(brand, ref.slice(PREFIX.length), "file").then(toDataUrl)
    .then((url) => { entry.url = url; }, () => { entry.failed = true; })
    .finally(() => { entry.wait = undefined; changed(); });
  return entry.wait;
}

/**
 * Before an image of a card is made: ask again for any picture that failed, and wait for every one on its way.
 */
export async function assetsSettled(): Promise<void> {
  for (const [key, e] of cache) {
    if (!e.failed || e.wait) continue;
    const at = key.indexOf("/");
    void load(key.slice(0, at), key.slice(at + 1));
  }
  await Promise.all([...cache.values()].map((e) => e.wait));
}

/** What to draw for a stored value: itself unless it names a library picture; then that picture, once it is here. */
export const shownPicture = (brand: string, value: string | undefined): string | undefined =>
  isAssetRef(value) ? cache.get(`${brand}/${value}`)?.url : value;

/** The library references among some values. */
export const refsIn = (values: (string | undefined)[]) => [...new Set(values.filter(isAssetRef))];

const useVersion = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version, () => 0);

/** Fetch what the values name, and give back how to show one. `waiting` says some are not here (yet, or at all). */
export function usePictures(brand: string, values: (string | undefined)[]) {
  const refs = refsIn(values);
  const key = `${brand} ${refs.join(" ")}`;
  const at = useVersion();
  useEffect(() => { refs.forEach((r) => void load(brand, r)); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => ({
    show: (v: string | undefined) => shownPicture(brand, v),
    waiting: refs.some((r) => !shownPicture(brand, r)),
    failed: refs.some((r) => cache.get(`${brand}/${r}`)?.failed),
  }), [key, at]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** A card's design and its brand with every library reference replaced by the picture, for drawing. */
export function fillPictures<D extends Pick<Design, "photos" | "screenshot" | "bgImage">, P extends Pick<Profile, "logoImage" | "headshot">>(design: D, profile: P, show: (v: string | undefined) => string | undefined): { design: D; profile: P } {
  if (!refsIn([...(design.photos ?? []), design.screenshot, design.bgImage, profile.logoImage, profile.headshot]).length) return { design, profile };
  return {
    design: { ...design, photos: (design.photos ?? []).map(show).filter((v): v is string => !!v), screenshot: show(design.screenshot), bgImage: show(design.bgImage) },
    profile: { ...profile, logoImage: show(profile.logoImage), headshot: show(profile.headshot) },
  };
}

/** The values of a card and its brand that may name a library picture. */
export const picturesOf = (design: Pick<Design, "photos" | "screenshot" | "bgImage">, profile?: Pick<Profile, "logoImage" | "headshot">) =>
  [...(design.photos ?? []), design.screenshot, design.bgImage, profile?.logoImage, profile?.headshot];

/**
 * A copy that holds its pictures itself, for what leaves the brand: a duplicated brand, an exported file. Throws when
 * a picture cannot be fetched, so that nothing is copied with a hole in it.
 */
export async function embedPictures<T>(brand: string, value: T): Promise<T> {
  const text = JSON.stringify(value);
  const refs = [...new Set(text.match(/"asset:[0-9a-f]+"/g) ?? [])].map((q) => q.slice(1, -1));
  await Promise.all(refs.map((r) => load(brand, r)));
  return JSON.parse(text, (_k, v) => {
    if (!isAssetRef(v)) return v;
    const url = shownPicture(brand, v);
    if (!url) throw new Error("A picture from the media library could not be loaded.");
    return url;
  }) as T;
}

/**
 * For a copy of a brand: each library picture the value names is put into the other brand's library, and the value
 * pointed at that one, so that no brand depends on another's files.
 */
export async function copyPictures<T>(from: string, to: string, value: T): Promise<T> {
  const text = JSON.stringify(value);
  const refs = [...new Set(text.match(/"asset:[0-9a-f]+"/g) ?? [])].map((q) => q.slice(1, -1));
  const moved = new Map<string, string>();
  for (const r of refs) { // one at a time, as the server takes them
    const blob = await api.assetBlob(from, r.slice(PREFIX.length), "file");
    const ext = blob.type.split("/")[1] ?? "png";
    moved.set(r, assetRef((await addToLibrary(to, new File([blob], `copied picture.${ext}`, { type: blob.type }))).id));
  }
  return moved.size ? (JSON.parse(text, (_k, v) => (isAssetRef(v) ? moved.get(v) ?? v : v)) as T) : value;
}
