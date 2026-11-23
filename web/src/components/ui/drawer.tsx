import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A right-hand drawer for tool settings. It slides over the edge of the studio without dimming or blocking it, so
 * the work area stays usable. The header matches the app header, the body scrolls, and `footer` is frozen at the bottom
 * for the actions. Esc or the close button calls `onClose`.
 */
export function Drawer({ open, onClose, title, subheader, footer, children, className }: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** A fixed strip under the header, e.g. tabs. */
  subheader?: ReactNode;
  /** Frozen at the bottom. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
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
      inert={!open}
      onKeyDown={(e) => { if (e.key === "Escape" && !e.defaultPrevented) { e.stopPropagation(); onClose(); } }}
      className={cn(
        "fixed inset-y-0 right-0 z-40 flex w-full max-w-[440px] flex-col border-l border-border bg-background shadow-[-8px_0_30px_rgba(0,0,0,0.10)] transition-transform duration-200 ease-out motion-reduce:transition-none",
        open ? "translate-x-0" : "translate-x-full",
        className,
      )}
    >
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
