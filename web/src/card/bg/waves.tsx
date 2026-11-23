import type { BackgroundDef, BgCtx } from "../bgkit";
import { ink } from "../bgkit";

// Drop-in background: copy this file, change id/name/hint and the render body. Files starting with "_" are ignored.
function render({ area, u, pal, rng }: BgCtx) {
  const rows = 9;
  return (
    <g>
      {Array.from({ length: rows }, (_, i) => {
        const y = area.y + (area.h * (i + 1)) / (rows + 1);
        const amp = (1 + rng() * 2) * u;
        const d = `M${area.x} ${y} Q${area.x + area.w * 0.25} ${y - amp} ${area.x + area.w * 0.5} ${y} T${area.x + area.w} ${y}`;
        return <path key={i} d={d} fill="none" stroke={i === 3 ? pal.accent : ink(pal, 0.2)} strokeWidth={0.25 * u} />;
      })}
    </g>
  );
}

const def: BackgroundDef = { id: "waves", name: "Waves", hint: "Soft, flowing look", render };
export default def;
