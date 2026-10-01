import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lockedInCode, mergeConfig, responseTypeOf, type AugurConfig, type ConfigOverrides, type HostConfig, type TriggerDef } from "./config";
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

export function AugurAdminSection({ store, hostConfig, confirm }: {
  store: AugurStore;
  hostConfig: HostConfig;
  selfUserId?: string;   // accepted for host compatibility; previews need no user
  confirm?: Confirm;
}) {
  const ask: Confirm = confirm ?? (async (m) => (typeof window !== "undefined" ? window.confirm(m) : false));
  const [tab, setTab] = useState<"results" | "settings">("results");
  const [preset, setPreset] = useState<Preset>("30d");
  const range = useMemo(() => rangeFor(preset), [preset]);

  // effective config (base ← host ← live overrides), the editable draft for Settings.
  const [draft, setDraft] = useState<AugurConfig | null>(null);
  const loadedRef = useRef<AugurConfig | null>(null);
  // The raw stored overrides, so a save never writes back a switch code has locked.
  const storedRef = useRef<ConfigOverrides>({});
  const locks = useMemo(() => lockedInCode(hostConfig), [hostConfig]);
  useEffect(() => {
    let live = true;
    store.readConfig().then((o) => { if (!live) return; storedRef.current = o ?? {}; const c = mergeConfig(hostConfig, o ?? {}); setDraft(c); loadedRef.current = c; })
      .catch(() => { if (!live) return; storedRef.current = {}; const c = mergeConfig(hostConfig, {}); setDraft(c); loadedRef.current = c; });
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

      {draft?.mode === "testing" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "10px 14px", borderRadius: "var(--k-radius-container, 10px)", border: "1px solid var(--k-warning, #B5852A)", background: "var(--k-warning-wash, rgba(181,133,42,.10))", color: "var(--k-text-primary, #1F1C15)", fontSize: 13.5 }}>
          <strong>Testing mode</strong>
          <span style={muted}>· prompts still appear, but nothing is captured. Turn it off in Settings → Environment to go live.</span>
        </div>
      )}

      {!draft ? <p style={muted}>Loading…</p>
        : tab === "results" ? <Results store={store} draft={draft} range={range} ask={ask} />
        : <Settings store={store} draft={draft} setDraft={setDraft} loadedRef={loadedRef} storedRef={storedRef} locks={locks} ask={ask} />}
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
  const entryPoints = useMemo(() => new Set(["manual", "button", ...notes.filter((n) => n.category != null || n.context != null).map((n) => n.triggerId)]), [notes]);
  const rt = (id: string): "choice3" | "choice" | "text" => draft.triggers[id] ? responseTypeOf(draft.triggers[id]) : entryPoints.has(id) ? "text" : "choice3";

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

  // Submissions from the button's panel: notes carrying a category or context. Their
  // trigger id is the entry point ("button", or the host's own label; "manual" from
  // before 0.3 counts as the button). Counted within the selected range.
  const [catFilter, setCatFilter] = useState("all");
  const sourceOf = (n: AdminNote) => (n.triggerId === "manual" ? "button" : n.triggerId);
  const submissions = useMemo(() => notes.filter((n) => (n.category != null || n.context != null)
    && n.createdAt >= range.from && n.createdAt < range.to), [notes, range]);
  const tally = (key: (n: AdminNote) => string) => {
    const m = new Map<string, number>();
    for (const n of submissions) m.set(key(n), (m.get(key(n)) ?? 0) + 1);
    return [...m.entries()].sort((a, z) => z[1] - a[1]);
  };
  const byCategory = useMemo(() => tally((n) => n.category || DASH), [submissions]); // eslint-disable-line react-hooks/exhaustive-deps
  const bySource = useMemo(() => tally(sourceOf), [submissions]); // eslint-disable-line react-hooks/exhaustive-deps
  const categoryLabel = (k: string) => draft.categories.find((c) => c.key === k)?.label ?? k;
  const noteCats = [...new Set(notes.map((n) => n.category).filter((c): c is string => !!c))].sort();

  const shownNotes = notes.filter((n) => (!unreadOnly || !n.read) && (catFilter === "all" || n.category === catFilter));

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
              const name = <code style={{ fontFamily: "var(--k-font-mono, ui-monospace, monospace)" }}>{id}{entryPoints.has(id) && !draft.triggers[id] ? " ·button" : ""}</code>;
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

      {submissions.length > 0 && (
        <div style={{ ...card, display: "flex", gap: 24, flexWrap: "wrap" }}>
          <p style={{ margin: 0, fontSize: 15, flexBasis: "100%" }}>{submissions.length} submission{submissions.length === 1 ? "" : "s"} from the feedback button in this range.</p>
          <Tally title="By category" rows={byCategory.map(([k, n]) => [k === DASH ? "No category" : categoryLabel(k), n])} />
          <Tally title="By entry point" rows={bySource} />
        </div>
      )}

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          <strong>Notes</strong>
          <span style={{ display: "inline-flex", gap: 14, alignItems: "center" }}>
            {noteCats.length > 0 && (
              <label style={{ ...muted, display: "flex", gap: 6, alignItems: "center" }}>category
                <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ font: "inherit", fontSize: 12.5 }}>
                  <option value="all">all</option>
                  {noteCats.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                </select>
              </label>
            )}
            <label style={{ ...muted, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> unread only
            </label>
          </span>
        </div>
        {shownNotes.length === 0 ? <p style={muted}>Nothing here.</p> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {shownNotes.map((n) => (
              <li key={n.id} style={{ borderLeft: `2px solid ${n.read ? "var(--k-border, #E7E2D3)" : "var(--k-action-fill, #394293)"}`, paddingLeft: 12 }}>
                <p style={{ margin: "0 0 3px" }}>{n.body}</p>
                <div style={{ ...muted, display: "flex", gap: 8, alignItems: "center" }}>
                  {n.category && <span style={{ border: "1px solid var(--k-border, #E7E2D3)", borderRadius: 4, padding: "0 6px" }}>{categoryLabel(n.category)}</span>}
                  <span style={{ fontFamily: "var(--k-font-mono, ui-monospace, monospace)" }}>{n.triggerId}</span>
                  {n.answer && <span>· {n.answer}</span>}
                  <span>· {new Date(n.createdAt).toLocaleDateString()}</span>
                  <span style={{ marginLeft: "auto", display: "inline-flex", gap: 12 }}>
                    {!n.read && <button onClick={() => markRead(n.id)} style={{ cursor: "pointer", font: "inherit", fontSize: 12, background: "none", border: "none", color: "var(--k-action-fill, #394293)", padding: 0 }}>mark read</button>}
                    <button onClick={() => deleteNote(n.id)} style={{ cursor: "pointer", font: "inherit", fontSize: 12, background: "none", border: "none", color: "var(--k-danger, #B4453B)", padding: 0 }}>delete</button>
                  </span>
                </div>
                {n.context && <ContextBlock ctx={n.context} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Tally({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div style={{ minWidth: 180 }}>
      <div style={{ ...lbl, marginBottom: 6 }}>{title}</div>
      <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
        <tbody>{rows.map(([k, n]) => (
          <tr key={k}><td style={{ padding: "3px 16px 3px 0" }}>{k}</td><td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{n}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// The stored diagnostic context, in plain words. Reads 0.3's shape and the older
// one (recentErrors as plain strings) alike.
function ContextBlock({ ctx }: { ctx: Record<string, unknown> }) {
  const vp = ctx.viewport as { w?: number; h?: number } | undefined;
  const errs = Array.isArray(ctx.errors) ? (ctx.errors as { type?: string; source?: string; line?: number; message?: string }[])
    .map((e) => `${e.type ?? "Error"}: ${e.message ?? ""}${e.source ? ` (${e.source}${e.line ? `:${e.line}` : ""})` : ""}`)
    : Array.isArray(ctx.recentErrors) ? (ctx.recentErrors as string[]) : [];
  const rows: [string, React.ReactNode][] = [
    ["Page", ctx.route ? <code>{String(ctx.route)}</code> : DASH],
    ["App version", ctx.appVersion ? String(ctx.appVersion) : DASH],
    ["Opened from", ctx.source ? String(ctx.source) : DASH],
    ["Screen size", vp?.w ? `${vp.w} × ${vp.h}` : DASH],
    ["Browser", ctx.userAgent ? String(ctx.userAgent) : DASH],
    ["Recent errors", errs.length ? <code style={{ whiteSpace: "pre-wrap" }}>{errs.join("\n")}</code> : "None"],
    ["Sent at", ctx.timestamp ? new Date(String(ctx.timestamp)).toLocaleString() : DASH],
  ];
  return (
    <details style={{ marginTop: 6 }}>
      <summary style={{ ...muted, cursor: "pointer" }}>Context</summary>
      <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "3px 12px", margin: "6px 0 0", fontSize: 12.5 }}>
        {rows.map(([k, v]) => [<dt key={k + "t"} style={muted}>{k}</dt>, <dd key={k + "d"} style={{ margin: 0, wordBreak: "break-word" }}>{v}</dd>])}
      </dl>
    </details>
  );
}

function Num({ v }: { v: number | string }) {
  return <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: v === DASH ? "var(--k-text-tertiary, #98917E)" : undefined }}>{v}</td>;
}

// ── SETTINGS ────────────────────────────────────────────────────────────────
function Settings({ store, draft, setDraft, loadedRef, storedRef, locks, ask }: {
  store: AugurStore; draft: AugurConfig; setDraft: (c: AugurConfig) => void;
  loadedRef: React.MutableRefObject<AugurConfig | null>;
  storedRef: React.MutableRefObject<ConfigOverrides>;
  locks: ReturnType<typeof lockedInCode>; ask: Confirm;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [unconf, setUnconf] = useState<Unconfigured[]>([]);
  const [purgeDays, setPurgeDays] = useState(90);
  const [purging, setPurging] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);
  const [modeSaving, setModeSaving] = useState(false);
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
    if (base.mode !== draft.mode) n++;
    if (JSON.stringify(base.answers) !== JSON.stringify(draft.answers)) n++;
    if (JSON.stringify(base.caps) !== JSON.stringify(draft.caps)) n++;
    for (const id of Object.keys(draft.triggers)) if (JSON.stringify(base.triggers[id]) !== JSON.stringify(draft.triggers[id])) n++;
    return n;
  }, [draft, loadedRef]);

  const patchTrigger = (id: string, p: Partial<TriggerDef>) => setDraft({ ...draft, triggers: { ...draft.triggers, [id]: { ...draft.triggers[id], ...p } } });

  // A code-locked switch reads as off/testing in the merged draft. Writing that back
  // would keep restraining it after code turns it on again, so keep the stored value.
  function unlockedOnly(o: ConfigOverrides): ConfigOverrides {
    const stored = storedRef.current;
    const triggers = Object.fromEntries(Object.entries(o.triggers ?? {}).map(([id, t]) => {
      if (!locks.triggers[id]) return [id, t];
      const { enabled: _drop, ...rest } = t;
      const keep = stored.triggers?.[id]?.enabled;
      return [id, keep === undefined ? rest : { ...rest, enabled: keep }];
    })) as Record<string, TriggerDef>;
    return {
      ...o,
      enabled: locks.enabled ? stored.enabled : o.enabled,
      persistentButton: locks.persistentButton ? stored.persistentButton : o.persistentButton,
      mode: locks.mode ? stored.mode : o.mode,
      triggers,
    };
  }

  async function save() {
    setSaving(true);
    const base = loadedRef.current;
    const triggers = Object.fromEntries(Object.entries(draft.triggers).map(([id, t]) => {
      const version = base && t.question !== base.triggers[id]?.question ? t.version + 1 : t.version;
      return [id, { ...t, version }];
    }));
    const overrides = unlockedOnly({ enabled: draft.enabled, mode: draft.mode, persistentButton: draft.persistentButton, answers: draft.answers, caps: draft.caps, triggers });
    try { await store.writeConfig?.(overrides); storedRef.current = overrides; const next = { ...draft, triggers } as AugurConfig; setDraft(next); loadedRef.current = next; }
    finally { setSaving(false); }
  }

  // Environment is an operational switch, not a staged edit: persist it the instant
  // it's flipped so it survives a reload, without pulling in other unsaved draft
  // edits. Writes the last-saved override set with only `mode` changed.
  async function commitMode(testing: boolean) {
    const mode: AugurConfig["mode"] = testing ? "testing" : "live";
    setDraft({ ...draft, mode });
    const base = loadedRef.current; if (!base) return;
    setModeSaving(true);
    const overrides = unlockedOnly({ enabled: base.enabled, mode, persistentButton: base.persistentButton, answers: base.answers, caps: base.caps, triggers: base.triggers });
    try { await store.writeConfig?.(overrides); storedRef.current = overrides; loadedRef.current = { ...base, mode }; }
    finally { setModeSaving(false); }
  }

  function configure(id: string) {
    // §5 — scaffold a config override for a trigger seen in the wild. The emit already
    // exists (that's why it fired); adding the entry makes it a real, tunable trigger.
    patchTrigger(id, { enabled: true, version: 1, delayMs: 2000, maxAsks: 1, dismissKill: 2, question: `Placeholder question for ${id} — reword me.` });
    setOpen(id);
  }

  return (
    <div style={{ paddingBottom: dirty ? 72 : 0 }}>
      <div style={{ ...card, borderColor: draft.mode === "testing" ? "var(--k-warning, #B5852A)" : (card.border as string) }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Environment</h2>
        <Toggle checked={draft.mode === "testing"} onChange={commitMode} disabled={locks.mode}
          title="Testing mode"
          hint={locks.mode ? "Set to testing in code. Change `mode` in your Augur config to go live." : "Prompts still appear so you can try the flow — but nothing is recorded: no events, no counts, and clicks on the feedback button aren’t captured either. Turn this off to go live."} />
        <p style={{ ...muted, margin: "6px 0 0" }}>{modeSaving ? "Saving…" : "Applies immediately and survives a reload — no need to Save."}</p>
      </div>

      <div style={card}>
        <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Master</h2>
        <Toggle checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} disabled={locks.enabled} title="Augur enabled"
          hint={locks.enabled ? "Turned off in code. Change `enabled` in your Augur config to turn it back on." : "Off means no prompt and no Feedback button, for anyone."} />
        <Toggle checked={draft.persistentButton} onChange={(v) => setDraft({ ...draft, persistentButton: v })} disabled={locks.persistentButton} title="Persistent feedback button"
          hint={locks.persistentButton ? "Hidden in code. Change `persistentButton` in your Augur config to show it." : "The always-available button (beta). Off hides it; timed triggers still fire."} />
        <p style={{ ...muted, margin: "6px 0 0" }}>The “by Augur” byline shows by default; hide it in code with <code>{"<Augur byline={false} />"}</code>.</p>
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
        <h2 style={{ margin: "0 0 2px", fontSize: 16 }}>Answers</h2>
        <p style={{ ...muted, margin: "0 0 12px" }}>The three replies shown for every “Yes / Not really / Not sure” prompt. Reword the labels to fit your voice — the meaning and how they aggregate stay the same.</p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {draft.answers.map((a, i) => (
            <label key={a.key} style={{ ...lbl, display: "flex", flexDirection: "column", gap: 4, fontWeight: 600 }}>
              {["Affirmative", "Negative", "Unsure"][i] ?? a.key}
              <input value={a.label}
                onChange={(e) => setDraft({ ...draft, answers: draft.answers.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })}
                style={{ ...input, width: 170, fontWeight: 400 }} />
            </label>
          ))}
        </div>
      </div>

      <div style={card}>
        <h2 style={{ margin: "0 0 2px", fontSize: 16 }}>Triggers</h2>
        <p style={{ ...muted, margin: "0 0 12px" }}>Reword and tune here. Adding or removing a trigger is a code change, not a setting.</p>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {Object.entries(draft.triggers).map(([id, t]) => (
            <TriggerRow key={id} id={id} t={t} isOpen={open === id} onToggleOpen={() => setOpen(open === id ? null : id)}
              patch={(p) => patchTrigger(id, p)} draft={draft} locked={!!locks.triggers[id]} />
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

function TriggerRow({ id, t, isOpen, onToggleOpen, patch, draft, locked }: {
  id: string; t: TriggerDef; isOpen: boolean; onToggleOpen: () => void; patch: (p: Partial<TriggerDef>) => void;
  draft: AugurConfig; locked: boolean;
}) {
  // A pure preview — it renders the real prompt but logs NOTHING, so previews
  // never show up in the counts.
  const [preview, setPreview] = useState(false);
  const type = responseTypeOf(t);
  const spec: PromptSpec = { question: t.question, followup: t.followup ?? draft.followup, responseType: type, answers: draft.answers, options: t.options, position: draft.presentation.position };

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
            <Toggle checked={t.enabled} onChange={(v) => patch({ enabled: v })} title="" hint="" compact disabled={locked}
              labelTitle={locked ? "Turned off in code" : undefined} />
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
          <button style={btn} onClick={() => setPreview(true)}>Show preview</button>
        </div>
      )}
      {/* Preview only — no logShown/logOutcome/logNote, so it isn't counted. */}
      {preview && <AugurPrompt spec={spec} strings={draft.strings} onAnswer={() => {}} onNote={() => {}} onIgnore={() => setPreview(false)} onDone={() => setPreview(false)} />}
    </div>
  );
}

function Toggle({ checked, onChange, title, hint, compact, disabled, labelTitle }: {
  checked: boolean; onChange: (v: boolean) => void; title: string; hint: string; compact?: boolean;
  disabled?: boolean; labelTitle?: string;
}) {
  return (
    <label title={labelTitle} style={{ display: "flex", alignItems: compact ? "center" : "flex-start", gap: 10, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1, padding: compact ? 0 : "8px 0" }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => { if (!disabled) onChange(e.target.checked); }} style={{ marginTop: compact ? 0 : 3, width: 16, height: 16, accentColor: "var(--k-action-fill, #394293)" }} />
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
