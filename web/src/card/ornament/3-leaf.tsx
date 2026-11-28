import type { OrnamentDef } from "../ornamentkit";

/** One leaf, from its stalk at 0,0 to its tip at 20,0. */
const LEAF = "M0 0 C5 -7 14 -7 20 0 C14 7 5 7 0 0 Z";
const LEAVES = [
  { x: 52, y: 16, turn: -32 }, { x: 62, y: 17, turn: 34 }, { x: 82, y: 14, turn: -36 },
  { x: 92, y: 14, turn: 30 }, { x: 112, y: 15, turn: -28 },
];

const def: OrnamentDef = {
  id: "leaf",
  name: "Leaf sprig",
  occasions: ["Thanksgiving"],
  render: ({ colour }) => (
    <g fill={colour}>
      {/* one half, and the same mirrored */}
      {["", "matrix(-1 0 0 1 270 0)"].map((side) => (
        <g key={side} transform={side || undefined}>
          <path d="M30 19 C60 17 92 13 126 15" fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" />
          {LEAVES.map((l) => <path key={l.x} d={LEAF} transform={`translate(${l.x} ${l.y}) rotate(${l.turn}) scale(.8)`} />)}
        </g>
      ))}
      <circle cx={135} cy={15} r={3.4} />
    </g>
  ),
};
export default def;
