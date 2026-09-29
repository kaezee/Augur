# Augur — Design Decisions

Why Augur is shaped the way it is. Each entry: the decision, the reasoning, and what
it rules out — so the boundaries read as intentional, not accidental.

---

## What Augur is (and refuses to be)

**Decision.** One well-timed question, three answers, an optional line — then it gets
out of the way. Sampling, not surveying.

**Rules out.** A form builder. Augur is deliberately *not* a survey tool; the whole
point is to catch an honest reaction at the moment it happens, without ceremony.

## Response types are a closed set

**Decision.** Exactly three: `choice3` (Yes / Not really / Not sure — the only type
that aggregates into a summary), `choice` (2–5 custom single-select options), and
`text` (free text, per-trigger read only).

**Why.** Anything that isn't `choice3` can't roll into one meaningful summary line;
mixing answer shapes makes the number lie.

**Rules out — permanently.** Multi-select, ranking, matrix questions, branching, NPS
0–10, star ratings. Each is individually reasonable; together they turn Augur into
the thing it exists to avoid. NPS especially — a different instrument with different
sampling requirements.

## Silence is the primary signal → "ignored," not "dismissed"

**Decision.** The outcome enum is `shown | ignored | answered`. A 20-second
no-interaction timeout always resolves a shown prompt to `ignored`.

**Why.** Most non-answers are timeouts — the user did nothing. "Dismissed" implies a
deliberate close; "ignored" is accurate for both, and an uncounted silence is a lost
measurement.

## Never render a zero where nothing was measured

**Decision.** The admin table shows an em-dash, not `0`, for a metric that doesn't
apply to a trigger (e.g. the yes/no columns of a `text` trigger). The summary is a
plain sentence, not four numbers.

**Why.** `shown 4 · answered 0 · yes 0 · not really 0` reads as findings that all
came back zero. They aren't findings at all.

## Product-initiated vs user-initiated

**Decision.** The three-way rating is for prompts the product fires. The persistent
"Feedback" button opens a **text** box, not a rating.

**Why.** Someone who reached for the button has something specific to say; asking
them to rate a mood wastes that intent.

## Storage behind one adapter (portability)

**Decision.** Nothing in `augur/` names a table or imports a DB client except
`stores/supabase.ts`. Collection goes through the `AugurStore` interface;
`LocalStore`, `SupabaseStore`, and `HttpStore` ship. Distribution is **copy the
folder**.

**Rules out.** An npm package, a public API contract, a hosted service — building
those now means maintaining an interface for zero users. Copy-the-folder is the
distribution model on purpose.

## Auth and config are the host's, not the module's

**Decision.** Augur takes `userId: string` (never a session or auth library) and
`config` with the host's triggers. `moment.first` is a host concept; it must not
live in the module. Live overrides merge over the passed config.

## Caps are enforced locally

**Decision.** Frequency caps (per session / per user per N days / quiet after an
answer / per-trigger lifetime and dies-after-N-ignores) are enforced in
`localStorage`, per device. Analytics stay exact server-side.

**Trade-off (named).** Caps are best-effort and per-device, because events carry no
way to read a user's history back. Enforcement is local; measurement is not.

## Adding a trigger is a code change; everything else is a setting

**Decision.** Adding or removing a trigger requires an `emit()` in host source, so it
can't be an admin action. Wording, timing, caps, and enable/disable are all tunable
in the admin without a deploy (rewording auto-versions the answers).

**Consequence.** The admin UI states this, so the missing "add" button reads as a
boundary, not an oversight. An `emit()` with no config entry is logged as
**unconfigured** rather than vanishing silently.

## Writes go through SECURITY DEFINER RPCs, not raw table calls

**Decision.** `SupabaseStore` writes via `augur_log_shown/_outcome/_note/
_unconfigured`, not direct inserts/updates.

**Why (a real bug).** `augur_events` has no SELECT policy by design (analytics go
through admin functions). That silently broke direct writes: the notes-insert
ownership check couldn't see the event, and outcome updates no-oped — the tool
dropped feedback without an error. When a table is deliberately unreadable, its
writes belong in definer functions.

## Attribution is a license term, not a toggle

> **Superseded** by "Attribution is a default, not a condition" (v0.2.0).

**Decision.** The "by Augur" byline and its link are always shown and are **not** a
config option. The host's own feedback button and icon are fully themeable; the
byline is not. Removing it requires a commercial license (see [LICENSE](./LICENSE)).

**Why.** A config toggle is, by definition, removable. For a free tool, attribution
is the price, and the honest enforcement is the license — open-source code can't
prevent a fork from deleting a line, exactly as "powered-by" free tiers work.

## Attribution is a default, not a condition

**Decision.** Augur is MIT-licensed. The "by Augur" byline ships on and can be turned
off with a `byline` prop on `<Augur>`. It is deliberately not an `AugurConfig` field,
so it can't be flipped from admin; hiding it is a line in the host's source. The name
and mark are protected separately by TRADEMARKS.md.

**Why.** The custom license cost more than it protected. GitHub couldn't detect it,
company legal reviews default to no on unfamiliar licenses, and the rule was
unenforceable in practice: copy-the-folder distribution means anyone can delete the
line. Defaults do the real work. Most hosts never change them, so a default-on byline
keeps most of the visibility with none of the friction. The name, which is what
carries the project's reputation, is guarded by the trademark note instead.

## Restraint wins for on/off

**Decision.** For `enabled`, `persistentButton`, each trigger's `enabled`, and `mode`,
code and stored admin settings combine and the more restrained value takes effect:
something happens only if both allow it, and testing in either place means testing.
Admin never writes back a value that code has locked. All other settings keep the
normal order, where admin overrides code.

**Why (a real bug).** Admin's save wrote every switch into stored overrides, and
overrides were applied last, so once anyone saved in admin, turning Augur off in code
silently did nothing. That broke the one operation a developer, or their coding
agent, most needs to trust. With restraint winning, "off in code" always works, admin
can still pause things without a deploy, and neither side can accidentally switch on
what the other turned off.
