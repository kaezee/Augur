// Friction: repeated presses on an element the host labelled with data-augur="…",
// recorded quietly (no prompt). Only labelled elements are watched; Augur never
// reads an element's text, value, or anything typed — just the label the host
// chose and the page path.

export const FRICTION_CLICKS = 3;        // presses on the same label…
export const FRICTION_WITHIN_MS = 1000;  // …within this window count as one burst
export const FRICTION_MAX_PER_SESSION = 20;

// Pure detector, time injected so it can be tested without a DOM. Returns the
// press count when a burst crosses the threshold, and only once per burst: further
// presses in the same burst are absorbed until the label has been quiet for a
// whole window.
export class FrictionDetector {
  private presses = new Map<string, number[]>();
  private reported = new Set<string>();

  press(label: string, now: number): number | null {
    const recent = (this.presses.get(label) ?? []).filter((t) => now - t < FRICTION_WITHIN_MS);
    if (recent.length === 0) this.reported.delete(label);   // quiet for a window: a new burst
    recent.push(now);
    this.presses.set(label, recent);
    if (recent.length >= FRICTION_CLICKS && !this.reported.has(label)) {
      this.reported.add(label);
      return recent.length;
    }
    return null;
  }
}

// The label of the nearest labelled element the press landed in, or null.
export function frictionLabel(target: EventTarget | null): string | null {
  const el = target instanceof Element ? target.closest("[data-augur]") : null;
  const label = el?.getAttribute("data-augur")?.trim();
  return label ? label.slice(0, 80) : null;
}

// Watch presses on labelled elements. pointerdown rather than click, so presses on a
// disabled button (the classic "it won't save" moment) are still seen where the
// browser dispatches them. Returns an uninstall.
export function installFrictionWatch(onBurst: (label: string, clicks: number) => void): () => void {
  if (typeof document === "undefined") return () => {};
  const detector = new FrictionDetector();
  let sent = 0;
  const onPress = (e: Event) => {
    const label = frictionLabel(e.target);
    if (!label) return;
    const clicks = detector.press(label, Date.now());
    if (clicks != null && sent < FRICTION_MAX_PER_SESSION) { sent++; onBurst(label, clicks); }
  };
  document.addEventListener("pointerdown", onPress, { capture: true, passive: true });
  return () => document.removeEventListener("pointerdown", onPress, { capture: true });
}
