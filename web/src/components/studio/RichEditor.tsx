import { useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DocNode, DraftKind } from "@/lib/draft";
import { cn } from "@/lib/utils";

/** Posts allow paragraphs, lists, bold and italic. Articles add headings, quotes and links. */
function extensionsFor(kind: DraftKind) {
  const placeholder = Placeholder.configure({ placeholder: kind === "post" ? "Write your post…" : "Write your article…" });
  if (kind === "post") {
    return [StarterKit.configure({ heading: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false, strike: false, underline: false, link: false }), placeholder];
  }
  return [StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, horizontalRule: false, strike: false, underline: false, link: { openOnClick: false, autolink: true } }), placeholder];
}

function Tool({ label, on, disabled, onClick, children }: { label: string; on?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" title={label} aria-label={label} aria-pressed={on} disabled={disabled}
      className={cn(on && "bg-accent text-brand")} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </Button>
  );
}

function Toolbar({ editor, kind }: { editor: Editor; kind: DraftKind }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const chain = () => editor.chain().focus();
  const applyLink = () => {
    const url = href.trim();
    if (!url) chain().unsetLink().run();
    else if (/^(https?:\/\/|mailto:)/i.test(url)) chain().setLink({ href: url }).run();
    else chain().setLink({ href: `https://${url}` }).run();
    setLinkOpen(false);
  };
  return (
    <div className="border-b border-input">
      <div className="flex flex-wrap items-center gap-0.5 p-1">
        <Tool label="Bold" on={editor.isActive("bold")} onClick={() => chain().toggleBold().run()}><Bold /></Tool>
        <Tool label="Italic" on={editor.isActive("italic")} onClick={() => chain().toggleItalic().run()}><Italic /></Tool>
        {kind === "article" && (
          <>
            <Tool label="Heading" on={editor.isActive("heading", { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 /></Tool>
            <Tool label="Subheading" on={editor.isActive("heading", { level: 3 })} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 /></Tool>
            <Tool label="Quote" on={editor.isActive("blockquote")} onClick={() => chain().toggleBlockquote().run()}><Quote /></Tool>
            <Tool label="Link" on={editor.isActive("link")} onClick={() => { setHref((editor.getAttributes("link").href as string) ?? ""); setLinkOpen((o) => !o); }}><Link2 /></Tool>
          </>
        )}
        <Tool label="Bulleted list" on={editor.isActive("bulletList")} onClick={() => chain().toggleBulletList().run()}><List /></Tool>
        <Tool label="Numbered list" on={editor.isActive("orderedList")} onClick={() => chain().toggleOrderedList().run()}><ListOrdered /></Tool>
        <span className="flex-1" />
        <Tool label="Undo" disabled={!editor.can().undo()} onClick={() => chain().undo().run()}><Undo2 /></Tool>
        <Tool label="Redo" disabled={!editor.can().redo()} onClick={() => chain().redo().run()}><Redo2 /></Tool>
      </div>
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
  const editor = useEditor(
    {
      extensions: extensionsFor(kind),
      content: doc,
      editable: !readOnly,
      autofocus: large ? "end" : false,
      shouldRerenderOnTransaction: true,
      editorProps: { attributes: { class: large ? "rich rich-lg" : "rich", role: "textbox", "aria-multiline": "true", "aria-label": kind === "post" ? "Post text" : "Article text" } },
      onCreate: ({ editor: e }) => onEditor(e),
      onDestroy: () => onEditor(null),
      onUpdate: ({ editor: e }) => onChange(e.getJSON() as DocNode),
    },
    [docKey, kind, large, readOnly],
  );
  if (!editor) return <div className={large ? "h-[60vh] bg-card" : "h-44 rounded-md border border-input bg-card"} />;
  return (
    <div className={cn(large ? "bg-card" : "rounded-md border border-input bg-card shadow-sm focus-within:ring-1 focus-within:ring-ring", fill && "flex h-full flex-col")}>
      <Toolbar editor={editor} kind={kind} />
      {fill ? <div className="min-h-0 flex-1 overflow-y-auto"><EditorContent editor={editor} /></div> : <EditorContent editor={editor} />}
    </div>
  );
}
