import type { OrnamentDef } from "../ornamentkit";

/** Five round petals around x,y, with an open centre. */
function Flower({ x, y, r, colour }: { x: number; y: number; r: number; colour: string }) {
  return (
    <g fill={colour}>
      {[0, 72, 144, 216, 288].map((turn) => (
        <circle key={turn} cx={x} cy={y - r * 0.62} r={r * 0.44} transform={`rotate(${turn} ${x} ${y})`} />
      ))}
    </g>
  );
}

const def: OrnamentDef = {
  id: "blossom",
  name: "Plum blossom",
  occasions: ["Chinese New Year"],
  render: ({ colour }) => (
    <g>
      <path d="M26 22 C62 24 86 12 119 16 M70 19 C76 14 80 10 86 9 M244 22 C208 24 184 12 151 16 M200 19 C194 14 190 10 184 9" fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" />
      <Flower x={135} y={15} r={14} colour={colour} />
      <Flower x={91} y={8} r={7} colour={colour} />
      <Flower x={179} y={8} r={7} colour={colour} />
      {[[50, 17], [220, 17], [110, 21], [160, 21]].map(([x, y]) => <circle key={x} cx={x} cy={y} r={2.6} fill={colour} />)}
    </g>
  ),
};
export default def;
