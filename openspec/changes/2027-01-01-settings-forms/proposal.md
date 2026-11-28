# A first brand of one's own, and settings forms that save the same way

**Status:** released in `v0.3.0`; deployed.

## Faults
1. A new person's brand carried the project owner's name, handle, website and logo text, and the sample card carried
   the owner's links: the built-in starting brand and card held them.
2. A new person who opened Settings before the studio saw a placeholder brand that had never been saved. Saving it
   failed ("Not saved"), because its id belonged to someone else's brand.
3. Brand look saved every brand at once, as one typed, with only a small "Not saved" when it failed.

## Fixes
- The built-in brand and sample card name nobody. A person with no brand gets one on first sign-in, named after them,
  from whichever page they land on.
- Brand look saves only the brand being edited, when **Save** is pressed.
- Brands already saved with the owner's details are **not** changed: their owners edit them under Brand look.

## Settings forms
- Every form has **Save** (or the action's own name) and **Cancel**, in the same place, and says whether it worked or
  why not. Nothing saves on its own: Appearance, Brand look and a user's role included.
- Leaving with unsaved changes asks first.
- Forms are in sections, and a section that may be left empty says **Optional**: the brand's name and type, address and
  contact among them.
- **Green** saves and confirms, **yellow** adds something new, **dark grey** cancels, red deletes, in light and dark.
- **New brand** is at the top right of Brands, as **Add user** is.

## Out of scope
The studio's own Details and Design columns, which save as one types.
