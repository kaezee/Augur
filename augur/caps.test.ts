import { describe, it, expect, beforeEach } from "vitest";
import { canShow, recordShown, recordAnswered, recordIgnored, __resetSession } from "./caps";
import { AUGUR_BASE_DEFAULTS, type AugurConfig } from "./config";

// Map-backed localStorage stub for the node test env.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  __resetSession();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null, length: 0,
  } as Storage;
});

const cfg = (over: Partial<AugurConfig> = {}): AugurConfig => ({
  ...AUGUR_BASE_DEFAULTS,
  triggers: { t: { enabled: true, version: 1, delayMs: 0, maxAsks: 2, dismissKill: 2, question: "?" } },
  ...over,
});
const U = "user-1";

describe("augur caps", () => {
  it("shows a fresh trigger", () => {
    expect(canShow(U, "t", cfg())).toBe(true);
  });

  it("one prompt per session", () => {
    recordShown(U, "t");
    expect(canShow(U, "t", cfg())).toBe(false);       // session cap (perSession 1)
    __resetSession();
    expect(canShow(U, "t", cfg())).toBe(false);       // now blocked by the 21-day per-user window
  });

  it("per-user 21-day window blocks all triggers", () => {
    recordShown(U, "t");
    __resetSession();
    const c = cfg({ triggers: {
      t: { enabled: true, version: 1, delayMs: 0, maxAsks: 2, dismissKill: 2, question: "?" },
      u: { enabled: true, version: 1, delayMs: 0, maxAsks: 2, dismissKill: 2, question: "?" },
    } });
    expect(canShow(U, "u", c)).toBe(false);            // a different trigger is still capped
    // ...but 22 days later it opens again
    const future = Date.now() + 22 * 86_400_000;
    expect(canShow(U, "u", c, future)).toBe(true);
  });

  it("dies after dismissKill dismissals, permanently", () => {
    recordIgnored(U, "t");
    recordIgnored(U, "t");
    __resetSession();
    const future = Date.now() + 60 * 86_400_000;       // well past every window
    expect(canShow(U, "t", cfg(), future)).toBe(false);
  });

  it("stops after maxAsks lifetime asks", () => {
    recordShown(U, "t"); __resetSession();
    const t1 = Date.now() + 30 * 86_400_000;
    recordShown(U, "t", t1); __resetSession();          // 2 asks now
    const t2 = Date.now() + 60 * 86_400_000;
    expect(canShow(U, "t", cfg(), t2)).toBe(false);
  });

  it("suppresses everything for 21 days after any answer", () => {
    recordAnswered(U);
    __resetSession();
    expect(canShow(U, "t", cfg())).toBe(false);
    const future = Date.now() + 22 * 86_400_000;
    expect(canShow(U, "t", cfg(), future)).toBe(true);
  });

  it("respects disabled module and disabled trigger", () => {
    expect(canShow(U, "t", cfg({ enabled: false }))).toBe(false);
    const off = cfg();
    off.triggers.t.enabled = false;
    expect(canShow(U, "t", off)).toBe(false);
  });
});
