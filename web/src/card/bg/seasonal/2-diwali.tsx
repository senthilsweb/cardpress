import type { ReactNode } from "react";
import type { BackgroundDef, BgCtx } from "../../bgkit";
import { between, pick } from "@/lib/rng";
import { f, SEASONAL, tone, tones } from "./_kit";

const FESTIVE = ["#f59e0b", "#e11d74", "#7c3aed", "#0f9f8f", "#ef5b2a", "#facc15"];

function glow(id: string, colour: string) {
  return (
    <radialGradient id={id}>
      <stop offset="0" stopColor={colour} stopOpacity="0.55" />
      <stop offset="1" stopColor={colour} stopOpacity="0" />
    </radialGradient>
  );
}

/** An oil lamp, about 100 units wide, rim at y=0. */
function Diya({ x, y, s, body, rim, uid }: { x: number; y: number; s: number; body: string; rim: string; uid: string }) {
  return (
    <g transform={`translate(${f(x)} ${f(y)}) scale(${s.toFixed(3)})`}>
      <circle cx={0} cy={-34} r={62} fill={`url(#glow-${uid})`} />
      <path d="M0,-66 C16,-44 19,-28 10,-17 C4,-10 -6,-10 -11,-17 C-19,-29 -12,-45 0,-66 Z" fill="#ff9a1f" />
      <path d="M0,-44 C8,-32 9,-24 4,-18 C1,-15 -3,-15 -6,-19 C-9,-26 -6,-33 0,-44 Z" fill="#ffe27a" />
      <path d="M-50,0 C-46,26 -22,38 0,38 C22,38 46,26 50,0 C30,8 -30,8 -50,0 Z" fill={body} />
      <path d="M-50,0 C-30,-12 30,-12 50,0 C30,8 -30,8 -50,0 Z" fill={rim} />
      <path d="M-34,17 Q-25,26 -17,19 Q-8,30 0,22 Q8,30 17,19 Q25,26 34,17" fill="none" stroke="#ffe7ae" strokeWidth={2.6} strokeLinecap="round" />
    </g>
  );
}

function diyas(c: BgCtx) {
  const { area, u, pal, rng, uid } = c;
  const [orange, pink, , , red, yellow] = tones(pal, FESTIVE);
  const rows = [
    { y: 0.42, n: 3, s: 12 },
    { y: 0.68, n: 4, s: 15 },
    { y: 0.9, n: 3, s: 19 },
  ];
  return (
    <g>
      <defs>{glow(`glow-${uid}`, tone(pal, "#ffb627"))}</defs>
      {Array.from({ length: 70 }, (_, i) => (
        <circle key={`s${i}`} cx={area.x + rng() * area.w} cy={area.y + rng() * area.h * 0.75} r={between(rng, 0.15, 0.55) * u} fill={yellow} opacity={between(rng, 0.25, 0.8)} />
      ))}
      {rows.flatMap((r, ri) =>
        Array.from({ length: r.n }, (_, i) => {
          const x = area.x + area.w * ((i + 0.5 + between(rng, -0.12, 0.12)) / r.n);
          return <Diya key={`${ri}-${i}`} x={x} y={area.y + area.h * r.y + between(rng, -2, 2) * u} s={(r.s * u) / 100} body={pick(rng, [red, pink, orange])} rim={yellow} uid={uid} />;
        })
      )}
    </g>
  );
}

function rangoli(c: BgCtx) {
  const { area, u, pal, rng, uid } = c;
  const col = tones(pal, FESTIVE);
  const cx = area.x + area.w * 0.56, cy = area.y + area.h * 0.5;
  const R = Math.min(area.w, area.h) * 0.52;
  const shift = Math.floor(rng() * col.length);
  const out: ReactNode[] = [];
  const rings = [
    { r: 1, n: 24, w: 0.1 }, { r: 0.8, n: 16, w: 0.15 }, { r: 0.6, n: 12, w: 0.17 }, { r: 0.4, n: 8, w: 0.18 }, { r: 0.22, n: 8, w: 0.1 },
  ];
  rings.forEach((g, k) => {
    const colour = col[(k + shift) % col.length];
    const L = g.r * R, W = g.w * R;
    for (let i = 0; i < g.n; i++) {
      const a = (360 * i) / g.n + (k % 2 ? 180 / g.n : 0);
      out.push(
        <g key={`${k}-${i}`} transform={`translate(${f(cx)} ${f(cy)}) rotate(${f(a)})`}>
          <path d={`M0,0 C${f(W)},${f(-L * 0.45)} ${f(W * 0.7)},${f(-L * 0.85)} 0,${f(-L)} C${f(-W * 0.7)},${f(-L * 0.85)} ${f(-W)},${f(-L * 0.45)} 0,0 Z`} fill={colour} fillOpacity={k === 0 ? 0.35 : 0.9} stroke={pal.base} strokeWidth={0.35 * u} />
          <circle cx={0} cy={-L * 0.78} r={0.55 * u} fill={pal.base} />
        </g>
      );
    }
    out.push(<circle key={`c${k}`} cx={cx} cy={cy} r={L * 1.07} fill="none" stroke={colour} strokeOpacity={0.5} strokeWidth={0.5 * u} strokeDasharray={`0 ${1.9 * u}`} strokeLinecap="round" />);
  });
  return (
    <g>
      <defs>{glow(`glow-${uid}`, col[0])}</defs>
      <circle cx={cx} cy={cy} r={R * 1.45} fill={`url(#glow-${uid})`} />
      {out.reverse()}
      <circle cx={cx} cy={cy} r={R * 0.07} fill={col[5]} stroke={pal.base} strokeWidth={0.4 * u} />
    </g>
  );
}

function garlands(c: BgCtx) {
  const { area, u, pal, rng, uid } = c;
  const [orange, pink, , green, , yellow] = tones(pal, FESTIVE);
  const n = 6;
  const flower = (x: number, y: number, r: number, colour: string, key: string) => (
    <g key={key} transform={`translate(${f(x)} ${f(y)})`}>
      {Array.from({ length: 10 }, (_, i) => <circle key={i} cx={Math.cos((i * Math.PI) / 5) * r * 0.65} cy={Math.sin((i * Math.PI) / 5) * r * 0.65} r={r * 0.42} fill={colour} />)}
      <circle r={r * 0.55} fill={colour} stroke={pal.base} strokeOpacity={0.35} strokeWidth={0.25 * u} />
    </g>
  );
  return (
    <g>
      <defs>{glow(`glow-${uid}`, yellow)}</defs>
      {Array.from({ length: n }, (_, i) => {
        const x = area.x + area.w * ((i + 0.5) / n) + between(rng, -1, 1) * u;
        const len = area.h * between(rng, 0.35, 0.82);
        const r = between(rng, 2, 2.7) * u;
        const beads: ReactNode[] = [];
        let k = 0;
        for (let y = area.y + r; y < area.y + len; y += r * 1.75, k++) beads.push(flower(x, y, r, k % 4 === 3 ? pink : k % 2 ? yellow : orange, `f${k}`));
        const end = area.y + len + r * 1.2;
        return (
          <g key={i}>
            <line x1={x} y1={area.y} x2={x} y2={end} stroke={green} strokeWidth={0.4 * u} />
            {beads}
            <path d={`M${f(x)},${f(end)} q${f(-3.4 * u)},${f(2.4 * u)} 0,${f(6.4 * u)} q${f(3.4 * u)},${f(-4 * u)} 0,${f(-6.4 * u)} Z`} fill={green} />
          </g>
        );
      })}
      {Array.from({ length: 5 }, (_, i) => (
        <Diya key={i} x={area.x + area.w * ((i + 0.5) / 5)} y={area.y + area.h * 0.93} s={(10 * u) / 100} body={pink} rim={yellow} uid={uid} />
      ))}
    </g>
  );
}

const theme = { category: SEASONAL, group: "Diwali", dense: true };
const defs: BackgroundDef[] = [
  { id: "diwali-diyas", name: "Diyas", hint: "Rows of lit lamps", render: diyas, ...theme },
  { id: "diwali-rangoli", name: "Rangoli", hint: "Colourful floor pattern", render: rangoli, ...theme },
  { id: "diwali-garlands", name: "Marigold garlands", hint: "Hanging flowers and lamps", render: garlands, ...theme },
];
export default defs;
