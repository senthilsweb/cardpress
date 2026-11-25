import type { Draft } from "./draft";

/** What the person has changed in a draft and the server has not yet confirmed. */
export interface Touched { fields: Set<string>; design: Set<string> }

export const untouched = (): Touched => ({ fields: new Set(), design: new Set() });
export const anyTouched = (t: Touched) => t.fields.size > 0 || t.design.size > 0;
export const union = (a: Touched, b: Touched): Touched => ({ fields: new Set([...a.fields, ...b.fields]), design: new Set([...a.design, ...b.design]) });

/** Note what an edit changes: the fields of the patch and, for the card, only the settings that differ. */
export function note(t: Touched, before: Draft, patch: Record<string, unknown>): Touched {
  const next = union(t, untouched());
  for (const [k, v] of Object.entries(patch)) {
    if (k !== "design") { next.fields.add(k); continue; }
    const old = (before.design ?? {}) as unknown as Record<string, unknown>;
    for (const [dk, dv] of Object.entries((v ?? {}) as Record<string, unknown>)) {
      if (JSON.stringify(old[dk]) !== JSON.stringify(dv)) next.design.add(dk);
    }
  }
  return next;
}

/**
 * The server's draft with the person's unconfirmed changes laid over it: what they typed or chose wins, everything else
 * is as the server has it. Card settings are merged one by one, so a title written by the assistant survives a
 * background the person picked at the same moment.
 */
export function merge(server: Draft, local: Draft, t: Touched): Draft {
  const out = { ...server } as unknown as Record<string, unknown>;
  const mine = local as unknown as Record<string, unknown>;
  for (const f of t.fields) out[f] = mine[f];
  if (t.design.size && local.design) {
    const card = { ...(server.design ?? local.design) } as unknown as Record<string, unknown>;
    const own = local.design as unknown as Record<string, unknown>;
    for (const k of t.design) { if (own[k] === undefined) delete card[k]; else card[k] = own[k]; }
    out.design = card;
  }
  return out as unknown as Draft;
}
