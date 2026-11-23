import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A right-hand drawer for tool settings. It slides over the edge of the studio without dimming or blocking it, so
 * the work area stays usable. The header matches the app header, the body scrolls, and `footer` is frozen at the bottom
 * for the actions. Esc or the close button calls `onClose`.
 */
const DEFAULT_WIDTH = 440;
const MIN_WIDTH = 360;
const maxWidth = () => Math.max(MIN_WIDTH, Math.min(960, (typeof window === "undefined" ? 960 : window.innerWidth) - 80));
const clamp = (w: number) => Math.round(Math.min(maxWidth(), Math.max(MIN_WIDTH, w)));

/** The drawer's width, which the person can change; it is remembered per `key`. */
function useDrawerWidth(key?: string) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    if (!key) return;
    try { const v = Number(localStorage.getItem(`cardpress.drawer.${key}`)); if (v > 0) setWidth(clamp(v)); } catch { /* storage may be blocked */ }
  }, [key]);
  const save = useCallback((w: number) => { if (key) try { localStorage.setItem(`cardpress.drawer.${key}`, String(w)); } catch { /* ignore */ } }, [key]);
  return [width, setWidth, save] as const;
}

export function Drawer({ open, onClose, title, subheader, footer, children, className, resizeKey }: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** A fixed strip under the header, e.g. tabs. */
  subheader?: ReactNode;
  /** Frozen at the bottom. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Adds a grip on the left edge to drag the drawer wider or narrower; the width is remembered under this name. */
  resizeKey?: string;
}) {
  const [width, setWidth, saveWidth] = useDrawerWidth(resizeKey);
  const drag = useRef<{ startX: number; startW: number } | null>(null);
  const onDown = (e: PointerEvent<HTMLDivElement>) => { e.preventDefault(); document.body.style.userSelect = "none"; drag.current = { startX: e.clientX, startW: width }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e: PointerEvent<HTMLDivElement>) => { if (drag.current) setWidth(clamp(drag.current.startW + (drag.current.startX - e.clientX))); };
  const onUp = () => { document.body.style.userSelect = ""; if (drag.current) { drag.current = null; saveWidth(width); } };
  const onGripKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 80 : 24;
    const next = e.key === "ArrowLeft" ? width + step : e.key === "ArrowRight" ? width - step : e.key === "Home" ? DEFAULT_WIDTH : null;
    if (next === null) return;
    e.preventDefault(); e.stopPropagation();
    const w = clamp(next); setWidth(w); saveWidth(w);
  };
  const titleId = useId();
  const root = useRef<HTMLElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  // move focus in when opening, and back to where it was when closing
  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      root.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (returnTo.current) {
      returnTo.current.focus();
      returnTo.current = null;
    }
  }, [open]);

  return (
    <aside
      ref={root}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      style={resizeKey ? { width: Math.min(width, maxWidth()) } : undefined}
      inert={!open}
      onKeyDown={(e) => { if (e.key === "Escape" && !e.defaultPrevented) { e.stopPropagation(); onClose(); } }}
      className={cn(
        "fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border bg-background shadow-[-8px_0_30px_rgba(0,0,0,0.10)] transition-transform duration-200 ease-out motion-reduce:transition-none",
        open ? "translate-x-0" : "translate-x-full",
        !resizeKey && "max-w-[440px]",
        className,
      )}
    >
      {resizeKey && open && (
        <div
          role="separator" aria-orientation="vertical" aria-label={`Resize ${title}`} aria-valuenow={width} aria-valuemin={MIN_WIDTH} aria-valuemax={maxWidth()} tabIndex={0}
          title="Drag to resize · double-click to reset"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onDoubleClick={() => { setWidth(DEFAULT_WIDTH); saveWidth(DEFAULT_WIDTH); }}
          onKeyDown={onGripKey}
          className="group absolute -left-3 top-1/2 z-10 hidden h-10 w-6 -translate-y-1/2 cursor-col-resize touch-none items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
        <h2 id={titleId} className="flex-1 truncate font-mono text-[12.5px] font-bold uppercase tracking-[0.14em]">{title}</h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={`Close ${title}`} data-autofocus><X /></Button>
      </header>
      {subheader && <div className="shrink-0 border-b border-border px-4 py-2.5">{subheader}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && <footer className="shrink-0 border-t border-border bg-background px-4 py-3">{footer}</footer>}
    </aside>
  );
}
