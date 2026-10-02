import { describe, it, expect } from "vitest";
import { FrictionDetector, FRICTION_CLICKS } from "./friction";

describe("friction detector", () => {
  it("fires once when 3 presses land within a second", () => {
    const d = new FrictionDetector();
    expect(d.press("save", 0)).toBeNull();
    expect(d.press("save", 300)).toBeNull();
    expect(d.press("save", 600)).toBe(FRICTION_CLICKS);
    expect(d.press("save", 700)).toBeNull();     // same burst: absorbed
    expect(d.press("save", 900)).toBeNull();
  });

  it("does not fire for presses spread over more than a second", () => {
    const d = new FrictionDetector();
    expect(d.press("save", 0)).toBeNull();
    expect(d.press("save", 600)).toBeNull();
    expect(d.press("save", 1200)).toBeNull();    // the first press has aged out
  });

  it("starts a new burst after the label goes quiet for a full window", () => {
    const d = new FrictionDetector();
    d.press("save", 0); d.press("save", 100); expect(d.press("save", 200)).toBe(3);
    expect(d.press("save", 2000)).toBeNull();
    expect(d.press("save", 2100)).toBeNull();
    expect(d.press("save", 2200)).toBe(3);
  });

  it("tracks labels separately", () => {
    const d = new FrictionDetector();
    d.press("a", 0); d.press("b", 10); d.press("a", 20); d.press("b", 30);
    expect(d.press("a", 40)).toBe(3);
    expect(d.press("b", 50)).toBe(3);
  });
});
