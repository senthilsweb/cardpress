import { Toaster as Sonner, type ToasterProps } from "sonner";

/** The app's toasts (shadcn's Sonner), coloured from the same tokens as the rest of the studio. */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      className="toaster group"
      style={{
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)",
        "--success-bg": "var(--popover)",
        "--success-text": "var(--popover-foreground)",
        "--success-border": "var(--brand)",
      } as React.CSSProperties}
      {...props}
    />
  );
}
