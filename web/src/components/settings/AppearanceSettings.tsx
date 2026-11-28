import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Pane } from "@/components/ui/pane";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { attempt, FormSection, SaveBar } from "./form";
import { useUnsaved } from "./guard";
import { resolveMode, saveAppearance, THEMES, useAppearance, type Appearance, type Mode, type ThemeId } from "@/lib/appearance";
import { cn } from "@/lib/utils";

const MODES: { id: Mode; name: string; icon: React.ReactNode }[] = [
  { id: "light", name: "Light", icon: <Sun /> }, { id: "dark", name: "Dark", icon: <Moon /> }, { id: "system", name: "System", icon: <Monitor /> },
];

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

/** The person's own colours for the application: a theme, and light, dark or the system's. Applied on Save. */
export function AppearanceSettings() {
  const saved = useAppearance();
  const [picked, setPicked] = useState<Partial<Appearance>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = picked.theme ?? saved.theme, mode = picked.mode ?? saved.mode;
  const dirty = theme !== saved.theme || mode !== saved.mode;
  useUnsaved(dirty);
  const systemDark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const shown = resolveMode(mode, systemDark); // the pictures show the choice before it is saved

  const save = async () => {
    setBusy(true);
    const failed = await attempt(() => saveAppearance({ theme, mode }), "Appearance saved", "Appearance not saved");
    if (!failed) setPicked({});
    setError(failed ?? null); setBusy(false);
  };

  return (
    <Pane footer={<SaveBar dirty={dirty} busy={busy} problem={error} onSave={() => void save()} onCancel={() => { setPicked({}); setError(null); }} />}>
      <div className="space-y-4">
        <FormSection title="Theme" about="Card colours come from the brand, not from the theme.">
          <RadioGroup aria-label="Theme" value={theme} onValueChange={(v) => setPicked((p) => ({ ...p, theme: v as ThemeId }))} className="grid-cols-2 gap-3 sm:grid-cols-4">
            {THEMES.map((t) => (
              <label key={t.id} className={cn("cursor-pointer rounded-lg border p-2", theme === t.id ? "border-brand ring-1 ring-brand" : "border-border hover:border-brand/50")}>
                <Preview theme={t.id} mode={shown} />
                <span className="mt-2 flex items-center gap-1.5 text-[13px] font-medium"><RadioGroupItem value={t.id} aria-label={t.name} />{t.name}</span>
                <span className="block text-[11px] text-muted-foreground">{t.hint}</span>
              </label>
            ))}
          </RadioGroup>
        </FormSection>
        <FormSection title="Light or dark">
          <ToggleGroup type="single" aria-label="Light or dark" className="w-fit rounded-md border border-border bg-card p-0.5" value={mode} onValueChange={(v) => { if (v) setPicked((p) => ({ ...p, mode: v as Mode })); }}>
            {MODES.map((m) => <ToggleGroupItem key={m.id} value={m.id}>{m.icon}{m.name}</ToggleGroupItem>)}
          </ToggleGroup>
        </FormSection>
      </div>
    </Pane>
  );
}
