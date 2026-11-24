import { useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import Image from "@tiptap/extension-image";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { toast } from "sonner";
import { Bold, Code, Code2, Heading1, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Strikethrough, Table2, Trash2, Underline as UnderlineIcon, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DocNode, DraftKind } from "@/lib/draft";
import { isPicture, MAX_DOC_BYTES, pictureToDataUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

/**
 * Posts allow paragraphs, lists, bold and italic (what LinkedIn shows). Articles are the rich kind: headings, quotes, links,
 * code, dividers, tables and pictures that live inside the text as base64.
 */
function extensionsFor(kind: DraftKind) {
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

function Toolbar({ editor, kind, onPicture }: { editor: Editor; kind: DraftKind; onPicture: (files: File[]) => void }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const chain = () => editor.chain().focus();
  const applyLink = () => {
    const url = href.trim();
    if (!url) chain().unsetLink().run();
    else if (/^(https?:\/\/|mailto:)/i.test(url)) chain().setLink({ href: url }).run();
    else chain().setLink({ href: `https://${url}` }).run();
    setLinkOpen(false);
  };
  const inTable = kind === "article" && editor.isActive("table");
  return (
    <div className="border-b border-input">
      <div className="flex flex-wrap items-center gap-0.5 p-1">
        <Tool label="Bold" on={editor.isActive("bold")} onClick={() => chain().toggleBold().run()}><Bold /></Tool>
        <Tool label="Italic" on={editor.isActive("italic")} onClick={() => chain().toggleItalic().run()}><Italic /></Tool>
        {kind === "article" && (
          <>
            <Tool label="Underline" on={editor.isActive("underline")} onClick={() => chain().toggleUnderline().run()}><UnderlineIcon /></Tool>
            <Tool label="Strikethrough" on={editor.isActive("strike")} onClick={() => chain().toggleStrike().run()}><Strikethrough /></Tool>
            <Tool label="Code" on={editor.isActive("code")} onClick={() => chain().toggleCode().run()}><Code /></Tool>
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
            <Tool label="Title" on={editor.isActive("heading", { level: 1 })} onClick={() => chain().toggleHeading({ level: 1 }).run()}><Heading1 /></Tool>
            <Tool label="Heading" on={editor.isActive("heading", { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 /></Tool>
            <Tool label="Subheading" on={editor.isActive("heading", { level: 3 })} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 /></Tool>
            <Tool label="Quote" on={editor.isActive("blockquote")} onClick={() => chain().toggleBlockquote().run()}><Quote /></Tool>
            <Tool label="Code block" on={editor.isActive("codeBlock")} onClick={() => chain().toggleCodeBlock().run()}><Code2 /></Tool>
            <Tool label="Link" on={editor.isActive("link")} onClick={() => { setHref((editor.getAttributes("link").href as string) ?? ""); setLinkOpen((o) => !o); }}><Link2 /></Tool>
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
            <Tool label="Picture" onClick={() => fileRef.current?.click()}><ImagePlus /></Tool>
            <Tool label="Table" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 /></Tool>
            <Tool label="Divider" onClick={() => chain().setHorizontalRule().run()}><Minus /></Tool>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" multiple className="sr-only" tabIndex={-1} aria-hidden
              onChange={(e) => { onPicture(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          </>
        )}
        <Tool label="Bulleted list" on={editor.isActive("bulletList")} onClick={() => chain().toggleBulletList().run()}><List /></Tool>
        <Tool label="Numbered list" on={editor.isActive("orderedList")} onClick={() => chain().toggleOrderedList().run()}><ListOrdered /></Tool>
        <span className="flex-1" />
        <Tool label="Undo" disabled={!editor.can().undo()} onClick={() => chain().undo().run()}><Undo2 /></Tool>
        <Tool label="Redo" disabled={!editor.can().redo()} onClick={() => chain().redo().run()}><Redo2 /></Tool>
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
      {linkOpen && (
        <form className="flex gap-1 border-t border-input p-1" onSubmit={(e) => { e.preventDefault(); applyLink(); }}>
          <Input value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://… (empty removes the link)" className="h-8" autoFocus aria-label="Link address" />
          <Button type="submit" size="sm" variant="outline">Set</Button>
        </form>
      )}
    </div>
  );
}

/**
 * The editor for one draft. It is created again when `docKey` or `kind` changes, so switching drafts
 * loads the new document. Changes are reported as TipTap JSON.
 */
export function RichEditor({ docKey, kind, doc, onChange, onEditor, large = false, fill = false, readOnly = false }: {
  docKey: string; kind: DraftKind; doc: DocNode; onChange: (doc: DocNode) => void; onEditor: (e: Editor | null) => void;
  /** The expanded, full-height editor. It takes focus when it opens. */
  large?: boolean;
  /** Fill the height of the parent and scroll inside, so the parent can be resized. */
  fill?: boolean;
  /** Shown but not changeable, for a draft that a post is waiting on. */
  readOnly?: boolean;
}) {
  const edRef = useRef<Editor | null>(null);
  // pictures come from the toolbar, a paste or a drop; each is shrunk, then placed where the cursor is
  const addPictures = async (files: File[]) => {
    const ed = edRef.current;
    if (!ed || ed.isDestroyed) return;
    for (const f of files.filter(isPicture)) {
      try {
        const src = await pictureToDataUrl(f);
        if (JSON.stringify(ed.getJSON()).length + src.length > MAX_DOC_BYTES) { toast.error("This article is too big to hold another picture", { description: "The limit is about 24 MB in all." }); return; }
        ed.chain().focus().setImage({ src, alt: f.name.replace(/\.[^.]+$/, "") }).run();
      } catch (e) { toast.error(e instanceof Error ? e.message : "Could not add the picture"); }
    }
  };
  const editor = useEditor(
    {
      extensions: extensionsFor(kind),
      content: doc,
      editable: !readOnly,
      autofocus: large ? "end" : false,
      shouldRerenderOnTransaction: true,
      editorProps: {
        attributes: { class: large ? "rich rich-lg" : "rich", role: "textbox", "aria-multiline": "true", "aria-label": kind === "post" ? "Post text" : "Article text" },
        handlePaste: (_view, e) => {
          const files = Array.from(e.clipboardData?.files ?? []).filter(isPicture);
          if (kind !== "article" || !files.length) return false;
          void addPictures(files);
          return true;
        },
        handleDrop: (_view, e) => {
          const files = Array.from(e.dataTransfer?.files ?? []).filter(isPicture);
          if (kind !== "article" || !files.length) return false;
          e.preventDefault();
          void addPictures(files);
          return true;
        },
      },
      onCreate: ({ editor: e }) => { edRef.current = e; onEditor(e); },
      onDestroy: () => { edRef.current = null; onEditor(null); },
      onUpdate: ({ editor: e }) => onChange(e.getJSON() as DocNode),
    },
    [docKey, kind, large, readOnly],
  );
  if (!editor) return <div className={large ? "h-[60vh] bg-card" : "h-44 rounded-md border border-input bg-card"} />;
  return (
    <div className={cn(large ? "bg-card" : "rounded-md border border-input bg-card shadow-sm focus-within:ring-1 focus-within:ring-ring", fill && "flex h-full flex-col")}>
      <Toolbar editor={editor} kind={kind} onPicture={(f) => void addPictures(f)} />
      {fill ? <div className="min-h-0 flex-1 overflow-y-auto"><EditorContent editor={editor} /></div> : <EditorContent editor={editor} />}
    </div>
  );
}
