import type { ReactNode } from "react";
import type { BackgroundDef, BgCtx } from "../../bgkit";
import { between, pick } from "@/lib/rng";
import { f, SEASONAL, tones } from "./_kit";

/* A maple leaf about 100 units wide, centred on 0,0, stem down. */
const HALF = [[8, -34], [18, -39], [14, -14], [29, -30], [32, -21], [47, -25], [41, -8], [49, -3], [25, 15], [29, 25], [3, 21]];
const LEAF = `M0,-52 L${HALF.map((q) => q.join(",")).join(" L")} L2,23 Q3,38 7,50 L3,52 Q-2,38 -2,23 L${[...HALF].reverse().map(([x, y]) => `${-x},${y}`).join(" L")} Z`;
const VEINS = "M0,22 L0,-42 M0,18 L36,-20 M0,18 L-36,-20 M0,20 L24,13 M0,20 L-24,13 M0,-8 L11,-28 M0,-8 L-11,-28";
const AUTUMN = ["#b3261e", "#d9531e", "#e8891d", "#f2b01e", "#8c2f1b", "#a65a1f"];

interface Leaf { x: number; y: number; s: number; r: number; fill: string }

/** Leaves on a staggered grid, jittered so that neighbours overlap. */
function scatter(c: BgCtx, cell: number, size: [number, number], colours: string[]): Leaf[] {
  const { area, rng } = c;
  const out: Leaf[] = [];
  let row = 0;
  for (let y = area.y; y < area.y + area.h + cell * 0.5; y += cell * 0.82, row++) {
    for (let x = area.x + (row % 2 ? cell * 0.5 : 0); x < area.x + area.w + cell * 0.5; x += cell) {
      out.push({
        x: x + between(rng, -0.22, 0.22) * cell,
        y: y + between(rng, -0.22, 0.22) * cell,
        s: (cell * between(rng, size[0], size[1])) / 100,
        r: between(rng, -180, 180),
        fill: pick(rng, colours),
      });
    }
  }
  // draw order mixed, so the overlaps weave over and under
  return out.map((l) => ({ l, k: rng() })).sort((a, b) => a.k - b.k).map((o) => o.l);
}
const at = (l: Leaf) => `translate(${f(l.x)} ${f(l.y)}) rotate(${f(l.r)}) scale(${l.s.toFixed(3)})`;

/** Curving twigs running through the leaves. */
function twigs(c: BgCtx, n: number, colour: string): ReactNode[] {
  const { area, u, rng } = c;
  return Array.from({ length: n }, (_, i) => {
    const y = area.y + (area.h * (i + 0.5)) / n;
    const a = between(rng, 9, 18) * u * (i % 2 ? -1 : 1);
    const q = area.w / 4;
    const d = `M${f(area.x)} ${f(y)} C${f(area.x + q)} ${f(y - a)} ${f(area.x + q)} ${f(y + a)} ${f(area.x + 2 * q)} ${f(y)} S${f(area.x + 3 * q)} ${f(y - a)} ${f(area.x + area.w)} ${f(y + a * 0.4)}`;
    return <path key={`t${i}`} d={d} fill="none" stroke={colour} strokeWidth={0.45 * u} strokeLinecap="round" />;
  });
}

function weave(c: BgCtx) {
  const { u, pal } = c;
  const col = tones(pal, AUTUMN);
  const back = scatter(c, 17 * u, [1.0, 1.25], col);
  const front = scatter(c, 22 * u, [0.7, 1.05], col);
  const draw = (l: Leaf, key: string, opacity: number) => (
    <g key={key} transform={at(l)} opacity={opacity}>
      <path d={LEAF} fill={l.fill} stroke={pal.base} strokeWidth={(0.55 * u) / l.s} strokeLinejoin="round" />
      <path d={VEINS} fill="none" stroke={pal.base} strokeOpacity={0.45} strokeWidth={(0.22 * u) / l.s} strokeLinecap="round" />
    </g>
  );
  return (
    <g>
      {back.map((l, i) => draw(l, `b${i}`, 0.45))}
      {twigs(c, 4, col[4])}
      {front.map((l, i) => draw(l, `f${i}`, 0.95))}
    </g>
  );
}

function lineArt(c: BgCtx) {
  const { u, pal } = c;
  const col = tones(pal, AUTUMN);
  return (
    <g>
      {twigs(c, 3, col[1])}
      {scatter(c, 18 * u, [0.95, 1.4], col).map((l, i) => (
        <g key={i} transform={at(l)}>
          <path d={LEAF} fill={l.fill} fillOpacity={0.07} stroke={l.fill} strokeWidth={(0.32 * u) / l.s} strokeLinejoin="round" />
          <path d={VEINS} fill="none" stroke={l.fill} strokeOpacity={0.7} strokeWidth={(0.18 * u) / l.s} strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

function falling(c: BgCtx) {
  const { area, u, pal, rng } = c;
  const col = tones(pal, AUTUMN);
  const n = 26;
  return (
    <g>
      {[0.22, 0.5, 0.78].map((t, i) => {
        const y = area.y + area.h * t;
        return <path key={`w${i}`} d={`M${f(area.x)} ${f(y + 8 * u)} C${f(area.x + area.w * 0.3)} ${f(y - 14 * u)} ${f(area.x + area.w * 0.65)} ${f(y + 16 * u)} ${f(area.x + area.w)} ${f(y - 10 * u)}`} fill="none" stroke={col[2]} strokeOpacity={0.45} strokeWidth={0.22 * u} strokeDasharray={`${0.5 * u} ${1.3 * u}`} strokeLinecap="round" />;
      })}
      {Array.from({ length: n }, (_, i) => {
        // golden-ratio spacing spreads them without clumps
        const x = area.x + area.w * (((i * 0.618 + rng() * 0.08) % 1) * 0.96 + 0.02);
        const y = area.y + area.h * ((i + rng()) / n);
        const size = i % 7 === 0 ? between(rng, 18, 24) : between(rng, 6, 13);
        const l = { x, y, s: (size * u) / 100, r: between(rng, -70, 70), fill: pick(rng, col) };
        return (
          <g key={i} transform={at(l)} opacity={size < 9 ? 0.7 : 1}>
            <path d={LEAF} fill={l.fill} />
            <path d={VEINS} fill="none" stroke={pal.base} strokeOpacity={0.5} strokeWidth={(0.18 * u) / l.s} strokeLinecap="round" />
          </g>
        );
      })}
    </g>
  );
}

/** A pumpkin about 100 units wide, standing on 0,0. */
function Pumpkin({ x, y, s, skin, rib, stem }: { x: number; y: number; s: number; skin: string; rib: string; stem: string }) {
  return (
    <g transform={`translate(${f(x)} ${f(y)}) scale(${s.toFixed(3)})`}>
      <ellipse cx={0} cy={2} rx={52} ry={6} fill="#000" opacity={0.14} />
      <path d="M-4,-70 C-6,-82 -2,-90 8,-96 L15,-90 C8,-84 7,-78 8,-70 Z" fill={stem} />
      {[[-30, 22, 34], [30, 22, 34], [-14, 24, 37], [14, 24, 37], [0, 18, 38]].map(([cx, rx, ry]) => (
        <ellipse key={cx} cx={cx} cy={-36} rx={rx} ry={ry} fill={skin} stroke={rib} strokeWidth={1.8} />
      ))}
    </g>
  );
}

/** A pine cone about 40 units wide: rows of scales. */
function Cone({ x, y, s, dark, light }: { x: number; y: number; s: number; dark: string; light: string }) {
  return (
    <g transform={`translate(${f(x)} ${f(y)}) rotate(24) scale(${s.toFixed(3)})`}>
      {[0, 1, 2, 3, 4, 5].flatMap((row) => {
        const w = [10, 17, 20, 19, 15, 8][row];
        return [-1, 0, 1].map((k) => (
          <path key={`${row}-${k}`} d={`M${k * w * 0.7 - 9},${-48 + row * 9} Q${k * w * 0.7},${-34 + row * 9} ${k * w * 0.7 + 9},${-48 + row * 9} Z`} fill={(row + k) % 2 ? dark : light} />
        ));
      })}
    </g>
  );
}

/** Leaves in the top corners and a harvest still life at the bottom, leaving the middle for the words. */
function harvest(c: BgCtx) {
  const { area, u, pal, rng, uid } = c;
  const col = tones(pal, AUTUMN);
  const [orange, rib, cream, creamRib, wood, stem, berry] = tones(pal, ["#e8731c", "#b9520d", "#f4e3c1", "#d09a52", "#8a5a33", "#6b4a22", "#c0261c"]);
  const right = area.x + area.w, floor = area.y + area.h * 0.93;
  const short = Math.min(area.w, area.h) / 100;
  const k = Math.min(u, short);
  const leaf = (x: number, y: number, size: number, turn: number, key: string, opacity = 1) => {
    const s = (size * k) / 100, fill = pick(rng, col);
    return (
      <g key={key} transform={`translate(${f(x)} ${f(y)}) rotate(${f(turn)}) scale(${s.toFixed(3)})`} opacity={opacity}>
        <path d={LEAF} fill={fill} stroke={pal.base} strokeWidth={(0.35 * k) / s} strokeLinejoin="round" />
        <path d={VEINS} fill="none" stroke={pal.base} strokeOpacity={0.45} strokeWidth={(0.18 * k) / s} strokeLinecap="round" />
      </g>
    );
  };
  // [from the corner across, from the top down, size]
  const spray = [[2, 2, 24], [13, 0, 19], [24, 3, 14], [4, 14, 17], [15, 11, 12], [32, -1, 11], [0, 25, 12], [9, 22, 9]];
  const corner = (side: 1 | -1) => spray.map(([dx, dy, size], i) => {
    const x = (side === 1 ? area.x + dx * k : right - dx * k) + between(rng, -1, 1) * k;
    return leaf(x, area.y + dy * k + between(rng, -1, 1) * k, size, side * between(rng, 100, 190), `c${side}${i}`);
  }).reverse();
  const bx = area.x + 15 * k;
  return (
    <g>
      <defs>
        <radialGradient id={`bokeh-${uid}`}>
          <stop offset="0" stopColor={col[3]} stopOpacity="0.34" />
          <stop offset="1" stopColor={col[3]} stopOpacity="0" />
        </radialGradient>
      </defs>
      {Array.from({ length: 22 }, (_, i) => {
        // soft lights down both sides, away from the words
        const x = i % 2 ? area.x + between(rng, 0, 0.18) * area.w : right - between(rng, 0, 0.18) * area.w;
        return <circle key={`b${i}`} cx={x} cy={area.y + rng() * area.h * 0.86} r={between(rng, 3, 10) * k} fill={`url(#bokeh-${uid})`} />;
      })}
      <path d={`M${f(area.x)},${f(area.y + 6 * k)} Q${f(area.x + 18 * k)},${f(area.y + 4 * k)} ${f(area.x + 38 * k)},${f(area.y - 2 * k)}`} fill="none" stroke={stem} strokeWidth={0.8 * k} strokeLinecap="round" />
      <path d={`M${f(right)},${f(area.y + 6 * k)} Q${f(right - 18 * k)},${f(area.y + 4 * k)} ${f(right - 38 * k)},${f(area.y - 2 * k)}`} fill="none" stroke={stem} strokeWidth={0.8 * k} strokeLinecap="round" />
      {corner(1)}
      {corner(-1)}
      <rect x={area.x} y={floor} width={area.w} height={area.y + area.h - floor} fill={wood} opacity={0.2} />
      <line x1={area.x} x2={right} y1={floor} y2={floor} stroke={wood} strokeOpacity={0.6} strokeWidth={0.35 * k} />
      {/* nothing reaches below the table's edge: the footer is written there */}
      {leaf(area.x + 4 * k, floor - 14 * k, 17, -50, "l1")}
      {leaf(area.x + 33 * k, floor - 8 * k, 13, 62, "l2")}
      <Pumpkin x={bx} y={floor - 0.8 * k} s={0.25 * k} skin={orange} rib={rib} stem={stem} />
      <Cone x={area.x + 35 * k} y={floor - 2 * k} s={0.17 * k} dark={stem} light={wood} />
      <Pumpkin x={area.x + 26 * k} y={floor + 0.2 * k} s={0.13 * k} skin={cream} rib={creamRib} stem={stem} />
      {[[39, -2], [41.5, -1], [43.5, -2.4], [40.5, -4], [42.8, -4.6], [45.5, -1.2]].map(([dx, dy]) => <circle key={`${dx}`} cx={area.x + dx * k} cy={floor + dy * k} r={1.35 * k} fill={berry} stroke={pal.base} strokeOpacity={0.4} strokeWidth={0.2 * k} />)}
      {leaf(area.x + 6.5 * k, floor - 5 * k, 10, 96, "l3")}
      {leaf(right - 6 * k, floor - 8 * k, 13, -34, "r1")}
      {leaf(right - 15 * k, floor - 4.5 * k, 8, 74, "r2")}
    </g>
  );
}

const theme = { category: SEASONAL, group: "Thanksgiving", dense: true, palette: "autumn-cream", keywords: ["thanks", "gratitude", "autumn", "fall", "maple", "harvest", "greeting"] };
const defs: BackgroundDef[] = [
  { id: "harvest-frame", name: "Harvest frame", hint: "Corners and pumpkins, clear middle", render: harvest, ...theme, frames: true, keywords: [...theme.keywords, "pumpkin"] },
  { id: "maple-weave", name: "Maple weave", hint: "Interlaced autumn leaves", render: weave, ...theme },
  { id: "maple-lines", name: "Maple line art", hint: "Outlined leaves, lighter", render: lineArt, ...theme },
  { id: "maple-fall", name: "Falling leaves", hint: "Leaves drifting down", render: falling, ...theme },
];
export default defs;
