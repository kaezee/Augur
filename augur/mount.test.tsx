// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { Augur, submitFeedback } from "./Augur";
import { resultsHeadline } from "./admin";
import { augur } from "./emit";
import * as publicApi from "./index";
import { mergeConfig, type HostConfig } from "./config";
import { LocalStore } from "./stores/local";
import { __resetSession } from "./caps";
import type { AugurStore, Submission } from "./store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fakeStore = (): AugurStore & { submitted: Submission[] } => {
  const submitted: Submission[] = [];
  return {
    submitted,
    logShown: vi.fn(async () => "ev1"), logOutcome: vi.fn(async () => {}), logNote: vi.fn(async () => {}),
    logUnconfigured: vi.fn(async () => {}), readConfig: vi.fn(async () => ({})),
    submit: vi.fn(async (s: Submission) => { submitted.push(s); }),
  };
};
const CFG: HostConfig = { triggers: { "t.done": { enabled: true, version: 1, delayMs: 0, maxAsks: 5, dismissKill: 5, question: "Did that work?" } } };

let host: HTMLDivElement, root: Root;
async function mount(config: HostConfig, store: AugurStore) {
  await act(async () => { root.render(<Augur userId="u1" store={store} config={config} appVersion="1.2.3" />); });
}
const q = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const buttonByText = (t: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === t) as HTMLButtonElement;

beforeEach(() => {
  localStorage.clear(); __resetSession();
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });

describe("emit API", () => {
  it("open() records 'button' when no source is given", () => {
    const seen: string[] = [];
    const off = augur.onOpen((s) => seen.push(s));
    augur.open(); augur.open("fab");
    off();
    expect(seen).toEqual(["button", "fab"]);
  });

  it("does not expose the panel-state broadcaster", () => {
    expect("setPanelOpen" in publicApi).toBe(false);
    expect("_setPanelOpen" in augur).toBe(false);
  });

  it("onPanelState fires true then false around a triggered prompt", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const states: boolean[] = [];
    const off = augur.onPanelState((o) => states.push(o));
    await mount(CFG, fakeStore());
    await act(async () => { augur.emit("t.done"); await vi.runOnlyPendingTimersAsync(); });
    expect(q('[role="region"]')?.textContent).toContain("Did that work?");
    await act(async () => { buttonByText("×").click(); });
    off();
    const changes = states.filter((s, i) => s !== states[i - 1]);
    expect(changes.slice(-2)).toEqual([true, false]);
  });

  it("a triggered prompt never takes focus; the panel does, and returns it on close", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const outside = document.createElement("button"); outside.textContent = "host"; document.body.appendChild(outside);
    await mount(CFG, fakeStore());
    outside.focus();
    await act(async () => { augur.emit("t.done"); await vi.runOnlyPendingTimersAsync(); });
    expect(document.activeElement).toBe(outside);
    await act(async () => { augur.close(); await vi.runOnlyPendingTimersAsync(); });

    await act(async () => { augur.open("fab"); });
    expect(document.activeElement?.textContent).toBe("Something broke");
    await act(async () => { augur.close(); await vi.runOnlyPendingTimersAsync(); });
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("closing the panel opened from the built-in button returns focus to that button", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await mount(CFG, fakeStore());
    const fab = () => document.querySelector<HTMLButtonElement>("[data-augur-fab]");
    fab()!.focus();
    await act(async () => { fab()!.click(); });
    expect(fab()).toBeNull();                                  // hidden while the panel is up
    await act(async () => { augur.close(); });                 // the button renders again…
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });   // …then takes focus
    expect(fab()).not.toBeNull();
    expect(document.activeElement).toBe(fab());
  });
});

describe("the button's panel", () => {
  it("picks a category, writes a line, and submits once with context", async () => {
    const store = fakeStore();
    await mount({ ...CFG, persistentButton: false }, store);
    await act(async () => { augur.open("fab"); });
    expect(store.logShown).not.toHaveBeenCalled();            // nothing written on open
    await act(async () => { buttonByText("Something’s confusing").click(); });
    const send = () => buttonByText("Send") as HTMLButtonElement;
    expect(send().disabled).toBe(true);                       // nothing typed: unavailable, and looks it
    expect(send().style.opacity).toBe("0.45");
    const ta = q("textarea") as HTMLTextAreaElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      set.call(ta, "The strip's dots"); ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(send().disabled).toBe(false);
    expect(send().style.opacity).toBe("");
    await act(async () => { send().click(); });
    expect(store.submitted).toHaveLength(1);
    const s = store.submitted[0];
    expect(s).toMatchObject({ userId: "u1", category: "confusing", body: "The strip's dots", source: "fab" });
    expect(s.context).toMatchObject({ source: "fab", appVersion: "1.2.3", route: "/" });
    expect(Array.isArray(s.context?.errors)).toBe(true);
  });

  it("writes nothing if closed without sending", async () => {
    const store = fakeStore();
    await mount(CFG, store);
    await act(async () => { augur.open(); });
    await act(async () => { buttonByText("Something broke").click(); });
    await act(async () => { buttonByText("Cancel").click(); });
    expect(store.submit).not.toHaveBeenCalled();
    expect(store.logShown).not.toHaveBeenCalled();
  });

  it("with categories: [] goes straight to the free-text box", async () => {
    await mount({ ...CFG, categories: [] }, fakeStore());
    await act(async () => { augur.open(); });
    expect(q("textarea")).not.toBeNull();
    expect(buttonByText("Something broke")).toBeUndefined();
  });

  it("never opens when the module is off", async () => {
    await mount({ ...CFG, enabled: false }, fakeStore());
    await act(async () => { augur.open(); });
    expect(q('[role="region"]')).toBeNull();
  });

  it("context: false installs no error listeners and sends no context", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const store = fakeStore();
    await mount({ ...CFG, context: false, categories: [] }, store);
    expect(add.mock.calls.some(([t]) => t === "error" || t === "unhandledrejection")).toBe(false);
    add.mockRestore();
    await act(async () => { augur.open(); });
    const ta = q("textarea") as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(ta, "hi");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { buttonByText("Send").click(); });
    expect(store.submitted[0].context).toBeUndefined();
  });
});

describe("admin reads that hold up as feedback grows", () => {
  it("pages notes newest first without skipping notes that share a timestamp, and filters by category", async () => {
    const store = new LocalStore();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-05-01T10:00:00Z"));
    for (let i = 0; i < 7; i++) await store.submit({ userId: "u1", category: i % 2 ? "missing" : "broke", body: `n${i}`, source: i === 0 ? "manual" : "button" });
    vi.useRealTimers();                                       // all seven share one timestamp
    const seen: string[] = [];
    let before: { createdAt: string; id: string } | undefined;
    for (;;) {
      const page = await store.readNotes({ limit: 3, before });
      seen.push(...page.map((n) => n.body));
      if (page.length < 3) break;
      before = { createdAt: page[2].createdAt, id: page[2].id };
    }
    expect(seen.sort()).toEqual(["n0", "n1", "n2", "n3", "n4", "n5", "n6"]);
    expect((await store.readNotes({ category: "missing" })).map((n) => n.body).sort()).toEqual(["n1", "n3", "n5"]);
    const stats = await store.readSubmissionStats({ from: "2026-01-01T00:00:00Z", to: "2027-01-01T00:00:00Z" });
    expect(stats.reduce((a, x) => a + x.count, 0)).toBe(7);
    expect(stats.find((x) => x.source === "button" && x.category === "broke")?.count).toBe(4);   // "manual" counts as the button
  });

  it("the headline names the question with the most 'Not really', not a blended total", () => {
    expect(resultsHeadline([])).toBe("No rating prompts were shown in this range.");
    expect(resultsHeadline([{ id: "a", shown: 3, answered: 0, notReally: 0 }])).toBe("3 prompts shown, none answered yet.");
    expect(resultsHeadline([{ id: "a", shown: 4, answered: 2, notReally: 0 }, { id: "b", shown: 1, answered: 1, notReally: 0 }]))
      .toBe("No “Not really” answers in this range: 3 answers across 2 questions.");
    expect(resultsHeadline([
      { id: "import.done", question: "Did the import land?", shown: 20, answered: 10, notReally: 2 },
      { id: "moment.recorded", question: "Was recording that moment easy?", shown: 12, answered: 6, notReally: 3 },
    ])).toBe("Most “Not really”: “Was recording that moment easy?”, 3 of 6 answers (50%).");
  });
});

describe("LocalStore.submit", () => {
  it("records category, body, source and context", async () => {
    const store = new LocalStore();
    await store.submit({ userId: "u1", category: "broke", body: "It broke", source: "fab",
      context: { route: "/w", viewport: { w: 1, h: 1 }, userAgent: "x", timestamp: "t", source: "fab", sessionId: "s", errors: [] } });
    const [n] = await store.readNotes();
    expect(n).toMatchObject({ triggerId: "fab", category: "broke", body: "It broke" });
    expect(n.context).toMatchObject({ route: "/w", source: "fab" });
  });

  it("records nothing in testing mode", async () => {
    const store = new LocalStore();
    const sent = submitFeedback(store, mergeConfig({ ...CFG, mode: "testing" }, {}), { userId: "u1", body: "x", source: "button" });
    expect(sent).toBe(false);
    expect(await store.readNotes()).toEqual([]);
  });
});

describe("friction", () => {
  const press = (el: Element) => el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  const storeWithFriction = () => Object.assign(fakeStore(), { logFriction: vi.fn(async () => {}) });

  it("records one burst for 3 quick presses on a labelled element, label and path only", async () => {
    const store = storeWithFriction();
    await mount(CFG, store);
    const btn = document.createElement("button"); btn.dataset.augur = "save-entity";
    btn.innerHTML = "<span>Save “Private draft”</span>"; document.body.appendChild(btn);
    press(btn.firstChild as Element); press(btn); press(btn); press(btn);
    expect(store.logFriction).toHaveBeenCalledTimes(1);
    expect(store.logFriction).toHaveBeenCalledWith({ userId: "u1", label: "save-entity", route: "/", clicks: 3 });
    btn.remove();
  });

  it("counts Enter/Space presses from the keyboard, but not a held-down key", async () => {
    const store = storeWithFriction();
    await mount(CFG, store);
    const btn = document.createElement("button"); btn.dataset.augur = "assign"; document.body.appendChild(btn);
    const key = (k: string, repeat = false) => btn.dispatchEvent(new KeyboardEvent("keydown", { key: k, repeat, bubbles: true }));
    key("Enter"); key("Enter", true); key("Enter", true);   // one press held down
    expect(store.logFriction).not.toHaveBeenCalled();
    key(" "); key("Enter");
    expect(store.logFriction).toHaveBeenCalledWith({ userId: "u1", label: "assign", route: "/", clicks: 3 });
    btn.remove();
  });

  it("ignores unlabelled elements, testing mode, and friction: false", async () => {
    for (const cfg of [CFG, { ...CFG, mode: "testing" as const }, { ...CFG, friction: false }]) {
      const store = storeWithFriction();
      await mount(cfg, store);
      const plain = document.createElement("button"); document.body.appendChild(plain);
      const labelled = document.createElement("button"); labelled.dataset.augur = "x"; document.body.appendChild(labelled);
      for (let i = 0; i < 3; i++) press(plain);
      if (cfg !== CFG) for (let i = 0; i < 3; i++) press(labelled);
      expect(store.logFriction).not.toHaveBeenCalled();
      plain.remove(); labelled.remove();
      await act(async () => root.render(<></>));
    }
  });
});
