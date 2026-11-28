import type { OrnamentDef } from "../ornamentkit";

const def: OrnamentDef = {
  id: "heart",
  name: "Heart flourish",
  occasions: ["Thanksgiving"],
  render: ({ colour }) => (
    <g fill="none" stroke={colour} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 22 C45 6 82 6 116 15" strokeWidth={3.2} />
      <path d="M262 22 C225 6 188 6 154 15" strokeWidth={3.2} />
      <path d="M135 27 C120 17 119 6 127 4 C131 3 134 6 135 10 C136 6 139 3 143 4 C151 6 150 17 135 27 Z" strokeWidth={2.6} />
    </g>
  ),
};
export default def;
