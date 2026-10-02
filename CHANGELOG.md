# Changelog

Augur is distributed by copying the `augur/` folder. Each entry says what changed and
what to run when upgrading.

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
