import { describe, it, expect } from "vitest";
import { mergeConfig, lockedInCode, type AugurConfig, type TriggerDef } from "./config";

const trig = (over: Partial<TriggerDef> = {}): TriggerDef =>
  ({ enabled: true, version: 1, delayMs: 0, maxAsks: 1, dismissKill: 2, question: "?", ...over });
type Host = Partial<AugurConfig> & { triggers: Record<string, TriggerDef> };
const host = (over: Partial<Host> = {}): Host => ({ triggers: { t: trig() }, ...over });

describe("mergeConfig: restraint wins for on/off", () => {
  it("code off beats admin on", () => {
    expect(mergeConfig(host({ enabled: false }), { enabled: true }).enabled).toBe(false);
  });
  it("admin off beats code on", () => {
    expect(mergeConfig(host({ enabled: true }), { enabled: false }).enabled).toBe(false);
  });
  it("on when neither side sets it", () => {
    expect(mergeConfig(host(), {}).enabled).toBe(true);
  });

  it("persistentButton follows the same rule", () => {
    expect(mergeConfig(host({ persistentButton: false }), { persistentButton: true }).persistentButton).toBe(false);
    expect(mergeConfig(host({ persistentButton: true }), { persistentButton: false }).persistentButton).toBe(false);
    expect(mergeConfig(host(), {}).persistentButton).toBe(true);
  });

  it("trigger enabled needs both code and admin", () => {
    const off = mergeConfig(host({ triggers: { t: trig({ enabled: false }) } }), { triggers: { t: trig({ enabled: true }) } });
    expect(off.triggers.t.enabled).toBe(false);
    const paused = mergeConfig(host({ triggers: { t: trig({ enabled: true }) } }), { triggers: { t: trig({ enabled: false }) } });
    expect(paused.triggers.t.enabled).toBe(false);
  });

  it("a trigger present only in overrides keeps its stored enabled", () => {
    expect(mergeConfig(host(), { triggers: { x: trig({ enabled: true }) } }).triggers.x.enabled).toBe(true);
    expect(mergeConfig(host(), { triggers: { x: trig({ enabled: false }) } }).triggers.x.enabled).toBe(false);
  });

  it("testing in either place means testing", () => {
    expect(mergeConfig(host({ mode: "testing" }), { mode: "live" }).mode).toBe("testing");
    expect(mergeConfig(host({ mode: "live" }), { mode: "testing" }).mode).toBe("testing");
    expect(mergeConfig(host(), {}).mode).toBe("live");
  });

  it("non-switch fields still take the override", () => {
    const c = mergeConfig(
      host({ caps: { perSession: 1, perUserDays: 21, suppressAfterAnswerDays: 21 } }),
      { caps: { perSession: 3, perUserDays: 21, suppressAfterAnswerDays: 21 }, triggers: { t: trig({ question: "Reworded?" }) } },
    );
    expect(c.caps.perSession).toBe(3);
    expect(c.triggers.t.question).toBe("Reworded?");
  });
});

describe("lockedInCode", () => {
  it("reports exactly the switches code set to their restrained value", () => {
    expect(lockedInCode(host({
      enabled: false, persistentButton: true, mode: "testing",
      triggers: { a: trig({ enabled: false }), b: trig({ enabled: true }) },
    }))).toEqual({ enabled: true, persistentButton: false, mode: true, triggers: { a: true, b: false } });
  });
  it("locks nothing when code sets nothing restrained", () => {
    expect(lockedInCode(host())).toEqual({ enabled: false, persistentButton: false, mode: false, triggers: { t: false } });
  });
});
