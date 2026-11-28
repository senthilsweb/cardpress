# Adding an ornament

An ornament is the small drawing between a greeting's headline and its message (**Design → Ornament**). Any file in `web/src/card/ornament/` is picked up at build time; there is no list to edit.

## Steps

1. Copy `web/src/card/ornament/2-divider.tsx` to `web/src/card/ornament/<number>-<name>.tsx`.
2. Change `id`, `name` and the `render` body.
3. Run `make dev` (hot reload) or `make build`.

## The definition

```tsx
import type { OrnamentDef } from "../ornamentkit";

const def: OrnamentDef = {
  id: "divider",
  name: "Plain divider",
  occasions: ["Diwali"], // optional
  render: ({ colour }) => <path d="M30 15 H240" fill="none" stroke={colour} strokeWidth={2.4} />,
};
export default def;
```

| Field | Use |
|---|---|
| `id` | Saved on the card. Letters, digits, `.`, `_`, `-`, up to 64. Not `none`. Renaming it puts the heart flourish on cards that used it |
| `name` | Shown under the preview |
| `occasions` | Background groups it suits (`Thanksgiving`, `Diwali`, `New Year`, `Chinese New Year`): listed first for such a card |
| `render` | SVG elements in a **270 × 30** box. Draw only in `colour`, which follows the card's palette |

Files whose name starts with `_` are ignored, and the number in front sets the order. Draw the art yourself, or use art whose licence allows it to be shared.
