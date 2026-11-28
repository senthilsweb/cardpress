import { memo, useEffect, useReducer, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import Image from "@tiptap/extension-image";
import { TextSelection } from "@tiptap/pm/state";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { toast } from "sonner";
import { Bold, Code, Code2, Heading1, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, ListTree, Minus, PanelLeftClose, Quote, Redo2, Strikethrough, Table2, Trash2, Underline as UnderlineIcon, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DocNode, DraftKind } from "@/lib/draft";
import { isPicture, MAX_DOC_BYTES, pictureToDataUrl } from "@/lib/images";
import { createTrailing, registerFlusher, type Trailing } from "@/lib/pendingEdits";
import { filterCommands, outlineOf, slashQuery, type OutlineItem, type SlashId } from "@/lib/editorTools";
import { cn } from "@/lib/utils";

/**
 * Posts allow paragraphs, lists, bold and italic (what LinkedIn shows). Articles are the rich kind: headings, quotes, links,
 * code, dividers, tables and pictures that live inside the text as base64.
 */
export function extensionsFor(kind: DraftKind) {
  const placeholder = Placeholder.configure({ placeholder: kind === "post" ? "Write your post…" : "Write your article…" });
  if (kind === "post") {
    return [StarterKit.configure({ heading: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false, strike: false, underline: false, link: false }), placeholder];
  }
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
    Image.configure({ allowBase64: true, inline: false }),
    Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
    placeholder,
  ];
}

function Tool({ label, on, disabled, onClick, children }: { label: string; on?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" title={label} aria-label={label} aria-pressed={on} disabled={disabled}
      className={cn(on && "bg-accent text-brand")} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </Button>
  );
}

/** Pictures come from the toolbar, a paste, a drop or the "/" menu; each is shrunk, then placed where the cursor is. */
export async function addPictures(ed: Editor | null, files: File[]) {
  if (!ed || ed.isDestroyed) return;
  for (const f of files.filter(isPicture)) {
    try {
      const src = await pictureToDataUrl(f);
      if (JSON.stringify(ed.getJSON()).length + src.length > MAX_DOC_BYTES) { toast.error("This article is too big to hold another picture", { description: "The limit is about 24 MB in all." }); return; }
      ed.chain().focus().setImage({ src, alt: f.name.replace(/\.[^.]+$/, "") }).run();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not add the picture"); }
  }
}

/** What the toolbar shows. Read through useEditorState, so the toolbar only draws again when one of these changes, not on every key. */
const NO_FLAGS = { bold: false, italic: false, underline: false, strike: false, code: false, h1: false, h2: false, h3: false, blockquote: false, codeBlock: false, link: false, bulletList: false, orderedList: false, table: false, undo: false, redo: false };
function toolbarFlags(ed: Editor | null) {
  if (!ed || ed.isDestroyed) return null;
  return {
    bold: ed.isActive("bold"), italic: ed.isActive("italic"), underline: ed.isActive("underline"), strike: ed.isActive("strike"), code: ed.isActive("code"),
    h1: ed.isActive("heading", { level: 1 }), h2: ed.isActive("heading", { level: 2 }), h3: ed.isActive("heading", { level: 3 }),
    blockquote: ed.isActive("blockquote"), codeBlock: ed.isActive("codeBlock"), link: ed.isActive("link"),
    bulletList: ed.isActive("bulletList"), orderedList: ed.isActive("orderedList"), table: ed.isActive("table"),
    undo: ed.can().undo(), redo: ed.can().redo(),
  };
}

/**
 * The formatting toolbar, with the table controls and the link form under it. In the large view it sits in the fixed header,
 * so the link form is controlled from outside (the floating menu opens it too).
 */
export const EditorToolbar = memo(function EditorToolbar({ editor, kind, extra, linkOpen, setLinkOpen }: {
  editor: Editor | null; kind: DraftKind; extra?: React.ReactNode; linkOpen?: boolean; setLinkOpen?: (open: boolean) => void;
}) {
  const f = useEditorState({ editor, selector: ({ editor: ed }) => toolbarFlags(ed) }) ?? NO_FLAGS;
  const [ownLinkOpen, setOwnLinkOpen] = useState(false);
  const open = linkOpen ?? ownLinkOpen;
  const setOpen = setLinkOpen ?? setOwnLinkOpen;
  const [href, setHref] = useState("");
  // the address shows when the form opens, whoever opened it
  useEffect(() => { if (open && editor && !editor.isDestroyed) setHref((editor.getAttributes("link").href as string) ?? ""); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const fileRef = useRef<HTMLInputElement>(null);
  if (!editor || editor.isDestroyed) return null;
  const chain = () => editor.chain().focus();
  const applyLink = () => {
    const url = href.trim();
    if (!url) chain().unsetLink().run();
    else if (/^(https?:\/\/|mailto:)/i.test(url)) chain().setLink({ href: url }).run();
    else chain().setLink({ href: `https://${url}` }).run();
    setOpen(false);
  };
  const inTable = kind === "article" && f.table;
  return (
    <div className="border-b border-input">
      <div className="flex flex-wrap items-center gap-0.5 p-1">
        <Tool label="Bold" on={f.bold} onClick={() => chain().toggleBold().run()}><Bold /></Tool>
        <Tool label="Italic" on={f.italic} onClick={() => chain().toggleItalic().run()}><Italic /></Tool>
        {kind === "article" && (
          <>
            <Tool label="Underline" on={f.underline} onClick={() => chain().toggleUnderline().run()}><UnderlineIcon /></Tool>
            <Tool label="Strikethrough" on={f.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough /></Tool>
            <Tool label="Code" on={f.code} onClick={() => chain().toggleCode().run()}><Code /></Tool>
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
            <Tool label="Title" on={f.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}><Heading1 /></Tool>
            <Tool label="Heading" on={f.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 /></Tool>
            <Tool label="Subheading" on={f.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 /></Tool>
            <Tool label="Quote" on={f.blockquote} onClick={() => chain().toggleBlockquote().run()}><Quote /></Tool>
            <Tool label="Code block" on={f.codeBlock} onClick={() => chain().toggleCodeBlock().run()}><Code2 /></Tool>
            <Tool label="Link" on={f.link} onClick={() => setOpen(!open)}><Link2 /></Tool>
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
            <Tool label="Picture" onClick={() => fileRef.current?.click()}><ImagePlus /></Tool>
            <Tool label="Table" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 /></Tool>
            <Tool label="Divider" onClick={() => chain().setHorizontalRule().run()}><Minus /></Tool>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" multiple className="sr-only" tabIndex={-1} aria-hidden
              onChange={(e) => { void addPictures(editor, Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          </>
        )}
        <Tool label="Bulleted list" on={f.bulletList} onClick={() => chain().toggleBulletList().run()}><List /></Tool>
        <Tool label="Numbered list" on={f.orderedList} onClick={() => chain().toggleOrderedList().run()}><ListOrdered /></Tool>
        <span className="flex-1" />
        {extra}
        <Tool label="Undo" disabled={!f.undo} onClick={() => chain().undo().run()}><Undo2 /></Tool>
        <Tool label="Redo" disabled={!f.redo} onClick={() => chain().redo().run()}><Redo2 /></Tool>
      </div>
      {inTable && (
        <div className="flex flex-wrap items-center gap-1 border-t border-input p-1 text-xs">
          <span className="px-1 text-muted-foreground">Table</span>
          <Button type="button" size="sm" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().addRowAfter().run()}>Row +</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().deleteRow().run()}>Row −</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().addColumnAfter().run()}>Column +</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().deleteColumn().run()}>Column −</Button>
          <Button type="button" size="sm" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().deleteTable().run()}><Trash2 /> Delete table</Button>
        </div>
      )}
      {open && (
        <form className="flex gap-1 border-t border-input p-1" onSubmit={(e) => { e.preventDefault(); applyLink(); }}>
          <Input value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://… (empty removes the link)" className="h-8" autoFocus aria-label="Link address" />
          <Button type="submit" size="sm" variant="outline">Set</Button>
        </form>
      )}
    </div>
  );
});

/** How long typing must rest before the article is handed on. Short enough to feel saved, long enough to skip the work mid-word. */
const TYPING_PAUSE_MS = 250;

/** The "/" menu's state, shared with the editor's key handler (which is created once and cannot see React state). */
interface SlashApi { open: boolean; onKey: (e: KeyboardEvent) => boolean }

/** A small list at the caret: typing "/" in an empty paragraph offers the blocks of an article. */
function SlashMenu({ editor, api, wrap }: { editor: Editor; api: React.RefObject<SlashApi>; wrap: React.RefObject<HTMLDivElement | null> }) {
  // draws again only when the typed "/…" or where it sits changes, not on every key in ordinary text
  useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      const { selection } = ed.state;
      const q = selection.empty && selection.$from.parent.type.name === "paragraph" ? slashQuery(selection.$from.parent.textContent) : null;
      return { q, start: selection.$from.start(), pos: q === null ? 0 : selection.$from.pos };
    },
  });
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { selection } = editor.state;
  const { $from } = selection;
  const q = selection.empty && $from.parent.type.name === "paragraph" ? slashQuery($from.parent.textContent) : null;
  const start = $from.start();
  const items = q === null ? [] : filterCommands(q);
  const open = q !== null && items.length > 0 && dismissed !== start;
  const sel = Math.min(index, Math.max(0, items.length - 1));
  useEffect(() => { setIndex(0); }, [q]);
  // moving to another paragraph forgets an Escape
  useEffect(() => { if (dismissed !== null && dismissed !== start) setDismissed(null); }, [start, dismissed]);

  const run = (id: SlashId) => {
    const c = editor.chain().focus().deleteRange({ from: start, to: $from.pos });
    switch (id) {
      case "h1": c.setHeading({ level: 1 }).run(); break;
      case "h2": c.setHeading({ level: 2 }).run(); break;
      case "picture": c.run(); fileRef.current?.click(); break;
      case "table": c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break;
      case "codeBlock": c.setCodeBlock().run(); break;
      case "quote": c.setBlockquote().run(); break;
      case "divider": c.setHorizontalRule().run(); break;
      case "bullets": c.toggleBulletList().run(); break;
      case "numbers": c.toggleOrderedList().run(); break;
    }
  };
  const live = useRef({ open, items, sel, run, start });
  live.current = { open, items, sel, run, start };
  useEffect(() => {
    const a = api.current;
    a.onKey = (e) => {
      const l = live.current;
      if (!l.open) return false;
      if (e.key === "ArrowDown") setIndex((l.sel + 1) % l.items.length);
      else if (e.key === "ArrowUp") setIndex((l.sel - 1 + l.items.length) % l.items.length);
      else if (e.key === "Enter" || e.key === "Tab") l.run(l.items[l.sel].id);
      else if (e.key === "Escape") setDismissed(l.start);
      else return false;
      return true;
    };
    return () => { a.onKey = () => false; };
  }, [api]);
  useEffect(() => { api.current.open = open; }, [open, api]);

  let box: { top: number; left: number } | null = null;
  if (open && wrap.current) {
    const c = editor.view.coordsAtPos($from.pos);
    const r = wrap.current.getBoundingClientRect();
    // near the bottom of the scrolling area the list opens upward so it is never cut off
    const room = (wrap.current.closest("[data-editor-scroll]")?.getBoundingClientRect().bottom ?? window.innerHeight) - c.bottom;
    const h = items.length * 28 + 12;
    box = { top: room < h + 8 ? c.top - r.top - h - 4 : c.bottom - r.top + 4, left: Math.max(0, c.left - r.left) };
  }
  return (
    <>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" multiple className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { void addPictures(editor, Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      {box && (
        <div role="listbox" aria-label="Insert" className="absolute z-30 w-48 rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md" style={box} onMouseDown={(e) => e.preventDefault()}>
          {items.map((it, i) => (
            <div key={it.id} role="option" aria-selected={i === sel} className={cn("cursor-pointer rounded px-2 py-1", i === sel && "bg-accent text-brand")} onMouseEnter={() => setIndex(i)} onClick={() => run(it.id)}>{it.label}</div>
          ))}
        </div>
      )}
    </>
  );
}

/** Bold, italic, link and heading next to selected text, so a short edit does not need the toolbar. */
function SelectionMenu({ editor, wrap, onLink }: { editor: Editor; wrap: React.RefObject<HTMLDivElement | null>; onLink: () => void }) {
  // nothing is drawn again while the cursor is just a cursor, so ordinary typing does not pay for this menu
  const [, focusTick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    editor.on("focus", focusTick);
    editor.on("blur", focusTick);
    return () => { editor.off("focus", focusTick); editor.off("blur", focusTick); };
  }, [editor]);
  useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      const s = ed.state.selection;
      return s.empty || !(s instanceof TextSelection) ? null : { from: s.from, to: s.to, bold: ed.isActive("bold"), italic: ed.isActive("italic"), link: ed.isActive("link"), h2: ed.isActive("heading", { level: 2 }) };
    },
  });
  const { selection } = editor.state;
  if (selection.empty || !(selection instanceof TextSelection) || !editor.view.hasFocus() || !wrap.current) return null;
  const a = editor.view.coordsAtPos(selection.from);
  const b = editor.view.coordsAtPos(selection.to);
  const r = wrap.current.getBoundingClientRect();
  const left = Math.max(0, Math.min((a.left + b.right) / 2 - r.left - 74, r.width - 160));
  const chain = () => editor.chain().focus();
  return (
    <div role="toolbar" aria-label="Format selection" className="absolute z-30 flex gap-0.5 rounded-md border border-border bg-popover p-0.5 shadow-md" style={{ top: Math.min(a.top, b.top) - r.top - 40, left }} onMouseDown={(e) => e.preventDefault()}>
      <Tool label="Bold" on={editor.isActive("bold")} onClick={() => chain().toggleBold().run()}><Bold /></Tool>
      <Tool label="Italic" on={editor.isActive("italic")} onClick={() => chain().toggleItalic().run()}><Italic /></Tool>
      <Tool label="Link" on={editor.isActive("link")} onClick={onLink}><Link2 /></Tool>
      <Tool label="Heading" on={editor.isActive("heading", { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 /></Tool>
    </div>
  );
}

/** The headings of the article, indented by level. Clicking one moves the cursor there. */
export const Outline = memo(function Outline({ editor, collapsed, onToggle }: { editor: Editor | null; collapsed: boolean; onToggle: () => void }) {
  const [items, setItems] = useState<OutlineItem[]>([]);
  // the list follows the text after a short pause rather than on every key
  useEffect(() => {
    if (!editor || editor.isDestroyed) { setItems([]); return; }
    const read = () => { if (!editor.isDestroyed) setItems(outlineOf(editor.state.doc)); };
    read();
    let t: number | undefined;
    const later = () => { window.clearTimeout(t); t = window.setTimeout(read, 250); };
    editor.on("update", later);
    return () => { window.clearTimeout(t); editor.off("update", later); };
  }, [editor]);
  const jump = (i: number) => {
    if (!editor || editor.isDestroyed) return;
    // positions are read again now, so a heading that moved since the list was drawn is still the right one
    const hit = outlineOf(editor.state.doc)[i];
    if (!hit) return;
    editor.chain().focus().setTextSelection(hit.pos + 1).run();
    (editor.view.nodeDOM(hit.pos) as HTMLElement | null)?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  if (collapsed) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center border-r border-border py-2 max-md:hidden">
        <Button type="button" variant="ghost" size="icon-sm" title="Show the outline" aria-label="Show the outline" aria-expanded={false} onClick={onToggle}><ListTree /></Button>
      </div>
    );
  }
  return (
    <nav aria-label="Outline" className="flex w-56 shrink-0 flex-col border-r border-border max-md:hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="eyebrow">Outline</span>
        <Button type="button" variant="ghost" size="icon-sm" title="Hide the outline" aria-label="Hide the outline" aria-expanded onClick={onToggle}><PanelLeftClose /></Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        {items.length === 0 && <p className="px-2 text-xs text-muted-foreground">No headings yet.</p>}
        {items.map((it, i) => (
          <button key={`${i}-${it.pos}`} type="button" className="block w-full cursor-pointer truncate rounded px-2 py-1 text-left text-xs hover:bg-accent hover:text-brand"
            style={{ paddingLeft: 8 + (it.level - 1) * 12, fontWeight: it.level === 1 ? 600 : 400 }} title={it.text} onClick={() => jump(i)}>{it.text}</button>
        ))}
      </div>
    </nav>
  );
});

/**
 * The editor for one draft. It is created again when `docKey` or `kind` changes, so switching drafts
 * loads the new document. Changes are reported as TipTap JSON.
 */
export function RichEditor({ docKey, kind, doc, onChange, onEditor, large = false, fill = false, readOnly = false, bare = false, onLinkRequest }: {
  docKey: string; kind: DraftKind; doc: DocNode;
  /** `key` is the docKey the text was written under, so a late hand-over can be told from the draft now open. */
  onChange: (doc: DocNode, key: string) => void; onEditor: (e: Editor | null) => void;
  /** The expanded, full-height editor. It takes focus when it opens. */
  large?: boolean;
  /** Fill the height of the parent and scroll inside, so the parent can be resized. */
  fill?: boolean;
  /** Shown but not changeable, for a draft that a post is waiting on. */
  readOnly?: boolean;
  /** No toolbar here: the parent shows it, outside the scrolling text. */
  bare?: boolean;
  /** The floating menu's Link button asks the parent to open the link form. */
  onLinkRequest?: () => void;
}) {
  const edRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const trailRef = useRef<Trailing<{ doc: DocNode; key: string }> | null>(null);
  trailRef.current ??= createTrailing((v) => onChangeRef.current(v.doc, v.key), TYPING_PAUSE_MS);
  const trail = trailRef.current;
  // Whatever is waiting goes out when something else needs the document, the window is left, or the editor goes away.
  useEffect(() => {
    const off = registerFlusher(trail.flush);
    const hidden = () => { if (document.visibilityState === "hidden") trail.flush(); };
    window.addEventListener("blur", trail.flush);
    window.addEventListener("beforeunload", trail.flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      off();
      window.removeEventListener("blur", trail.flush);
      window.removeEventListener("beforeunload", trail.flush);
      document.removeEventListener("visibilitychange", hidden);
      trail.flush();
    };
  }, [trail]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const slash = useRef<SlashApi>({ open: false, onKey: () => false });
  const extras = large && kind === "article" && !readOnly;
  const editor = useEditor(
    {
      extensions: extensionsFor(kind),
      content: doc,
      editable: !readOnly,
      autofocus: large ? "end" : false,
      shouldRerenderOnTransaction: !bare,
      editorProps: {
        attributes: { class: large ? "rich rich-lg" : "rich", role: "textbox", "aria-multiline": "true", "aria-label": kind === "post" ? "Post text" : "Article text" },
        handleKeyDown: (_view, e) => (slash.current.open ? slash.current.onKey(e) : false),
        handlePaste: (_view, e) => {
          const files = Array.from(e.clipboardData?.files ?? []).filter(isPicture);
          if (kind !== "article" || !files.length) return false;
          void addPictures(edRef.current, files);
          return true;
        },
        handleDrop: (_view, e) => {
          const files = Array.from(e.dataTransfer?.files ?? []).filter(isPicture);
          if (kind !== "article" || !files.length) return false;
          e.preventDefault();
          void addPictures(edRef.current, files);
          return true;
        },
      },
      // an article is handed on after a pause (see pendingEdits); a post is short and shown at once
      onUpdate: ({ editor: e }) => {
        const d = e.getJSON() as DocNode;
        if (kind === "article") trail.push({ doc: d, key: docKey }); else onChangeRef.current(d, docKey);
      },
    },
    [docKey, kind, large, readOnly, bare],
  );
  // Reported from an effect rather than onCreate/onDestroy: when the editor is rebuilt, the old one's destroy can arrive
  // after the new one's create, which would leave the parent holding nothing.
  useEffect(() => {
    edRef.current = editor;
    onEditor(editor);
    return () => { edRef.current = null; onEditor(null); };
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!editor) return <div className={large ? "h-[60vh] bg-card" : "h-44 rounded-md border border-input bg-card"} />;
  return (
    <div ref={wrapRef} className={cn("relative", large ? "bg-card" : "rounded-md border border-input bg-card shadow-sm focus-within:ring-1 focus-within:ring-ring", fill && "flex h-full flex-col")}>
      {!bare && <EditorToolbar editor={editor} kind={kind} />}
      {fill ? <div className="min-h-0 flex-1 overflow-y-auto"><EditorContent editor={editor} /></div> : <EditorContent editor={editor} />}
      {extras && <SlashMenu editor={editor} api={slash} wrap={wrapRef} />}
      {extras && <SelectionMenu editor={editor} wrap={wrapRef} onLink={() => onLinkRequest?.()} />}
    </div>
  );
}
