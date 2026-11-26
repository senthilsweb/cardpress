import type { ReactNode } from "react";
import type { Palette } from "@/lib/types";
import type { BackgroundDef, BgCtx } from "../../bgkit";
import { ink } from "../../bgkit";
import { hexToRgb } from "@/lib/color";
import { between } from "@/lib/rng";
import { f, SEASONAL, tone } from "./_kit";

const GOLD = "#e6ab2c";
/** Red art would vanish on a red card, which takes the deeper gold-and-cream instead. */
const redCard = (p: Palette) => {
  const [r, g, b] = hexToRgb(p.base);
  return r > 90 && r > g * 2 && r > b * 2;
};
const reds = (p: Palette) => (redCard(p) ? "#d6202a" : tone(p, "#cf1f26"));

function lanterns(c: BgCtx) {
  const { area, u, pal, rng } = c;
  const gold = tone(pal, GOLD), red = reds(pal);
  const set = [
    { x: 0.2, y: 0.34, r: 8 }, { x: 0.46, y: 0.58, r: 12 }, { x: 0.74, y: 0.32, r: 10.5 }, { x: 0.9, y: 0.66, r: 7 },
  ];
  return (
    <g>
      {Array.from({ length: 50 }, (_, i) => <circle key={`s${i}`} cx={area.x + rng() * area.w} cy={area.y + rng() * area.h} r={between(rng, 0.15, 0.5) * u} fill={gold} opacity={between(rng, 0.3, 0.75)} />)}
      {set.map((s, i) => {
        const x = area.x + area.w * s.x, y = area.y + area.h * (s.y + between(rng, -0.05, 0.05)), r = s.r * u, h = r * 0.82;
        return (
          <g key={i}>
            <line x1={x} y1={area.y} x2={x} y2={y - h} stroke={gold} strokeWidth={0.3 * u} />
            <ellipse cx={x} cy={y} rx={r * 1.35} ry={h * 1.35} fill={gold} opacity={0.1} />
            <ellipse cx={x} cy={y} rx={r} ry={h} fill={red} stroke={gold} strokeWidth={0.3 * u} />
            {[0.72, 0.4, 0.04].map((k) => <ellipse key={k} cx={x} cy={y} rx={Math.max(r * k, 0.1)} ry={h} fill="none" stroke={gold} strokeOpacity={0.75} strokeWidth={0.28 * u} />)}
            {[-1, 1].map((d) => <rect key={d} x={x - r * 0.45} y={y + d * h - r * 0.09} width={r * 0.9} height={r * 0.2} rx={r * 0.06} fill={gold} />)}
            <circle cx={x} cy={y + h + r * 0.27} r={r * 0.11} fill={gold} />
            {Array.from({ length: 7 }, (_, k) => <line key={k} x1={x} y1={y + h + r * 0.3} x2={x + (k - 3) * r * 0.1} y2={y + h + r * 1.05} stroke={gold} strokeWidth={0.28 * u} strokeLinecap="round" />)}
          </g>
        );
      })}
    </g>
  );
}

function blossom(c: BgCtx) {
  const { area, u, pal, rng } = c;
  const gold = tone(pal, GOLD);
  const petal = redCard(pal) ? "#ffd9d6" : tone(pal, "#e5486a");
  const wood = redCard(pal) ? "#3d0507" : tone(pal, "#6b3a26");
  const P = (x: number, y: number) => ({ x: area.x + area.w * x, y: area.y + area.h * y });
  const branches = [
    { a: P(1.02, 0.86), b: P(0.72, 0.72), cc: P(0.55, 0.6), d: P(0.16, 0.24), w: 2 },
    { a: P(0.66, 0.65), b: P(0.62, 0.42), cc: P(0.78, 0.3), d: P(0.7, 0.08), w: 1.1 },
    { a: P(0.46, 0.5), b: P(0.34, 0.62), cc: P(0.28, 0.76), d: P(0.12, 0.74), w: 0.8 },
    { a: P(0.84, 0.76), b: P(0.9, 0.58), cc: P(0.86, 0.5), d: P(0.96, 0.4), w: 0.8 },
  ];
  const flower = (x: number, y: number, r: number, turn: number, key: string) => (
    <g key={key} transform={`translate(${f(x)} ${f(y)}) rotate(${f(turn)})`}>
      {[0, 72, 144, 216, 288].map((a) => <circle key={a} cx={0} cy={-r * 0.58} r={r * 0.48} fill={petal} stroke={pal.base} strokeWidth={0.2 * u} transform={`rotate(${a})`} />)}
      {[36, 108, 180, 252, 324].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <line x1={0} y1={0} x2={0} y2={-r * 0.5} stroke={gold} strokeWidth={0.18 * u} />
          <circle cx={0} cy={-r * 0.52} r={r * 0.08} fill={gold} />
        </g>
      ))}
      <circle r={r * 0.2} fill={gold} />
    </g>
  );
  const blooms: ReactNode[] = [];
  branches.forEach((br, bi) => {
    const n = bi === 0 ? 8 : 4;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.7) / n, m = 1 - t;
      const q = (k: "x" | "y") => m * m * m * br.a[k] + 3 * m * m * t * br.b[k] + 3 * m * t * t * br.cc[k] + t * t * t * br.d[k];
      const x = q("x") + between(rng, -4, 4) * u, y = q("y") + between(rng, -4, 4) * u;
      if (i % 3 === 2) blooms.push(<circle key={`${bi}-${i}`} cx={x} cy={y} r={between(rng, 0.9, 1.5) * u} fill={petal} />);
      else blooms.push(flower(x, y, between(rng, 2.6, 5) * u, between(rng, 0, 72), `${bi}-${i}`));
    }
  });
  return (
    <g>
      <circle cx={P(0.4, 0.3).x} cy={P(0.4, 0.3).y} r={Math.min(area.w, area.h) * 0.24} fill={gold} opacity={0.22} />
      {branches.map((br, i) => <path key={i} d={`M${f(br.a.x)} ${f(br.a.y)} C${f(br.b.x)} ${f(br.b.y)} ${f(br.cc.x)} ${f(br.cc.y)} ${f(br.d.x)} ${f(br.d.y)}`} fill="none" stroke={wood} strokeWidth={br.w * u} strokeLinecap="round" />)}
      {blooms}
    </g>
  );
}

function clouds(c: BgCtx) {
  const { area, u, pal, rng } = c;
  const gold = tone(pal, GOLD), red = reds(pal);
  const cell = 15 * u;
  const out: ReactNode[] = [];
  let row = 0;
  // overlapping wave arcs, row over row
  for (let y = area.y + area.h * 0.55; y < area.y + area.h + cell; y += cell * 0.36, row++) {
    for (let x = area.x + (row % 2 ? cell / 2 : 0); x < area.x + area.w + cell / 2; x += cell) {
      out.push(
        <g key={`w${row}-${x}`}>
          {[0.5, 0.36, 0.22].map((k, i) => <path key={k} d={`M${f(x - cell * k)},${f(y)} A${f(cell * k)},${f(cell * k)} 0 0 1 ${f(x + cell * k)},${f(y)}`} fill={i === 0 ? pal.base : "none"} stroke={gold} strokeOpacity={0.75} strokeWidth={0.28 * u} />)}
        </g>
      );
    }
  }
  const cloud = "M-50,14 C-62,14 -62,-6 -46,-6 C-48,-24 -22,-30 -14,-16 C-8,-40 28,-36 28,-12 C46,-20 62,0 46,10 C62,12 58,22 44,20 L-34,20 C-30,6 -48,2 -48,10 C-48,16 -38,15 -40,9 M-14,-16 C-2,-12 0,2 -10,4 C-18,5 -20,-6 -12,-6 M28,-12 C16,-12 12,2 22,5 C30,6 32,-4 25,-4";
  return (
    <g>
      <circle cx={area.x + area.w * 0.64} cy={area.y + area.h * 0.3} r={13 * u} fill={red} stroke={gold} strokeWidth={0.5 * u} />
      <circle cx={area.x + area.w * 0.64} cy={area.y + area.h * 0.3} r={16 * u} fill="none" stroke={ink(pal, 0.18)} strokeWidth={0.25 * u} />
      {out}
      {[[0.3, 0.2, 22], [0.8, 0.45, 26], [0.2, 0.46, 15]].map(([cx, cy, w], i) => (
        <g key={i} transform={`translate(${f(area.x + area.w * (cx + between(rng, -0.05, 0.05)))} ${f(area.y + area.h * cy)}) scale(${((w * u) / 100).toFixed(3)})`}>
          <path d={cloud} fill={pal.base} fillOpacity={0.85} stroke={gold} strokeWidth={(0.4 * u * 100) / (w * u)} strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

const theme = { category: SEASONAL, group: "Chinese New Year", dense: true };
const defs: BackgroundDef[] = [
  { id: "lunar-lanterns", name: "Red lanterns", hint: "Hanging lanterns", render: lanterns, ...theme },
  { id: "lunar-blossom", name: "Plum blossom", hint: "Flowering branch", render: blossom, ...theme },
  { id: "lunar-clouds", name: "Lucky clouds", hint: "Clouds, waves and sun", render: clouds, ...theme },
];
export default defs;
