# Deploying Augur — a guide for coding agents

You are an AI coding agent (Claude Code or similar) that has been asked to add Augur
to a product. This file is your playbook. Follow it top to bottom and the integration
is done in one sitting, correctly, without a second round of questions.

Augur is a **portable, in-product feedback module**. It asks the user one question at
a real moment (*"Was it easy to export that report?"*), takes one of three answers and
an optional line, then gets out of the way. It is not a form builder or a survey tool.
Full product overview: [`README.md`](./README.md).

**Golden rule: propose, don't impose.** A trigger is a moment in *this* product where
a real reaction is worth catching. Read the code and draft the placements yourself
(§2), then get the developer's yes before wiring anything. Wiring an `emit()` to the
wrong moment is worse than shipping none.

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

## 2. Audit the app, then propose where Augur asks

Don't make the developer think this up. Read the app, draft a placement plan, and
bring it to them to approve or edit. They know the product; you can see the code. A
plan they can say yes to beats a blank question like "which moments matter?".

### 2a. Map the jobs

List the screens or routes and the 3–6 jobs people come to the product to do (create
a post, log a meal, invite a teammate, export a report). The README, the nav, and the
route table usually say what the jobs are.

### 2b. Find the completion points

Each job ends somewhere in the code. Look for the success path of a mutation:

- the line after an awaited save, create, submit, publish, upload, export, import,
  invite, payment or sync call resolves
- success toasts and snackbars (`toast.success`, `showSnackbar`, `enqueueSnackbar`, …)
- navigation that happens because something finished (`navigate(...)`
  after a mutation, or `router.push` to a "done" or detail page)
- the last step of an onboarding or setup flow

Never a page load, a click handler before the work resolves, or an error branch.

### 2c. Pick 1–3 moments

Score each candidate on three things and take the top one to three:

| | Ask when… | Skip when… |
|---|---|---|
| **Matters** | it's a core job, or new and unproven | it's a settings toggle or a trivial action |
| **Often enough** | a typical user reaches it within a week | it happens once a year |
| **Could go wrong** | multi-step, async, slow, or has had bugs | it's instant and can't fail |

Don't ask on sign-in, during payment, on error screens, or in a user's first minute
before they've done anything. For screens with sensitive data (health, money, kids),
propose `autoTriggers={false}` there and let the developer decide.

### 2d. Write the question

The answers are Yes / Not really / Not sure, so write the question so that **Yes is
the good outcome** and it **names the action** the person just did:

| Good | Why the others don't work |
|---|---|
| "Was it easy to invite your teammate?" | ✗ "Did that go as expected?": expected what? It names nothing. |
| "Did your export have everything you needed?" | ✗ "Did Acme help you get that done?": it's about the product, not the action. |
| "Was it easy to log that meal?" | ✗ "Was it hard to log that meal?": then Yes is the bad answer, which reads backwards. |
| "Did the photo upload the way you wanted?" | ✗ "Was it fast and easy?": that's two questions in one. |

Keep it under ~60 characters, in the product's own words for the thing (its "post",
"entry" or "board").

### 2e. Timing and caps

- `delayMs`: after the success is visible. Use 1500–3000ms after a toast or a
  navigation settles. Never let it cover the result the person is looking at.
- The shipped caps (1 per session, 1 per 21 days, dies after 2 ignores) are gentle on
  purpose. Keep them unless the developer has a reason.
- Keep the default `choice3`. Use `choice` or `text` only for a reason you can name.

### 2f. Friction labels

Propose `data-augur="<label>"` on up to five elements where repeated presses would
mean someone is stuck: the primary button of each slow or async action (save, submit,
export, sync), "Load more", and anything that looks clickable but often isn't ready.
Use kebab-case labels that describe the action (`save-entry`, `export-pdf`) and never
include user data.

### 2g. Where the Feedback button goes

Check what's already in the corners at phone and desktop widths: bottom tab bars,
a primary floating action button, chat widgets, toasts, cookie banners.

- **Desktop or web layout, clear corner:** keep the built-in button (`bottom-right`,
  or `bottom-left` if right is taken).
- **Phone layout with a bottom tab bar or its own floating action button:** the
  built-in button will collide with them. Propose `persistentButton: false` and a
  "Send feedback" item where people look for help: the profile, settings or help
  menu, calling `augur.open("menu")`.
- **Both layouts in one app:** use the menu item everywhere, and keep the corner
  button only where it doesn't collide.

### 2h. Bring the plan, then wait

Show the developer one table and get a yes before writing code:

| Moment | Where (file:line) | Question | Delay | Why this one |
|---|---|---|---|---|
| `entry.saved` | `src/entries/save.ts:42` | "Was it easy to log that entry?" | 2000 | core job, every day, async save |

…then the friction labels, the button placement, and anything you deliberately left
out and why. Change what they change. If you can't find one moment worth asking,
say so and ship only the Feedback button. A prompt at the wrong moment is worse than
none.

---

## 3. Pick the store (one seam)

| Store | Backend | When |
|---|---|---|
| `SupabaseStore(client)` | Supabase | run [`sql/schema.sql`](./sql/schema.sql) once, then pass the client |
| `HttpStore({ endpoint })` | your API | you implement the routes the store calls |
| `LocalStore` | `localStorage` | demo / dev only — single device, no analytics worth reading |

All three implement the `AugurStore` interface in [`augur/store.ts`](./augur/store.ts).
If none fit (Firestore, say), write a small adapter to that interface. Don't fork the module.

**An adapter's writes must reject when they fail.** Augur shows "Thanks" only after
`submit()` or `logNote()` resolves. If the adapter catches its own error and resolves
anyway, people get thanked for notes that were lost. Let the backend's error
propagate (`await addDoc(...)`, no `catch`).

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
         question: "Did your order go through okay?",
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
| Add a prompt | Run §2 for that one moment (find the success path, write the question, propose it), then add the config entry **and** the `emit()`. Never one without the other. |
| "Where should we ask?" / "Audit our placements" | Run §2 against the current code, compare it with the triggers already declared, and bring back one table: keep, move, add, remove. Change nothing until they agree. |
| "Tell me when feedback comes in" | A notification has to come from the server, never the browser. Follow README → *Get told when feedback lands* for their store, and ask where it should go (email, Slack, …). Don't put webhook URLs or keys in client code. |
| "Go through the feedback" | Read the notes with the admin reads (`readNotes`, `readSubmissionStats`) or the developer's database, then group them by category and screen, flag anything that looks like a bug (recent errors in `context`), and propose what to fix first. Mark notes read only if they ask. |
| Remove a prompt | Delete its `emit()` call(s) and its config key. Past answers stay in the database. |
| Reword a question | Prefer admin (no deploy; versioning is automatic). In code: change `question` **and** increment that trigger's `version`. |
| Try it without recording anything | Set `mode: "testing"` in the host config, or use admin's Testing mode. Remove it before real users arrive. |
| Move it to the other corner | `presentation: { position: "bottom-left" }` (or `"bottom-right"`). |
| Hide the "by Augur" byline | `byline={false}` on `<Augur>`. See §7. |
| Change or remove the categories | Edit `categories` in the host config. `[]` for plain free text. 2 to 5 entries. |
| Hide our own button while Augur is open | Subscribe with `augur.onPanelState(open => …)` in the button component. |
| Turn off diagnostic context | `context: false` in the host config. |
| Find where people get stuck / track a slow button | Add `data-augur="<short-label>"` to that element in the host's markup (e.g. `data-augur="save-entity"`). Labels are kebab-case, describe the action, never contain user data. Admin's Results shows repeated-press bursts per label. |
| Turn off friction | `friction: false` in the host config. |
| Translate Augur | Override keys in `strings`, plus `followup`, `manualQuestion` and the `answers` labels. |
| Upgrade Augur | Replace the `augur/` folder, then ask the developer to run each `sql/migrations/*.sql` newer than their version, in order (0.3.0, 0.4.0). Never run SQL yourself. |
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
