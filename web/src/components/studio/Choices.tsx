import { History, Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AS_RADIOS, choiceLabel, ofReply, open, optionText, picked, selected } from "@/lib/choices";
import type { Choice, Conversation } from "@/lib/chat";
import type { Draft } from "@/lib/draft";
import { lockReason } from "@/lib/lock";
import { useChoiceContext } from "@/lib/useChoices";
import { changeLine } from "@/lib/reply";

const KIND = { post: "Post", article: "Article" } as const;

/** One offer: radio buttons, or a drop-down when there are many. Picking shows it at once and saves nothing. */
export function OptionPicker({ choice, label, place }: { choice: Choice; label: string; place: string }) {
  const store = useChoiceContext();
  if (!store) return null;
  const at = selected(choice, store.picks);
  const name = `${place}-${choice.id}`;
  const note = (i: number) => [i === 0 ? "recommended" : "", choice.options[i].note ?? ""].filter(Boolean).join(" · ");
  if (choice.options.length > AS_RADIOS) {
    return (
      <div className="space-y-1">
        <p className="font-medium" id={`${name}-label`}>{label}</p>
        <Select value={String(at)} onValueChange={(v) => store.pick(choice, Number(v))} disabled={store.busy}>
          <SelectTrigger aria-labelledby={`${name}-label`} className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {choice.options.map((o, i) => <SelectItem key={i} value={String(i)}>{optionText(o.value)}{note(i) && <span className="text-muted-foreground"> — {note(i)}</span>}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <p className="mb-1 font-medium" id={`${name}-label`}>{label}</p>
      <RadioGroup aria-labelledby={`${name}-label`} className="gap-1" value={String(at)} onValueChange={(v) => store.pick(choice, Number(v))} disabled={store.busy}>
        {choice.options.map((o, i) => (
          <label key={i} className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-accent">
            {/* pressing the marked one again counts as a pick too */}
            <RadioGroupItem value={String(i)} className="mt-px" onClick={() => store.pick(choice, i)} />
            <span className="min-w-0 break-words">{optionText(o.value)}{note(i) && <span className="block text-[11px] text-muted-foreground">{note(i)}</span>}</span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}

/** The offer for a field of the open item, beside that field in Details. */
export function FieldChoices({ draftId, field }: { draftId: string; field: string }) {
  const store = useChoiceContext();
  const choice = store?.choices.filter((c) => c.draftId === draftId && c.field === field && open(c)).at(-1);
  if (!store || !choice) return null;
  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-2 text-xs">
      <OptionPicker choice={choice} label="Options from the assistant" place="details" />
      {store.picks[choice.id] !== undefined && (
        <div className="flex justify-end gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => store.drop([choice.id])} disabled={store.busy}>Keep as is</Button>
          <Button variant="brand" size="sm" onClick={() => void store.save(choice.messageId)} disabled={store.busy}><Save /> Save as version</Button>
        </div>
      )}
    </div>
  );
}

/** Under a reply: the options it offered, whether its change is saved, and the buttons to save or undo it. */
export function ReplyActions({ conv, messageId, drafts, onVersion, onShow }: {
  conv: Conversation; messageId: string; drafts: Draft[];
  onVersion: (draftId: string, version: number) => void;
  /** Put a changed item on the canvas. */
  onShow: (draftId: string) => void;
}) {
  const store = useChoiceContext();
  const { changes, choices } = ofReply(conv, messageId);
  if (!store || (!changes.length && !choices.length)) return null;
  const item = (id: string) => drafts.find((d) => d.id === id);
  const pending = changes.filter((c) => c.status === "pending");
  const picks = picked(choices, store.picks);
  const locked = [...pending, ...choices].map((x) => lockReason(item(x.draftId))).find(Boolean);
  const edited = pending.some((c) => (item(c.draftId)?.revision ?? c.revision) > c.revision);
  const several = new Set([...changes, ...choices].map((x) => x.draftId)).size > 1;
  const did = conv.messages?.find((m) => m.id === messageId)?.detail?.saved;
  const STANDS = { pending: "not saved", undone: "undone", passed: "changed again later", saved: "" };

  return (
    <div className="max-w-[92%] space-y-2 rounded-lg border border-border bg-card p-2.5 text-xs" aria-label="Save this reply">
      {choices.map((c) => <OptionPicker key={c.id} choice={c} place="chat" label={several ? `${KIND[c.kind]}: ${choiceLabel(c.field).toLowerCase()}` : choiceLabel(c.field)} />)}
      {changes.map((c) => {
        const saved = c.status === "saved" && c.version;
        const named = did?.find((x) => x.draftId === c.draftId);
        const line = (named && changeLine(named)) ?? `${KIND[c.kind]}: changed`;
        return (
          <div key={c.draftId} className="space-y-1">
            <p className="text-muted-foreground">
              {line}{STANDS[c.status] && ` · ${STANDS[c.status]}`}
              {item(c.draftId) && <> · <button type="button" className="cursor-pointer font-medium text-brand underline-offset-2 hover:underline" aria-label={`View the ${c.kind}`} onClick={() => onShow(c.draftId)}>View</button></>}
            </p>
            {saved && <Button variant="outline" size="sm" title="Open this version" onClick={() => onVersion(c.draftId, c.version!)}><History /> Saved: {KIND[c.kind]} v{c.version}</Button>}
          </div>
        );
      })}
      {locked && (pending.length > 0 || picks.length > 0) && <p role="status" className="text-muted-foreground">{locked}</p>}
      {(pending.length > 0 || picks.length > 0) && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {picks.length > 0 && <Button variant="ghost" size="sm" onClick={() => store.drop(picks.map((p) => p.choiceId))} disabled={store.busy}>Keep as is</Button>}
          {pending.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => void store.undo(messageId)} disabled={store.busy || edited || !!locked}
              title={edited ? "Changed since this reply" : "Put it back as it was before this reply"}><Undo2 /> Undo</Button>
          )}
          <Button variant="brand" size="sm" onClick={() => void store.save(messageId)} disabled={store.busy || (picks.length > 0 && !!locked)}><Save /> Save as version</Button>
        </div>
      )}
    </div>
  );
}
