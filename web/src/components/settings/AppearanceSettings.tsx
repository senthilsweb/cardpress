import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { setMode, setTheme, THEMES, useAppearance, type Mode } from "@/lib/appearance";
import { cn } from "@/lib/utils";

const MODES: { id: Mode; name: string; icon: React.ReactNode }[] = [
  { id: "light", name: "Light", icon: <Sun /> }, { id: "dark", name: "Dark", icon: <Moon /> }, { id: "system", name: "System", icon: <Monitor /> },
];
const noop = () => undefined;

/** A small picture of the application in a theme's own colours. */
function Preview({ theme, mode }: { theme: string; mode: "light" | "dark" }) {
  return (
    // the attributes give this box the theme's colours, whatever the page is shown in
    <span aria-hidden data-palette={theme} data-theme={mode} className="theme-preview block h-24 overflow-hidden rounded-md border" style={{ background: "var(--side-bg)", borderColor: "var(--line)" }}>
      <span className="block h-4 border-b" style={{ background: "var(--head-bg)", borderColor: "var(--head-line)" }}>
        <span className="ml-2 mt-1.5 block h-1.5 w-8 rounded-full" style={{ background: "var(--head-accent)" }} />
      </span>
      <span className="flex h-20">
        <span className="flex w-7 flex-col items-center gap-1.5 pt-2">
          {[0, 1, 2].map((i) => <span key={i} className="block h-2 w-4 rounded-sm" style={{ background: i === 0 ? "var(--side-fg)" : "var(--side-muted)", opacity: i === 0 ? 1 : 0.7 }} />)}
        </span>
        <span className="flex flex-1 flex-col gap-1.5 rounded-tl-md p-2" style={{ background: "var(--paper)" }}>
          <span className="block h-2 w-1/2 rounded-full" style={{ background: "var(--ink)" }} />
          <span className="block flex-1 rounded border" style={{ background: "var(--card-bg)", borderColor: "var(--line)" }}>
            <span className="m-1.5 block h-2.5 w-10 rounded-sm" style={{ background: "var(--brand)" }} />
          </span>
        </span>
      </span>
    </span>
  );
}

/** The person's own colours for the application: a theme, and light, dark or the system's. */
export function AppearanceSettings() {
  const { theme, mode, shown } = useAppearance();
  return (
    <Drawer open onClose={noop} title="Appearance">
      <div className="space-y-6 px-4 py-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Theme</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {THEMES.map((t) => (
              <button key={t.id} type="button" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}
                className={cn("cursor-pointer rounded-lg border p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", theme === t.id ? "border-brand ring-1 ring-brand" : "border-border hover:border-brand/50")}>
                <Preview theme={t.id} mode={shown} />
                <span className="mt-2 flex items-center justify-between text-[13px] font-medium">{t.name}{theme === t.id && <Check className="h-4 w-4 text-brand" />}</span>
                <span className="block text-[11px] text-muted-foreground">{t.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Light or dark</legend>
          <div className="inline-flex rounded-md border border-border bg-card p-0.5">
            {MODES.map((m) => (
              <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}
                className={cn("flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-[13px] font-medium [&_svg]:h-4 [&_svg]:w-4", mode === m.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {m.icon}{m.name}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-muted-foreground">Card colours come from the brand, not from the theme.</p>
      </div>
    </Drawer>
  );
}
