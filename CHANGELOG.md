# Changelog

Augur is distributed by copying the `augur/` folder. Each entry says what changed and
what to run when upgrading.

## Unreleased

- **Admin:** "1 trigger declared" instead of "1 triggers declared".
- **Panel:** Send looks unavailable (faded, not-allowed cursor) until something is typed; it was
  already disabled but looked clickable.
- **Accessibility:** closing the panel opened from the built-in button returns focus to that
  button (it was lost while the button was hidden). The "by Augur" credit no longer fades its
  text, so it keeps the host's secondary-text contrast. Admin's date-range and purge selects
  have accessible names.
- **Friction from the keyboard:** Enter or Space on a labelled control counts as a press, so
  keyboard users' repeated presses are recorded too; a held-down key counts once.
- **Live demo** at https://kaezee.github.io/Augur/: a sample task board running the
  real module, with a live feed of what Augur records. Also new since 0.4.0: README
  privacy section, gallery frames 3 and 4, SECURITY.md, CONTRIBUTING.md.

No migration.

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
