# Adding a background

Backgrounds are small SVG renderers. Any file in `web/src/card/bg/`, folders included, is picked up automatically at build time; there is no registry to edit and no type to extend.

## Steps

1. Copy `web/src/card/bg/waves.tsx` to `web/src/card/bg/<name>.tsx`.
2. Change `id`, `name`, `hint` and the `render` body.
3. Run `make dev` (hot reload) or `make build`. The background appears in the picker under its category.

Rules the loader applies:

- Files whose name starts with `_` are ignored. Park work in progress as `_draft.tsx`.
- The file must `export default` a `BackgroundDef`, or a list of them for variations of one theme. Anything else is skipped silently.
- A drop-in with the same `id` as a built-in replaces it.
- Drop-ins are sorted by file path, so a number in front of a file name (`1-thanksgiving.tsx`) sets the order.

## The definition

```tsx
import type { BackgroundDef, BgCtx } from "../bgkit";
import { ink } from "../bgkit";

function render({ area, u, pal, rng }: BgCtx) {
  return <g>{/* SVG */}</g>;
}
const def: BackgroundDef = { id: "waves", name: "Waves", hint: "Soft, flowing look", render };
export default def;
```

Set `dense: true` when the art is busy: the card then clears a strip behind the footer, and behind the logo where the art runs under it.

Optional `needs: "photos" | "screenshot" | "image"` shows an "add" badge until the user supplies that media.

## Categories

| Field | Use |
|---|---|
| `category` | The list it appears in, picked in the background picker (Design → Background → Browse). Without it: **Abstract** |
| `group` | A heading inside the category, for example an occasion |
| `keywords` | Other words the picker's search finds it by |
| `palette` | Id of a standard palette the picker offers with it |

A new category appears as soon as one background names it. **Seasonal greetings** lives in `web/src/card/bg/seasonal/`, one file per occasion, each exporting its variations:

```tsx
const theme = { category: SEASONAL, group: "Thanksgiving" };
const defs: BackgroundDef[] = [{ id: "maple-weave", name: "Maple weave", hint: "Interlaced autumn leaves", render: weave, ...theme }];
export default defs;
```

Seasonal art keeps its own festive colours, passed through `tone(pal, colour)` from `seasonal/_kit.ts` so they suit light and dark cards.

## What `render` receives (`BgCtx`)

| Field | Use |
|---|---|
| `area` | `{x, y, w, h}` where the art should concentrate, so the text stays readable |
| `u` | 1% of the card's short side. Size everything in multiples of `u` so it scales with every card size |
| `pal` | The active palette: `pal.base`, `pal.fade`, `pal.accent`, `pal.text`, `pal.sub`. Use these, never hard-coded colours, so the background follows every theme |
| `rng` | Seeded random generator. Use it instead of `Math.random()` so Shuffle and exports are repeatable |
| `W`, `H` | Card size in pixels |
| `mask` | `"right" \| "top" \| "bottom" \| "none"`, the side the layout fades towards |
| `uid` | Unique id for SVG `<defs>` (gradients, clip paths), so several cards on a page do not clash |
| `photos`, `screenshot`, `image` | User media, when the background declares `needs` |

Helpers from `../bgkit`: `ink(pal, alpha)` (text colour at an opacity) and `surface(pal)` (a tint slightly off the base).

## Troubleshooting

- **Not in the picker:** another category is selected, the file is outside `card/bg/`, starts with `_`, has no default export, or the dev server needs a restart.
- **Looks wrong on dark themes:** a colour is hard-coded. Use `pal` and `ink()`.
- **Changes every render:** `Math.random()` was used instead of `rng`.
