import { describe, it, expect, vi } from "vitest";
import { mergeConfig, lockedInCode, effectiveCategories, type HostConfig, type TriggerDef } from "./config";

const trig = (over: Partial<TriggerDef> = {}): TriggerDef =>
  ({ enabled: true, version: 1, delayMs: 0, maxAsks: 1, dismissKill: 2, question: "?", ...over });
type Host = HostConfig;
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

describe("categories and strings", () => {
  it("ships the three default categories", () => {
    expect(mergeConfig(host(), {}).categories.map((c) => c.key)).toEqual(["broke", "confusing", "missing"]);
    expect(effectiveCategories(mergeConfig(host(), {}).categories)).toHaveLength(3);
  });
  it("[] keeps plain free text", () => {
    expect(effectiveCategories(mergeConfig(host({ categories: [] }), {}).categories)).toEqual([]);
  });
  it("treats a single category as none, and drops duplicate keys and extras", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(effectiveCategories([{ key: "a", label: "A" }])).toEqual([]);
    expect(effectiveCategories([{ key: "a", label: "A" }, { key: "a", label: "A2" }])).toEqual([]);
    const six = "abcdef".split("").map((k) => ({ key: k, label: k }));
    expect(effectiveCategories(six).map((c) => c.key)).toEqual(["a", "b", "c", "d", "e"]);
    warn.mockRestore();
  });
  it("merges strings per key, admin over code", () => {
    const c = mergeConfig(host({ strings: { send: "Envoyer" } }), { strings: { cancel: "Annuler" } });
    expect(c.strings.send).toBe("Envoyer");
    expect(c.strings.cancel).toBe("Annuler");
    expect(c.strings.skip).toBe("Skip");
    expect(c.strings.close).toBe("Dismiss");
  });
  it("context is on by default and categories follow the normal override rule", () => {
    const c = mergeConfig(host(), { categories: [{ key: "x", label: "X" }, { key: "y", label: "Y" }] });
    expect(c.context).toBe(true);
    expect(c.categories.map((k) => k.key)).toEqual(["x", "y"]);
  });
});
