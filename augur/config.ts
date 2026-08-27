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
};

// The default response type when a trigger doesn't set one.
export const responseTypeOf = (t: Pick<TriggerDef, "responseType">): ResponseType => t.responseType ?? "choice3";

// Merge order (AUGUR-HANDOFF §6, Patch 2 §3): base defaults ← host config ← live
// store overrides. Shallow per top-level key; triggers merge per-trigger.
export function mergeConfig(
  host: Partial<AugurConfig> & { triggers: Record<string, TriggerDef> },
  overrides: Partial<AugurConfig>,
): AugurConfig {
  const triggers: Record<string, TriggerDef> = { ...host.triggers };
  for (const [id, t] of Object.entries(overrides.triggers ?? {})) {
    triggers[id] = { ...triggers[id], ...t };
  }
  return {
    ...AUGUR_BASE_DEFAULTS,
    ...host,
    ...overrides,
    caps: { ...AUGUR_BASE_DEFAULTS.caps, ...host.caps, ...overrides.caps },
    presentation: { ...AUGUR_BASE_DEFAULTS.presentation, ...host.presentation, ...overrides.presentation },
    answers: overrides.answers ?? host.answers ?? AUGUR_BASE_DEFAULTS.answers,
    triggers,
  };
}
