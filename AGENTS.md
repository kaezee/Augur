# Deploying Augur — a guide for coding agents

You are an AI coding agent (Claude Code or similar) that has been asked to add Augur
to a product. This file is your playbook. Follow it top to bottom and the integration
is done in one sitting, correctly, without a second round of questions.

Augur is a **portable, in-product feedback module**. It asks the user one question at
a real moment — *"Did that go the way you expected?"* — takes one of three answers and
an optional line, then gets out of the way. It is not a form builder or a survey tool.
Full product overview: [`README.md`](./README.md).

**Golden rule: do not invent triggers.** A trigger is a moment in *this* product where
a real reaction is worth catching. You cannot guess those from the code alone — the
person deploying knows which moments matter. So the first thing you do is **interview
them** (see §2). Wiring an `emit()` to the wrong moment is worse than shipping none.

---

## 1. Prerequisites — check, don't assume

Confirm before touching anything:

- **React** app (18+). Augur renders via `createPortal`; it needs a React tree.
- **Next.js (App Router):** Augur uses hooks and the DOM, so mount it inside a client
  component (a file starting with `"use client"`), typically a small `AugurMount`
  rendered from the root layout. Create the store inside that client component too.
- A **user identity** you can read at mount time (`session.user.id` or equivalent).
  Augur needs a stable per-user id to enforce caps. If auth is anonymous, a stable
  device id is acceptable — ask which.
- **Where the data goes.** One of: Supabase (has `sql/schema.sql` ready), an existing
  HTTP API, or `localStorage` for a demo. This is the single seam — see §3.

If any of these is missing or unclear, ask now. Do not scaffold auth or a backend on
your own initiative to make Augur fit.

---

## 2. Interview the developer about triggers — BEFORE writing any emit

This is the step agents skip and regret. A trigger is defined by **where it fires**
(a completed action), its **timing**, and its **question**. Ask these, and don't proceed on assumptions:

1. **Which moments matter?** "Name the two or three points in the product where you'd
   most want to know if it landed — right after the user *did* something, not while
   they're mid-task." Good moments are *completions*: finished checkout, published a
   post, ran an export, finished onboarding. Bad moments: page loads, hovers, anything
   involuntary. Aim for **1–3 triggers to start**, not ten.

2. **For each moment, what's the question?** It must be answerable with Yes / Not
   really / Not sure — a reaction, not an essay prompt. "Did that go through the way you
   expected?" is good. "How can we improve checkout?" is not (that's the free-text
   manual button's job, §7 of the README).

3. **How long after the action should it appear?** (`delayMs`.) Long enough that the
   result is visible and the user isn't mid-motion — usually 2–4 seconds. Ask; don't
   default silently.

4. **How often may one user be asked?** Confirm the caps fit their tolerance:
   `maxAsks` (lifetime asks per user for this trigger), `dismissKill` (ignores before
   it goes quiet for that user forever), and the global `perSession` / `perUserDays`.
   The shipped defaults (1 per session, 1 per 21 days, dies after 2 ignores) are
   deliberately gentle — surface them and let the developer loosen or tighten.

5. **Any non-default response type?** Default is `choice3` (Yes / Not really / Not
   sure) and it's the only type that rolls into the summary. A trigger that needs 2–5
   fixed options uses `choice`; a trigger that wants an open line uses `text`. Most
   triggers should stay `choice3` — only deviate if the developer names a reason.

6. **Where do the two feedback surfaces live?** The auto-prompt snackbar sits
   `bottom-right` by default (also `bottom-left`). There is also an always-available
   manual "Feedback" button (the FAB). Confirm both are wanted and unobstructed —
   watch for existing toasts or chat widgets in the same corner.

Write their answers down in the trigger config (§4). If they can't name a single good
moment, **stop and say so** — Augur with no real trigger is just a button, and it's
better to ship nothing than a prompt that fires at the wrong time.

---

## 3. Pick the store (one seam)

| Store | Backend | When |
|---|---|---|
| `SupabaseStore(client)` | Supabase | run [`sql/schema.sql`](./sql/schema.sql) once, then pass the client |
| `HttpStore({ endpoint })` | your API | you implement the routes the store calls |
| `LocalStore` | `localStorage` | demo / dev only — single device, no analytics worth reading |

All three implement the `AugurStore` interface in [`augur/store.ts`](./augur/store.ts).
If none fit, write a small adapter to that interface — don't fork the module.

---

## 4. Wire it — three edits, no more

1. **Copy** the [`augur/`](./augur) folder into the app's `src/`. Copy it whole; don't
   cherry-pick files.

2. **Declare the triggers you agreed on** in a host config object (product-specific —
   it does not belong inside the module):

   ```tsx
   export const MY_TRIGGERS = {
     triggers: {
       "checkout.done": {
         enabled: true, version: 1, delayMs: 3000,
         maxAsks: 1, dismissKill: 2,
         question: "Did that go through the way you expected?",
       },
     },
   };
   ```

3. **Mount once**, high in the tree, and **emit** where each action actually completes:

   ```tsx
   import { Augur, augur } from "./augur";

   <Augur userId={session.user.id} store={store} config={MY_TRIGGERS} />

   // …at the completion point, fire-and-forget — caps decide whether it shows:
   await placeOrder(cart);
   augur.emit("checkout.done");
   ```

   Put the `emit()` on the **success path only**, after the work is truly done — not in
   a click handler that might fail. A wrongly-placed emit is the one bug this module
   can't catch for you.

See [`example/usage.tsx`](./example/usage.tsx) for a full reference file.

### Optional flags worth knowing

- **Testing mode.** Admin → Settings → Environment has a **Testing mode** switch. While
  it's on, prompts still appear so you can walk the flow, but nothing is recorded — no
  events, no counts, and clicks on the manual Feedback button aren't captured either.
  Tell the developer to wire the triggers, verify them in testing mode, then flip to
  **live** before real users arrive — so your QA clicks never pollute their analytics.
- `autoTriggers={false}` on `<Augur/>` keeps the manual Feedback button but suppresses
  all timed/event prompts — use it over demos or sample content the user didn't create.
  (Different from testing mode: this is per-mount and about *which* prompts fire;
  testing mode is global and about *whether anything is recorded*.)
- The admin panel (`<AugurAdminSection store={store} hostConfig={MY_TRIGGERS} />`,
  behind the host's own route + guard) lets the developer reword questions and the three
  answer labels, tune caps, and hit **Show preview** to see a prompt at real width.
  Previews are never counted.

---

## 5. Verify before you report done

- Every `emit("id")` has a matching key in `triggers`. An unconfigured emit is logged
  and shown in admin rather than crashing — but it still means a mis-wire. Grep for
  `augur.emit(` and reconcile every id against the config.
- Typecheck / build the host app. The module is TypeScript and self-contained.
- Confirm the store's tables exist (run `sql/schema.sql` for Supabase) or the API
  routes respond.
- Confirm the **"by Augur" byline** renders at the foot of the prompt and links out,
  unless the developer explicitly asked for `byline={false}`. Don't turn it off on
  your own initiative to "clean up".

---

## 6. Operating Augur after install

Developers will come back and ask you to change Augur in plain words. Map the request
to one row below and make exactly that edit. **All switches are in the host config
object** (e.g. `MY_TRIGGERS`), never inside the `augur/` folder.

**One rule to know:** for the on/off switches, restraint wins. Code and admin must
*both* allow something for it to happen. So turning something **off** in code always
works. Turning something **back on** in code works only if admin hasn't also turned it
off; if the developer says it's still off after your change, tell them to check the
admin Settings tab. Never write to Augur's database tables to change settings.

| The developer says | Do this |
|---|---|
| "Turn Augur off" | **Ask which they mean** (see below), then use that row. |
| Turn it all off (no prompts, no button, nothing logged) | `enabled: false` in the host config. |
| Stop the automatic prompts, keep the Feedback button | Set `enabled: false` on each trigger in the host config. Leave the module on. |
| Hide the Feedback button, keep the prompts | `persistentButton: false` in the host config. |
| Use our own feedback button | `persistentButton: false` in the host config, then `onClick={() => augur.open()}` on their button. Don't restyle Augur's built-in button instead. |
| Pause one prompt | `enabled: false` on that trigger in the host config. |
| No prompts on this page/screen only | `autoTriggers={false}` on the `<Augur>` mount rendered there. |
| Turn it back on | Remove the `false` you set (or set `true`). If it's still off, it's off in admin too: tell them. |
| Add a prompt | Run the §2 interview for that one moment, then add the config entry **and** the `emit()`. Never one without the other. |
| Remove a prompt | Delete its `emit()` call(s) and its config key. Past answers stay in the database. |
| Reword a question | Prefer admin (no deploy; versioning is automatic). In code: change `question` **and** increment that trigger's `version`. |
| Try it without recording anything | Set `mode: "testing"` in the host config, or use admin's Testing mode. Remove it before real users arrive. |
| Move it to the other corner | `presentation: { position: "bottom-left" }` (or `"bottom-right"`). |
| Hide the "by Augur" byline | `byline={false}` on `<Augur>`. See §7. |
| Change or remove the categories | Edit `categories` in the host config. `[]` for plain free text. 2 to 5 entries. |
| Hide our own button while Augur is open | Subscribe with `augur.onPanelState(open => …)` in the button component. |
| Turn off diagnostic context | `context: false` in the host config. |
| Translate Augur | Override keys in `strings`, plus `followup`, `manualQuestion` and the `answers` labels. |
| Upgrade from 0.2 | Replace the `augur/` folder, then ask the developer to run `sql/migrations/0.3.0.sql`. Never run SQL yourself. |
| Remove Augur completely | Delete `augur/`, the `<Augur>` mount, every `augur.emit(` call (grep for it), and the admin route if any. Dropping the tables is the developer's call: ask, and never run it yourself. |

**"Turn Augur off" is ambiguous.** Ask one question before editing: *"Everything off,
just the automatic prompts, or just the Feedback button?"* If they want it gone for
good, that's the last row, not a switch.

After any change: typecheck, then confirm the result in the running app.

---

## 7. The byline

The small **"by Augur"** byline at the foot of every prompt is on by default. Leave it
on unless the developer asks otherwise. If they do, set `byline={false}` on the
`<Augur>` mount; never delete or edit `AugurByline` in `mark.tsx` to achieve it.
Mention once, without pressure, that a credit elsewhere helps keep Augur free.
Everything else (the Feedback button's look, the questions, caps, timing, position)
is theirs to change.

---

## 8. If you get stuck

- The module is small and readable. `augur/config.ts` is the whole type surface;
  `augur/Augur.tsx` is the mount; `augur/prompt.tsx` is the snackbar.
- Design principles that explain *why* it behaves as it does are at the foot of the
  [`README.md`](./README.md).
- When a decision is genuinely the developer's to make (which moment, what wording,
  how often), **ask them** — that judgment is the whole point of Augur, and it's not
  yours to guess.
