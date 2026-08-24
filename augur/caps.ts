// The cap engine (AUGUR-HANDOFF §5.3). Enforced LOCALLY per user — the store
// exposes no way to read a user's history (events have no user-select), and
// keeping caps local is what makes the module portable across any backend.
// Consequence: caps are per-device, best-effort. Analytics stay exact (every
// shown/ignored/answered is still logged); only *enforcement* is local.

import type { AugurConfig } from "./config";

const DAY = 86_400_000;

interface TriggerCap { asks: number; dismisses: number }
interface CapState { lastPromptAt?: number; lastAnswerAt?: number; triggers: Record<string, TriggerCap> }

let sessionShown = 0;   // per-session, in-memory — reset on reload by design

const key = (userId: string) => `augur.caps.${userId}`;

function read(userId: string): CapState {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return { triggers: {} };
    const s = JSON.parse(raw) as CapState;
    return s && typeof s === "object" ? { ...s, triggers: s.triggers ?? {} } : { triggers: {} };
  } catch { return { triggers: {} }; }
}
function write(userId: string, s: CapState) {
  try { localStorage.setItem(key(userId), JSON.stringify(s)); } catch { /* private mode etc. */ }
}

// May this trigger be shown right now? Applies, in order: module/trigger enabled,
// per-session, per-user window, suppress-after-answer, lifetime asks, dismiss-kill.
export function canShow(userId: string, triggerId: string, cfg: AugurConfig, now = Date.now()): boolean {
  if (!cfg.enabled) return false;
  const t = cfg.triggers[triggerId];
  if (!t || !t.enabled) return false;
  if (sessionShown >= cfg.caps.perSession) return false;
  const s = read(userId);
  if (s.lastPromptAt && now - s.lastPromptAt < cfg.caps.perUserDays * DAY) return false;
  if (s.lastAnswerAt && now - s.lastAnswerAt < cfg.caps.suppressAfterAnswerDays * DAY) return false;
  const tc = s.triggers[triggerId] ?? { asks: 0, dismisses: 0 };
  if (tc.asks >= t.maxAsks) return false;
  if (tc.dismisses >= t.dismissKill) return false;
  return true;
}

export function recordShown(userId: string, triggerId: string, now = Date.now()) {
  sessionShown += 1;
  const s = read(userId);
  s.lastPromptAt = now;
  const tc = s.triggers[triggerId] ?? { asks: 0, dismisses: 0 };
  tc.asks += 1;
  s.triggers[triggerId] = tc;
  write(userId, s);
}

export function recordAnswered(userId: string, now = Date.now()) {
  const s = read(userId);
  s.lastAnswerAt = now;
  write(userId, s);
}

// An "ignore" (Patch 2 §6.2) is any non-answer — an explicit close or a timeout.
// dismissKill counts them; the ledger field keeps its name for local back-compat.
export function recordIgnored(userId: string, triggerId: string) {
  const s = read(userId);
  const tc = s.triggers[triggerId] ?? { asks: 0, dismisses: 0 };
  tc.dismisses += 1;
  s.triggers[triggerId] = tc;
  write(userId, s);
}

// Test hook — clears the in-memory session counter between cases.
export function __resetSession() { sessionShown = 0; }
