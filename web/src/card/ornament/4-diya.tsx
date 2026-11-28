import type { OrnamentDef } from "../ornamentkit";

const def: OrnamentDef = {
  id: "diya",
  name: "Diya",
  occasions: ["Diwali"],
  render: ({ colour }) => (
    <g fill={colour}>
      {/* the flame, the bowl and its foot */}
      <path d="M135 1 C141 7 143 12 135 16 C127 12 129 7 135 1 Z" />
      <path d="M113 17 H157 C153 25 145 27 135 27 C125 27 117 25 113 17 Z" />
      <path d="M126 29 H144" fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" />
      <path d="M40 21 H100 M230 21 H170" fill="none" stroke={colour} strokeWidth={2.2} strokeLinecap="round" />
      {[28, 14, 242, 256].map((x, i) => <circle key={x} cx={x} cy={21} r={i % 2 ? 1.8 : 2.8} />)}
    </g>
  ),
};
export default def;
