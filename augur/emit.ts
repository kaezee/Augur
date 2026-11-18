// The host's integration surface: augur.emit('trigger.id') after a completed action,
// augur.open() from the host's own button. A tiny synchronous bus — no context, no
// host state.

type Listener = (triggerId: string) => void;
const listeners = new Set<Listener>();
type OpenListener = (source: string) => void;
const openers = new Set<OpenListener>();
const closers = new Set<() => void>();
const panelListeners = new Set<(open: boolean) => void>();
const errorListeners = new Set<(e: unknown) => void>();

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
  // Close whatever Augur is showing (a triggered prompt or the panel).
  close(): void {
    for (const l of [...closers]) l();
  },
  // Report a failure your app handled itself, such as a request that came back 401 or
  // 500, so it shows under "recent errors" if the person then sends feedback. Pass an
  // Error or a short line ("401 on /api/upload"): it's masked and cut like any other
  // error. Records nothing when context is off or <Augur> isn't mounted.
  error(e: unknown): void {
    for (const l of [...errorListeners]) l(e);
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
// Admin saved settings: a mounted <Augur> re-reads them so a change such as Testing
// mode applies at once, not after a reload.
const configListeners = new Set<() => void>();
export function onConfigChanged(l: () => void): () => void {
  configListeners.add(l);
  return () => { configListeners.delete(l); };
}
export function configChanged(): void {
  for (const l of [...configListeners]) l();
}
// augur.error() reports: the mount's error capture listens while context is on.
export function onReportedError(l: (e: unknown) => void): () => void {
  errorListeners.add(l);
  return () => { errorListeners.delete(l); };
}
