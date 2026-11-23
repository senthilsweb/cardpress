import { forwardRef, useEffect, useId, type CSSProperties, type ReactNode } from "react";
import type { Design, LayoutId, Palette, Profile } from "@/lib/types";
import type { Size } from "@/lib/sizes";
import { mulberry32 } from "@/lib/rng";
import { isDark, mix, rgba } from "@/lib/color";
import { cssFamily, ensureFont, resolveFonts } from "@/lib/fonts";
import { bgById, type Area, type MaskKind } from "./backgrounds";

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

const lines = (t: string) => t.split("\n").map((l, i, a) => (
  <span key={i}>
    {l}
    {i < a.length - 1 && <br />}
  </span>
));

export const Card = forwardRef<HTMLDivElement, Props>(function Card({ design, profile, palette: pal, size, style }, ref) {
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
  useEffect(() => { Object.values(fonts).forEach((f) => { void ensureFont(f); }); }, [fontKey]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const logo = design.showLogo ? (
    <div style={{ position: "absolute", left: pad, top: pad * (land ? 0.95 : 0.8), display: "flex", alignItems: "center", gap: 1.4 * u }}>
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
  const footLeft = design.footerLeft || profile.website;
  const footRight = design.footer || profile.handle;
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

  const bf = design.bottomFade;
  const imgOverlay = fullBleedImage
    ? `linear-gradient(${land ? "90deg" : "180deg"}, ${rgba(pal.base, 0.94)} 0%, ${rgba(pal.base, L === "center" || L === "quote" ? 0.8 : 0.82)} ${land ? 40 : 45}%, ${rgba(pal.base, L === "center" || L === "quote" ? 0.7 : 1 - design.intensity * 0.85)} 100%)`
    : null;

  return (
    <div
      ref={ref}
      style={{ width: W, height: H, position: "relative", overflow: "hidden", background: pal.base, color: pal.text, fontFamily: body, ...style }}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, display: "block" }}>
        <FadeMask id={uid} mask={art.mask} area={art.area} W={W} H={H} />
        <g mask={!fullBleedImage && art.mask !== "none" ? `url(#m-${uid})` : undefined} opacity={fullBleedImage ? 1 : intensity}>
          {artNode}
        </g>
      </svg>
      {imgOverlay && <div style={{ position: "absolute", inset: 0, background: imgOverlay }} />}
      {!fullBleedImage && (L === "center" || L === "quote") && design.background !== "plain" && (
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 55% 45% at 50% 50%, ${rgba(pal.base, 0.92)} 0%, ${rgba(pal.base, 0.6)} 55%, ${rgba(pal.base, 0)} 100%)` }} />
      )}
      {bf > 0 && <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${rgba(pal.fade, 0)} 45%, ${rgba(pal.fade, bf)} 100%)` }} />}
      {logo}
      {content}
      {footer}
    </div>
  );
});
