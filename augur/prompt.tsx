import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AnswerOption, Presentation, ResponseType } from "./config";
import { AugurByline } from "./mark";

// The snackbar (AUGUR-HANDOFF §4, Patch 2 §4/§7/§8/§9). Self-contained: inline
// styles reading host --k-* tokens with sane fallbacks, so it inherits the host
// look and renders fine where none are defined. Never a modal, never centre-screen,
// never in the prose column. One prompt → the optional line, in place.
//
// Response type decides the first step: choice3/choice show answer buttons; text
// shows a single free-text box (the user-initiated "what's on your mind?" prompt).

const AUTO_DISMISS_MS = 20_000;

export interface PromptSpec {
  question: string;
  followup: string;
  responseType: ResponseType;
  answers: AnswerOption[];                     // choice3
  options?: { key: string; label: string }[]; // choice
  position: Presentation["position"];
}

export function AugurPrompt({ spec, onAnswer, onNote, onIgnore, onDone }: {
  spec: PromptSpec;
  onAnswer: (answer?: string) => void;   // marks the row answered (choice key, or none for text)
  onNote: (body: string) => void;
  onIgnore: () => void;                  // closed without answering (×, Esc, timeout)
  onDone: () => void;                    // closed after answering
}) {
  const isText = spec.responseType === "text";
  const [step, setStep] = useState<"q" | "note">("q");
  const [text, setText] = useState("");
  const closed = useRef(false);

  const [sent, setSent] = useState(false);

  const ignore = () => { if (closed.current) return; closed.current = true; onIgnore(); };
  const done = () => { if (closed.current) return; closed.current = true; onDone(); };
  // A short thank-you so a Send visibly lands, then close (the write already happened).
  const finish = () => { if (closed.current || sent) return; setSent(true); window.setTimeout(done, 1500); };

  // 20s no-interaction auto-dismiss — only while still on the first step. Silence
  // is a real signal (§6.3): it always resolves the row to 'ignored'.
  useEffect(() => {
    if (step !== "q" || sent) return;
    const t = window.setTimeout(ignore, AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [step, sent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); step === "q" ? ignore() : done(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [step]);

  const side = spec.position === "bottom-left" ? { left: 24 } : { right: 24 };
  const wrap: React.CSSProperties = {
    position: "fixed", bottom: 24, ...side, zIndex: 2147483000, width: isText ? "min(460px, calc(100vw - 32px))" : "min(360px, calc(100vw - 32px))",
    background: "var(--k-bg-raised, #ffffff)", color: "var(--k-text-primary, #1F1C15)",
    border: "1px solid var(--k-border, #E7E2D3)", borderRadius: "var(--k-radius-container, 10px)",
    boxShadow: "0 12px 40px rgba(0,0,0,.18)", padding: "14px 16px",
    font: "500 13.5px/1.4 var(--k-font-sans, ui-sans-serif, system-ui, sans-serif)",
  };
  const qStyle: React.CSSProperties = { margin: "0 0 11px", paddingRight: 18 };
  const btnRow: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "nowrap" };
  const btn: React.CSSProperties = {
    font: "inherit", fontWeight: 600, cursor: "pointer", padding: "6px 12px", borderRadius: "var(--k-radius-control, 6px)",
    border: "1px solid var(--k-border-strong, #D3CCB9)", background: "var(--k-bg-surface, #fff)", color: "var(--k-text-secondary, #5C5647)", whiteSpace: "nowrap",
  };
  const primary: React.CSSProperties = {
    ...btn, border: "1px solid transparent", background: "var(--k-action-fill, #394293)", color: "var(--k-on-action-fill, #fff)",
  };
  const close: React.CSSProperties = {
    position: "absolute", top: 10, right: 12, cursor: "pointer", color: "var(--k-text-tertiary, #98917E)",
    background: "none", border: "none", font: "inherit", fontSize: 16, lineHeight: 1, padding: 2,
  };
  const inputStyle: React.CSSProperties = {
    flex: 1, font: "inherit", padding: "7px 10px", borderRadius: "var(--k-radius-control, 6px)",
    border: "1px solid var(--k-border, #E7E2D3)", background: "var(--k-bg-sunken, #F7F6F1)", color: "inherit", minWidth: 0,
  };

  const choices = spec.responseType === "choice" && spec.options ? spec.options : spec.answers;

  return createPortal(
    <div style={wrap} role="dialog" aria-label="Feedback">
      <button style={close} aria-label="Dismiss" onClick={() => (sent ? done() : step === "q" ? ignore() : done())}>×</button>

      {sent ? (
        <p style={{ margin: "2px 0", display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <span style={{ color: "var(--k-action-fill, #394293)" }}>✓</span> Thanks — that’s logged.
        </p>
      ) : isText ? (
        // User-initiated: free text, no rating (§7).
        <>
          <p style={qStyle}>{spec.question}</p>
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={5}
            placeholder="Type your feedback…" style={{ ...inputStyle, width: "100%", minHeight: 108, resize: "vertical", marginBottom: 10 }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button style={{ ...btn, border: "none", background: "none" }} onClick={ignore}>Cancel</button>
            <button style={primary} disabled={!text.trim()} onClick={() => { onAnswer(); onNote(text.trim()); finish(); }}>Send</button>
          </div>
        </>
      ) : step === "q" ? (
        <>
          <p style={qStyle}>{spec.question}</p>
          <div style={btnRow}>
            {choices.map((a) => (
              <button key={a.key} style={btn} aria-label={(a as { aria?: string }).aria || a.label}
                onClick={() => { onAnswer(a.key); setStep("note"); }}>{a.label}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p style={qStyle}>{spec.followup}</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onNote(text.trim()); finish(); } }}
              placeholder="one line, optional" style={inputStyle} />
            <button style={primary} onClick={() => { if (text.trim()) onNote(text.trim()); finish(); }}>Send</button>
            <button style={{ ...btn, border: "none", background: "none", padding: "6px 4px" }} onClick={done}>Skip</button>
          </div>
        </>
      )}

      {/* Required attribution (Augur License §1) — always shown, links to the repo. */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}><AugurByline /></div>
    </div>,
    document.body,
  );
}
