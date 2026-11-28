import type { OrnamentDef } from "../ornamentkit";

const def: OrnamentDef = {
  id: "divider",
  name: "Plain divider",
  render: ({ colour }) => (
    <g stroke={colour} strokeWidth={2.4} strokeLinecap="round">
      <path d="M30 15 H112 M158 15 H240" fill="none" />
      <path d="M135 7 L143 15 L135 23 L127 15 Z" fill={colour} />
    </g>
  ),
};
export default def;
