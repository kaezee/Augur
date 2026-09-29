// The one-line integration surface for the host: augur.emit('trigger.id') after a
// completed action. A tiny synchronous bus — no context, no host state.

type Listener = (triggerId: string) => void;
const listeners = new Set<Listener>();
type OpenListener = () => void;
const openListeners = new Set<OpenListener>();

export const augur = {
  emit(triggerId: string): void {
    for (const l of [...listeners]) l(triggerId);
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },

  // Open the free-text feedback prompt from the host's own button.
  // Same prompt, logging and testing-mode behaviour as Augur's built-in button.
  open(): void {
    for (const l of [...openListeners]) l();
  },
  onOpen(l: OpenListener): () => void {
    openListeners.add(l);
    return () => { openListeners.delete(l); };
  },
};
