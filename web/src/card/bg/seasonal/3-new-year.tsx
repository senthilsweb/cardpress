import type { ReactNode } from "react";
import type { BackgroundDef, BgCtx } from "../../bgkit";
import { ink } from "../../bgkit";
import { between, pick } from "@/lib/rng";
import { f, SEASONAL, tones } from "./_kit";

const PARTY = ["#e0a91b", "#e0457b", "#2b9de0", "#17a673", "#8b5cf6", "#f26430"];

function burst(c: BgCtx, x: number, y: number, r: number, colour: string, key: string): ReactNode {
  const { u, rng } = c;
  const n = 18 + Math.floor(rng() * 10);
  return (
    <g key={key} stroke={colour} fill={colour} strokeLinecap="round">
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + rng() * 0.12;
        const from = r * between(rng, 0.25, 0.45), to = r * between(rng, 0.75, 1);
        const cos = Math.cos(a), sin = Math.sin(a);
        return (
          <g key={i}>
            <line x1={x + cos * from} y1={y + sin * from} x2={x + cos * to} y2={y + sin * to} strokeWidth={0.35 * u} />
            <circle cx={x + cos * (to + 1.6 * u)} cy={y + sin * (to + 1.6 * u)} r={0.5 * u} stroke="none" />
          </g>
        );
      })}
      <circle cx={x} cy={y} r={r * 0.09} stroke="none" />
    </g>
  );
}

function stars(c: BgCtx, n: number, colour: string) {
  const { area, u, rng } = c;
  return Array.from({ length: n }, (_, i) => (
    <circle key={`s${i}`} cx={area.x + rng() * area.w} cy={area.y + rng() * area.h} r={between(rng, 0.12, 0.45) * u} fill={colour} opacity={between(rng, 0.25, 0.75)} />
  ));
}

function fireworks(c: BgCtx) {
  const { area, u, pal, rng } = c;
  const col = tones(pal, PARTY);
  const spots = [[0.62, 0.34, 25], [0.26, 0.2, 14], [0.86, 0.7, 17], [0.32, 0.68, 19], [0.9, 0.14, 10]];
  const shift = Math.floor(rng() * col.length);
  return (
    <g>
      {stars(c, 60, col[0])}
      {spots.map(([sx, sy, r], i) => {
        const x = area.x + area.w * (sx + between(rng, -0.06, 0.06)), y = area.y + area.h * (sy + between(rng, -0.06, 0.06));
        const colour = col[(i + shift) % col.length];
        return (
          <g key={i}>
            <path d={`M${f(x - 5 * u)} ${f(area.y + area.h)} Q${f(x - 4 * u)} ${f((y + area.y + area.h) / 2)} ${f(x)} ${f(y + r * u * 0.3)}`} fill="none" stroke={colour} strokeOpacity={0.35} strokeWidth={0.25 * u} strokeDasharray={`${0.6 * u} ${1.1 * u}`} />
            {burst(c, x, y, r * u, colour, "b")}
          </g>
        );
      })}
    </g>
  );
}

function confetti(c: BgCtx) {
  const { area, u, pal, rng } = c;
  const col = tones(pal, PARTY);
  return (
    <g>
      {Array.from({ length: 7 }, (_, i) => {
        const x = area.x + area.w * ((i + 0.5) / 7);
        const len = area.h * between(rng, 0.35, 0.75);
        const s = 3.2 * u;
        let d = `M${f(x)} ${f(area.y)}`;
        for (let k = 0; k * 6 * u < len; k++) d += ` q${f(k % 2 ? -s : s)} ${f(3 * u)} 0 ${f(6 * u)}`;
        return <path key={`r${i}`} d={d} fill="none" stroke={col[i % col.length]} strokeWidth={0.7 * u} strokeLinecap="round" />;
      })}
      {Array.from({ length: 130 }, (_, i) => {
        const x = area.x + rng() * area.w, y = area.y + rng() * area.h;
        const colour = pick(rng, col), r = between(rng, -90, 90);
        if (i % 4 === 0) return <circle key={i} cx={x} cy={y} r={between(rng, 0.45, 0.95) * u} fill={colour} />;
        if (i % 9 === 0) return <path key={i} transform={`translate(${f(x)} ${f(y)}) rotate(${f(r)})`} d={`M0,${f(-1.5 * u)} L${f(1.4 * u)},${f(1.1 * u)} L${f(-1.4 * u)},${f(1.1 * u)} Z`} fill={colour} />;
        return <rect key={i} x={x} y={y} width={between(rng, 1.4, 3) * u} height={between(rng, 0.6, 1.1) * u} rx={0.2 * u} fill={colour} transform={`rotate(${f(r)} ${f(x)} ${f(y)})`} />;
      })}
    </g>
  );
}

function clock(c: BgCtx) {
  const { area, u, pal, rng } = c;
  const [gold, pink, blue] = tones(pal, PARTY);
  const cx = area.x + area.w * 0.56, cy = area.y + area.h * 0.52;
  const R = Math.min(area.w, area.h) * 0.34;
  const hand = (deg: number, len: number, w: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return <line x1={cx} y1={cy} x2={cx + Math.cos(a) * len} y2={cy + Math.sin(a) * len} stroke={gold} strokeWidth={w} strokeLinecap="round" />;
  };
  return (
    <g>
      {stars(c, 80, gold)}
      {burst(c, area.x + area.w * between(rng, 0.14, 0.24), area.y + area.h * 0.2, 11 * u, pink, "a")}
      {burst(c, area.x + area.w * between(rng, 0.84, 0.92), area.y + area.h * 0.8, 13 * u, blue, "b")}
      <circle cx={cx} cy={cy} r={R * 1.18} fill="none" stroke={gold} strokeOpacity={0.35} strokeWidth={0.3 * u} strokeDasharray={`${0.4 * u} ${1.6 * u}`} />
      <circle cx={cx} cy={cy} r={R} fill={pal.base} stroke={gold} strokeWidth={0.9 * u} />
      <circle cx={cx} cy={cy} r={R * 0.9} fill="none" stroke={ink(pal, 0.2)} strokeWidth={0.2 * u} />
      {Array.from({ length: 60 }, (_, i) => {
        const a = (i / 60) * Math.PI * 2, hour = i % 5 === 0;
        const r0 = R * (hour ? 0.74 : 0.83);
        return <line key={i} x1={cx + Math.cos(a) * r0} y1={cy + Math.sin(a) * r0} x2={cx + Math.cos(a) * R * 0.86} y2={cy + Math.sin(a) * R * 0.86} stroke={hour ? gold : ink(pal, 0.45)} strokeWidth={(hour ? 0.6 : 0.2) * u} strokeLinecap="round" />;
      })}
      {hand(-14, R * 0.5, 1.2 * u)}
      {hand(-3, R * 0.72, 0.7 * u)}
      <circle cx={cx} cy={cy} r={1.2 * u} fill={gold} />
    </g>
  );
}

const theme = { category: SEASONAL, group: "New Year", dense: true };
const defs: BackgroundDef[] = [
  { id: "newyear-fireworks", name: "Fireworks", hint: "Bursts in the night sky", render: fireworks, ...theme },
  { id: "newyear-confetti", name: "Confetti", hint: "Streamers and confetti", render: confetti, ...theme },
  { id: "newyear-clock", name: "Midnight clock", hint: "Counting down to twelve", render: clock, ...theme },
];
export default defs;
