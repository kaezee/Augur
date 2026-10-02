// The live demo: the real augur/ folder, unmodified, inside a sample task app.
// The "What Augur saved" feed is a thin wrapper around LocalStore that reports each
// write Augur makes, so every row is something Augur actually recorded. Everything
// stays in this browser; "Start over" clears it.

import { StrictMode, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as KE, type PointerEvent as PE, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Augur, AugurAdminSection, AugurWordmark, LocalStore, augur, type FrictionEvent, type HostConfig, type Submission } from "../augur";

// ── Augur config: one trigger, four feedback categories ──────────────────────
// Augur's standard answers, which Admin counts per trigger.
const ANSWERS = [{ key: "yes", label: "Yes" }, { key: "not_really", label: "Not really" }, { key: "unclear", label: "Not sure" }];
const CATEGORIES = [
  { key: "bug", label: "Bug", placeholder: "What went wrong?" },
  { key: "idea", label: "Idea", placeholder: "What would help?" },
  { key: "question", label: "Question", placeholder: "What are you trying to do?" },
  { key: "praise", label: "Praise", placeholder: "What worked well?" },
];
// Limits are lifted so a visitor can try each step more than once. A real app keeps
// the defaults (one prompt per session, then 21 days of quiet).
const DEMO_AUGUR: HostConfig = {
  persistentButton: false,   // the app has its own Feedback button
  categories: CATEGORIES,
  strings: { categoryQuestion: "What's it about?" },
  caps: { perSession: 1000, perUserDays: 0, suppressAfterAnswerDays: 0 },
  triggers: {
    "task.done": {
      enabled: true, version: 1, delayMs: 700, maxAsks: 1000, dismissKill: 1000,
      question: "Did Acme Tasks help you get that done?",
    },
  },
};

// ── A store that reports what Augur writes ───────────────────────────────────
type Kind = "answer" | "feedback" | "signal";
interface Saved { id: number; kind: Kind; what: string; data: Record<string, string>; at: Date }
let report: (s: Omit<Saved, "id" | "at">) => void = () => {};
const label = (list: { key: string; label: string }[], key?: string) => list.find((x) => x.key === key)?.label ?? key ?? "";

class DemoStore extends LocalStore {
  private triggerOf = new Map<string, string>();
  async logShown(e: { userId: string; triggerId: string; triggerVer: number }) {
    const id = await super.logShown(e);
    this.triggerOf.set(id, e.triggerId);
    return id;
  }
  async logOutcome(eventId: string, outcome: "ignored" | "answered", answer?: string) {
    await super.logOutcome(eventId, outcome, answer);
    const trigger = this.triggerOf.get(eventId) ?? "";
    report(outcome === "answered"
      ? { kind: "answer", what: `Answered “${DEMO_AUGUR.triggers[trigger]?.question}”`, data: { trigger, answer: label(ANSWERS, answer) } }
      : { kind: "answer", what: "Question dismissed", data: { trigger, outcome: "ignored" } });
  }
  async logNote(eventId: string, body: string) {
    await super.logNote(eventId, body);
    report({ kind: "answer", what: body, data: { note_on: this.triggerOf.get(eventId) ?? "" } });
  }
  async submit(s: Submission) {
    await super.submit(s);
    const c = s.context;
    report({ kind: "feedback", what: s.body, data: {
      category: label(CATEGORIES, s.category), page: c?.route ?? "", window: c ? `${c.viewport.w}×${c.viewport.h}` : "", errors: String(c?.errors.length ?? 0),
    } });
  }
  async logFriction(e: FrictionEvent) {
    await super.logFriction(e);
    report({ kind: "signal", what: `“${e.label}” pressed ${e.clicks} times in a second`, data: { label: e.label, page: e.route, clicks: String(e.clicks) } });
  }
}
const store = new DemoStore();

function userId(): string {
  try {
    let id = localStorage.getItem("augur-demo.user");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("augur-demo.user", id); }
    return id;
  } catch { return "demo-visitor"; }
}
function startOver() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith("augur")).forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem("augur.sid");
  } catch { /* storage blocked: nothing to clear */ }
  location.reload();
}

// ── Icons ────────────────────────────────────────────────────────────────────
const PATHS: Record<string, ReactNode> = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  question: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7M12 17h.01" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></>,
  click: <><path d="M9 9l10 4-4.2 1.6L13 19z" /><path d="M5 3.5l1.2 2.2M2.8 8h2.4M10.5 3l-.6 2.4M4.6 12.2l2-1.4" /></>,
  userPlus: <><circle cx="10" cy="8" r="3.5" /><path d="M3.5 19.5c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5M19 8v6M16 11h6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  reset: <><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5" /></>,
  github: <path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.4a3 3 0 0 0-.8-2.3c2.7-.3 5.5-1.3 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.5 2.6 5.5 2.9 5.5 2.9a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.3c0 4.6 2.8 5.7 5.5 6a3 3 0 0 0-.8 2.3V21" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  inbox: <><path d="M3 13l3-8h12l3 8v6H3z" /><path d="M3 13h5l1.5 2.5h5L16 13h5" /></>,
  list: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11" /><circle cx="5" cy="18" r="1.4" /></>,
};
const Icon = ({ n }: { n: string }) => <svg className="i" viewBox="0 0 24 24" aria-hidden="true">{PATHS[n]}</svg>;
const Grip = () => <svg className="i" viewBox="0 0 16 16" aria-hidden="true">{[3.5, 8, 12.5].flatMap((y) => [5.5, 10.5].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" />))}</svg>;
const KIND: Record<Kind, { l: string; i: string }> = { answer: { l: "answer", i: "question" }, feedback: { l: "feedback", i: "chat" }, signal: { l: "repeated clicks", i: "click" } };

// ── The sample app: a task board ─────────────────────────────────────────────
type Col = "todo" | "doing" | "done";
interface Task { id: number; t: string; tag: string; who?: string; col: Col }
const COLS: { id: Col; name: string }[] = [{ id: "todo", name: "To do" }, { id: "doing", name: "In progress" }, { id: "done", name: "Done" }];
const SW: Record<Col, string> = { todo: "#9aa1ae", doing: "#e0a33b", done: "#2f9e6d" };
const PEOPLE: Record<string, [string, string]> = { MK: ["#e4e8ff", "#3340a8"], JR: ["#e1f4ec", "#1d6b4b"], AL: ["#fdeedd", "#8a4b0f"] };
const TAGS: Record<string, string> = { Growth: "#6b7cf0", Bug: "#e0574f", Ops: "#8b93a3", Infra: "#2f9e9a" };
const START: Task[] = [
  { id: 1, t: "Write onboarding emails", tag: "Growth", col: "todo" },
  { id: 2, t: "Fix avatar upload on Safari", tag: "Bug", who: "MK", col: "todo" },
  { id: 3, t: "Invite the design team", tag: "Ops", col: "todo" },
  { id: 4, t: "Pricing page copy", tag: "Growth", who: "JR", col: "doing" },
  { id: 5, t: "Migrate billing webhooks", tag: "Infra", who: "AL", col: "doing" },
  { id: 6, t: "Set up staging", tag: "Infra", who: "AL", col: "done" },
];
const Avatar = ({ who }: { who: string }) => <span className="av" style={{ background: PEOPLE[who][0], color: PEOPLE[who][1] }} title={`Assigned to ${who}`}>{who}</span>;

function Board({ invite, onDone, say }: { invite: boolean; onDone: () => void; say: (t: string) => void }) {
  const [cards, setCards] = useState(START);
  const [draft, setDraft] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [target, setTarget] = useState<Col | null>(null);
  const [lifted, setLifted] = useState<{ id: number; to: number; from: Col } | null>(null);
  const cardsRef = useRef(cards); cardsRef.current = cards;
  const drag = useRef<{ el: HTMLElement; id: number; from: Col; sx: number; sy: number; ox: number; oy: number; w: number; started: boolean; pid: number; ghost?: HTMLElement } | null>(null);

  const moveTo = (id: number, to: Col): boolean => {
    const c = cardsRef.current.find((x) => x.id === id);
    if (!c || c.col === to) return false;
    setCards((cs) => cs.map((x) => (x.id === id ? { ...x, col: to } : x)));
    say(`${c.t} moved to ${COLS.find((x) => x.id === to)!.name}.`);
    if (to === "done") { augur.emit("task.done"); onDone(); }
    return true;
  };
  const moveRef = useRef(moveTo); moveRef.current = moveTo;

  // Pointer drag: a lifted copy follows the pointer, the card's spot becomes a
  // placeholder, and the column under the pointer lights up.
  useEffect(() => {
    const colAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest(".col") as HTMLElement | null)?.dataset.col as Col | undefined;
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pid) return;
      if (!d.started) {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
        d.started = true;
        const g = d.el.cloneNode(true) as HTMLElement;
        g.classList.add("ghost"); g.removeAttribute("tabindex"); g.style.width = `${d.w}px`;
        document.body.appendChild(g); d.ghost = g;
        document.body.classList.add("dragging");
        setDragId(d.id);
      }
      d.ghost!.style.left = `${e.clientX - d.ox}px`; d.ghost!.style.top = `${e.clientY - d.oy}px`;
      const over = colAt(e.clientX, e.clientY);
      setTarget(over && over !== d.from ? over : null);
      e.preventDefault();
    };
    const onUp = (e: PointerEvent, cancel: boolean) => {
      const d = drag.current; drag.current = null;
      if (!d || !d.started) return;
      d.ghost?.remove(); document.body.classList.remove("dragging");
      const over = cancel ? undefined : colAt(e.clientX, e.clientY);
      setDragId(null); setTarget(null);
      if (!(over && moveRef.current(d.id, over))) say("Put back.");
    };
    const up = (e: PointerEvent) => onUp(e, false), cancel = (e: PointerEvent) => onUp(e, true);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); };
  }, []);

  const onPointerDown = (e: PE<HTMLElement>, c: Task) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button,input,form")) return;
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { el: e.currentTarget, id: c.id, from: c.col, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, started: false, pid: e.pointerId };
  };

  // Keyboard drag: Space picks up, Left/Right choose the column, Space drops, Escape cancels.
  const onKeyDown = (e: KE<HTMLElement>, c: Task) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!lifted) { setLifted({ id: c.id, to: COLS.findIndex((x) => x.id === c.col), from: c.col }); say(`Picked up ${c.t}. Left and right arrows choose a column, space drops, escape cancels.`); return; }
      const to = COLS[lifted.to].id; setLifted(null); setTarget(null);
      if (!moveTo(c.id, to)) say("Dropped back.");
      return;
    }
    if (lifted && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      const to = Math.max(0, Math.min(2, lifted.to + (e.key === "ArrowRight" ? 1 : -1)));
      setLifted({ ...lifted, to }); setTarget(COLS[to].id === lifted.from ? null : COLS[to].id); say(`Over ${COLS[to].name}.`);
      return;
    }
    if (lifted && e.key === "Escape") { e.preventDefault(); setLifted(null); setTarget(null); say(`Cancelled. ${c.t} stays put.`); }
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setCards([...cards, { id: Date.now(), t: draft.trim(), tag: "Ops", col: "todo" }]);
    say(`${draft.trim()} added to To do.`); setDraft("");
  };

  return (
    <div className="board">
      {COLS.map((col, ci) => {
        const list = cards.filter((c) => c.col === col.id);
        const next = COLS[ci + 1];
        return (
          <section key={col.id} className={`col${target === col.id ? " target" : ""}${dragId != null && cards.find((c) => c.id === dragId)?.col === col.id ? " source" : ""}`}
            data-col={col.id} aria-label={`${col.name}, ${list.length} tasks`}>
            <div className="col-head"><span className="sw" style={{ background: SW[col.id] }} />{col.name}<span className="n">{list.length}</span>
              {col.id === "done" && <span className="ask" title="Augur asks a question when a task lands here"><Icon n="question" />Augur asks here</span>}
            </div>
            {list.map((c) => (
              <article key={c.id} className={`task${c.col === "done" ? " isdone" : ""}${dragId === c.id ? " placeholder" : ""}${lifted?.id === c.id ? " lifted" : ""}`}
                tabIndex={0} aria-roledescription="draggable task" aria-label={`${c.t}. In ${col.name}. Press space to pick up.`}
                onPointerDown={(e) => onPointerDown(e, c)} onKeyDown={(e) => onKeyDown(e, c)}
                onBlur={() => { if (lifted?.id === c.id) { setLifted(null); setTarget(null); } }}>
                <span className="grip" title="Drag to move"><Grip /></span>
                <div className="t">{c.t}</div>
                <div className="meta">
                  <span className="tag"><i style={{ background: TAGS[c.tag] ?? "#8b93a3" }} />{c.tag}</span>
                  <span className="grow" />
                  {c.who ? <Avatar who={c.who} /> : c.col !== "done" && (
                    // Does nothing on purpose. The data-augur label is all Augur needs to
                    // notice repeated presses.
                    <button className="assign" type="button" data-augur="assign"><Icon n="userPlus" />Assign</button>
                  )}
                  {next && <button className="move" type="button" aria-label={`Move ${c.t} to ${next.name}`} title={`Move to ${next.name}`} onClick={() => moveTo(c.id, next.id)}><Icon n="arrow" /></button>}
                </div>
              </article>
            ))}
            {col.id === "done" && (
              <div className={`dropzone${invite ? " invite" : ""}`} aria-hidden="true">
                {target === "done" ? <><Icon n="check" />Release to move it to Done</> : <><Icon n="down" />{invite ? "Drag a card here to try it" : "Drop a card here to finish it"}</>}
              </div>
            )}
            {col.id === "todo" && (
              <form className="add" onSubmit={add}>
                <label className="sr" htmlFor="addInput">New task</label>
                <input id="addInput" placeholder="Add a task" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} />
                <button className="btn btn-sm" type="submit" data-augur="add-task"><Icon n="plus" />Add</button>
              </form>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
const STEPS = [
  { k: "move", b: "Move a card to Done", e: "1 drag", d: "Drag any card straight into Done, or click its arrow until it gets there. Augur then asks one short question." },
  { k: "feedback", b: "Send feedback", e: "1 note", d: "Feedback is at the bottom right. Pick a topic, write a line." },
  { k: "signal", b: "Click Assign 3 times, fast", e: "3 clicks", d: "Nothing changes in the app. Augur still notices." },
  { k: "admin", b: "Open Admin", e: "1 click", d: "See everything Augur saved, the way your team would." },
] as const;
type StepKey = (typeof STEPS)[number]["k"];
const clock = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const GITHUB = "https://github.com/kaezee/Augur";
const ADD = "https://github.com/kaezee/Augur#three-step-integration";

function App() {
  const [tab, setTab] = useState<"app" | "admin">("app");
  const [adminKey, setAdminKey] = useState(0);
  const [done, setDone] = useState<Record<StepKey, boolean>>({ move: false, feedback: false, signal: false, admin: false });
  const [saved, setSaved] = useState<Saved[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [augurOpen, setAugurOpen] = useState(false);
  const [live, setLive] = useState("");
  const seq = useRef(0);
  const toastTimer = useRef<number>();

  const tick = (k: StepKey) => setDone((d) => (d[k] ? d : { ...d, [k]: true }));
  const say = (t: string) => { setLive(""); window.setTimeout(() => setLive(t), 30); };

  useEffect(() => augur.onPanelState(setAugurOpen), []);
  useEffect(() => {
    report = (s) => {
      setSaved((list) => [{ ...s, id: ++seq.current, at: new Date() }, ...list]);
      if (s.kind === "feedback") tick("feedback");
      if (s.kind === "signal") tick("signal");
      setToast(`Augur saved: ${KIND[s.kind].l}`);
      window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 2000);
      say(`Augur saved ${KIND[s.kind].l}. ${s.what}`);
    };
    return () => { report = () => {}; };
  }, []);

  const show = (t: "app" | "admin") => {
    setTab(t);
    if (t === "admin") { tick("admin"); setAdminKey((k) => k + 1); }   // remount so it reads the latest data
  };
  const n = Object.values(done).filter(Boolean).length;
  const latest = saved[0]?.id;

  return (
    <>
      <header className="top">
        <AugurWordmark size={20} /><span className="pill">Demo</span>
        <span className="grow" />
        <a className="link" href={GITHUB} target="_blank" rel="noopener"><Icon n="github" /><span>GitHub</span></a>
        <a className="btn btn-ink btn-sm" href={ADD}>Add it to your app</a>
      </header>

      <main className="page">
        <aside className="guide" aria-label="How to try Augur">
          <div className="thesis">
            <h1>See what your users never tell you</h1>
            <p>Augur is running inside the sample app. Try the four things below and watch it record each one.</p>
          </div>

          <section className="card steps" aria-labelledby="stepsTitle">
            <div className="steps-head">
              <span className={`ringwrap${n === 4 ? " all" : ""}`} aria-hidden="true">
                <svg className="ring" viewBox="0 0 24 24">
                  <circle className="bg" cx="12" cy="12" r="10.5" />
                  <circle className="fg" cx="12" cy="12" r="10.5" strokeDasharray="65.97" strokeDashoffset={65.97 * (1 - n / 4)} transform="rotate(-90 12 12)" />
                </svg>
                <Icon n={n === 4 ? "check" : "list"} />
              </span>
              <div><h2 id="stepsTitle">Four things to try</h2><span className="sub">About a minute, any order.</span></div>
              <span className={`progress${n === 4 ? " all" : ""}`} aria-label={`${n} of 4 done`}>{n}/4</span>
            </div>
            <ul className="list">
              {STEPS.map((s, i) => (
                <li key={s.k} className={`step${done[s.k] ? " done" : ""}`}>
                  <span className="num" aria-hidden="true">{i + 1}</span>
                  <div><b>{s.b}<em className="eff">{s.e}</em></b><span className="d">{s.d}</span><span className="sr">{done[s.k] ? "Done." : "Not done yet."}</span></div>
                  <span className="box" aria-hidden="true"><Icon n="check" /></span>
                </li>
              ))}
            </ul>
            {n === 4 && (
              <div className="finish">
                <b>That's Augur in under a minute</b>
                <p>A question at the right moment, feedback with its context, and clicks that went nowhere, all in one place.</p>
                <div className="row"><a className="btn btn-sm" href={ADD}>Add it to your app</a><a className="glink" href={GITHUB} target="_blank" rel="noopener"><Icon n="github" />View on GitHub</a></div>
              </div>
            )}
            <div className="steps-foot">
              <span className="hint"><Icon n="info" /><span>Runs in your browser with sample data. In your app, you decide what Augur asks and when.</span></span>
              <button className="btn btn-sm" type="button" style={{ alignSelf: "flex-start" }} onClick={startOver}><Icon n="reset" />Start over</button>
            </div>
          </section>

          <section className="card feed" aria-labelledby="feedTitle">
            <div className="feed-head"><span className="dot" aria-hidden="true" /><h2 id="feedTitle">What Augur saved</h2>{saved.length > 0 && <span className="count">{saved.length}</span>}</div>
            <div className="feed-body">
              {saved.length === 0
                ? <div className="empty"><span className="ico"><Icon n="inbox" /></span><span>Nothing yet. Each step shows up here the moment Augur records it.</span></div>
                : <ul>{saved.map((e) => (
                    <li key={e.id} className={`ev${e.id === latest ? " fresh" : ""}`}>
                      <span className={`ico k-${e.kind}`}><Icon n={KIND[e.kind].i} /></span>
                      <div className="what">{e.what}</div><time>{clock(e.at)}</time>
                      <div className="data">{Object.entries(e.data).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>
                    </li>
                  ))}</ul>}
            </div>
          </section>
        </aside>

        <section className="sandbox" aria-label="Sample app">
          <div className="bar-row">
            <div className="tabs" role="tablist" aria-label="View">
              <button className="tab" role="tab" type="button" aria-selected={tab === "app"} onClick={() => show("app")}>App</button>
              <button className="tab" role="tab" type="button" aria-selected={tab === "admin"} onClick={() => show("admin")}>Admin {saved.length > 0 && <span className="count">{saved.length}</span>}</button>
            </div>
            <span className="note"><span className="dot" aria-hidden="true" />Augur is running in this sample app</span>
          </div>

          <div className="frame">
            {/* Kept mounted so the board keeps its state while Admin is open. */}
            <div style={{ display: tab === "app" ? "contents" : "none" }}>
              <div className="frame-head"><h3>Acme Tasks</h3><span>Sprint 14</span>
                <span className="people" aria-label="Team">{Object.keys(PEOPLE).map((w) => <Avatar key={w} who={w} />)}</span>
              </div>
              <Board invite={!done.move} onDone={() => tick("move")} say={say} />
            </div>
            {tab === "admin" && (
              <>
                <div className="frame-head"><h3>Augur admin</h3><span>Acme Tasks · what your team sees</span></div>
                <div className="admin-wrap"><AugurAdminSection key={adminKey} store={store} hostConfig={DEMO_AUGUR} /></div>
              </>
            )}
            {toast && <div className="toast" aria-hidden="true"><span className="tic"><Icon n="check" /></span>{toast}</div>}
          </div>
        </section>
      </main>

      {!augurOpen && <button className="fb-btn" type="button" onClick={() => augur.open("feedback-button")}><Icon n="chat" />Feedback</button>}
      <div className="sr" aria-live="polite">{live}</div>
      <Augur userId={userId()} store={store} config={DEMO_AUGUR} appVersion="demo" />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
