import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AnswerOption, AugurStrings, Category, MoreLink, Presentation, ResponseType } from "./config";
import { AugurByline } from "./mark";

// The snackbar (AUGUR-HANDOFF §4, Patch 2 §4/§7/§8/§9). Self-contained: inline
// styles reading host --k-* tokens with sane fallbacks, so it inherits the host
// look and renders fine where none are defined. Never a modal, never centre-screen,
// never in the prose column. One prompt → the optional line, in place.
//
// Response type decides a triggered prompt's first step: choice3/choice show answer buttons;
// text shows a single free-text box. The button's panel (`panel` set) is person-
// initiated: categories → a line → sent, or straight to the line with no categories.
//
// Focus: a triggered prompt never takes focus (it interrupts gently); the panel does, onto the
// first category or the textarea. The mount returns focus on close.

const AUTO_DISMISS_MS = 20_000;

export interface PromptSpec {
  question: string;
  followup: string;
  responseType: ResponseType;
  answers: AnswerOption[];                     // choice3
  options?: { key: string; label: string }[]; // choice
  position: Presentation["position"];
}

export function AugurPrompt({ spec, panel, strings, byline = true, onAnswer, onNote, onIgnore, onDone, onSubmit }: {
  spec: PromptSpec;
  // Set for the button's panel (person-initiated). Absent for a triggered prompt.
  panel?: { categories: Category[]; moreLink?: MoreLink };
  strings: AugurStrings;
  byline?: boolean;
  onAnswer: (answer?: string) => void;   // triggers: marks the row answered
  onNote: (body: string) => Promise<void> | void;   // triggers: the optional line; rejects if not stored
  onIgnore: () => void;                  // closed without answering/sending (×, Esc, Cancel, timeout)
  onDone: () => void;                    // closed after answering/sending
  onSubmit?: (category: string | undefined, body: string) => Promise<void> | void;   // the panel's Send; rejects if not stored
}) {
  const isPanel = !!panel;
  const cats = panel?.categories ?? [];
  const isText = isPanel || spec.responseType === "text";
  const [step, setStep] = useState<"q" | "note">("q");
  const [cat, setCat] = useState<Category | null>(null);   // panel: chosen category
  const [text, setText] = useState("");
  const closed = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const picking = isPanel && cats.length > 0 && !cat;

  const ignore = () => { if (closed.current) return; closed.current = true; onIgnore(); };
  const done = () => { if (closed.current) return; closed.current = true; onDone(); };
  // A short thank-you so a Send visibly lands, then close.
  const finish = () => { if (closed.current || sent) return; setSent(true); window.setTimeout(done, 1500); };
  // Thank only once the write is stored. On failure keep the text and say so.
  const write = async (w: () => Promise<void> | void) => {
    if (sending) return;
    setSending(true); setFailed(false);
    try { await w(); finish(); } catch { setFailed(true); } finally { setSending(false); }
  };
  const dismiss = () => (sent ? done() : step === "q" ? ignore() : done());

  // 20s no-interaction auto-dismiss — triggered prompts only, and only on the first step.
  // Silence is a real signal (§6.3): it resolves the row to 'ignored'. The panel
  // never times out: the person opened it and may be mid-sentence.
  useEffect(() => {
    if (isPanel || step !== "q" || sent) return;
    const t = window.setTimeout(ignore, AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [step, sent]);

  // Esc closes, in every state.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); dismiss(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [step, sent]);

  // The panel takes focus: the first category, or the textarea once writing.
  useEffect(() => {
    if (!isPanel || sent) return;
    rootRef.current?.querySelector<HTMLElement>(picking ? "[data-augur-cat]" : "textarea")?.focus();
  }, [isPanel, picking, sent]);

  // Announce the current heading politely. Filled a tick after mount so screen
  // readers register the live region before its text changes.
  const heading = sent ? strings.sent : picking ? strings.categoryQuestion : cat ? cat.label : step === "note" ? spec.followup : spec.question;
  const [announce, setAnnounce] = useState("");
  useEffect(() => { const t = window.setTimeout(() => setAnnounce(heading), 50); return () => window.clearTimeout(t); }, [heading]);

  const side = spec.position === "bottom-left" ? { left: 24 } : { right: 24 };
  const wrap: React.CSSProperties = {
    position: "fixed", bottom: 24, ...side, zIndex: 2147483000, width: isText ? "min(460px, calc(100vw - 32px))" : "min(360px, calc(100vw - 32px))",
    background: "var(--k-bg-raised, #ffffff)", color: "var(--k-text-primary, #1F1C15)",
    border: "1px solid var(--k-border, #E7E2D3)", borderRadius: "var(--k-radius-container, 10px)",
    boxShadow: "0 12px 40px rgba(0,0,0,.18)", padding: "14px 16px",
    font: "500 13.5px/1.4 var(--k-font-sans, ui-sans-serif, system-ui, sans-serif)",
  };
  const qStyle: React.CSSProperties = { margin: "0 0 11px", paddingRight: 30 };
  const btnRow: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "nowrap" };
  const btn: React.CSSProperties = {
    // 44px minimum: WCAG 2.5.5 (AAA) target size.
    font: "inherit", fontWeight: 600, cursor: "pointer", padding: "6px 12px", minHeight: 44, minWidth: 44, borderRadius: "var(--k-radius-control, 6px)",
    border: "1px solid var(--k-border-strong, #D3CCB9)", background: "var(--k-bg-surface, #fff)", color: "var(--k-text-secondary, #5C5647)", whiteSpace: "nowrap",
  };
  const primary: React.CSSProperties = {
    ...btn, border: "1px solid transparent", background: "var(--k-action-fill, #394293)", color: "var(--k-on-action-fill, #fff)",
  };
  // Send with nothing typed: still in place, visibly unavailable.
  const primaryOff: React.CSSProperties = { ...primary, opacity: 0.45, cursor: "not-allowed" };
  const close: React.CSSProperties = {
    position: "absolute", top: 0, right: 0, width: 44, height: 44, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--k-text-tertiary, #98917E)",
    background: "none", border: "none", font: "inherit", fontSize: 16, lineHeight: 1, padding: 0,
  };
  const inputStyle: React.CSSProperties = {
    flex: 1, font: "inherit", padding: "7px 10px", minHeight: 44, boxSizing: "border-box", borderRadius: "var(--k-radius-control, 6px)",
    border: "1px solid var(--k-border, #E7E2D3)", background: "var(--k-bg-sunken, #F7F6F1)", color: "inherit", minWidth: 0,
  };
  const quiet: React.CSSProperties = { ...btn, border: "none", background: "none" };

  const choices = spec.responseType === "choice" && spec.options ? spec.options : spec.answers;
  const send = () => {
    if (!text.trim()) return;
    if (isPanel) void write(() => onSubmit?.(cat?.key, text.trim()));
    else { onAnswer(); void write(() => onNote(text.trim())); }
  };
  const sendNote = () => { if (text.trim()) void write(() => onNote(text.trim())); else finish(); };
  const error = failed && <p role="alert" style={{ margin: "0 0 10px", color: "var(--k-danger, #B4453B)", fontSize: 12.5 }}>{strings.sendFailed}</p>;

  return createPortal(
    <div ref={rootRef} className="augur-ui" style={wrap} role="region" aria-label={strings.promptLabel}>
      <style>{FOCUS_CSS}</style>
      <span aria-live="polite" style={SR_ONLY}>{announce}</span>
      <button style={close} aria-label={strings.close} onClick={dismiss}>×</button>

      {sent ? (
        <p style={{ margin: "2px 0", display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <span style={{ color: "var(--k-action-fill, #394293)" }} aria-hidden="true">✓</span> {strings.sent}
        </p>
      ) : picking ? (
        // The panel, step 1: what kind of thing is this?
        <>
          <p style={qStyle}>{strings.categoryQuestion}</p>
          <div style={{ ...btnRow, flexWrap: "wrap" }}>
            {cats.map((c) => (
              <button key={c.key} data-augur-cat style={btn} onClick={() => setCat(c)}>{c.label}</button>
            ))}
          </div>
        </>
      ) : isText ? (
        // Free text: the panel's line (after a category, or with none), or a text trigger.
        <>
          {cat ? (
            <button style={{ ...quiet, padding: "0 4px", margin: "-8px 0 2px -4px", fontSize: 12.5 }} aria-label={`${strings.back}: ${cat.label}`}
              onClick={() => setCat(null)}>‹ {cat.label}</button>
          ) : <p style={qStyle}>{spec.question}</p>}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
            aria-label={cat ? cat.label : spec.question}
            placeholder={cat?.placeholder || strings.textPlaceholder} style={{ ...inputStyle, width: "100%", minHeight: 108, resize: "vertical", marginBottom: 10 }} />
          {error}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button style={quiet} onClick={ignore}>{strings.cancel}</button>
            <button style={text.trim() && !sending ? primary : primaryOff} disabled={!text.trim() || sending} onClick={send}>{sending ? strings.sending : strings.send}</button>
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
          {error}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Focus here is fine: the person just chose to answer. */}
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} aria-label={spec.followup}
              onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) sendNote(); }}
              placeholder={strings.notePlaceholder} style={inputStyle} />
            <button style={sending ? primaryOff : primary} disabled={sending} onClick={sendNote}>{sending ? strings.sending : strings.send}</button>
            <button style={{ ...quiet, padding: "6px 4px" }} onClick={done}>{strings.skip}</button>
          </div>
        </>
      )}

      {/* The "by Augur" credit — on by default, off via <Augur byline={false} />.
          Kept on the opposite side from the action buttons so it never sits under them.
          On the category step the optional "Say more" link sits opposite it. */}
      {(byline || (picking && panel?.moreLink)) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 2, marginBottom: -8 }}>
          {byline ? <AugurByline /> : <span />}
          {picking && panel?.moreLink && (
            <a href={panel.moreLink.href} target="_blank" rel="noreferrer noopener"
              style={{ display: "inline-flex", alignItems: "center", minHeight: 44, fontSize: 12.5, fontWeight: 600, color: "var(--k-text-secondary, #5C5647)", textDecoration: "none" }}>
              {panel.moreLink.label} <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

// Visible focus ring on every control, from the host's action colour.
const FOCUS_CSS = `.augur-ui :is(button,a,input,textarea):focus-visible{outline:2px solid var(--k-action-fill,#394293);outline-offset:2px}`;
const SR_ONLY: React.CSSProperties = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };
