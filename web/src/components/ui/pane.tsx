import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One page inside a panel dialog (use it with `fill`): tabs that stay on top, a body that scrolls, a footer that stays. */
export function Pane({ tabs, footer, children, className }: { tabs?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {tabs && <div className="shrink-0 px-5 pt-1 max-sm:px-4">{tabs}</div>}
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4 max-sm:px-4", className)}>
        <div className="max-w-2xl">{children}</div>
      </div>
      {footer && <div className="shrink-0 border-t border-border px-5 py-3 max-sm:px-4"><div className="max-w-2xl">{footer}</div></div>}
    </div>
  );
}
