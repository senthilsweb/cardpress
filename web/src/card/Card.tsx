import { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { Design, LayoutId, Palette, Profile } from "@/lib/types";
import type { Size } from "@/lib/sizes";
import { mulberry32 } from "@/lib/rng";
import { isDark, mix, rgba } from "@/lib/color";
import { cssFamily, ensureFont, resolveFonts } from "@/lib/fonts";
import { fillPictures, picturesOf, usePictures } from "@/lib/assetRefs";
import { bgById, type Area, type MaskKind } from "./backgrounds";
import { Ornament, ornamentOf } from "./ornaments";
import { greetingWash, shadeLayers, washesArt } from "./shade";
import { fitScale } from "./fit";

export interface LayoutDef {
  id: LayoutId;
  name: string;
  hint: string;
}
export const LAYOUTS: LayoutDef[] = [
  { id: "hero", name: "Hero", hint: "Text left, art right" },
  { id: "center", name: "Centred", hint: "Big centred title" },
  { id: "cover", name: "Article cover", hint: "Series tag + title" },
  { id: "quote", name: "Quote", hint: "Big quote + author" },
  { id: "stat", name: "Big number", hint: "One stat that matters" },
  { id: "split", name: "Headshot", hint: "Your photo + title" },
  { id: "greeting", name: "Greeting", hint: "Centred wish with a sign-off" },
];

interface Props {
  design: Design;
  profile: Profile;
  palette: Palette;
  size: Size;
  style?: CSSProperties;
}


/** Where the art sits, and which way it fades, for each layout. */
function artFor(layout: LayoutId, W: number, H: number): { area: Area; mask: MaskKind; soft: number } {
  const land = W / H >= 1.3;
  switch (layout) {
    case "hero":
    case "stat":
      return land ? { area: { x: W * 0.46, y: 0, w: W * 0.54, h: H }, mask: "right", soft: 1 } : { area: { x: 0, y: H * 0.11, w: W, h: H * 0.42 }, mask: "top", soft: 1 };
    case "cover":
      return land ? { area: { x: W * 0.5, y: 0, w: W * 0.5, h: H }, mask: "right", soft: 1 } : { area: { x: 0, y: H * 0.11, w: W, h: H * 0.38 }, mask: "top", soft: 1 };
    case "split":
      return { area: { x: 0, y: 0, w: W, h: H }, mask: "none", soft: 0.35 };
    case "greeting":
      return { area: { x: 0, y: 0, w: W, h: H }, mask: "none", soft: 1 };
    default:
      return { area: { x: 0, y: 0, w: W, h: H }, mask: "none", soft: 0.4 };
  }
}

function FadeMask({ id, mask, area, W, H }: { id: string; mask: MaskKind; area: Area; W: number; H: number }) {
  if (mask === "none") return null;
  const g =
    mask === "right"
      ? { x1: area.x - W * 0.04, x2: area.x + W * 0.16, y1: 0, y2: 0 }
      : { x1: 0, x2: 0, y1: area.y + area.h + H * 0.04, y2: area.y + area.h - H * 0.14 };
  return (
    <defs>
      <linearGradient id={`g-${id}`} gradientUnits="userSpaceOnUse" {...g}>
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#fff" stopOpacity="1" />
      </linearGradient>
      <mask id={`m-${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
        <rect x="0" y="0" width={W} height={H} fill={`url(#g-${id})`} />
      </mask>
    </defs>
  );
}

function Mark({ profile, palette, u }: { profile: Profile; palette: Palette; u: number }) {
  const s = 3.2 * u;
  if (profile.mark === "none") return null;
  if (profile.mark === "image" && profile.logoImage)
    return <img src={profile.logoImage} alt="" style={{ height: 5.2 * u, width: "auto", display: "block" }} />;
  if (profile.mark === "diamond")
    return (
      <svg width={s} height={s} viewBox="0 0 10 10" style={{ display: "block" }}>
        <path d="M5 0.6 9.4 5 5 9.4 0.6 5Z" fill={palette.accent} />
      </svg>
    );
  const letter = (profile.logoText || profile.displayName || "A").trim().charAt(0).toUpperCase();
  const box = 4.6 * u;
  return (
    <div style={{ width: box, height: box, borderRadius: 1 * u, background: palette.accent, color: isDark(palette.accent) ? "#fff" : palette.base, fontWeight: 800, fontSize: 2.8 * u, lineHeight: `${box}px`, textAlign: "center" }}>
      {letter}
    </div>
  );
}

function SubLine({ text, palette, u, size, center }: { text: string; palette: Palette; u: number; size: number; center?: boolean }) {
  const parts = text.split("|").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  return (
    <div style={{ fontSize: size * u, fontWeight: 500, color: palette.text, opacity: 0.88, lineHeight: 1.4, display: "flex", flexWrap: "wrap", justifyContent: center ? "center" : "flex-start", columnGap: 1.3 * u }}>
      {parts.map((p, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 1.3 * u }}>
          {i > 0 && <span style={{ color: palette.accent, fontWeight: 700 }}>/</span>}
          {p}
        </span>
      ))}
    </div>
  );
}

/** One line (or the lines as typed) made as large as asked, then smaller until it fits; very long text wraps. */
function FitText({ text, size, width, style }: { text: string; size: number; width: number; style: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.whiteSpace = "pre";
    el.style.width = "max-content";
    el.style.fontSize = `${size}px`;
    const wide = el.offsetWidth;
    if (wide <= width) return;
    const k = width / wide;
    // a little inside the width: a script's flourishes reach past its box
    el.style.fontSize = `${size * Math.max(k * 0.97, 0.55)}px`;
    if (k * 0.97 < 0.55) { el.style.whiteSpace = "pre-wrap"; el.style.width = `${width}px`; }
  }, [size, width]);
  useLayoutEffect(fit);
  // a font that arrives after the first drawing changes the width
  useEffect(() => {
    document.fonts?.addEventListener("loadingdone", fit);
    void document.fonts?.ready.then(fit);
    return () => document.fonts?.removeEventListener("loadingdone", fit);
  }, [fit]);
  return (
    <div style={{ width, display: "flex", justifyContent: "center", ...style }}>
      <span ref={ref} style={{ display: "inline-block", flexShrink: 0, textAlign: "center", fontSize: size }}>{text}</span>
    </div>
  );
}

/**
 * The greeting's lines, centred between the logo and the footer. Each keeps its own shape; when together they are taller
 * than the space, the whole block is made smaller until it fits.
 */
function FitBlock({ children, style }: { children: ReactNode; style: CSSProperties }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const fit = useCallback(() => {
    const room = outer.current, block = inner.current;
    if (!room || !block) return;
    // sizes before any scaling, so fitting again starts from the same place
    const k = fitScale(room.clientHeight, block.offsetHeight);
    block.style.transform = k < 1 ? `scale(${k})` : "";
  }, []);
  useLayoutEffect(fit);
  // a headline that is resized, or a font that arrives, changes the height after the first drawing
  useEffect(() => {
    if (!inner.current || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(fit);
    watch.observe(inner.current);
    return () => watch.disconnect();
  }, [fit]);
  return (
    <div ref={outer} style={{ ...style, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div ref={inner} data-fit style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>{children}</div>
    </div>
  );
}

const lines = (t: string) => t.split("\n").map((l, i, a) => (
  <span key={i}>
    {l}
    {i < a.length - 1 && <br />}
  </span>
));

export const Card = forwardRef<HTMLDivElement, Props>(function Card({ design: stored, profile: brand, palette: pal, size, style }, ref) {
  // pictures kept in the brand's media library are fetched and put in before drawing
  const pictures = usePictures(brand.id, picturesOf(stored, brand));
  const { design, profile } = fillPictures(stored, brand, pictures.show);
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, "");
  const W = size.w, H = size.h;
  const u = Math.min(W, H) / 100;
  const land = W / H >= 1.3;
  const pad = land ? W * 0.065 : W * 0.075;
  const L = design.layout;
  const art = artFor(L, W, H);
  const bg = bgById(design.background);
  const rng = mulberry32(design.seed * 9973 + W * 7 + H);
  const fonts = resolveFonts(profile, design);
  const display = cssFamily(fonts.title);
  const body = cssFamily(fonts.body);
  const MONO = cssFamily(fonts.label);
  const LOGO = cssFamily(fonts.logo);
  const STAT = cssFamily(fonts.stat);
  const fontKey = Object.values(fonts).join("|");
  // the script font is fetched only for the layout that draws with it
  useEffect(() => { Object.entries(fonts).forEach(([role, f]) => { if (role !== "script" || design.layout === "greeting") void ensureFont(f); }); }, [fontKey, design.layout]); // eslint-disable-line react-hooks/exhaustive-deps
  const ts = design.titleScale;
  const intensity = design.intensity * art.soft;

  const artNode = bg.render({
    W, H, u, area: art.area, mask: art.mask, pal, rng, uid,
    photos: design.photos, screenshot: design.screenshot, image: design.bgImage,
  });
  const fullBleedImage = design.background === "image" && design.bgImage;

  /* ---------- shared text pieces ---------- */
  const eyebrow = design.eyebrow ? (
    <div style={{ fontFamily: MONO, fontSize: 2.3 * u, letterSpacing: "0.14em", textTransform: "uppercase", color: pal.sub, fontWeight: 600, marginBottom: 2.2 * u }}>
      {design.eyebrow}
    </div>
  ) : null;
  const title = (sz: number, extra?: CSSProperties) =>
    design.title ? (
      <div style={{ fontFamily: display, fontSize: sz * u * ts, fontWeight: 700, lineHeight: 1.06, letterSpacing: "-0.02em", color: pal.text, ...extra }}>
        {lines(design.title)}
      </div>
    ) : null;
  const subtitle = (center?: boolean) =>
    design.subtitle ? (
      <div style={{ marginTop: 3 * u }}>
        <SubLine text={design.subtitle} palette={pal} u={u} size={land ? 2.9 : 3.1} center={center} />
      </div>
    ) : null;

  const greeting = L === "greeting";
  const logo = design.showLogo ? (
    <div style={{ position: "absolute", ...(greeting ? { left: 0, right: 0, top: 3.2 * u, justifyContent: "center" } : { left: pad, top: pad * (land ? 0.95 : 0.8) }), display: "flex", alignItems: "center", gap: 1.4 * u }}>
      <Mark profile={profile} palette={pal} u={u} />
      {(profile.logoText || profile.logoSub) && !(profile.mark === "image" && profile.logoImage && !profile.logoText) && (
        <div style={{ lineHeight: 1.15 }}>
          {profile.logoSub && profile.logoSubPos !== "below" && <div style={{ fontFamily: LOGO, fontSize: 1.7 * u, letterSpacing: "0.12em", textTransform: "uppercase", color: pal.text, opacity: 0.7 }}>{profile.logoSub}</div>}
          {profile.logoText && <div style={{ fontFamily: LOGO, fontSize: 2.2 * u, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700, color: pal.text }}>{profile.logoText}</div>}
          {profile.logoSub && profile.logoSubPos === "below" && <div style={{ fontFamily: LOGO, fontSize: 1.7 * u, letterSpacing: "0.12em", textTransform: "uppercase", color: pal.text, opacity: 0.7, marginTop: 0.3 * u }}>{profile.logoSub}</div>}
        </div>
      )}
    </div>
  ) : null;

  // Small print at the very bottom: a quiet link on the left and the main one right-aligned at the bottom right.
  const footLeft = design.footerLeft || (design.noFooterLeft ? "" : profile.website);
  const footRight = design.footer || (design.noFooter ? "" : profile.handle);
  const clip: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  const footer = design.showFooter && (footLeft || footRight) ? (
    <div style={{ position: "absolute", left: pad, right: pad, bottom: 2.6 * u, display: "flex", alignItems: "baseline", gap: 3 * u, fontFamily: MONO, fontSize: 1.5 * u, letterSpacing: "0.02em", color: pal.text }}>
      {footLeft && <span style={{ ...clip, opacity: 0.65 }}>{footLeft}</span>}
      {footRight && <span style={{ ...clip, marginLeft: "auto", textAlign: "right", color: pal.sub, fontWeight: 600 }}>{footRight}</span>}
    </div>
  ) : null;

  /* ---------- layout bodies ---------- */
  let content: ReactNode = null;
  const textTopPortrait = art.area.y + art.area.h + 3 * u;
  const blockStyle: CSSProperties = land
    ? { position: "absolute", left: pad, top: H * 0.18, bottom: H * 0.16, width: L === "cover" ? W * 0.5 - pad : W * 0.5 - pad, display: "flex", flexDirection: "column", justifyContent: "center" }
    : { position: "absolute", left: pad, right: pad, top: textTopPortrait, bottom: H * 0.1, display: "flex", flexDirection: "column", justifyContent: "center" };

  if (L === "hero") {
    content = <div style={blockStyle}>{eyebrow}{title(land ? 8.6 : 9)}{subtitle()}</div>;
  } else if (L === "cover") {
    content = (
      <div style={blockStyle}>
        {design.tag && (
          <div style={{ alignSelf: "flex-start", fontFamily: MONO, fontSize: 2 * u, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, color: isDark(pal.accent) ? "#fff" : pal.base, background: pal.accent, padding: `${0.9 * u}px ${1.8 * u}px`, borderRadius: 0.6 * u, marginBottom: 2.6 * u }}>
            {design.tag}
          </div>
        )}
        {eyebrow}
        {title(land ? 9.4 : 10)}
        {subtitle()}
      </div>
    );
  } else if (L === "stat") {
    content = (
      <div style={blockStyle}>
        {eyebrow}
        <div style={{ fontFamily: STAT, fontSize: (land ? 24 : 26) * u * ts, fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.04em", color: pal.accent }}>{design.statValue}</div>
        {title(land ? 5 : 5.6, { marginTop: 2.2 * u, fontWeight: 600, letterSpacing: "-0.01em" })}
        {subtitle()}
      </div>
    );
  } else if (L === "center") {
    content = (
      <div style={{ position: "absolute", left: pad * 1.4, right: pad * 1.4, top: H * 0.16, bottom: H * 0.16, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        {eyebrow}
        {title(land ? 9.4 : 10)}
        {subtitle(true)}
      </div>
    );
  } else if (L === "quote") {
    content = (
      <div style={{ position: "absolute", left: pad * 1.3, right: pad * 1.3, top: H * 0.14, bottom: H * 0.16, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ fontFamily: display, fontSize: 20 * u, lineHeight: 1, height: 11 * u, overflow: "hidden", color: pal.accent, fontWeight: 700, marginBottom: 1.5 * u }}>“</div>
        {title(land ? 6.6 : 7.2, { fontWeight: 600, lineHeight: 1.18, letterSpacing: "-0.01em" })}
        {design.quoteAuthor && (
          <div style={{ marginTop: 3.4 * u, fontFamily: MONO, fontSize: 2.2 * u, letterSpacing: "0.14em", textTransform: "uppercase", color: pal.sub, fontWeight: 600 }}>— {design.quoteAuthor}</div>
        )}
      </div>
    );
  } else if (L === "greeting") {
    const width = Math.min(W - 2 * pad, 150 * u);
    const script = cssFamily(fonts.script);
    const message = design.subtitle.length > 200 ? 2.7 : design.subtitle.length > 110 ? 3.1 : 3.6;
    const rule = <span style={{ width: 9 * u, height: 0.35 * u, background: pal.accent, flexShrink: 0 }} />;
    content = (
      <FitBlock style={{ position: "absolute", left: pad, right: pad, top: 10 * u, bottom: 9 * u }}>
        {design.eyebrow && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2.6 * u, fontFamily: body, fontSize: 4.2 * u, fontWeight: 600, letterSpacing: "0.34em", textTransform: "uppercase", color: pal.text }}>
            {rule}<span style={{ marginRight: "-0.34em" }}>{design.eyebrow}</span>{rule}
          </div>
        )}
        {design.title && <FitText text={design.title} size={(land ? 17 : 18) * u * ts} width={width} style={{ fontFamily: script, fontWeight: 700, lineHeight: 1.2, color: pal.sub }} />}
        {design.title && <Ornament id={ornamentOf(design)} colour={pal.sub} width={(land ? 50 : 56) * u} />}
        {design.subtitle && (
          <div style={{ marginTop: 3 * u, maxWidth: Math.min(width * 0.86, 100 * u), fontSize: message * u, fontWeight: 500, lineHeight: 1.45, color: pal.text, whiteSpace: "pre-line" }}>{design.subtitle}</div>
        )}
        {design.signature && (
          // to the right of centre, clear of art that sits in the lower left
          <div style={{ alignSelf: "flex-end", width: land ? "42%" : "60%", marginTop: 3.4 * u }}>
            <div style={{ fontFamily: script, fontSize: 5.4 * u, fontWeight: 600, lineHeight: 1.25, color: pal.sub, whiteSpace: "pre-line" }}>{design.signature}</div>
            <div style={{ width: 18 * u, height: 0.35 * u, background: pal.sub, margin: `${1.2 * u}px auto 0` }} />
          </div>
        )}
      </FitBlock>
    );
  } else if (L === "split") {
    const photo = profile.headshot || design.photos[0];
    const d = land ? H * 0.56 : W * 0.46;
    const ph: CSSProperties = land
      ? { position: "absolute", right: pad * 1.1, top: (H - d) / 2, width: d, height: d }
      : { position: "absolute", left: (W - d) / 2, top: H * 0.1, width: d, height: d };
    content = (
      <>
        <div style={{ ...ph, borderRadius: "50%", padding: 1.2 * u, background: `conic-gradient(from 210deg, ${pal.accent}, ${pal.sub}, ${pal.accent})` }}>
          <div style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", background: mix(pal.base, pal.text, 0.1), border: `${0.8 * u}px solid ${pal.base}` }}>
            {photo ? (
              <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 2 * u, letterSpacing: "0.12em", textTransform: "uppercase", color: pal.text, opacity: 0.5 }}>add headshot</div>
            )}
          </div>
        </div>
        <div style={land ? { ...blockStyle, width: W - d - pad * 3.4 } : { ...blockStyle, top: H * 0.1 + d + 3 * u }}>
          {eyebrow}
          {title(land ? 7.8 : 8.4)}
          {subtitle()}
        </div>
      </>
    );
  }

  // With a shade set, it alone shades one's own picture. Cards made before it keep their two fades.
  const shaded = fullBleedImage && design.shade !== undefined;
  const textTop = (L === "split" && !land ? H * 0.1 + W * 0.46 + 3 * u : art.area.y + art.area.h + 3 * u) / H;
  const shades = shaded ? shadeLayers(pal.base, design.shade!, { layout: L, land, textTop, logo: !!logo, footer: !!footer }) : [];
  const bf = shaded ? 0 : design.bottomFade;
  const imgOverlay = fullBleedImage && !shaded
    ? `linear-gradient(${land ? "90deg" : "180deg"}, ${rgba(pal.base, 0.94)} 0%, ${rgba(pal.base, L === "center" || L === "quote" ? 0.8 : 0.82)} ${land ? 40 : 45}%, ${rgba(pal.base, L === "center" || L === "quote" ? 0.7 : 1 - design.intensity * 0.85)} 100%)`
    : null;

  return (
    <div
      ref={ref}
      // an image of the card is not made while this is set (lib/export.ts)
      data-asset-missing={pictures.waiting || undefined}
      style={{ width: W, height: H, position: "relative", overflow: "hidden", background: pal.base, color: pal.text, fontFamily: body, ...style }}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, display: "block" }}>
        <FadeMask id={uid} mask={art.mask} area={art.area} W={W} H={H} />
        <g mask={!fullBleedImage && art.mask !== "none" ? `url(#m-${uid})` : undefined} opacity={fullBleedImage ? 1 : intensity}>
          {artNode}
        </g>
      </svg>
      {imgOverlay && <div style={{ position: "absolute", inset: 0, background: imgOverlay }} />}
      {shades.map((background, i) => <div key={i} data-shade style={{ position: "absolute", inset: 0, background }} />)}
      {!fullBleedImage && (L === "center" || L === "quote") && design.background !== "plain" && (
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 55% 45% at 50% 50%, ${rgba(pal.base, 0.92)} 0%, ${rgba(pal.base, 0.6)} 55%, ${rgba(pal.base, 0)} 100%)` }} />
      )}
      {washesArt(design, bg.frames) && design.shade !== undefined && greetingWash(pal.base, design.shade) && (
        <div data-wash style={{ position: "absolute", inset: 0, background: greetingWash(pal.base, design.shade)! }} />
      )}
      {washesArt(design, bg.frames) && design.shade === undefined && (
        // cards made before the Shading setting keep their wider, stronger wash
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 72% 62% at 50% 50%, ${rgba(pal.base, 0.95)} 0%, ${rgba(pal.base, 0.86)} 55%, ${rgba(pal.base, 0)} 100%)` }} />
      )}
      {bf > 0 && <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${rgba(pal.fade, 0)} 45%, ${rgba(pal.fade, bf)} 100%)` }} />}
      {bg.dense && !bg.frames && footer && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 12 * u, background: `linear-gradient(0deg, ${rgba(pal.base, 0.96)} 45%, ${rgba(pal.base, 0)} 100%)` }} />}
      {bg.dense && !bg.frames && logo && art.area.x < pad && <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: pad + 14 * u, background: `linear-gradient(180deg, ${rgba(pal.base, 0.96)} 35%, ${rgba(pal.base, 0)} 100%)` }} />}
      {logo}
      {content}
      {footer}
    </div>
  );
});
