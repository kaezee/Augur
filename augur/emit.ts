// The one-line integration surface for the host: augur.emit('trigger.id') after a
// completed action. A tiny synchronous bus — no context, no host state.

type Listener = (triggerId: string) => void;
const listeners = new Set<Listener>();

export const augur = {
  emit(triggerId: string): void {
    for (const l of [...listeners]) l(triggerId);
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};
