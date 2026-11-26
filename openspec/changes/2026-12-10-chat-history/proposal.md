# The whole conversation, reopened

**Status:** proposed. Nothing is built.

## Why
A reopened conversation shows its messages, but not all that happened in it. What the assistant did while working is lost, and a reply that failed leaves no trace although drafts may have been saved.

## What exists today
All messages, attached sources and outside agents' proposals are loaded when a conversation is opened. The history drawer lists the newest 100 and searches them.

## What changes
- Each reply keeps its **steps**, the **versions it saved**, the **check result**, any **options** offered and what was chosen.
- A failed or stopped reply is kept, with the reason.
- Opening a conversation shows all of it in order, scrolled to the end, and puts its post and article on screen.
- The history drawer loads older conversations as you scroll.

## Out of scope
Reading history back from the model service; conversations from before this change show what was stored.
