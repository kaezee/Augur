// The host's integration surface: augur.emit('trigger.id') after a completed action,
// augur.open() from the host's own button. A tiny synchronous bus — no context, no
// host state.

type Listener = (triggerId: string) => void;
const listeners = new Set<Listener>();
type OpenListener = (source: string) => void;
const openers = new Set<OpenListener>();
const closers = new Set<() => void>();
const panelListeners = new Set<(open: boolean) => void>();

export const augur = {
  emit(triggerId: string): void {
    for (const l of [...listeners]) l(triggerId);
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },

  // Open the feedback panel from the host's own button. `source` is the entry point
  // recorded with the submission ("button" when omitted, same as the built-in button).
  open(source = "button"): void {
    for (const l of [...openers]) l(source);
  },
  onOpen(l: OpenListener): () => void {
    openers.add(l);
    return () => { openers.delete(l); };
  },
  // Close whatever Augur is showing (a moment's prompt or the panel).
  close(): void {
    for (const l of [...closers]) l();
  },
  // true when any prompt or panel appears, false when it closes — so a host's own
  // button can hide while Augur is on screen.
  onPanelState(l: (open: boolean) => void): () => void {
    panelListeners.add(l);
    return () => { panelListeners.delete(l); };
  },
};

// Internal: the <Augur> mount and its own tests use these. Not re-exported from
// index.ts, so hosts can listen to panel state but can't fake it.
export function onClose(l: () => void): () => void {
  closers.add(l);
  return () => { closers.delete(l); };
}
export function setPanelOpen(open: boolean): void {
  for (const l of [...panelListeners]) l(open);
}
