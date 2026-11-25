import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { GripVertical } from "lucide-react";
import { clampSidebar, SIDEBAR_WIDTH } from "@/lib/layout";

/**
 * The grip between the left column and the canvas: drag it, or focus it and use the arrow keys, to change the column's
 * width. Double-click puts it back. `onResize` follows the pointer; `onDone` is the width to remember.
 */
export function SideGrip({ width, onResize, onDone }: { width: number; onResize: (w: number) => void; onDone: (w: number) => void }) {
  const drag = useRef<{ startX: number; startW: number; width: number } | null>(null);
  const onDown = (e: PointerEvent<HTMLDivElement>) => { e.preventDefault(); document.body.style.userSelect = "none"; drag.current = { startX: e.clientX, startW: width, width }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.width = clampSidebar(d.startW + (e.clientX - d.startX), window.innerWidth);
    onResize(d.width);
  };
  const onUp = () => { document.body.style.userSelect = ""; const d = drag.current; drag.current = null; if (d) onDone(d.width); };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 80 : 24;
    const next = e.key === "ArrowRight" ? width + step : e.key === "ArrowLeft" ? width - step : e.key === "Home" ? SIDEBAR_WIDTH : null;
    if (next === null) return;
    e.preventDefault();
    onDone(clampSidebar(next, window.innerWidth));
  };
  return (
    <div className="relative z-30 hidden w-0 lg:block">
      <div role="separator" aria-orientation="vertical" aria-label="Resize the left column" aria-valuenow={width} tabIndex={0} title="Drag to resize · double-click to reset"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={() => onDone(SIDEBAR_WIDTH)} onKeyDown={onKey}
        className="absolute -left-3 top-1/2 flex h-10 w-6 -translate-y-1/2 cursor-col-resize touch-none items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <GripVertical className="h-4 w-4" />
      </div>
    </div>
  );
}
