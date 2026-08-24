# Branding

Drop the Augur logo here as **`augur.svg`** (and optionally `augur-mark.svg` for
the icon-only eye-in-triangle).

The module ships a self-contained inline-SVG placeholder in
[`../augur/mark.tsx`](../augur/mark.tsx) so it renders with no asset dependency.
To use the real logo, edit that one file:

- **`AugurMark`** — the icon (rail, byline). Replace the `<path>` data with your
  `augur-mark.svg` paths. Keep `fill="currentColor"` so it tints with the text
  colour and works in dark mode.
- **`AugurByline`** — the "by Augur" wordmark at the foot of each prompt. Swap in
  your `augur.svg` wordmark here.

Every place that shows the mark imports from `mark.tsx`, so editing it updates the
rail, the admin header, and the prompt byline at once.

Keep the mark monochrome (single colour, `currentColor`) — the prompt renders on
whatever surface the host provides, light or dark.
