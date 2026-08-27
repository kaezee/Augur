import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mergeConfig, responseTypeOf, type AugurConfig, type TriggerDef } from "./config";
import type { AdminNote, AugurStore, DateRange, Summary, TriggerStat, Unconfigured } from "./store";
import { AugurPrompt, type PromptSpec } from "./prompt";
import { AugurWordmark, AUGUR_REPO_URL } from "./mark";

// The Augur admin surface (AUGUR-HANDOFF §7, replaced by Patch 2 §6). A section, not
// a route: the host mounts it behind its own guard. Two tabs — Results (read, the
// default) and Settings (tune). Portable: --k-* tokens with fallbacks, no host classes.

// ── shared inline styles ──
const card: React.CSSProperties = { background: "var(--k-bg-raised, #fff)", border: "1px solid var(--k-border, #E7E2D3)", borderRadius: "var(--k-radius-container, 10px)", padding: 18, marginBottom: 16 };
const muted: React.CSSProperties = { color: "var(--k-text-tertiary, #98917E)", fontSize: 12.5 };
const lbl: React.CSSProperties = { display: "block", ...muted, marginBottom: 4, fontWeight: 600 };
const input: React.CSSProperties = { font: "inherit", padding: "7px 10px", borderRadius: "var(--k-radius-control, 6px)", width: "100%", border: "1px solid var(--k-border, #E7E2D3)", background: "var(--k-bg-surface, #fff)", color: "inherit", boxSizing: "border-box" };
const btn: React.CSSProperties = { font: "inherit", fontWeight: 600, cursor: "pointer", padding: "7px 12px", borderRadius: "var(--k-radius-control, 6px)", border: "1px solid var(--k-border-strong, #D3CCB9)", background: "var(--k-bg-surface, #fff)", color: "var(--k-text-secondary, #5C5647)" };
const primary: React.CSSProperties = { ...btn, border: "1px solid transparent", background: "var(--k-action-fill, #394293)", color: "var(--k-on-action-fill, #fff)" };
const DASH = "—";
// How each response type reads to a human (the raw ids — choice3/choice/text —
// are jargon; "choice3" was being misread as "trigger 3").
const RESPONSE_LABEL: Record<"choice3" | "choice" | "text", string> = {
  choice3: "Yes / Not really / Not sure",
  choice: "Multiple choice",
  text: "Free text",
};

// ── range presets ──
type Preset = "7d" | "30d" | "90d" | "all";
const PRESETS: [Preset, string][] = [["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["all", "All time"]];
function rangeFor(p: Preset): DateRange {
  const to = new Date(Date.now() + 1000).toISOString();
  const days = p === "7d" ? 7 : p === "30d" ? 30 : p === "90d" ? 90 : 0;
  const from = days ? new Date(Date.now() - days * 86_400_000).toISOString() : new Date(0).toISOString();
  return { from, to };
}

// ── optional reading hooks (Patch 2 §10) ──
export function useAugurSummary(store: AugurStore, range: DateRange) {
  const [data, setData] = useState<Summary | null>(null);
  const reload = useCallback(() => { store.readSummary?.(range).then(setData).catch(() => setData(null)); }, [store, range]);
  useEffect(reload, [reload]);
  return { data, reload };
}
export function useAugurNotes(store: AugurStore, unreadOnly = false) {
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const reload = useCallback(() => { store.readNotes?.({ unreadOnly }).then(setNotes).catch(() => setNotes([])); }, [store, unreadOnly]);
  useEffect(reload, [reload]);
  const markRead = useCallback(async (id: string) => { await store.markNoteRead?.(id); reload(); }, [store, reload]);
  return { notes, reload, markRead };
}

// A host may inject a nicer confirm dialog; otherwise the portable module uses
// window.confirm so destructive actions still prompt anywhere.
export type Confirm = (message: string) => Promise<boolean>;

export function AugurAdminSection({ store, hostConfig, selfUserId, confirm }: {
  store: AugurStore;
  hostConfig: Partial<AugurConfig> & { triggers: Record<string, TriggerDef> };
  selfUserId?: string;   // the admin's own id — enables "Send it to me now"
  confirm?: Confirm;
}) {
  const ask: Confirm = confirm ?? (async (m) => (typeof window !== "undefined" ? window.confirm(m) : false));
  const [tab, setTab] = useState<"results" | "settings">("results");
  const [preset, setPreset] = useState<Preset>("30d");
  const range = useMemo(() => rangeFor(preset), [preset]);

  // effective config (base ← host ← live overrides), the editable draft for Settings.
  const [draft, setDraft] = useState<AugurConfig | null>(null);
  const loadedRef = useRef<AugurConfig | null>(null);
  useEffect(() => {
    let live = true;
    store.readConfig().then((o) => { if (!live) return; const c = mergeConfig(hostConfig, o); setDraft(c); loadedRef.current = c; })
      .catch(() => { if (!live) return; const c = mergeConfig(hostConfig, {}); setDraft(c); loadedRef.current = c; });
    return () => { live = false; };
  }, [store, hostConfig]);

  const declared = draft ? Object.keys(draft.triggers).length : 0;
  const enabled = draft ? Object.values(draft.triggers).filter((t) => t.enabled).length : 0;

  return (
    <section style={{ font: "500 14px/1.5 var(--k-font-sans, ui-sans-serif, system-ui, sans-serif)", color: "var(--k-text-primary, #1F1C15)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 4 }}>
        <div>
          <h1 style={{ margin: 0, display: "inline-flex", alignItems: "center" }}><AugurWordmark size={26} /></h1>
          <p style={{ ...muted, margin: "2px 0 0" }}>{declared} triggers declared, {enabled} enabled · adding or removing a trigger needs a code change.</p>
        </div>
        <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} style={{ ...btn, cursor: "pointer" }}>
          {PRESETS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--k-border, #E7E2D3)", margin: "14px 0 20px" }}>
        {(["results", "settings"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ ...btn, border: "none", background: "none", borderRadius: 0, borderBottom: tab === t ? "2px solid var(--k-action-fill, #394293)" : "2px solid transparent", color: tab === t ? "var(--k-text-primary, #1F1C15)" : "var(--k-text-tertiary, #98917E)", textTransform: "capitalize" }}>{t}</button>
        ))}
      </div>

      {!draft ? <p style={muted}>Loading…</p>
        : tab === "results" ? <Results store={store} draft={draft} range={range} ask={ask} />
        : <Settings store={store} draft={draft} setDraft={setDraft} loadedRef={loadedRef} selfUserId={selfUserId} ask={ask} />}
    </section>
  );
}

// ── RESULTS ───────────────────────────────────────────────────────────────────
function Results({ store, draft, range, ask }: { store: AugurStore; draft: AugurConfig; range: DateRange; ask: Confirm }) {
  const [statsRange, setStatsRange] = useState<TriggerStat[]>([]);
  const [statsAll, setStatsAll] = useState<TriggerStat[]>([]);
  const { notes, markRead, reload: reloadNotes } = useAugurNotes(store, false);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const deleteNote = async (id: string) => {
    if (!(await ask("Delete this note permanently?"))) return;
    await store.deleteNote?.(id); reloadNotes();
  };

  useEffect(() => { store.readTriggerStats?.(range).then(setStatsRange).catch(() => setStatsRange([])); }, [store, range]);
  useEffect(() => { store.readTriggerStats?.(rangeFor("all")).then(setStatsAll).catch(() => setStatsAll([])); }, [store]);

  const byIdRange = useMemo(() => new Map(statsRange.map((s) => [s.triggerId, s])), [statsRange]);
  const everFired = useMemo(() => new Set(statsAll.filter((s) => s.shown > 0).map((s) => s.triggerId)), [statsAll]);
  const rt = (id: string): "choice3" | "choice" | "text" => id === "manual" ? "text" : draft.triggers[id] ? responseTypeOf(draft.triggers[id]) : "choice3";

  const rowIds = useMemo(() => {
    const ids = new Set<string>([...Object.keys(draft.triggers), ...statsRange.map((s) => s.triggerId), ...statsAll.map((s) => s.triggerId)]);
    return [...ids].sort();
  }, [draft, statsRange, statsAll]);

  // choice3-only summary sentence (§6 rule 4).
  const sentence = useMemo(() => {
    const c3 = rowIds.filter((id) => rt(id) === "choice3");
    let shown = 0, answered = 0, yes = 0, nr = 0, un = 0;
    for (const id of c3) { const s = byIdRange.get(id); if (!s) continue; shown += s.shown; answered += s.answered; yes += s.byAnswer.yes; nr += s.byAnswer.not_really; un += s.byAnswer.unclear; }
    if (shown === 0) return "No rating prompts were shown in this range.";
    if (answered === 0) return `Nobody has answered yet. ${shown} prompt${shown === 1 ? " was" : "s were"} shown and closed without a reply.`;
    return `${answered} of ${shown} shown prompt${shown === 1 ? "" : "s"} got an answer — ${yes} yes, ${nr} not really, ${un} not sure.`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowIds, byIdRange]);

  const shownNotes = notes.filter((n) => !unreadOnly || !n.read);

  return (
    <>
      <div style={card}><p style={{ margin: 0, fontSize: 15 }}>{sentence}</p></div>

      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>{["Trigger", "Shown", "Answered", "Ignored", "Yes", "Not really", "Not sure"].map((h, i) => (
            <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "10px 12px", ...muted, fontWeight: 600, borderBottom: "1px solid var(--k-border, #E7E2D3)" }}>{h}</th>
          ))}</tr></thead>
          <tbody>
            {rowIds.map((id) => {
              const s = byIdRange.get(id);
              const c3 = rt(id) === "choice3";
              const name = <code style={{ fontFamily: "var(--k-font-mono, ui-monospace, monospace)" }}>{id}{id === "manual" ? " ·button" : ""}</code>;
              if (!everFired.has(id)) return (
                <tr key={id} style={{ borderTop: "1px solid var(--k-border, #E7E2D3)" }}>
                  <td style={{ padding: "9px 12px" }}>{name}</td>
                  <td colSpan={6} style={{ padding: "9px 12px", ...muted }}>No prompts shown yet</td>
                </tr>
              );
              if (!s) return (
                <tr key={id} style={{ borderTop: "1px solid var(--k-border, #E7E2D3)" }}>
                  <td style={{ padding: "9px 12px" }}>{name}</td>
                  <td colSpan={6} style={{ padding: "9px 12px", ...muted }}>not shown in this range</td>
                </tr>
              );
              return (
                <tr key={id} style={{ borderTop: "1px solid var(--k-border, #E7E2D3)" }}>
                  <td style={{ padding: "9px 12px" }}>{name}</td>
                  <Num v={s.shown} /><Num v={s.answered} /><Num v={s.ignored} />
                  <Num v={c3 ? s.byAnswer.yes : DASH} /><Num v={c3 ? s.byAnswer.not_really : DASH} /><Num v={c3 ? s.byAnswer.unclear : DASH} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <strong>Notes</strong>
          <label style={{ ...muted, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> unread only
          </label>
        </div>
        {shownNotes.length === 0 ? <p style={muted}>Nothing here.</p> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {shownNotes.map((n) => (
              <li key={n.id} style={{ borderLeft: `2px solid ${n.read ? "var(--k-border, #E7E2D3)" : "var(--k-action-fill, #394293)"}`, paddingLeft: 12 }}>
                <p style={{ margin: "0 0 3px" }}>{n.body}</p>
                <div style={{ ...muted, display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--k-font-mono, ui-monospace, monospace)" }}>{n.triggerId}</span>
                  {n.answer && <span>· {n.answer}</span>}
                  <span>· {new Date(n.createdAt).toLocaleDateString()}</span>
                  <span style={{ marginLeft: "auto", display: "inline-flex", gap: 12 }}>
                    {!n.read && <button onClick={() => markRead(n.id)} style={{ cursor: "pointer", font: "inherit", fontSize: 12, background: "none", border: "none", color: "var(--k-action-fill, #394293)", padding: 0 }}>mark read</button>}
                    <button onClick={() => deleteNote(n.id)} style={{ cursor: "pointer", font: "inherit", fontSize: 12, background: "none", border: "none", color: "var(--k-danger, #B4453B)", padding: 0 }}>delete</button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Num({ v }: { v: number | string }) {
  return <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: v === DASH ? "var(--k-text-tertiary, #98917E)" : undefined }}>{v}</td>;
}

// ── SETTINGS ────────────────────────────────────────────────────────────────
function Settings({ store, draft, setDraft, loadedRef, selfUserId, ask }: {
  store: AugurStore; draft: AugurConfig; setDraft: (c: AugurConfig) => void;
  loadedRef: React.MutableRefObject<AugurConfig | null>; selfUserId?: string; ask: Confirm;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [unconf, setUnconf] = useState<Unconfigured[]>([]);
  const [purgeDays, setPurgeDays] = useState(90);
  const [purging, setPurging] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);
  useEffect(() => { store.readUnconfigured?.().then(setUnconf).catch(() => setUnconf([])); }, [store]);

  async function purge(beforeDays: number | null) {
    const label = beforeDays == null ? "ALL feedback and insights" : `feedback older than ${beforeDays} days`;
    if (!(await ask(`Permanently delete ${label}? Events, notes, and unconfigured records are removed; your settings are kept. This can’t be undone.`))) return;
    setPurging(true); setPurgeMsg(null);
    try { const n = await store.purgeData?.(beforeDays); setPurgeMsg(`Removed ${n ?? 0} event${n === 1 ? "" : "s"}.`); }
    catch (e) { setPurgeMsg(String((e as Error)?.message ?? e)); }
    finally { setPurging(false); }
  }

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(loadedRef.current), [draft, loadedRef]);
  const pending = useMemo(() => {
    const base = loadedRef.current; if (!base) return 0; let n = 0;
    if (base.enabled !== draft.enabled) n++; if (base.persistentButton !== draft.persistentButton) n++;
    if (JSON.stringify(base.caps) !== JSON.stringify(draft.caps)) n++;
    for (const id of Object.keys(draft.triggers)) if (JSON.stringify(base.triggers[id]) !== JSON.stringify(draft.triggers[id])) n++;
    return n;
  }, [draft, loadedRef]);

  const patchTrigger = (id: string, p: Partial<TriggerDef>) => setDraft({ ...draft, triggers: { ...draft.triggers, [id]: { ...draft.triggers[id], ...p } } });

  async function save() {
    setSaving(true);
    const base = loadedRef.current;
    const triggers = Object.fromEntries(Object.entries(draft.triggers).map(([id, t]) => {
      const version = base && t.question !== base.triggers[id]?.question ? t.version + 1 : t.version;
      return [id, { ...t, version }];
    }));
    const overrides: Partial<AugurConfig> = { enabled: draft.enabled, persistentButton: draft.persistentButton, caps: draft.caps, triggers };
    try { await store.writeConfig?.(overrides); const next = { ...draft, triggers } as AugurConfig; setDraft(next); loadedRef.current = next; }
    finally { setSaving(false); }
  }

  function configure(id: string) {
    // §5 — scaffold a config override for a trigger seen in the wild. The emit already
    // exists (that's why it fired); adding the entry makes it a real, tunable trigger.
    patchTrigger(id, { enabled: true, version: 1, delayMs: 2000, maxAsks: 1, dismissKill: 2, question: `Placeholder question for ${id} — reword me.` });
    setOpen(id);
  }

  return (
    <div style={{ paddingBottom: dirty ? 72 : 0 }}>
      <div style={card}>
        <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Master</h2>
        <Toggle checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} title="Augur enabled" hint="Off means no prompt ever surfaces, for anyone." />
        <Toggle checked={draft.persistentButton} onChange={(v) => setDraft({ ...draft, persistentButton: v })} title="Persistent feedback button" hint="The always-available button (beta). Off hides it; timed triggers still fire." />
        <p style={{ ...muted, margin: "6px 0 0" }}>The “by Augur” byline is part of the free license and always shows.</p>
      </div>

      <div style={card}>
        <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Caps</h2>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Field label="1 prompt / session" v={draft.caps.perSession} onChange={(n) => setDraft({ ...draft, caps: { ...draft.caps, perSession: n } })} />
          <Field label="Min days between prompts" v={draft.caps.perUserDays} onChange={(n) => setDraft({ ...draft, caps: { ...draft.caps, perUserDays: n } })} />
          <Field label="Quiet days after an answer" v={draft.caps.suppressAfterAnswerDays} onChange={(n) => setDraft({ ...draft, caps: { ...draft.caps, suppressAfterAnswerDays: n } })} />
        </div>
      </div>

      <div style={card}>
        <h2 style={{ margin: "0 0 2px", fontSize: 16 }}>Triggers</h2>
        <p style={{ ...muted, margin: "0 0 12px" }}>Reword and tune here. Adding or removing a trigger is a code change, not a setting.</p>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {Object.entries(draft.triggers).map(([id, t]) => (
            <TriggerRow key={id} id={id} t={t} isOpen={open === id} onToggleOpen={() => setOpen(open === id ? null : id)}
              patch={(p) => patchTrigger(id, p)} draft={draft} store={store} selfUserId={selfUserId} />
          ))}
        </div>
      </div>

      {unconf.length > 0 && (
        <div style={card}>
          <h2 style={{ margin: "0 0 2px", fontSize: 16 }}>Unconfigured</h2>
          <p style={{ ...muted, margin: "0 0 12px" }}>Emitted in the wild with no config entry — shown to nobody. Configure to scaffold one.</p>
          {unconf.map((u) => (
            <div key={u.triggerId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderTop: "1px solid var(--k-border, #E7E2D3)", padding: "10px 0" }}>
              <span><code style={{ fontFamily: "var(--k-font-mono, ui-monospace, monospace)" }}>{u.triggerId}</code> <span style={muted}>· seen {u.seen}× · {new Date(u.lastSeen).toLocaleDateString()}</span></span>
              <button style={btn} onClick={() => configure(u.triggerId)}>Configure this</button>
            </div>
          ))}
        </div>
      )}

      <div style={card}>
        <h2 style={{ margin: "0 0 2px", fontSize: 16 }}>Maintenance</h2>
        <p style={{ ...muted, margin: "0 0 12px" }}>Feedback and insights accumulate. Clear out old data to keep this fast — your triggers and settings are never touched.</p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5 }}>Delete feedback older than</span>
          <select value={purgeDays} onChange={(e) => setPurgeDays(Number(e.target.value))} style={{ ...btn, cursor: "pointer" }}>
            {[30, 90, 180, 365].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
          <button style={btn} onClick={() => purge(purgeDays)} disabled={purging}>{purging ? "Working…" : "Clear old"}</button>
          <button style={{ ...btn, color: "var(--k-danger, #B4453B)", borderColor: "var(--k-danger, #B4453B)" }} onClick={() => purge(null)} disabled={purging}>Delete all feedback</button>
          {purgeMsg && <span style={muted}>{purgeMsg}</span>}
        </div>
      </div>

      <div style={card}>
        <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>About</h2>
        <p style={muted}>Augur · in-product feedback · v2. {AUGUR_REPO_URL
          ? <a href={AUGUR_REPO_URL} target="_blank" rel="noreferrer noopener" style={{ color: "var(--k-action-fill, #394293)" }}>Repository</a>
          : "Repository link appears once it’s public."}</p>
      </div>

      {dirty && (
        <div style={{ position: "sticky", bottom: 0, marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", background: "var(--k-bg-raised, #fff)", border: "1px solid var(--k-border-strong, #D3CCB9)", borderRadius: "var(--k-radius-container, 10px)", boxShadow: "0 -4px 20px rgba(0,0,0,.08)" }}>
          <span style={muted}>{pending} unsaved change{pending === 1 ? "" : "s"} · rewording a question re-versions it.</span>
          <button style={primary} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      )}
    </div>
  );
}

function TriggerRow({ id, t, isOpen, onToggleOpen, patch, draft, store, selfUserId }: {
  id: string; t: TriggerDef; isOpen: boolean; onToggleOpen: () => void; patch: (p: Partial<TriggerDef>) => void;
  draft: AugurConfig; store: AugurStore; selfUserId?: string;
}) {
  const [preview, setPreview] = useState<{ eventId: string } | null>(null);
  const type = responseTypeOf(t);
  const spec: PromptSpec = { question: t.question, followup: t.followup ?? draft.followup, responseType: type, answers: draft.answers, options: t.options, position: draft.presentation.position };

  async function sendToMe() {
    if (!selfUserId) return;
    try { const eventId = await store.logShown({ userId: selfUserId, triggerId: id, triggerVer: t.version }); setPreview({ eventId }); } catch { /* ignore */ }
  }
  const close = (outcome: "ignored" | "answered", answer?: string) => {
    if (preview) store.logOutcome(preview.eventId, outcome, answer).catch(() => {});
    setPreview(null);
  };

  return (
    <div style={{ borderTop: "1px solid var(--k-border, #E7E2D3)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 0", cursor: "pointer" }} onClick={onToggleOpen}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <code style={{ fontFamily: "var(--k-font-mono, ui-monospace, monospace)", fontSize: 13 }}>{id}</code>
          <span style={{ ...muted, border: "1px solid var(--k-border, #E7E2D3)", borderRadius: 4, padding: "1px 6px" }} title="How people answer this prompt">{RESPONSE_LABEL[type]}</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          {/* stopPropagation only on the toggle, so it doesn't also expand the row;
              the chevron stays part of the header's open/close click. */}
          <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>
            <Toggle checked={t.enabled} onChange={(v) => patch({ enabled: v })} title="" hint="" compact />
          </span>
          <span style={muted} aria-hidden>{isOpen ? "▲" : "▼"}</span>
        </span>
      </div>
      {isOpen && (
        <div style={{ padding: "0 0 16px", opacity: t.enabled ? 1 : 0.6 }}>
          <label style={lbl}>Question</label>
          <textarea value={t.question} onChange={(e) => patch({ question: e.target.value })} rows={2} style={{ ...input, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "10px 0" }}>
            <Field label="Delay (seconds)" v={Math.round(t.delayMs / 1000)} onChange={(n) => patch({ delayMs: n * 1000 })} />
            <Field label="Max asks (lifetime)" v={t.maxAsks} onChange={(n) => patch({ maxAsks: n })} />
            <Field label="Dies after N ignores" v={t.dismissKill} onChange={(n) => patch({ dismissKill: n })} />
          </div>
          {selfUserId && <button style={btn} onClick={sendToMe}>Send it to me now — the real prompt, at real width</button>}
        </div>
      )}
      {preview && <AugurPrompt spec={spec} onAnswer={(a) => { store.logOutcome(preview.eventId, "answered", a).catch(() => {}); }} onNote={(b) => store.logNote(preview.eventId, b).catch(() => {})} onIgnore={() => close("ignored")} onDone={() => setPreview(null)} />}
    </div>
  );
}

function Toggle({ checked, onChange, title, hint, compact }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string; compact?: boolean }) {
  return (
    <label style={{ display: "flex", alignItems: compact ? "center" : "flex-start", gap: 10, cursor: "pointer", padding: compact ? 0 : "8px 0" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: compact ? 0 : 3, width: 16, height: 16, accentColor: "var(--k-action-fill, #394293)" }} />
      {title && <span><span style={{ fontWeight: 600 }}>{title}</span><br /><span style={muted}>{hint}</span></span>}
    </label>
  );
}

function Field({ label: text, v, onChange }: { label: string; v: number; onChange: (n: number) => void }) {
  return (
    <div style={{ minWidth: 120 }}>
      <label style={lbl}>{text}</label>
      <input type="number" min={0} value={v} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} style={{ ...input, width: 150 }} />
    </div>
  );
}
