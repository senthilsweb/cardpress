import type { ReactNode } from "react";
import type { Palette } from "@/lib/types";
import { between, pick } from "@/lib/rng";
import { ink, surface, type BgCtx, type BackgroundDef } from "./bgkit";
import { isDark, mix, hexToRgb } from "@/lib/color";

export type { Area, MaskKind, BgCtx, BackgroundDef } from "./bgkit";

/* ---------------------------------------------------------------- 1. constellation */
function constellation(c: BgCtx) {
  const { area, u, pal, rng } = c;
  const padX = area.w * 0.1, padY = area.h * 0.12;
  const hub = { x: area.x + area.w * between(rng, 0.42, 0.58), y: area.y + area.h * between(rng, 0.4, 0.6) };
  const n = 16;
  const pts = Array.from({ length: n }, () => ({
    x: area.x + padX + rng() * (area.w - 2 * padX),
    y: area.y + padY + rng() * (area.h - 2 * padY),
    r: between(rng, 0.7, 1.6) * u,
    hot: rng() < 0.22,
  }));
  const edges: [number, number][] = [];
  pts.forEach((p, i) => {
    if (rng() < 0.55) edges.push([-1, i]);
    else {
      let best = -1, bd = Infinity;
      pts.forEach((q, j) => {
        if (j === i) return;
        const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
        if (d < bd) { bd = d; best = j; }
      });
      edges.push([i, best]);
    }
  });
  const at = (k: number) => (k < 0 ? hub : pts[k]);
  return (
    <g>
      {[14, 24, 34].map((r, i) => (
        <circle key={i} cx={hub.x} cy={hub.y} r={r * u} fill="none" stroke={ink(pal, 0.1)} strokeWidth={0.18 * u} strokeDasharray={`${0.6 * u} ${1.2 * u}`} />
      ))}
      {edges.map(([a, b], i) => (
        <line key={i} x1={at(a).x} y1={at(a).y} x2={at(b).x} y2={at(b).y} stroke={a < 0 ? pal.accent : ink(pal, 0.3)} strokeOpacity={a < 0 ? 0.55 : 1} strokeWidth={0.22 * u} />
      ))}
      <circle cx={hub.x} cy={hub.y} r={11 * u} fill={pal.accent} opacity={0.08} />
      <circle cx={hub.x} cy={hub.y} r={6.5 * u} fill={pal.accent} opacity={0.16} />
      <circle cx={hub.x} cy={hub.y} r={3 * u} fill={pal.accent} />
      <circle cx={hub.x} cy={hub.y} r={1.1 * u} fill={pal.base} />
      {pts.map((p, i) => (
        <g key={i}>
          {p.hot && <circle cx={p.x} cy={p.y} r={p.r * 2.4} fill={pal.sub} opacity={0.18} />}
          <circle cx={p.x} cy={p.y} r={p.r} fill={p.hot ? pal.sub : ink(pal, 0.65)} />
        </g>
      ))}
    </g>
  );
}

/* ---------------------------------------------------------------- 2. dot grid */
function dots(c: BgCtx) {
  const { area, u, pal, rng, W, H } = c;
  const step = 3.2 * u;
  const fx = area.x + area.w * 0.6, fy = area.y + area.h * 0.45;
  const dmax = Math.hypot(Math.max(area.w, W * 0.5), Math.max(area.h, H * 0.5)) * 0.75;
  const out: ReactNode[] = [];
  for (let y = area.y + step / 2; y < area.y + area.h; y += step) {
    for (let x = area.x + step / 2; x < area.x + area.w; x += step) {
      const k = Math.max(0, 1 - Math.hypot(x - fx, y - fy) / dmax);
      const hot = rng() < 0.05 * k + 0.01;
      out.push(
        <circle key={`${x}-${y}`} cx={x} cy={y} r={(0.18 + 0.5 * k) * u * (hot ? 1.6 : 1)} fill={hot ? pal.accent : ink(pal, 0.15 + 0.5 * k)} />
      );
    }
  }
  return <g>{out}</g>;
}

/* ---------------------------------------------------------------- 3. code lines */
function code(c: BgCtx) {
  const { area, u, pal, rng } = c;
  const lh = 3.4 * u, bh = 1.25 * u, gap = 1.1 * u;
  const colors = [pal.accent, pal.sub, ink(pal, 0.5), ink(pal, 0.28), ink(pal, 0.28)];
  const x0 = area.x + area.w * 0.1;
  let indent = 0;
  const out: ReactNode[] = [];
  let row = 0;
  for (let y = area.y + area.h * 0.1; y < area.y + area.h * 0.94; y += lh, row++) {
    if (rng() < 0.1) continue; // blank line
    indent = Math.max(0, Math.min(3, indent + (rng() < 0.3 ? 1 : rng() < 0.3 ? -1 : 0)));
    out.push(<rect key={`n${row}`} x={area.x + area.w * 0.02} y={y} width={1.6 * u} height={bh} rx={bh / 2} fill={ink(pal, 0.12)} />);
    let x = x0 + indent * 3.4 * u;
    const segs = 1 + Math.floor(rng() * 4);
    for (let s = 0; s < segs && x < area.x + area.w; s++) {
      const w = between(rng, 3, 16) * u;
      out.push(<rect key={`${row}-${s}`} x={x} y={y} width={w} height={bh} rx={bh / 2} fill={pick(rng, colors)} />);
      x += w + gap;
    }
  }
  // blinking-cursor style block
  return (
    <g>
      {out}
    </g>
  );
}

/* ---------------------------------------------------------------- 4. rising bars */
function bars(c: BgCtx) {
  const { area, u, pal, rng } = c;
  const n = 9;
  const left = area.x + area.w * 0.12, right = area.x + area.w * 0.92;
  const base = area.y + area.h * 0.82, top = area.y + area.h * 0.16;
  const slot = (right - left) / n, bw = slot * 0.62;
  const hs = Array.from({ length: n }, (_, i) => Math.min(1, 0.18 + (i / (n - 1)) * 0.75 + between(rng, -0.08, 0.08)));
  const tops = hs.map((h, i) => ({ x: left + i * slot + bw / 2, y: base - h * (base - top) }));
  return (
    <g>
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <line key={i} x1={left - slot * 0.3} x2={right} y1={base - t * (base - top)} y2={base - t * (base - top)} stroke={ink(pal, i === 0 ? 0.35 : 0.1)} strokeWidth={0.2 * u} strokeDasharray={i === 0 ? undefined : `${0.8 * u} ${0.8 * u}`} />
      ))}
      {hs.map((h, i) => (
        <rect key={i} x={left + i * slot} y={base - h * (base - top)} width={bw} height={h * (base - top)} rx={0.5 * u} fill={i >= n - 2 ? pal.accent : i % 3 === 0 ? mix(pal.accent, pal.base, 0.55) : ink(pal, 0.16)} />
      ))}
      <polyline points={tops.map((t) => `${t.x},${t.y - 2 * u}`).join(" ")} fill="none" stroke={pal.sub} strokeWidth={0.35 * u} strokeLinejoin="round" />
      {tops.map((t, i) => <circle key={i} cx={t.x} cy={t.y - 2 * u} r={0.65 * u} fill={pal.sub} />)}
    </g>
  );
}

/* ---------------------------------------------------------------- 5. gradient mesh */
function mesh(c: BgCtx) {
  const { area, u, pal, rng, uid } = c;
  const cols = [pal.accent, pal.sub, mix(pal.accent, pal.base, 0.35), pal.fade, mix(pal.sub, pal.base, 0.4)];
  const blobs = cols.map((col, i) => ({
    x: area.x + area.w * between(rng, 0.1, 0.95),
    y: area.y + area.h * between(rng, 0.05, 0.95),
    r: between(rng, 16, 32) * u,
    col,
    o: i < 2 ? 0.75 : 0.6,
  }));
  return (
    <g>
      <defs>
        <filter id={`blur-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={9 * u} />
        </filter>
      </defs>
      <g filter={`url(#blur-${uid})`}>
        {blobs.map((b, i) => <circle key={i} cx={b.x} cy={b.y} r={b.r} fill={b.col} opacity={b.o} />)}
      </g>
    </g>
  );
}

/* ---------------------------------------------------------------- 6. topographic contours */
function contours(c: BgCtx) {
  const { area, u, pal, rng } = c;
  const centers = [0, 1].map(() => ({
    x: area.x + area.w * between(rng, 0.3, 0.8),
    y: area.y + area.h * between(rng, 0.25, 0.75),
    a: between(rng, 0.08, 0.16), k: 2 + Math.floor(rng() * 3), ph: rng() * 6.28,
    b: between(rng, 0.04, 0.09), m: 4 + Math.floor(rng() * 3), ps: rng() * 6.28,
  }));
  const out: ReactNode[] = [];
  centers.forEach((cn, ci) => {
    const levels = ci === 0 ? 16 : 9;
    for (let L = 1; L <= levels; L++) {
      const r0 = L * 3 * u;
      const pts: string[] = [];
      for (let s = 0; s <= 72; s++) {
        const t = (s / 72) * Math.PI * 2;
        const r = r0 * (1 + cn.a * Math.sin(cn.k * t + cn.ph + L * 0.15) + cn.b * Math.sin(cn.m * t + cn.ps));
        pts.push(`${(cn.x + r * Math.cos(t)).toFixed(1)},${(cn.y + r * Math.sin(t)).toFixed(1)}`);
      }
      const major = L % 4 === 0;
      out.push(<polygon key={`${ci}-${L}`} points={pts.join(" ")} fill="none" stroke={major ? pal.accent : ink(pal, 0.2)} strokeWidth={(major ? 0.32 : 0.2) * u} />);
    }
  });
  return <g>{out}</g>;
}

/* ---------------------------------------------------------------- 7. geometric tiles */
function geometric(c: BgCtx) {
  const { area, u, pal, rng, mask, W } = c;
  const cell = mask === "right" ? area.h / 5 : W / 7;
  const cols = Math.ceil(area.w / cell), rows = Math.ceil(area.h / cell);
  const x0 = area.x + area.w - cols * cell, y0 = area.y;
  const fills = [pal.accent, pal.sub, mix(pal.accent, pal.base, 0.5), pal.fade, surface(pal)];
  const out: ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let ci = 0; ci < cols; ci++) {
      // fewer shapes toward the text side
      const towardText = mask === "right" ? 1 - ci / Math.max(1, cols - 1) : mask === "top" ? r / Math.max(1, rows - 1) : 0;
      if (rng() < 0.15 + 0.5 * towardText) continue;
      const x = x0 + ci * cell, y = y0 + r * cell, s = cell;
      const bg = rng() < 0.4 ? pick(rng, fills) : null;
      let fg = pick(rng, fills);
      if (fg === bg) fg = pal.text;
      const kind = pick(rng, ["qc", "half", "circle", "tri", "ring", "square", "qc"]);
      const rot = Math.floor(rng() * 4) * 90;
      const cx = x + s / 2, cy = y + s / 2;
      let shape: ReactNode = null;
      if (kind === "qc") shape = <path d={`M${x},${y} L${x + s},${y} A${s},${s} 0 0 1 ${x},${y + s} Z`} fill={fg} />;
      else if (kind === "half") shape = <path d={`M${x},${cy} A${s / 2},${s / 2} 0 0 1 ${x + s},${cy} Z`} fill={fg} />;
      else if (kind === "circle") shape = <circle cx={cx} cy={cy} r={s * 0.36} fill={fg} />;
      else if (kind === "tri") shape = <path d={`M${x},${y} L${x + s},${y + s} L${x},${y + s} Z`} fill={fg} />;
      else if (kind === "ring") shape = <circle cx={cx} cy={cy} r={s * 0.3} fill="none" stroke={fg} strokeWidth={s * 0.12} />;
      else shape = <rect x={x + s * 0.2} y={y + s * 0.2} width={s * 0.6} height={s * 0.6} fill={fg} />;
      out.push(
        <g key={`${r}-${ci}`} transform={`rotate(${rot} ${cx} ${cy})`}>
          {bg && <rect x={x} y={y} width={s} height={s} fill={bg} />}
          {shape}
        </g>
      );
    }
  void u;
  return <g>{out}</g>;
}

/* ---------------------------------------------------------------- 8. photo mosaic */
const P0 = [
  ["e", "i", "s", "e", "t"],
  ["t", "e", "e", "i", "i"],
  ["e", "e", "t", "e", "i"],
  ["e", "e", "e", "i", "e"],
  ["e", "e", "i", "e", "l"],
];
function mosaic(c: BgCtx) {
  const { area, u, pal, rng, mask, W, uid, photos } = c;
  const cell = mask === "right" ? area.h / 5 : W / 7;
  const cols = Math.ceil(area.w / cell), rows = Math.ceil(area.h / cell);
  const x0 = area.x + area.w - cols * cell, y0 = area.y;
  const dk = hexToRgb(mix(pal.accent, "#000000", 0.7)), lt = hexToRgb(mix(pal.accent, "#ffffff", 0.35));
  const tv = (i: number) => `${(dk[i] / 255).toFixed(3)} ${(lt[i] / 255).toFixed(3)}`;
  let k = 0;
  const out: ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let ci = 0; ci < cols; ci++) {
      // first draw keeps the classic pattern; shuffles mix it up
      const towardText = mask === "right" ? 1 - ci / Math.max(1, cols - 1) : mask === "top" ? r / Math.max(1, rows - 1) : 0;
      const pc = ci - (cols - 5);
      const roll = rng();
      let t = pc >= 0 ? P0[r % 5][pc] : "e";
      if (rng() < 0.5) {
        t = roll < 0.2 + 0.45 * towardText ? "e" : pick(rng, ["i", "i", "t", "t", "s", "l"]);
      }
      if (t === "e") continue;
      const x = x0 + ci * cell, y = y0 + r * cell;
      if (t === "s") out.push(<rect key={`${r}-${ci}`} x={x} y={y} width={cell} height={cell} fill={pal.accent} />);
      else if (t === "l") out.push(<rect key={`${r}-${ci}`} x={x} y={y} width={cell} height={cell} fill={mix(pal.accent, "#ffffff", 0.7)} />);
      else if (photos.length) {
        const src = photos[k++ % photos.length];
        out.push(
          <image key={`${r}-${ci}`} href={src} x={x} y={y} width={cell} height={cell} preserveAspectRatio="xMidYMid slice" filter={`url(#${t === "i" ? "gray" : "duo"}-${uid})`} />
        );
      } else {
        out.push(
          <g key={`${r}-${ci}`}>
            <rect x={x} y={y} width={cell} height={cell} fill={t === "t" ? mix(pal.accent, pal.base, 0.55) : surface(pal)} />
            <rect x={x} y={y} width={cell} height={cell} fill={`url(#hatch-${uid})`} />
          </g>
        );
      }
    }
  return (
    <g>
      <defs>
        <filter id={`gray-${uid}`}><feColorMatrix type="saturate" values="0" /></filter>
        <filter id={`duo-${uid}`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues={tv(0)} />
            <feFuncG type="table" tableValues={tv(1)} />
            <feFuncB type="table" tableValues={tv(2)} />
          </feComponentTransfer>
        </filter>
        <pattern id={`hatch-${uid}`} width={2.2 * u} height={2.2 * u} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2={2.2 * u} stroke={ink(pal, 0.12)} strokeWidth={0.5 * u} />
        </pattern>
      </defs>
      {out}
    </g>
  );
}

/* ---------------------------------------------------------------- 9. browser frame */
function browser(c: BgCtx) {
  const { area, u, pal, rng, mask, uid, screenshot, W, H } = c;
  const dark = isDark(pal.base);
  const win =
    mask === "right"
      ? { x: area.x + area.w * 0.06, y: H * 0.14, w: area.w * 1.02, h: H * 0.8 }
      : { x: W * 0.1, y: area.y + area.h * 0.14, w: W * 0.96, h: area.h * 0.92 };
  const bar = 4.4 * u, rad = 1.6 * u;
  const body = dark ? mix(pal.base, "#ffffff", 0.08) : "#ffffff";
  const chrome = dark ? mix(pal.base, "#ffffff", 0.14) : mix(pal.base, "#000000", 0.06);
  const cx = win.x, cy = win.y + bar;
  const sk: ReactNode[] = [];
  if (!screenshot) {
    const sw = win.w * 0.18;
    sk.push(<rect key="side" x={cx} y={cy} width={sw} height={win.h - bar} fill={mix(body, pal.accent, 0.06)} />);
    for (let i = 0; i < 7; i++)
      sk.push(<rect key={`s${i}`} x={cx + 1.6 * u} y={cy + 3 * u + i * 3.4 * u} width={sw * between(rng, 0.45, 0.8)} height={1.2 * u} rx={0.6 * u} fill={i === 1 ? pal.accent : ink(pal, 0.16)} />);
    const mx = cx + sw + 3 * u, mw = win.w - sw - 6 * u;
    sk.push(<rect key="h1" x={mx} y={cy + 3 * u} width={mw * 0.35} height={2 * u} rx={u} fill={ink(pal, 0.55)} />);
    const cardW = (mw - 4 * u) / 3;
    for (let i = 0; i < 3; i++) {
      const x = mx + i * (cardW + 2 * u), y = cy + 8 * u;
      sk.push(<rect key={`c${i}`} x={x} y={y} width={cardW} height={9 * u} rx={u} fill={mix(body, pal.text, 0.04)} stroke={ink(pal, 0.08)} strokeWidth={0.15 * u} />);
      sk.push(<rect key={`cv${i}`} x={x + 1.4 * u} y={y + 2 * u} width={cardW * 0.4} height={2.6 * u} rx={0.5 * u} fill={i === 0 ? pal.accent : ink(pal, 0.4)} />);
      sk.push(<rect key={`cl${i}`} x={x + 1.4 * u} y={y + 6 * u} width={cardW * 0.6} height={0.9 * u} rx={0.45 * u} fill={ink(pal, 0.15)} />);
    }
    const chY = cy + 20 * u, chH = Math.min(win.h - bar - 24 * u, 22 * u);
    if (chH > 6 * u) {
      sk.push(<rect key="ch" x={mx} y={chY} width={mw} height={chH} rx={u} fill={mix(body, pal.text, 0.03)} stroke={ink(pal, 0.08)} strokeWidth={0.15 * u} />);
      const pts = Array.from({ length: 12 }, (_, i) => `${mx + 2 * u + (i / 11) * (mw - 4 * u)},${chY + chH - 2 * u - (0.15 + 0.7 * (i / 11) + between(rng, -0.1, 0.1)) * (chH - 4 * u)}`);
      sk.push(<polyline key="cl" points={pts.join(" ")} fill="none" stroke={pal.accent} strokeWidth={0.4 * u} strokeLinejoin="round" />);
    }
  }
  return (
    <g>
      <defs>
        <filter id={`shadow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy={1.2 * u} stdDeviation={2.4 * u} floodColor="#000" floodOpacity={dark ? 0.5 : 0.18} />
        </filter>
        <clipPath id={`win-${uid}`}><rect x={win.x} y={win.y} width={win.w} height={win.h} rx={rad} /></clipPath>
      </defs>
      <rect x={win.x} y={win.y} width={win.w} height={win.h} rx={rad} fill={body} filter={`url(#shadow-${uid})`} />
      <g clipPath={`url(#win-${uid})`}>
        <rect x={win.x} y={win.y} width={win.w} height={bar} fill={chrome} />
        {["#ff5f57", "#febc2e", "#28c840"].map((col, i) => <circle key={i} cx={win.x + 2.2 * u + i * 1.9 * u} cy={win.y + bar / 2} r={0.6 * u} fill={col} />)}
        <rect x={win.x + win.w * 0.28} y={win.y + bar * 0.25} width={Math.min(win.w * 0.4, 40 * u)} height={bar * 0.5} rx={bar * 0.25} fill={dark ? mix(chrome, "#ffffff", 0.08) : "#ffffff"} />
        {screenshot ? (
          <image href={screenshot} x={win.x} y={win.y + bar} width={win.w} height={win.h - bar} preserveAspectRatio="xMinYMin slice" />
        ) : (
          sk
        )}
      </g>
    </g>
  );
}

/* ---------------------------------------------------------------- 10. own image */
function image(c: BgCtx) {
  if (!c.image) return mesh(c);
  return <image href={c.image} x={0} y={0} width={c.W} height={c.H} preserveAspectRatio="xMidYMid slice" />;
}

const BUILTIN: BackgroundDef[] = [
  { id: "constellation", name: "Constellation", hint: "Hub and nodes – agents, architecture", render: constellation },
  { id: "dots", name: "Dot grid", hint: "Clean tech look", render: dots },
  { id: "code", name: "Code lines", hint: "Coding and dev tools", render: code },
  { id: "bars", name: "Rising bars", hint: "Metrics and benchmarks", render: bars },
  { id: "geometric", name: "Geometric", hint: "Brand tiles, no photos needed", render: geometric },
  { id: "contours", name: "Contours", hint: "Article covers", render: contours },
  { id: "mesh", name: "Gradient mesh", hint: "Announcements and quotes", render: mesh },
  { id: "mosaic", name: "Photo mosaic", hint: "Your photos in tiles", needs: "photos", render: mosaic },
  { id: "browser", name: "Browser frame", hint: "Show an app screenshot", needs: "screenshot", render: browser },
  { id: "image", name: "Own image", hint: "Your image with colour overlay", needs: "image", render: image },
  { id: "plain", name: "Plain", hint: "Just colour", render: () => null },
];
/* Drop-in backgrounds: any card/bg/*.tsx (not starting with "_") that default-exports a BackgroundDef is listed. */
const dropIns = Object.entries(import.meta.glob<{ default: BackgroundDef }>("./bg/*.tsx", { eager: true }))
  .filter(([path]) => !path.split("/").pop()!.startsWith("_"))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, m]) => m.default)
  .filter((d) => d && d.id && typeof d.render === "function");

// Insert before "Plain" so it stays last; a drop-in with a built-in id replaces that built-in.
const plain = BUILTIN[BUILTIN.length - 1];
const base = BUILTIN.slice(0, -1).filter((b) => !dropIns.some((d) => d.id === b.id));
export const BACKGROUNDS: BackgroundDef[] = [...base, ...dropIns, plain];
export const bgById = (id: string) => BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0];
