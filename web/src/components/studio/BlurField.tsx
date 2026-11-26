import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { registerFlusher } from "@/lib/pendingEdits";

/**
 * A field that is saved when it is left (or on Enter, or before anything acts on the item), not on every key. A refused
 * value goes back to what is stored.
 */
export function BlurField({ id, value, onSave, lines, rows, maxLength, disabled, placeholder, onType }: {
  id: string; value: string;
  onSave: (v: string) => Promise<void>;
  /** More than one line. */
  lines?: boolean; rows?: number; maxLength?: number; disabled?: boolean; placeholder?: string;
  /** What is in the box now, for a counter. */
  onType?: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const now = useRef({ text: value, value, onSave });
  now.current.value = value;
  now.current.onSave = onSave;
  const type = (v: string) => { now.current.text = v; setText(v); onType?.(v); };
  useEffect(() => { type(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    const { text: v, value: stored, onSave: save } = now.current;
    if (v.trim() === stored) return;
    save(v.trim()).catch(() => type(now.current.value));
  };
  // leaving the form (another item, another tab) saves what was typed
  useEffect(() => { const stop = registerFlusher(commit); return () => { stop(); commit(); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const common = { id, value: text, maxLength, disabled, placeholder, onBlur: commit };
  return lines
    ? <Textarea {...common} rows={rows ?? 2} onChange={(e) => type(e.target.value)} />
    : <Input {...common} onChange={(e) => type(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} />;
}
