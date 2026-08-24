import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { augur } from "./emit";
import { canShow, recordShown, recordAnswered, recordIgnored } from "./caps";
import { mergeConfig, responseTypeOf, type AugurConfig, type TriggerDef } from "./config";
import type { AugurStore } from "./store";
import { AugurPrompt, type PromptSpec } from "./prompt";
import { AugurMark } from "./mark";

// The mount (AUGUR-HANDOFF §4/§9, Patch 2). One instance, high in the host tree.
// It listens on the emit bus, gates through the local cap engine, logs through the
// injected store, and renders the snackbar. Nothing here knows the backend or the
// host's product — userId, store and config are all props. Drop it in with:
//   <Augur userId={session.user.id} store={store} config={KRONICLER_AUGUR} />

const MANUAL = "manual";              // synthetic trigger id for the persistent button

interface Active {
  triggerId: string;
  eventId: string;
  spec: PromptSpec;
  manual: boolean;
}

export function Augur({ userId, store, config }: {
  userId: string;
  store: AugurStore;
  config: Partial<AugurConfig> & { triggers: Record<string, TriggerDef> };
}) {
  const [overrides, setOverrides] = useState<Partial<AugurConfig>>({});
  const cfg = useMemo(() => mergeConfig(config, overrides), [config, overrides]);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const [active, setActive] = useState<Active | null>(null);
  const activeRef = useRef(false);
  activeRef.current = active !== null;

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
    const timers = new Set<number>();
    const off = augur.subscribe((triggerId) => {
      if (activeRef.current) return;
      const c = cfgRef.current;
      const def = c.triggers[triggerId];
      // §5 — an emit with no config entry: show nothing, but record it so admin can see it.
      if (!def) { store.logUnconfigured(triggerId, userId).catch(() => {}); return; }
      if (!canShow(userId, triggerId, c)) return;
      const t = window.setTimeout(async () => {
        timers.delete(t);
        if (activeRef.current) return;
        if (!canShow(userId, triggerId, cfgRef.current)) return;
        try {
          const eventId = await store.logShown({ userId, triggerId, triggerVer: def.version });
          recordShown(userId, triggerId);
          setActive({ triggerId, eventId, spec: specFor(def, cfgRef.current), manual: false });
        } catch { /* logging failed — say nothing rather than a broken prompt */ }
      }, def.delayMs);
      timers.add(t);
    });
    return () => { off(); timers.forEach((t) => window.clearTimeout(t)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, store]);

  // The persistent button (beta only): user-initiated free text (§7). Bypasses every
  // cap and never touches the cap ledger — it must not consume a real-trigger budget.
  const openManual = async () => {
    if (activeRef.current) return;
    const c = cfgRef.current;
    try {
      const eventId = await store.logShown({ userId, triggerId: MANUAL, triggerVer: 0 });
      setActive({
        triggerId: MANUAL, eventId, manual: true,
        spec: { question: c.manualQuestion, followup: c.followup, responseType: "text", answers: c.answers, position: c.presentation.position },
      });
    } catch { /* ignore */ }
  };

  const onAnswer = (answer?: string) => {
    if (!active) return;
    store.logOutcome(active.eventId, "answered", answer).catch(() => {});
    if (!active.manual) recordAnswered(userId);
  };
  const onNote = (body: string) => { if (active) store.logNote(active.eventId, body).catch(() => {}); };
  const onIgnore = () => {
    if (!active) return;
    store.logOutcome(active.eventId, "ignored").catch(() => {});
    if (!active.manual) recordIgnored(userId, active.triggerId);
    setActive(null);
  };
  const onDone = () => setActive(null);

  return (
    <>
      {active && <AugurPrompt spec={active.spec} onAnswer={onAnswer} onNote={onNote} onIgnore={onIgnore} onDone={onDone} />}
      {cfg.persistentButton && !active && <PersistentButton position={cfg.presentation.position} onClick={openManual} />}
    </>
  );
}

// A small, unobtrusive FAB. Same token-with-fallback approach as the prompt.
function PersistentButton({ position, onClick }: { position: "bottom-right" | "bottom-left"; onClick: () => void }) {
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
    <button style={style} onClick={onClick} aria-label="Give feedback" title="Give feedback"><AugurMark size={15} /> Feedback</button>,
    document.body,
  );
}
