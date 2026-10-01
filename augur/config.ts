// Augur config — universal defaults live here; the host supplies its own triggers.
// Nothing product-specific belongs in this module (moment.first is Kronicler's).

export type Answer = "yes" | "not_really" | "unclear";

// Patch 2 §4: a closed set of response shapes, never a form builder.
// choice3 is the ONLY type that rolls into the summary; choice/text are per-trigger.
export type ResponseType = "choice3" | "choice" | "text";

export interface TriggerDef {
  enabled: boolean;
  version: number;      // bump when the question wording changes; answers stamp it
  delayMs: number;      // fire this long after the completed action
  maxAsks: number;      // lifetime asks per user for this trigger
  dismissKill: number;  // ignores before this trigger dies for a user, permanently
  question: string;
  followup?: string;    // the second-step prompt; falls back to the base default
  responseType?: ResponseType;                 // default choice3
  options?: { key: string; label: string }[];  // choice only: 2–5 single-select
}

export interface Presentation {
  position: "bottom-right" | "bottom-left";
}

export interface AnswerOption { key: Answer; label: string; aria?: string }

// The button's panel (person-initiated feedback only; moments keep their own
// question). 0 categories = plain free text; otherwise 2–5 with unique keys.
// `placeholder` is optional per category and falls back to strings.textPlaceholder.
export interface Category { key: string; label: string; placeholder?: string }
export interface MoreLink { label: string; href: string }

// What a host passes to <Augur config={…}>: any subset of the config, strings
// per key, plus its own triggers.
export type HostConfig = Partial<Omit<AugurConfig, "strings" | "triggers">> & {
  strings?: Partial<AugurStrings>;
  triggers: Record<string, TriggerDef>;
};
// Stored admin overrides: the same shape, triggers optional.
export type ConfigOverrides = Partial<Omit<HostConfig, "triggers">> & { triggers?: Record<string, TriggerDef> };

// Every visible string Augur renders, so a host can translate or reword it.
// Merged per key: override one without restating the rest. The byline is not here.
export interface AugurStrings {
  categoryQuestion: string;  // heading on the category step
  button: string;            // built-in button text
  buttonLabel: string;       // built-in button accessible name / tooltip
  promptLabel: string;       // accessible name of the prompt region
  send: string;
  skip: string;
  cancel: string;
  sent: string;
  notePlaceholder: string;   // the optional line after an answer
  textPlaceholder: string;   // the free-text box
  close: string;             // accessible name of ×
  back: string;              // accessible name of the category back control
}

export interface AugurConfig {
  enabled: boolean;
  // "testing" keeps every prompt visible so you can try the flow, but records
  // nothing — no events, no cap ledger, no manual-button clicks. Flip to "live"
  // when you're ready for real data. Off by default is "live".
  mode: "live" | "testing";
  persistentButton: boolean;                       // beta-only manual button
  manualQuestion: string;                          // the persistent button's prompt
  caps: { perSession: number; perUserDays: number; suppressAfterAnswerDays: number };
  answers: AnswerOption[];                          // the choice3 answers, forever
  followup: string;                                // "Thanks. Anything you'd change?"
  presentation: Presentation;
  categories: Category[];                          // [] = plain free text
  moreLink?: MoreLink;                             // optional "Say more" on the panel
  strings: AugurStrings;
  // Diagnostic context on person-initiated submissions (route path, app version,
  // viewport, browser, recent errors). false = no listeners, nothing sent.
  context: boolean;
  ignoreErrorSources: string[];                    // error source prefixes to drop
  triggers: Record<string, TriggerDef>;            // host-supplied
}

// Everything universal — caps, presentation, the answer enum, the follow-up.
// A host merges its `triggers` (and any overrides) over this.
export const AUGUR_BASE_DEFAULTS: Omit<AugurConfig, "triggers"> = {
  enabled: true,
  mode: "live",
  persistentButton: true,
  manualQuestion: "What would make this better?",
  caps: { perSession: 1, perUserDays: 21, suppressAfterAnswerDays: 21 },
  answers: [
    { key: "yes", label: "Yes" },
    { key: "not_really", label: "Not really" },
    // §9: short visible label so all three fit one row; full phrase stays the aria label.
    { key: "unclear", label: "Not sure", aria: "Not sure what happened" },
  ],
  followup: "Thanks. Anything you’d change?",
  presentation: { position: "bottom-right" },
  categories: [
    { key: "broke",     label: "Something broke" },
    { key: "confusing", label: "Something’s confusing" },
    { key: "missing",   label: "Something’s missing" },
  ],
  strings: {
    categoryQuestion: "What’s on your mind?",
    button: "Feedback",
    buttonLabel: "Give feedback",
    promptLabel: "Feedback",
    send: "Send",
    skip: "Skip",
    cancel: "Cancel",
    sent: "Thanks — that’s logged.",
    notePlaceholder: "one line, optional",
    textPlaceholder: "Type your feedback…",
    close: "Dismiss",
    back: "Back",
  },
  context: true,
  ignoreErrorSources: [],
};

// 0 or 2–5 categories with unique keys. One category is meaningless (a one-option
// menu), so it's treated as none; extras and duplicate keys are dropped. Warns once.
let warned = false;
export function effectiveCategories(cats: Category[] | undefined): Category[] {
  const seen = new Set<string>();
  const uniq = (cats ?? []).filter((c) => c && c.key && !seen.has(c.key) && !!seen.add(c.key));
  const out = uniq.length < 2 ? [] : uniq.slice(0, 5);
  if (!warned && (cats ?? []).length > 0 && out.length !== (cats ?? []).length) {
    warned = true;
    console.warn(`[augur] categories need 0 or 2–5 entries with unique keys; using ${out.length}.`);
  }
  return out;
}

// The default response type when a trigger doesn't set one.
export const responseTypeOf = (t: Pick<TriggerDef, "responseType">): ResponseType => t.responseType ?? "choice3";

// Merge order (AUGUR-HANDOFF §6, Patch 2 §3): base defaults ← host config ← live
// store overrides. Shallow per top-level key; triggers merge per-trigger.
//
// Restraint wins for the on/off switches: code and admin must both allow something
// for it to happen, and testing in either place means testing. Admin can pause what
// code allows; it can never revive what code turned off. See DECISIONS.md.
const both = (a?: boolean, b?: boolean) => a !== false && b !== false;

export function mergeConfig(
  host: HostConfig,
  overrides: ConfigOverrides,
): AugurConfig {
  const triggers: Record<string, TriggerDef> = { ...host.triggers };
  for (const [id, t] of Object.entries(overrides.triggers ?? {})) {
    const h = host.triggers[id];
    triggers[id] = h ? { ...h, ...t, enabled: both(h.enabled, t.enabled) } : { ...t };
  }
  return {
    ...AUGUR_BASE_DEFAULTS,
    ...host,
    ...overrides,
    enabled: both(host.enabled, overrides.enabled),
    persistentButton: both(host.persistentButton, overrides.persistentButton),
    mode: host.mode === "testing" || overrides.mode === "testing" ? "testing" : "live",
    caps: { ...AUGUR_BASE_DEFAULTS.caps, ...host.caps, ...overrides.caps },
    presentation: { ...AUGUR_BASE_DEFAULTS.presentation, ...host.presentation, ...overrides.presentation },
    strings: { ...AUGUR_BASE_DEFAULTS.strings, ...host.strings, ...overrides.strings },
    answers: overrides.answers ?? host.answers ?? AUGUR_BASE_DEFAULTS.answers,
    triggers,
  };
}

// Which switches has code turned off? Admin shows these as locked.
export function lockedInCode(host: HostConfig) {
  return {
    enabled: host.enabled === false,
    persistentButton: host.persistentButton === false,
    mode: host.mode === "testing",
    triggers: Object.fromEntries(Object.entries(host.triggers).map(([id, t]) => [id, t.enabled === false])),
  };
}
