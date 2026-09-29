# Branding

These are the Augur brand assets — `augur.svg` (the wordmark) and `augur-mark.svg`
(the icon-only eye-in-triangle). They're inlined into
[`../augur/mark.tsx`](../augur/mark.tsx) as `currentColor` SVGs so they tint with the
surrounding text and work in dark mode, with no asset dependency.

## What you may change

- **Your feedback button.** The floating "Feedback" control and whatever icon sits
  on it are *yours* — restyle or replace them however you like (edit the persistent
  button in `../augur/Augur.tsx`).

## The byline

The **"by Augur"** byline and its link (`AugurByline` in `mark.tsx`) show at the foot
of every prompt by default. To hide it, pass `byline={false}` to `<Augur>`; don't
edit `mark.tsx` to do it. Keep everything monochrome (`currentColor`) if you touch
anything here, so it reads on any surface, light or dark.

## The name and mark

The assets in this folder are the Augur name and mark. The code is MIT; these are
covered by [`../TRADEMARKS.md`](../TRADEMARKS.md). Use them to credit Augur; don't use
them as your own product's logo, and don't ship a fork under the Augur name.
