// The live demo: the real augur/ folder, unmodified, with LocalStore. Everything
// stays in this browser's localStorage; "Start over" clears it.

import { StrictMode, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Augur, AugurAdminSection, AugurWordmark, LocalStore, augur, type HostConfig } from "../augur";

const store = new LocalStore();

// Limits are lifted so a visitor can try each step more than once. A real app keeps
// the defaults (one prompt per session, then 21 days of quiet).
const DEMO_AUGUR: HostConfig = {
  caps: { perSession: 1000, perUserDays: 0, suppressAfterAnswerDays: 0 },
  triggers: {
    "task.done": {
      enabled: true, version: 1, delayMs: 1500, maxAsks: 1000, dismissKill: 1000,
      question: "Did moving that card go the way you expected?",
    },
  },
};

function userId(): string {
  try {
    let id = localStorage.getItem("augur-demo.user");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("augur-demo.user", id); }
    return id;
  } catch { return "demo-visitor"; }
}

function resetDemo() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith("augur")).forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem("augur.sid");
  } catch { /* storage blocked: nothing to clear */ }
  location.reload();
}

type Col = "todo" | "doing" | "done";
interface Task { id: number; title: string; tag: string; who?: string }
const COLS: { key: Col; label: string }[] = [
  { key: "todo", label: "To do" }, { key: "doing", label: "In progress" }, { key: "done", label: "Done" },
];
const NEXT: Record<Col, Col | null> = { todo: "doing", doing: "done", done: null };
const START: (Task & { col: Col })[] = [
  { id: 1, col: "todo",  title: "Write onboarding emails",       tag: "Growth" },
  { id: 2, col: "todo",  title: "Fix avatar upload on Safari",   tag: "Bug", who: "MK" },
  { id: 3, col: "todo",  title: "Invite the design team",        tag: "Ops" },
  { id: 4, col: "doing", title: "Pricing page copy",             tag: "Growth", who: "JR" },
  { id: 5, col: "doing", title: "Migrate billing webhooks",      tag: "Infra", who: "AL" },
  { id: 6, col: "done",  title: "Set up staging",                tag: "Infra", who: "AL" },
];

function Board() {
  const [tasks, setTasks] = useState(START);
  const [draft, setDraft] = useState("");

  function move(id: number, to: Col) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.col === to) return;
    setTasks(tasks.map((x) => (x.id === id ? { ...x, col: to } : x)));
    if (to === "done") augur.emit("task.done");
  }
  function add(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setTasks([...tasks, { id: Date.now(), col: "todo", title: draft.trim(), tag: "New" }]);
    setDraft("");
  }

  return (
    <div className="card app">
      <div className="app-hd"><b>Acme Tasks</b><span>Sprint 14</span></div>
      <div className="board">
        {COLS.map((c) => (
          <div key={c.key} className="col" onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => move(Number(e.dataTransfer.getData("text/plain")), c.key)}>
            <h3>{c.label} <span>{tasks.filter((t) => t.col === c.key).length}</span></h3>
            {tasks.filter((t) => t.col === c.key).map((t) => {
              const next = NEXT[t.col];
              return (
                <div key={t.id} className={`task${t.col === "done" ? " is-done" : ""}`} draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", String(t.id))}>
                  <p>{t.title}</p>
                  <div className="task-ft">
                    <span className="tag">{t.tag}</span>
                    {t.who ? <span className="who" title="Assignee">{t.who}</span>
                      : <button className="assign" data-augur="assign">Assign</button>}
                    {next && <button className="mv" aria-label={`Move “${t.title}” to ${COLS.find((x) => x.key === next)!.label}`}
                      onClick={() => move(t.id, next)}>→</button>}
                  </div>
                </div>
              );
            })}
            {c.key === "todo" && (
              <form className="add" onSubmit={add}>
                <input aria-label="New task" placeholder="Add a task" value={draft} onChange={(e) => setDraft(e.target.value)} />
                <button className="btn" data-augur="add-task">Add</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<"app" | "admin">("app");
  return (
    <>
      <header>
        <div className="brand"><AugurWordmark size={22} /> <small>Demo</small></div>
        <nav>
          <a href="https://github.com/kaezee/Augur">GitHub</a>
          <a className="cta" href="https://github.com/kaezee/Augur#three-step-integration">Add it to your app</a>
        </nav>
      </header>
      <main>
        <aside className="card steps">
          <h2>Try it</h2>
          <p className="lede">Augur running in a sample app. Everything stays in your browser.</p>
          <ol>
            <li><b>Move a card to Done</b><span>Drag it or click its arrow. A short question appears.</span></li>
            <li><b>Click Feedback</b><span>Bottom right. Pick a topic and send a note.</span></li>
            <li><b>Click Assign three times, fast</b><span>Nothing happens on screen, but it gets logged.</span></li>
            <li><b>Open Admin</b><span>See everything Augur saved.</span></li>
          </ol>
          <button className="btn" onClick={resetDemo}>Start over</button>
        </aside>

        <section>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "app"} onClick={() => setTab("app")}>App</button>
            <button role="tab" aria-selected={tab === "admin"} onClick={() => setTab("admin")}>Admin</button>
          </div>
          {tab === "app" ? (
            <Board />
          ) : (
            // Remounted on each visit to the tab, so it always reads the latest data.
            <div className="card admin"><AugurAdminSection store={store} hostConfig={DEMO_AUGUR} /></div>
          )}
        </section>
      </main>
      <Augur userId={userId()} store={store} config={DEMO_AUGUR} appVersion="demo" />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
