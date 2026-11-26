import { useId, useRef, type ReactNode } from "react";
import { ChevronDown, ImagePlus, Trash2 } from "lucide-react";
import { sectionOpen, useLayout } from "@/lib/layout";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { fileToDataUrl } from "@/lib/image";
import { cn } from "@/lib/utils";

/**
 * A titled group in the sidebar. Click the title to fold it. The fold state is saved by `id`
 * (the title when no id is given), so pass an id when the title can change.
 */
export function Section({ title, id, children, action, folded = false }: { title: string; id?: string; children: ReactNode; action?: ReactNode; /** Starts folded. */ folded?: boolean }) {
  const key = id ?? title;
  const { isCollapsed, toggle } = useLayout();
  const open = sectionOpen(isCollapsed(key), folded);
  const bodyId = useId();
  return (
    <section className="border-b border-border px-4 last:border-b-0">
      <div className="flex items-center justify-between gap-2 py-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => toggle(key)}
          className="-ml-1 flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform motion-reduce:transition-none", !open && "-rotate-90")} />
          <h3 className="eyebrow">{title}</h3>
        </button>
        {action}
      </div>
      {/* grid-rows 1fr -> 0fr animates the height; inert keeps folded fields out of the tab order */}
      <div id={bodyId} inert={!open} className={cn("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="-mx-1 min-h-0 overflow-hidden px-1">
          <div className="space-y-3 pb-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TextField(props: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; placeholder?: string }) {
  return (
    <Field label={props.label} hint={props.hint} htmlFor={props.id}>
      <Input id={props.id} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
    </Field>
  );
}

export function AreaField(props: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; rows?: number }) {
  return (
    <Field label={props.label} hint={props.hint} htmlFor={props.id}>
      <Textarea id={props.id} rows={props.rows ?? 2} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </Field>
  );
}

export function SliderField(props: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{props.label}</Label>
        <span className="font-mono text-[11px] text-muted-foreground">{props.format ? props.format(props.value) : props.value}</span>
      </div>
      <Slider value={[props.value]} min={props.min} max={props.max} step={props.step} onValueChange={(v) => props.onChange(v[0])} />
    </div>
  );
}

export function SwitchField({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={id} className="text-sm text-foreground">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <div className="flex items-center gap-1.5 rounded-md border border-input bg-card p-1 shadow-sm">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0" aria-label={label} />
        <input
          key={value}
          defaultValue={value}
          aria-label={`${label} hex`}
          onChange={(e) => /^#[0-9a-fA-F]{6}$/.test(e.target.value) && onChange(e.target.value.toLowerCase())}
          className="w-full min-w-0 bg-transparent font-mono text-[11px] outline-none"
        />
      </div>
    </div>
  );
}

/** Upload one image (or several when `multiple`). Shows thumbnails with remove buttons. */
export function ImageField(props: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (v: string[]) => void;
  multiple?: boolean;
  max?: number;
  maxPx?: number;
  keepPng?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, props.max ?? 12);
    const urls = await Promise.all(list.map((f) => fileToDataUrl(f, props.maxPx ?? 1600, props.keepPng).catch(() => null)));
    const ok = urls.filter(Boolean) as string[];
    props.onChange(props.multiple ? [...props.values, ...ok].slice(0, props.max ?? 12) : ok.slice(0, 1));
    if (ref.current) ref.current.value = "";
  };
  return (
    <Field label={props.label} hint={props.hint}>
      <div
        className="flex flex-wrap gap-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}
      >
        {props.values.map((v, i) => (
          <div key={i} className="group relative h-14 w-14 overflow-hidden rounded-md border border-border checker">
            <img src={v} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              className="absolute inset-0 hidden cursor-pointer items-center justify-center bg-black/55 text-white group-hover:flex"
              onClick={() => props.onChange(props.values.filter((_, j) => j !== i))}
              aria-label="Remove image"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {(props.multiple || props.values.length === 0) && (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className={cn("flex h-14 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-input px-3 text-xs text-muted-foreground hover:border-brand hover:text-brand", props.values.length ? "w-14 px-0" : "")}
          >
            <ImagePlus className="h-4 w-4" />
            {!props.values.length && <span>Add or drop</span>}
          </button>
        )}
        {!props.multiple && props.values.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => ref.current?.click()}>Replace</Button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" multiple={props.multiple} className="hidden" onChange={(e) => add(e.target.files)} />
    </Field>
  );
}
