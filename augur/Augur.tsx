import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { augur, onClose, setPanelOpen } from "./emit";
import { canShow, recordShown, recordAnswered, recordIgnored } from "./caps";
import { effectiveCategories, mergeConfig, responseTypeOf, type AugurConfig, type HostConfig, type TriggerDef } from "./config";
import { captureContext, installErrorCapture, stripUrl } from "./context";
import { installFrictionWatch } from "./friction";
import type { AugurStore, Submission } from "./store";
import { AugurPrompt, type PromptSpec } from "./prompt";
import { AugurMark } from "./mark";

// The mount. One instance, high in the host tree. Two ways in: triggers (the host's
// augur.emit, gated by the local cap engine, logged per trigger) and the button's
// panel (the built-in button or the host's own via augur.open(), one submit() on
// Send). Nothing here knows the backend or the host's product — userId, store and
// config are all props. Drop it in with:
//   <Augur userId={session.user.id} store={store} config={MY_TRIGGERS} />

interface Active {
  triggerId: string;      // a trigger's id, or the panel's entry point
  eventId: string;        // triggers only ("" for the panel: nothing is logged until Send)
  spec: PromptSpec;
  manual: boolean;
}

// Send one panel submission, unless testing. Exported for tests.
export function submitFeedback(store: AugurStore, cfg: AugurConfig, s: Submission): boolean {
  if (cfg.mode === "testing") return false;
  store.submit(s).catch(() => {});
  return true;
}

export function Augur({ userId, store, config, autoTriggers = true, byline = true, appVersion }: {
  userId: string;
  store: AugurStore;
  config: HostConfig;
  // When false, timed/event-driven prompts are suppressed but the manual
  // feedback button still shows — e.g. over a demo/sample the writer didn't make.
  autoTriggers?: boolean;
  // The "by Augur" credit at the foot of each prompt. On by default; it's how
  // other builders find Augur. Set false to hide it (MIT, no license needed).
  byline?: boolean;
  // Recorded in the diagnostic context of panel submissions, if given.
  appVersion?: string;
}) {
  const [overrides, setOverrides] = useState<Awaited<ReturnType<AugurStore["readConfig"]>>>({});
  const cfg = useMemo(() => mergeConfig(config, overrides), [config, overrides]);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const [active, setActive] = useState<Active | null>(null);
  const activeRef = useRef(false);
  activeRef.current = active !== null;
  const answered = useRef(false);                       // the current triggered prompt got an answer
  const returnFocus = useRef<HTMLElement | null>(null); // where focus was before open()

  // Hosts can listen (augur.onPanelState) to hide their own button while Augur shows.
  useEffect(() => { setPanelOpen(active !== null); }, [active !== null]);
  useEffect(() => () => setPanelOpen(false), []);

  // Error capture for diagnostic context, only while context is on.
  // Friction: quiet recording of repeated presses on labelled elements. No listener
  // when the module or friction is off; nothing written in testing mode.
  useEffect(() => {
    if (!cfg.enabled || !cfg.friction || !store.logFriction) return;
    return installFrictionWatch((label, clicks) => {
      if (isTesting()) return;
      const route = typeof location !== "undefined" ? stripUrl(location.pathname) : "";
      store.logFriction?.({ userId, label, route, clicks }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.enabled, cfg.friction, store, userId]);

  const ignoreKey = cfg.ignoreErrorSources.join("\n");
  useEffect(() => (cfg.context ? installErrorCapture(cfg.ignoreErrorSources) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg.context, ignoreKey]);

  // Testing mode (config.mode): show prompts as normal, but write nothing — no
  // events, no cap ledger, no notes. Read live so an admin toggle takes effect
  // without a remount.
  const isTesting = () => cfgRef.current.mode === "testing";

  useEffect(() => {
    let live = true;
    store.readConfig().then((o) => { if (live && o) setOverrides(o); }).catch(() => {});
    return () => { live = false; };
  }, [store]);

  // Build the snackbar spec from a trigger def + the merged config.
  const specFor = (def: TriggerDef, c: AugurConfig): PromptSpec => ({
    question: def.question,
    followup: def.followup ?? c.followup,
    responseType: responseTypeOf(def),
    answers: c.answers,
    options: def.options,
    position: c.presentation.position,
  });

  useEffect(() => {
    if (!autoTriggers) return;   // demo/sample: keep the manual button, drop timed prompts
    const timers = new Set<number>();
    const off = augur.subscribe((triggerId) => {
      if (activeRef.current) return;
      if (!cfgRef.current.enabled) return;
      const c = cfgRef.current;
      const def = c.triggers[triggerId];
      // §5 — an emit with no config entry: show nothing, but record it so admin can see it.
      if (!def) { if (!isTesting()) store.logUnconfigured(triggerId, userId).catch(() => {}); return; }
      if (!canShow(userId, triggerId, c)) return;
      const t = window.setTimeout(async () => {
        timers.delete(t);
        if (activeRef.current) return;
        if (!canShow(userId, triggerId, cfgRef.current)) return;
        try {
          // Testing: skip the write and the cap ledger; still show the prompt.
          const eventId = isTesting() ? "test" : await store.logShown({ userId, triggerId, triggerVer: def.version });
          if (!isTesting()) recordShown(userId, triggerId);
          answered.current = false;
          setActive({ triggerId, eventId, spec: specFor(def, cfgRef.current), manual: false });
        } catch { /* logging failed — say nothing rather than a broken prompt */ }
      }, def.delayMs);
      timers.add(t);
    });
    return () => { off(); timers.forEach((t) => window.clearTimeout(t)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, store, autoTriggers]);

  // The button's panel: person-initiated. Bypasses every cap and never touches the
  // cap ledger — it must not consume a trigger's budget. Nothing is written on open;
  // one submit() on Send, nothing at all if the person closes without sending.
  const openManual = (source: string) => {
    if (!cfgRef.current.enabled) return;
    if (activeRef.current) return;
    const c = cfgRef.current;
    returnFocus.current = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    setActive({
      triggerId: source, eventId: "", manual: true,
      spec: { question: c.manualQuestion, followup: c.followup, responseType: "text", answers: c.answers, position: c.presentation.position },
    });
  };
  // augur.open() from the host's own button. Not gated on persistentButton: turning
  // the built-in button off to use your own is the point.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => augur.onOpen((source) => openManual(source)), [userId, store]);

  const clear = () => {
    const back = active?.manual ? returnFocus.current : null;
    returnFocus.current = null;
    setActive(null);
    if (back && back.isConnected) window.setTimeout(() => back.focus(), 0);
  };
  const onAnswer = (answer?: string) => {
    if (!active || active.manual || isTesting()) return;
    answered.current = true;
    store.logOutcome(active.eventId, "answered", answer).catch(() => {});
    recordAnswered(userId);
  };
  const onNote = (body: string) => { if (active && !active.manual && !isTesting()) store.logNote(active.eventId, body).catch(() => {}); };
  const onIgnore = () => {
    if (!active) return;
    if (!active.manual && !isTesting()) {
      store.logOutcome(active.eventId, "ignored").catch(() => {});
      recordIgnored(userId, active.triggerId);
    }
    clear();
  };
  const onDone = () => clear();
  const onSubmit = (category: string | undefined, body: string) => {
    if (!active?.manual) return;
    const c = cfgRef.current;
    submitFeedback(store, c, {
      userId, category, body, source: active.triggerId,
      context: c.context ? captureContext(active.triggerId, appVersion) : undefined,
    });
  };

  // augur.close(): close whatever is showing. An unanswered triggered prompt counts as ignored.
  const closeRef = useRef(() => {});
  closeRef.current = () => { if (!active) return; if (!active.manual && !answered.current) onIgnore(); else clear(); };
  useEffect(() => onClose(() => closeRef.current()), []);

  return (
    <>
      {active && <AugurPrompt key={active.eventId || active.triggerId} spec={active.spec} strings={cfg.strings} byline={byline}
        panel={active.manual ? { categories: effectiveCategories(cfg.categories), moreLink: cfg.moreLink } : undefined}
        onAnswer={onAnswer} onNote={onNote} onIgnore={onIgnore} onDone={onDone} onSubmit={onSubmit} />}
      {cfg.enabled && cfg.persistentButton && !active && <PersistentButton position={cfg.presentation.position}
        label={cfg.strings.button} name={cfg.strings.buttonLabel} onClick={() => openManual("button")} />}
    </>
  );
}

// A small, unobtrusive FAB. Same token-with-fallback approach as the prompt.
function PersistentButton({ position, label, name, onClick }: { position: "bottom-right" | "bottom-left"; label: string; name: string; onClick: () => void }) {
  const side = position === "bottom-left" ? { left: 24 } : { right: 24 };
  const style: React.CSSProperties = {
    position: "fixed", bottom: 24, ...side, zIndex: 2147482000,
    cursor: "pointer", padding: "8px 14px", borderRadius: 999,
    border: "1px solid var(--k-border-strong, #D3CCB9)", background: "var(--k-bg-raised, #ffffff)",
    color: "var(--k-text-secondary, #5C5647)", boxShadow: "0 4px 16px rgba(0,0,0,.12)",
    font: "600 12.5px/1 var(--k-font-sans, ui-sans-serif, system-ui, sans-serif)",
    display: "inline-flex", alignItems: "center", gap: 7,
  };
  return createPortal(
    <button className="augur-ui" style={style} onClick={onClick} aria-label={name} title={name}><style>{FAB_FOCUS_CSS}</style><AugurMark size={15} /> {label}</button>,
    document.body,
  );
}

const FAB_FOCUS_CSS = `button.augur-ui:focus-visible{outline:2px solid var(--k-action-fill,#394293);outline-offset:2px}`;
