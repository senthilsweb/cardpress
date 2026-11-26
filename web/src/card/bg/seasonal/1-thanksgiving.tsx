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

const theme = { category: SEASONAL, group: "Thanksgiving", dense: true };
const defs: BackgroundDef[] = [
  { id: "maple-weave", name: "Maple weave", hint: "Interlaced autumn leaves", render: weave, ...theme },
  { id: "maple-lines", name: "Maple line art", hint: "Outlined leaves, lighter", render: lineArt, ...theme },
  { id: "maple-fall", name: "Falling leaves", hint: "Leaves drifting down", render: falling, ...theme },
];
export default defs;
