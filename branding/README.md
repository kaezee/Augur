# Branding

These are the Augur brand assets — `augur.svg` (the wordmark) and `augur-mark.svg`
(the icon-only eye-in-triangle). They're inlined into
[`../augur/mark.tsx`](../augur/mark.tsx) as `currentColor` SVGs so they tint with the
surrounding text and work in dark mode, with no asset dependency.

## What you may change

- **Your feedback button.** The floating "Feedback" control and whatever icon sits
  on it are *yours* — restyle or replace them however you like (edit the persistent
  button in `../augur/Augur.tsx`).

## What you must keep (Augur License §2)

- **The "by Augur" byline and its link** at the foot of every prompt
  (`AugurByline` in `mark.tsx`) must stay visible and functional. Don't remove,
  hide, shrink to illegibility, or re-point it. Removing it needs a commercial
  license — see [`../LICENSE`](../LICENSE).

If you have a commercial/white-label license, that's when you'd edit `AugurByline`
(and swap `AugurMark`) for your own artwork; keep everything monochrome
(`currentColor`) so it reads on any surface, light or dark.
