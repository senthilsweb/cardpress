# Issue: typed text was never saved

Status: **fixed.**

## What was seen
On the deployed server: text typed in the post editor was lost when the editor was expanded, the full preview was empty, and Approve did nothing. There is no Save button; the draft saves itself.

## Cause
The editor hands each edit on with the key it was given (`<draft id>:<revision>`). The composer compared that key with the bare draft id, so no edit ever matched and every one was dropped. The saved draft stayed empty, which is what the large view, the preview and Approve all read. Posts and articles were both affected.

## Fix
`web/src/components/studio/Composer.tsx` compares with the same key it gives the editor.

## Checked
In the browser on a local server: type in a new post, the counts move and the badge says Saved; expand, the text is there; full preview shows the text and the card.

## Still open
- No automated test types into the real editor (the web tests have no browser page). Add one so this cannot return unseen.
