import { EditorContent, useEditor } from "@tiptap/react";
import type { DocNode, DraftKind } from "@/lib/draft";
import { extensionsFor } from "./RichEditor";

/** A saved text shown as it is written (headings, lists, code, tables, pictures) and not editable. */
export function DocView({ doc, kind }: { doc: DocNode; kind: DraftKind }) {
  const editor = useEditor({
    extensions: extensionsFor(kind === "article" ? "article" : "post"),
    content: doc,
    editable: false,
    editorProps: { attributes: { class: "rich article-html", role: "article", "aria-label": "Full text" } },
  }, [doc, kind]);
  if (!editor) return null;
  return <EditorContent editor={editor} />;
}
