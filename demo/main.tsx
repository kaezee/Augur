// The live demo: the real augur/ folder, unmodified, with LocalStore. Everything
// stays in this browser's localStorage; "Reset demo" clears it.

import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Augur, AugurAdminSection, AugurWordmark, LocalStore, augur, type HostConfig } from "../augur";

const store = new LocalStore();

// Caps loosened so a visitor can try everything more than once. A real app keeps
// the defaults (one prompt per session, then 21 days of quiet).
const DEMO_AUGUR: HostConfig = {
  caps: { perSession: 1000, perUserDays: 0, suppressAfterAnswerDays: 0 },
  triggers: {
    "draft.saved": {
      enabled: true, version: 1, delayMs: 1500, maxAsks: 1000, dismissKill: 1000,
      question: "Did saving go the way you expected?",
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

function App() {
  const [tab, setTab] = useState<"app" | "admin">("app");
  const [title, setTitle] = useState("Chapter one");
  const [body, setBody] = useState("The lighthouse keeper had not spoken to anyone in eleven days.");
  const [status, setStatus] = useState("");

  function save() {
    setStatus(`Saved at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    augur.emit("draft.saved");
  }

  return (
    <>
      <header>
        <div className="brand"><AugurWordmark size={22} /> <small>live demo</small></div>
        <nav>
          <a href="https://github.com/kaezee/Augur">GitHub</a>
          <a href="https://github.com/kaezee/Augur#three-step-integration">Add it to your app</a>
        </nav>
      </header>
      <main>
        <aside className="card steps">
          <h2>Try it</h2>
          <p className="lede">This is the real module, running in your browser. Nothing leaves this page.</p>
          <ol>
            <li><b>Save the draft.</b><span>A moment later, Augur asks one question. Answer, or ignore it.</span></li>
            <li><b>Press the Feedback button</b><span>at the bottom right. Pick what kind of thing it is, then write a line.</span></li>
            <li><b>Press Publish three times quickly.</b><span>In this demo it never responds. Augur records that as friction, without a prompt.</span></li>
            <li><b>Open Admin</b><span>to see what was recorded: answers, notes by category with their context, and the friction table.</span></li>
          </ol>
          <p className="foot">Caps are loosened here so you can repeat each step.</p>
          <button className="btn" onClick={resetDemo}>Reset demo</button>
        </aside>

        <section>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "app"} onClick={() => setTab("app")}>App</button>
            <button role="tab" aria-selected={tab === "admin"} onClick={() => setTab("admin")}>Admin</button>
          </div>
          {tab === "app" ? (
            <div className="card app">
              <label htmlFor="t">Title</label>
              <input id="t" value={title} onChange={(e) => setTitle(e.target.value)} />
              <label htmlFor="b">Draft</label>
              <textarea id="b" value={body} onChange={(e) => setBody(e.target.value)} />
              <div className="row">
                <button className="btn primary" data-augur="save-draft" onClick={save}>Save draft</button>
                <button className="btn" data-augur="publish">Publish</button>
                <span className="status" role="status">{status}</span>
              </div>
              <p className="hint">Both buttons carry a <code>data-augur</code> label. Augur reads only the label and the page path, never what you typed here.</p>
            </div>
          ) : (
            // Remounted on each visit to the tab, so it always reads the latest data.
            <div className="card"><AugurAdminSection store={store} hostConfig={DEMO_AUGUR} /></div>
          )}
        </section>
      </main>
      <Augur userId={userId()} store={store} config={DEMO_AUGUR} appVersion="demo" />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
