import type { DocNode } from "./draft";

const esc = (s: string) => s.replace(/([\\`*_[\]])/g, "\\$1");

function inline(nodes: DocNode[] | undefined): string {
  let out = "";
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") { out += "  \n"; continue; }
    if (n.type !== "text") { out += inline(n.content); continue; }
    const marks = (n.marks ?? []).map((m) => m.type);
    let t = marks.includes("code") ? `\`${n.text ?? ""}\`` : esc(n.text ?? "");
    if (marks.includes("bold")) t = `**${t}**`;
    if (marks.includes("italic")) t = `*${t}*`;
    if (marks.includes("strike")) t = `~~${t}~~`;
    if (marks.includes("underline")) t = `<u>${t}</u>`;
    const link = (n.marks ?? []).find((m) => m.type === "link");
    if (link) t = `[${t}](${String(link.attrs?.href ?? "")})`;
    out += t;
  }
  return out;
}

function block(n: DocNode, indent = ""): string[] {
  switch (n.type) {
    case "heading": return [`${"#".repeat(Math.min(6, Math.max(1, Number(n.attrs?.level ?? 2))))} ${inline(n.content)}`];
    case "blockquote": return (n.content ?? []).flatMap((c) => block(c)).join("\n\n").split("\n").map((l) => `> ${l}`.trimEnd());
    case "codeBlock": return ["```" + String(n.attrs?.language ?? ""), (n.content ?? []).map((c) => c.text ?? "").join(""), "```"];
    case "horizontalRule": return ["---"];
    case "image": return [`![${String(n.attrs?.alt ?? "")}](${String(n.attrs?.src ?? "")})`];
    case "bulletList":
    case "orderedList": {
      const lines: string[] = [];
      (n.content ?? []).forEach((item, i) => {
        const marker = n.type === "orderedList" ? `${Number(n.attrs?.start ?? 1) + i}. ` : "- ";
        let first = true;
        for (const child of item.content ?? []) {
          for (const line of block(child, indent + "  ")) {
            if (child.type === "bulletList" || child.type === "orderedList") lines.push(line);
            else { lines.push(first ? `${indent}${marker}${line.trimStart()}` : `${indent}  ${line.trimStart()}`); first = false; }
          }
        }
      });
      return lines;
    }
    case "table": {
      const rows = (n.content ?? []).map((row) => (row.content ?? []).map((cell) => (cell.content ?? []).map((p) => inline(p.content)).join(" ").replace(/\|/g, "\\|").trim()));
      if (!rows.length) return [];
      const width = Math.max(...rows.map((r) => r.length));
      const pad = (r: string[]) => `| ${[...r, ...Array(width - r.length).fill("")].join(" | ")} |`;
      return [pad(rows[0]), `| ${Array(width).fill("---").join(" | ")} |`, ...rows.slice(1).map(pad)];
    }
    default: {
      const t = inline(n.content);
      return t.trim() ? t.split("\n").map((l) => indent + l) : [];
    }
  }
}

/** An article as Markdown, pictures included (as data URLs). */
export function docToMarkdown(doc: DocNode): string {
  return (doc.content ?? []).map((n) => block(n).join("\n")).filter((b) => b.trim() !== "").join("\n\n") + "\n";
}

/** A complete HTML page around the article's body, to open anywhere. */
export function articleHtmlPage(title: string, bodyHtml: string): string {
  const safe = title.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safe}</title>
<style>body{font:17px/1.65 system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#1a1712}img{max-width:100%;height:auto}pre{background:#f3efe6;padding:.8rem;overflow:auto;border-radius:6px}code{background:#f3efe6;padding:.1em .3em;border-radius:4px}pre code{background:none;padding:0}blockquote{border-left:3px solid #0e6b57;margin-left:0;padding-left:1rem;color:#555}table{border-collapse:collapse}td,th{border:1px solid #d9d2c0;padding:.35rem .6rem}th{background:#f3efe6}</style>
</head><body>
${bodyHtml}
</body></html>
`;
}
