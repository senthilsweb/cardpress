import { useId, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/*
 * What every settings form is made of, so that they look and answer alike: sections, one bar with Cancel and Save, and
 * a message saying whether it worked.
 */

/** A group of fields under a heading. `optional` says it may be left empty. */
export function FormSection({ title, optional, about, children }: { title: string; optional?: boolean; about?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <Card role="group" aria-labelledby={id}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle id={id}>{title}</CardTitle>
          {optional && <Badge variant="outline">Optional</Badge>}
        </div>
        {about && <CardDescription>{about}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

/** The foot of a form: what is wrong or unsaved, Cancel (which puts back what was saved) and Save. */
export function SaveBar({ dirty, busy, problem, label = "Save", onSave, onCancel, extra }: {
  dirty: boolean;
  busy?: boolean;
  /** Why it cannot be saved, or why saving failed. */
  problem?: string | null;
  label?: string;
  onSave: () => void;
  onCancel: () => void;
  /** Another action of the page, beside the two. */
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {problem
        ? <p role="alert" className="mr-auto min-w-0 text-xs text-destructive">{problem}</p>
        : <span className="mr-auto text-xs text-muted-foreground" aria-live="polite">{dirty ? "Unsaved changes" : ""}</span>}
      {extra}
      <Button type="button" size="sm" variant="cancel" disabled={!dirty || busy} onClick={onCancel}>Cancel</Button>
      <Button type="button" size="sm" variant="brand" disabled={!dirty || busy} onClick={onSave}>{busy && <Loader2 className="animate-spin" />} {label}</Button>
    </div>
  );
}

export const reason = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/** Do something and say whether it worked. Resolves to why it did not, or undefined when it did. */
export async function attempt(work: () => Promise<unknown>, done: string, failed: string): Promise<string | undefined> {
  try {
    await work();
    toast.success(done);
    return undefined;
  } catch (e) {
    toast.error(failed, { description: reason(e) });
    return reason(e);
  }
}
