import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pageNumbers } from "@/lib/library";

/** Under a list that comes in pages: what is shown, the page numbers, and how many to a page. */
export function Pager({ label, sizeLabel = "Per page", page, pages, pageSize, total, sizes, onPage, onSize }: {
  /** What the pages are of, for screen readers. */
  label: string;
  sizeLabel?: string;
  page: number; pages: number; pageSize: number; total: number;
  sizes: readonly number[];
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}) {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1, to = Math.min(total, page * pageSize);
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label={label}>
      <span className="text-muted-foreground">{from}–{to} of {total}</span>
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft /></Button>
        {pageNumbers(page, pages).map((n, i) => n === "…"
          ? <span key={`gap${i}`} className="px-1 text-muted-foreground" aria-hidden>…</span>
          : <Button key={n} size="sm" variant={n === page ? "brand" : "ghost"} className="min-w-8 px-2" aria-current={n === page ? "page" : undefined} aria-label={`Page ${n}`} onClick={() => onPage(n)}>{n}</Button>)}
        <Button size="icon-sm" variant="ghost" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight /></Button>
      </div>
      <Select value={String(pageSize)} onValueChange={(v) => onSize(Number(v))}>
        <SelectTrigger className="w-[130px]" aria-label={sizeLabel}><SelectValue /></SelectTrigger>
        <SelectContent>{sizes.map((n) => <SelectItem key={n} value={String(n)}>{n} per page</SelectItem>)}</SelectContent>
      </Select>
    </nav>
  );
}
