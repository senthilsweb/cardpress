/*
 * The Markdown a writing guide uses, read into plain data for a preview: headings, paragraphs, lists, quotes, tables,
 * and bold, italic, code and web links within a line. Nothing becomes HTML, so there is nothing to clean.
 */
export type Span =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "bold"; spans: Span[] }
  | { type: "italic"; spans: Span[] }
  | { type: "link"; href: string; spans: Span[] };

export type Block =
  | { type: "heading"; level: number; spans: Span[] }
  | { type: "paragraph"; spans: Span[] }
  | { type: "list"; ordered: boolean; items: { depth: number; spans: Span[] }[] }
  | { type: "quote"; spans: Span[] }
  | { type: "table"; head: Span[][]; rows: Span[][][] }
  | { type: "rule" };

const INLINE = /(`[^`]+`)|(\*\*(?=\S)[\s\S]+?\*\*|__(?=\S)[\s\S]+?__)|(\*(?=\S)[^*]+?\*|(?<![A-Za-z0-9])_(?=\S)[^_]+?_(?![A-Za-z0-9]))|\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/;

export function spans(text: string): Span[] {
  const out: Span[] = [];
  let rest = text;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) { out.push({ type: "text", text: rest }); break; }
    if (m.index) out.push({ type: "text", text: rest.slice(0, m.index) });
    if (m[1]) out.push({ type: "code", text: m[1].slice(1, -1) });
    else if (m[2]) out.push({ type: "bold", spans: spans(m[2].slice(2, -2)) });
    else if (m[3]) out.push({ type: "italic", spans: spans(m[3].slice(1, -1)) });
    else out.push({ type: "link", href: m[5], spans: spans(m[4] || m[5]) });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const ITEM = /^(\s*)(?:([-*+])|\d{1,3}[.)])\s+(.*)$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => spans(c.trim()));

export function blocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) out.push({ type: "paragraph", spans: spans(para.join(" ")) }); para = []; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = HEADING.exec(line), item = ITEM.exec(line);
    if (!line.trim()) flush();
    else if (heading) { flush(); out.push({ type: "heading", level: heading[1].length, spans: spans(heading[2]) }); }
    else if (RULE.test(line)) { flush(); out.push({ type: "rule" }); }
    else if (line.includes("|") && DIVIDER.test(lines[i + 1] ?? "") && (lines[i + 1] ?? "").includes("|")) {
      flush();
      const head = cells(line), rows: Span[][][] = [];
      for (i += 2; i < lines.length && lines[i].includes("|"); i++) rows.push(cells(lines[i]));
      i--;
      out.push({ type: "table", head, rows });
    } else if (item) {
      flush();
      const ordered = !item[2], items: { depth: number; text: string }[] = [];
      for (; i < lines.length; i++) {
        const next = ITEM.exec(lines[i]);
        if (next && !RULE.test(lines[i])) items.push({ depth: Math.min(3, Math.floor(next[1].length / 2)), text: next[3] });
        else if (/^\s{2,}\S/.test(lines[i])) items[items.length - 1].text += ` ${lines[i].trim()}`;
        else break;
      }
      i--;
      out.push({ type: "list", ordered, items: items.map((x) => ({ depth: x.depth, spans: spans(x.text) })) });
    } else if (line.startsWith(">")) {
      flush();
      const quoted: string[] = [];
      for (; i < lines.length && lines[i].startsWith(">"); i++) quoted.push(lines[i].replace(/^>\s?/, ""));
      i--;
      out.push({ type: "quote", spans: spans(quoted.join(" ")) });
    } else para.push(line.trim());
  }
  flush();
  return out;
}
