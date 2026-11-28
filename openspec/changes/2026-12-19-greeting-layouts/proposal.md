# Greeting layouts

**Status:** step 1 released and deployed (2026-11-27). The other presets, art sets and templates are not built.

## Why
The card layouts are made for articles and announcements: small line, headline, subtitle, aligned left. A greeting card
is composed differently. Seasonal backgrounds give the art; the words need places of their own.

## The reference composition
A square card, everything centred:

```
┌───────────────────────────────────────┐
│ leaves                         leaves │   art frames the top corners
│            ── H A P P Y ──           │   1 lead words: small, wide spacing, a rule on each side
│                                       │
│            Thanksgiving!              │   2 headline: very large script, accent colour
│           ~~~~~~  ♡  ~~~~~~           │   3 flourish
│                                       │
│     Today and always, we are          │   4 message: 2 to 4 centred lines, plain type
│     grateful for our team and         │
│     the communities we serve.         │
│                                       │
│ pumpkins        From all of us at     │   5 sign-off: script, right of the art
│ leaves, cones   TemplrPress!          │      a short rule under it
│ ═══════════════ table ═══════════════ │   art grounds the bottom
└───────────────────────────────────────┘
```

| Part | Card field | Type |
|---|---|---|
| 1 | `eyebrow` | Label font, upper case, wide spacing |
| 2 | `headline` | Script font, sized to fit one line |
| 3 | none | Vector ornament in the accent colour |
| 4 | `subtitle` | Body font, centred, wraps |
| 5 | `signature` (**new**) | Script font |

## What changes

### Layout presets
| Preset | Composition | Best for |
|---|---|---|
| Greeting · Centred | The reference | Square, portrait |
| Greeting · Side art | Art on the left third, the stack centred in the rest | Landscape post image |
| Greeting · Framed | The stack inside a thin double frame, art outside it | Square, any quiet background |
| Greeting · Headline only | Lead words and script headline, large; no message | Story, short wishes |

- Every preset works at every size: it rearranges, and never cuts text off.
- Long text shrinks within limits, then wraps; the card shows a warning when it cannot fit.
- Logo and footer stay, quieter, and can be switched off as today.

### Fonts
A **script** font role for the headline and sign-off, with a few bundled or Google families to choose from. A card can
override it, like the other roles.

### Art with room for words
- A background says where it leaves space (`clear` area per preset), so art frames the words and does not run under
  them.
- New vector pieces: leaf corners, a harvest cluster (pumpkins, pine cone, berries), a table edge, soft light dots.
  Matching sets for Diwali (lamps, garlands), New Year and Lunar New Year.
- The reference is photographic. These are drawings. A photograph still works with every preset through **Own image**.

### Templates
The background picker offers, for an occasion, a **template**: background, layout, colours and script font together,
previewed with the person's words. Applying it never changes the words.

## Schema and server
- New card field `signature`: content schema version 4, tool schemas, field lists for options and clearing.
- The server accepts the new layout ids and the script font role.
- The greetings writer already returns `signature` in its record; once the field exists the coordinator puts it on the
  card.

## Order
1. Script font role, `signature`, **Centred** preset, one Thanksgiving art set with clear areas.
2. The other presets.
3. Art sets for the other occasions; templates in the picker.
4. Agent: `signature` on the card.

## Rules
- Reference pictures from others are never added to the repository; art is drawn here.
- Text stays readable: a soft wash behind words where art is near.

## Open questions
| Question | Suggested |
|---|---|
| Photographic art too? | Not yet: vector sets, and Own image for photographs |
| Exclamation mark and heart ornament by default? | Ornament on, with a switch; punctuation is the person's words |
| Default size for greetings | Square |
