import { Fragment, type ReactNode } from "react";
import { blocks, type Block, type Span } from "@/lib/mdPreview";
import { cn } from "@/lib/utils";

const inline = (spans: Span[]): ReactNode => spans.map((s, i) => {
  if (s.type === "text") return <Fragment key={i}>{s.text}</Fragment>;
  if (s.type === "code") return <code key={i} className="rounded bg-muted px-1 font-mono text-[0.9em]">{s.text}</code>;
  if (s.type === "bold") return <strong key={i}>{inline(s.spans)}</strong>;
  if (s.type === "italic") return <em key={i}>{inline(s.spans)}</em>;
  return <a key={i} href={s.href} target="_blank" rel="noreferrer noopener" className="text-brand underline underline-offset-2">{inline(s.spans)}</a>;
});

function one(b: Block, i: number) {
  switch (b.type) {
    case "heading": return <p key={i} role="heading" aria-level={Math.min(6, b.level + 2)} className={cn("font-semibold", b.level <= 1 ? "text-base" : "text-sm")}>{inline(b.spans)}</p>;
    case "paragraph": return <p key={i}>{inline(b.spans)}</p>;
    case "quote": return <blockquote key={i} className="border-l-2 border-border pl-3 text-muted-foreground">{inline(b.spans)}</blockquote>;
    case "code": return <pre key={i} className="overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-xs">{b.text}</pre>;
    case "rule": return <hr key={i} className="border-border" />;
    case "list": {
      const List = b.ordered ? "ol" : "ul";
      return <List key={i} className={cn("space-y-0.5 pl-5", b.ordered ? "list-decimal" : "list-disc")}>{b.items.map((x, j) => <li key={j} style={x.depth ? { marginLeft: x.depth * 16 } : undefined}>{inline(x.spans)}</li>)}</List>;
    }
    case "table": return (
      <div key={i} className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead><tr>{b.head.map((c, j) => <th key={j} className="border border-border px-2 py-1 text-left font-semibold">{inline(c)}</th>)}</tr></thead>
          <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className="border border-border px-2 py-1 align-top">{inline(c)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
}

/** A guide as it reads. Built from the text as data, never as HTML. */
export function MarkdownPreview({ text, className }: { text: string; className?: string }) {
  return <div className={cn("space-y-2 break-words text-sm leading-relaxed", className)}>{blocks(text).map(one)}</div>;
}
