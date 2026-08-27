<div align="center">

# Augur

**A portable, in-product feedback module.**
One well-timed question, three answers, an optional line.

</div>

Augur asks the user a single question at a real moment in your product — *"Did that
go the way you expected?"* — takes one of three answers and an optional line, then
gets out of the way. It is not a form builder, not an NPS widget, not a survey tool.
It exists to catch honest reactions at the moment they happen, without ceremony.

Distribution is **copy the folder**. No npm install, no build step, no service to
run. Drop `augur/` into your React app, pick where the data goes, mount it once.

---

## Three-step integration

**1. Copy** the [`augur/`](./augur) folder into your `src/`.

**2. Pick a store** — the one seam between Augur and your database:

| Store | Backend | Use |
|---|---|---|
| `LocalStore` | `localStorage` | demo / dev, single device |
| `SupabaseStore(client)` | Supabase | run [`sql/schema.sql`](./sql/schema.sql) once |
| `HttpStore({endpoint})` | your API | you implement the routes |

Or write your own to the `AugurStore` interface in [`augur/store.ts`](./augur/store.ts).

**3. Mount once and emit** — the whole integration is two lines:

```tsx
import { Augur, augur } from "./augur";

// declare the trigger in your config…
"checkout.done": { enabled: true, version: 1, delayMs: 3000,
  maxAsks: 1, dismissKill: 2, question: "Did that go through as expected?" }

// …mount once, high in the tree…
<Augur userId={session.user.id} store={store} config={MY_TRIGGERS} />

// …and emit where the action completes. Fire-and-forget; caps decide if it shows.
await placeOrder(cart);
augur.emit("checkout.done");
```

See [`example/usage.tsx`](./example/usage.tsx) for a complete file.

---

## What you get

- **Response types** — `choice3` (Yes · Not really · Not sure — the default, and the
  only one that rolls into the summary), `choice` (2–5 custom options), and `text`.
  Deliberately closed: no ranking, matrix, NPS, or star ratings. That is the line
  between a feedback prompt and a form builder, and Augur stays on the near side.
- **Caps, enforced locally** — one prompt per session, one per user per N days, quiet
  for N days after any answer, plus per-trigger lifetime and dies-after-N-ignores.
  Per-device and best-effort by design (no user history is ever read back); the
  analytics stay exact.
- **Testing mode** — a switch in admin that keeps every prompt visible so you can try
  the flow, while recording nothing: no events, no counts, no manual-button clicks. QA
  in testing, flip to live when you're ready, and your own clicks never skew the data.
- **Unconfigured emits are caught** — an `emit()` with no config entry is logged and
  surfaced in admin instead of vanishing silently, the most common integration slip.
- **Theme-aware, self-contained** — the snackbar reads your `--k-*` CSS variables
  with sane fallbacks, so it inherits your look and still renders fine where none
  are defined. No external assets, no fonts, no network.

## Admin (optional)

Mount `<AugurAdminSection store={store} hostConfig={MY_TRIGGERS} />` behind your own
route and guard. Two tabs: **Results** (a plain-sentence summary, a per-trigger
table, and the notes) and **Settings** (reword questions and answer labels, tune caps
and timing, **Show preview** to see a prompt at real width — previews are never
counted — and a master switch). The route, the
admin check, and the 404 are yours — Augur ships the section, not the page.

Skip the admin import entirely and collection still works, with a smaller bundle.

## Branding & attribution

Augur is free, and stays free, on one condition: the small **"by Augur"** byline at
the foot of every prompt — and its link to this repo — **must stay visible**. It is
not a config toggle; it always shows. Removing, hiding, or altering it requires a
commercial license (see [LICENSE](./LICENSE)).

What you *do* own is your **feedback entry point** — the floating "Feedback" button
and its icon. Restyle or replace that freely. If you want to swap the placeholder
Augur mark used elsewhere for your own artwork, drop it in [`branding/`](./branding)
and edit [`augur/mark.tsx`](./augur/mark.tsx) — but leave the byline lockup and its
link intact. See [`branding/README.md`](./branding/README.md).

## Remove it

Delete the `augur/` folder, the one `<Augur/>` mount, your `emit()` calls, and drop
the tables. Nothing else references it.

---

## Design principles

1. **One question, one moment.** Sampling, not surveying.
2. **The three-way answer is for prompts the product initiates.** Free text is for
   prompts the user initiates (the persistent button).
3. **Never render a zero where nothing was measured.** A dash, not a `0`.
4. **Adding or removing a trigger is a code change**, because it needs an `emit()` in
   your source. Everything else — wording, caps, enable/disable — is tunable in admin
   without a deploy.

## License

Free to use, including commercially, **provided the "by Augur" attribution stays
visible** (see Branding above). Source-available, not OSI open-source. Full terms in
[LICENSE](./LICENSE). © 2026 Krishnachandran Ramachandran ([kaezee](https://github.com/kaezee)).
