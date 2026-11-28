import type { OrnamentDef } from "../ornamentkit";

/** A four-pointed star around x,y. */
const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z`;
const STARS: [number, number, number][] = [
  [135, 15, 14], [103, 10, 8], [167, 20, 8], [74, 19, 5.5], [196, 11, 5.5], [48, 13, 4], [222, 18, 4],
];

const def: OrnamentDef = {
  id: "sparkles",
  name: "Sparkles",
  occasions: ["New Year", "Diwali"],
  render: ({ colour }) => <g fill={colour}>{STARS.map(([x, y, r]) => <path key={x} d={star(x, y, r)} />)}</g>,
};
export default def;
