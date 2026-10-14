# Changelog

Augur is distributed by copying the `augur/` folder. Each entry says what changed and
what to run when upgrading.

## Unreleased

- **`AUGUR_VERSION`**, exported from `augur/`, is shown at the bottom of the admin
  panel and sent as `augurVersion` in each report's diagnostic context, so a bug
  report can say which Augur it came from.
- **Admin:** "1 trigger declared" instead of "1 triggers declared".
- **Panel:** Send looks unavailable (faded, not-allowed cursor) until something is typed; it was
  already disabled but looked clickable.
- **Accessibility:** closing the panel opened from the built-in button returns focus to that
  button (it was lost while the button was hidden). The "by Augur" credit no longer fades its
  text, so it keeps the host's secondary-text contrast. Admin's date-range and purge selects
  have accessible names.
- **Send only says thanks when the note is stored.** The panel and a prompt's follow-up
  line show "Sending…", then "Thanks" once the store's write resolves. If it fails, the
  text stays, an error says it didn't send, and Send tries again. Before, "Thanks"
  showed even when the write failed and the note was lost. Custom stores: let
  `submit()` and `logNote()` reject on failure (AGENTS.md §3). New strings: `sending`,
  `sendFailed`.
- **AGENTS.md: the agent proposes placements.** §2 now has the agent audit the app:
  map the jobs, find the success paths, pick one to three moments, write questions
  that name the action with Yes as the good answer, suggest friction labels, and place
  the Feedback button around tab bars and floating buttons on phones. It brings one
  plan to approve, instead of asking the developer to come up with the moments.
- **README: Get told when feedback lands.** Server-side pings for Supabase (Database
  Webhook + Edge Function), Firestore (Cloud Function) and HttpStore.
- **Target size (WCAG 2.5.5, AAA):** every control in the prompt, panel, feedback button,
  Admin and console is at least 44×44px. The close ✕ is a 44px square; the "Add to your
  product" pill keeps its size inside a 44px-tall link. In Admin settings the ▲/▼ that opens
  a question's editor is now a button (it only worked with a mouse), the on/off checkbox on
  each question has a name, and the editor's labels are tied to their fields.
- **Admin that holds up as feedback grows:**
  - The Results headline names the question with the highest share of "Not really"
    (e.g. *Most "Not really": "Was recording that moment easy?", 6 of 20 answers (30%)*)
    instead of adding Yes / Not really / Not sure across different questions.
  - Notes load 50 at a time with **Load more**; category and unread filters run in the
    store. `readNotes()` takes `{ category, before, limit }`; without `limit` it returns
    everything, as before.
  - New optional `readSubmissionStats(range)`: the by-category and by-entry-point tallies
    are counted by the store, so paging can't undercount them. Local and Supabase
    stores implement it; stores without it fall back to the loaded notes.
  - An index on `augur_events (shown_at)` backs the date-range counts.
- **Friction from the keyboard:** Enter or Space on a labelled control counts as a press, so
  keyboard users' repeated presses are recorded too; a held-down key counts once.
- **Live demo** at https://kaezee.github.io/Augur/: a sample task board running the
  real module, with a live feed of what Augur records. Also new since 0.4.0: README
  privacy section, gallery frames 3 and 4, SECURITY.md, CONTRIBUTING.md.

Upgrading from 0.4: replace `augur/` and run `sql/migrations/0.5.0.sql`. Callers of
`augur_admin_notes(p_unread_only)` keep working unchanged.

## 0.4.0

- **Friction:** label controls with `data-augur="…"`. Three presses on the same label
  within a second is recorded quietly (label, page path, press count; never element
  text or input; at most 20 per session). Admin's Results gains a Friction table: bursts,
  people, most common page, last seen. `friction: false` turns it off. No listener runs
  when Augur is off, and testing mode records nothing.
- **Store:** optional `logFriction()` and `readFriction()`; Local, Supabase and HTTP
  stores implement them. Stores without them simply skip friction.
- **Database:** new `augur_friction` table and `augur_log_friction()` /
  `augur_admin_friction()`, not callable by signed-out visitors. `augur_admin_purge()`
  also clears old friction rows.
- **Words:** the automatic prompts are called triggers / triggered prompts throughout
  (no more "moments"). README gallery images use a card per text block.

Upgrading from 0.3: replace `augur/` and run `sql/migrations/0.4.0.sql`.

## 0.3.0

Augur can now be your product's only feedback button.

- **Categories:** the button's panel asks "What's on your mind?" with Something
  broke / confusing / missing, then a line. Configurable (2 to 5, optional
  placeholder each), or `categories: []` for plain text. Optional `moreLink`.
- **Diagnostic context** with each button submission: page path, app version
  (new `appVersion` prop), viewport, browser, entry point and the last 5 errors.
  Never query strings, never what people typed. `context: false` turns it off;
  `ignoreErrorSources` drops noisy scripts.
- **Your own button:** `augur.open(source)` (default `"button"`), `augur.close()`
  and `augur.onPanelState()`.
- **Every string configurable** through `strings`, merged per key.
- **Accessibility:** announced prompts, triggered prompts never take focus, the panel takes
  focus and returns it, Esc everywhere, visible focus rings.
- **Security:** Augur's database functions are no longer callable by signed-out
  visitors.
- **Store:** new required `submit()`. The button's panel writes once on Send
  (nothing if closed), replacing the shown → outcome → note sequence, so admin's
  shown/ignored totals no longer include button opens. Pre-0.3 button rows
  (`manual`) are counted with `button`.
- **Admin:** submissions by category and entry point, a category filter, and each
  submission's context in plain words.
- The button's panel no longer auto-closes after 20 seconds (triggered prompts still do).
- Dev: `package.json`, `tsconfig.json` and CI (typecheck + tests). `augur/` itself
  still has no dependencies.

Upgrading from 0.2: replace `augur/` and run `sql/migrations/0.3.0.sql`.

## 0.2.0

- License changed to MIT; the name and mark are covered by `TRADEMARKS.md`.
- `byline` prop: `<Augur byline={false} />` hides the "by Augur" credit.
- On/off switches: code and admin must both allow something (restraint wins); admin
  shows code-locked switches and never writes them back. With the module off, no
  button shows and nothing is logged.
- `augur.open()` lets your own button open the feedback prompt.
- README gallery images; `AGENTS.md` operations guide.

## 0.1.0

- First release, under the original Augur License: triggered prompts with `choice3`,
  `choice` and `text` responses, local caps, testing mode, unconfigured-emit
  logging, the admin section, and Local, Supabase and HTTP stores.
