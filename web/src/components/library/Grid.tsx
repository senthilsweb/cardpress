import { Fragment } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarClock, Eye, ExternalLink, Globe, MoreHorizontal, PenLine, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatInZone } from "@/lib/jobs";
import { COLUMNS, pagePath, rowActions, rowKey, type ColumnId, type LibraryItem, type LibrarySort, type SortKey } from "@/lib/library";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export interface GridActions {
  onView: (it: LibraryItem) => void;
  /** Where Edit and, for a post, Schedule go. */
  editHref: (it: LibraryItem) => string;
  scheduleHref: (it: LibraryItem) => string;
  onBackToDraft: (it: LibraryItem) => void;
  onDelete: (items: LibraryItem[]) => void;
}

interface Props extends GridActions {
  items: LibraryItem[];
  columns: ColumnId[];
  sort: LibrarySort;
  onSort: (key: SortKey) => void;
  selected: Set<string>;
  onSelected: (next: Set<string>) => void;
  loading: boolean;
  brandName: (id: string) => string;
  thumb: (it: LibraryItem) => React.ReactNode;
  badge: (it: LibraryItem) => React.ReactNode;
  when: (iso: string) => string;
}

/** The library as a table: sortable headings, chosen columns, rows to select, and a menu on each row. */
export function Grid({ items, columns, sort, onSort, selected, onSelected, loading, brandName, thumb, badge, when, ...act }: Props) {
  const { can } = useSession();
  const shown = COLUMNS.filter((c) => columns.includes(c.id));
  const deletable = items.filter((it) => rowActions(it, can).delete);
  const allOnPage = deletable.length > 0 && deletable.every((it) => selected.has(rowKey(it)));
  const toggle = (it: LibraryItem) => {
    const next = new Set(selected);
    if (next.has(rowKey(it))) next.delete(rowKey(it)); else next.add(rowKey(it));
    onSelected(next);
  };
  const toggleAll = () => {
    const next = new Set(selected);
    for (const it of deletable) { if (allOnPage) next.delete(rowKey(it)); else next.add(rowKey(it)); }
    onSelected(next);
  };

  const heading = (label: string, key?: SortKey, className?: string) => {
    if (!key) return <th scope="col" className={cn("px-3 py-2.5 text-left font-medium", className)}>{label}</th>;
    const on = sort.sort === key;
    return (
      <th scope="col" className={cn("px-3 py-2.5 text-left font-medium", className)} aria-sort={on ? (sort.order === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => onSort(key)} className={cn("inline-flex cursor-pointer items-center gap-1 rounded hover:text-foreground", on && "text-foreground")}>
          {label}
          {on ? (sort.order === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />}
        </button>
      </th>
    );
  };

  const cell = (it: LibraryItem, id: ColumnId) => {
    switch (id) {
      case "type": return it.kind === "article" ? "Article" : "Post";
      case "status": return badge(it);
      case "when": return <span className="whitespace-nowrap">{when(it.at)}</span>;
      case "brand": return brandName(it.profileId);
      case "createdBy": return it.createdBy || "–";
      case "approvedBy": return it.approvedBy || "–";
      case "version": return it.version ? `v${it.version}` : "–";
      case "planned": return it.plannedAt ? <span className="whitespace-nowrap">{formatInZone(it.plannedAt, it.timezone)}</span> : "–";
      case "page": {
        const p = pagePath(it);
        return p ? <a href={p} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline"><Globe className="h-3.5 w-3.5" /> Page</a> : "–";
      }
      case "linkedin":
        return it.postUrl && it.status === "published"
          ? <a href={it.postUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">Open <ExternalLink className="h-3 w-3" /></a> : "–";
    }
  };

  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border bg-card", loading && "opacity-60")} aria-busy={loading}>
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="w-10 px-3 py-2.5">
              <input type="checkbox" aria-label="Select every row on this page that can be deleted" className="h-4 w-4 cursor-pointer accent-[var(--brand)]"
                checked={allOnPage} disabled={deletable.length === 0} onChange={toggleAll} />
            </th>
            <th scope="col" className="w-24 px-1 py-2.5"><span className="sr-only">Card</span></th>
            {heading("Title", "title", "min-w-[220px]")}
            {shown.map((c) => <Fragment key={c.id}>{heading(c.label, c.sort)}</Fragment>)}
            <th scope="col" className="w-12 px-3 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const a = rowActions(it, can);
            const key = rowKey(it);
            return (
              <tr key={key} onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a, input, [role=menuitem]")) act.onView(it); }} className={cn("cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/30", selected.has(key) && "bg-brand/5")}>
                <td className="px-3 py-2 align-middle">
                  <input type="checkbox" aria-label={`Select ${it.title || "Untitled"}`} className="h-4 w-4 cursor-pointer accent-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-40"
                    checked={selected.has(key)} disabled={!a.delete} title={a.deleteWhy ?? undefined} onChange={() => toggle(it)} />
                </td>
                <td className="px-1 py-2 align-middle">{thumb(it)}</td>
                <td className="max-w-[420px] px-3 py-2 align-middle">
                  <button type="button" onClick={() => act.onView(it)} className="block w-full cursor-pointer text-left">
                    <span className="block truncate font-medium hover:text-brand">{it.title || "Untitled"}</span>
                    {it.excerpt && <span className="block truncate text-xs text-muted-foreground">{it.excerpt}</span>}
                  </button>
                </td>
                {shown.map((c) => <td key={c.id} className="px-3 py-2 align-middle text-[13px]">{cell(it, c.id)}</td>)}
                <td className="px-2 py-2 text-right align-middle">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${it.title || "Untitled"}`}><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[180px]">
                      <DropdownMenuItem onSelect={() => act.onView(it)}><Eye /> View</DropdownMenuItem>
                      {a.edit && <DropdownMenuItem asChild><a href={act.editHref(it)}><PenLine /> Edit</a></DropdownMenuItem>}
                      {a.schedule && (it.kind === "post"
                        ? <DropdownMenuItem asChild><a href={act.scheduleHref(it)}><CalendarClock /> Schedule…</a></DropdownMenuItem>
                        : <DropdownMenuItem onSelect={() => act.onView(it)}><CalendarClock /> Plan a date…</DropdownMenuItem>)}
                      {a.backToDraft && <DropdownMenuItem onSelect={() => act.onBackToDraft(it)}><Undo2 /> Back to draft</DropdownMenuItem>}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem disabled={!a.delete} onSelect={() => act.onDelete([it])} className="text-destructive focus:text-destructive">
                        <Trash2 /> {a.recordOnly ? "Delete record" : "Delete"}
                        {a.deleteWhy && <span className="ml-auto pl-3 text-[11px] text-muted-foreground">{a.deleteWhy}</span>}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
