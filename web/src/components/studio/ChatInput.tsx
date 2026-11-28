import { useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from "react";
import { FileText, Link2, Loader2, Paperclip, Send, Square, Type, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { asLink, attachmentName, fileProblem, FILE_TYPES, LONG_PASTE, MAX_SOURCES, MIN_TEXT, type Attachment } from "@/lib/compose";
import type { ChatSource } from "@/lib/chat";
import { cn } from "@/lib/utils";

let n = 0;
const key = () => `a${++n}`;

function Chip({ icon, name, onRemove }: { icon: "file" | "url" | "text"; name: string; onRemove?: () => void }) {
  const Icon = icon === "url" ? Link2 : icon === "text" ? Type : FileText;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-accent py-0.5 pl-1.5 pr-1 text-[11.5px]" title={name}>
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{name}</span>
      {onRemove && <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="cursor-pointer rounded p-0.5 hover:bg-background/60"><X className="h-3 w-3" /></button>}
    </span>
  );
}

export const SourceChip = ({ source, onRemove }: { source: ChatSource; onRemove?: () => void }) => (
  <Chip icon={source.kind === "url" ? "url" : source.kind === "text" ? "text" : "file"} name={`${source.name}${source.truncated ? " (cut short)" : ""}`} onRemove={onRemove} />
);

/**
 * The one box a person talks to the assistant through: words, with files, links and long text beside them. The send
 * button becomes a stop button while a reply is being written.
 */
export function ChatInput({ placeholder, replying, busy, waiting, onRemoveWaiting, onSend, onStop, disabled, ticks }: {
  placeholder: string;
  /** A reply is being written: the button stops it. */
  replying: boolean;
  /** Something else is under way (sources being read), so nothing can be sent yet. */
  busy: boolean;
  /** Sources already with the conversation that no message has taken along. */
  waiting: ChatSource[];
  onRemoveWaiting: (id: string) => void;
  /** Resolves true once the words and attachments were taken; the box is then cleared. */
  onSend: (text: string, attachments: Attachment[]) => Promise<boolean>;
  onStop: () => void;
  /** Nothing can be sent, for instance because no assistant is set up. */
  disabled?: boolean;
  /** Shown above the button row: what to write. */
  ticks?: ReactNode;
}) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<Attachment[]>([]);
  const [adding, setAdding] = useState<"url" | "text" | null>(null);
  const [entry, setEntry] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const room = MAX_SOURCES - items.length - waiting.length;
  const add = (more: Attachment[]) => {
    if (more.length > room) setProblem(`At most ${MAX_SOURCES} sources.`);
    setItems((cur) => [...cur, ...more.slice(0, Math.max(0, room))]);
  };
  const addFiles = (files: File[]) => {
    const bad = files.map((f) => fileProblem(f.name, f.size)).find(Boolean);
    setProblem(bad ?? null);
    add(files.filter((f) => !fileProblem(f.name, f.size)).map((f) => ({ key: key(), kind: "file", file: f })));
  };
  const confirmEntry = () => {
    if (adding === "url") {
      const url = asLink(entry);
      if (!url) { setProblem("Enter a web address that starts with https://"); return; }
      add([{ key: key(), kind: "url", url }]);
    } else {
      if (entry.trim().length < MIN_TEXT) { setProblem(`Paste at least ${MIN_TEXT} characters.`); return; }
      add([{ key: key(), kind: "text", text: entry.trim() }]);
    }
    setProblem(null); setEntry(""); setAdding(null); area.current?.focus();
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) { e.preventDefault(); addFiles(files); return; }
    const pasted = e.clipboardData.getData("text/plain");
    const url = !text.trim() ? asLink(pasted) : undefined;
    if (url) { e.preventDefault(); add([{ key: key(), kind: "url", url }]); }
    else if (pasted.length > LONG_PASTE) { e.preventDefault(); add([{ key: key(), kind: "text", text: pasted.trim() }]); }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const ready = !disabled && !replying && !busy && !sending && (text.trim() !== "" || items.length > 0 || waiting.length > 0);
  const send = async () => {
    if (!ready) return;
    setSending(true); setProblem(null);
    try {
      if (await onSend(text.trim(), items)) { setText(""); setItems([]); setAdding(null); setEntry(""); }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="shrink-0 space-y-1.5 border-t border-border bg-card px-3 py-2.5">
      {problem && <p role="alert" className="text-xs text-destructive">{problem}</p>}
      <div
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
        onDrop={onDrop}
        className={cn("rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring", over && "border-brand ring-2 ring-ring")}
      >
        {(items.length > 0 || waiting.length > 0) && (
          <div className="flex flex-wrap gap-1.5 px-2.5 pt-2.5" aria-label="Attached">
            {waiting.map((s) => <SourceChip key={s.id} source={s} onRemove={sending ? undefined : () => onRemoveWaiting(s.id)} />)}
            {items.map((a) => <Chip key={a.key} icon={a.kind} name={attachmentName(a)} onRemove={sending ? undefined : () => setItems((cur) => cur.filter((x) => x.key !== a.key))} />)}
          </div>
        )}
        <textarea
          ref={area} rows={3} value={text} disabled={sending || disabled} aria-label="Message" placeholder={over ? "Drop the files here" : placeholder}
          onChange={(e) => setText(e.target.value)} onPaste={onPaste}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
          className="block max-h-48 min-h-[4.5rem] w-full resize-none bg-transparent px-3 py-2.5 text-[13px] leading-snug outline-none placeholder:text-muted-foreground [field-sizing:content] disabled:opacity-60"
        />
        {adding && (
          <div className="space-y-1.5 border-t border-border px-2.5 py-2">
            {adding === "url"
              ? <Input autoFocus type="url" value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="https://example.com/article" aria-label="Web address" className="h-8 text-xs"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmEntry(); } if (e.key === "Escape") { e.stopPropagation(); setAdding(null); } }} />
              : <Textarea autoFocus rows={5} value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="Paste the article or your notes here…" aria-label="Text to write from" className="text-xs"
                  onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setAdding(null); } }} />}
            <div className="flex justify-end gap-1.5">
              <Button type="button" variant="cancel" size="sm" onClick={() => { setAdding(null); setProblem(null); }}>Cancel</Button>
              <Button type="button" variant="outline" size="sm" disabled={!entry.trim()} onClick={confirmEntry}>Add</Button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between px-1.5 pb-1.5">
          <input ref={file} type="file" multiple accept={FILE_TYPES} className="hidden" aria-label="Choose files"
            onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Attach" title="Attach a file, a link or text" disabled={sending || disabled}><Paperclip /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuItem onSelect={() => file.current?.click()}><FileText /> Attach a file</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { setEntry(""); setAdding("url"); }}><Link2 /> Add a link</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { setEntry(""); setAdding("text"); }}><Type /> Paste text</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {ticks}
          </div>
          {replying
            ? <Button type="button" variant="brand" size="icon-sm" onClick={onStop} aria-label="Stop" title="Stop"><Square className="fill-current" /></Button>
            : <Button type="button" variant={ready ? "brand" : "ghost"} size="icon-sm" disabled={!ready} onClick={() => void send()} aria-label="Send" title="Send (Enter)">{sending || busy ? <Loader2 className="animate-spin" /> : <Send />}</Button>}
        </div>
      </div>
    </div>
  );
}
