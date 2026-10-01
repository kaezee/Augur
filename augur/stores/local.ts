// The zero-backend store: everything in localStorage. Two uses — a runnable demo
// for anyone adopting Augur (drop the folder in, mount with a LocalStore, it just
// works), and a reference implementation of the full AugurStore including the
// admin reads. Single-device, no auth, no network. Not for real collection.

import type { ConfigOverrides } from "../config";
import type { AdminNote, AugurStore, DateRange, Submission, SubmitContext, Summary, TriggerStat, Unconfigured } from "../store";

interface Ev { id: string; userId: string; triggerId: string; triggerVer: number; outcome: "shown" | "ignored" | "answered"; answer?: string; shownAt: number; category?: string; context?: SubmitContext; }
interface Note { id: string; eventId: string; body: string; createdAt: number; readAt?: number; }
interface Unc { triggerId: string; userId: string; seenAt: number; }
interface Bag { events: Ev[]; notes: Note[]; unconfigured: Unc[]; overrides: ConfigOverrides; }

const KEY = "augur.local";

function load(): Bag {
  try {
    const raw = localStorage.getItem(KEY);
    const b = raw ? (JSON.parse(raw) as Partial<Bag>) : {};
    return { events: b.events ?? [], notes: b.notes ?? [], unconfigured: b.unconfigured ?? [], overrides: b.overrides ?? {} };
  } catch { return { events: [], notes: [], unconfigured: [], overrides: {} }; }
}
function save(b: Bag) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* private mode */ } }
const within = (t: number, r: DateRange) => t >= Date.parse(r.from) && t < Date.parse(r.to);

export class LocalStore implements AugurStore {
  async logShown(e: { userId: string; triggerId: string; triggerVer: number }): Promise<string> {
    const b = load();
    const id = crypto.randomUUID();
    b.events.push({ id, userId: e.userId, triggerId: e.triggerId, triggerVer: e.triggerVer, outcome: "shown", shownAt: Date.now() });
    save(b);
    return id;
  }

  // One submission = one answered event (entry point as its trigger id) + its note.
  async submit(s: Submission): Promise<void> {
    const b = load();
    const id = crypto.randomUUID();
    b.events.push({ id, userId: s.userId, triggerId: s.source, triggerVer: 0, outcome: "answered", shownAt: Date.now(), category: s.category, context: s.context });
    if (s.body.trim()) b.notes.push({ id: crypto.randomUUID(), eventId: id, body: s.body.trim(), createdAt: Date.now() });
    save(b);
  }

  async logOutcome(eventId: string, outcome: "ignored" | "answered", answer?: string): Promise<void> {
    const b = load();
    const ev = b.events.find((x) => x.id === eventId);
    if (ev) { ev.outcome = outcome; if (outcome === "answered") ev.answer = answer; save(b); }
  }

  async logNote(eventId: string, body: string): Promise<void> {
    const b = load();
    b.notes.push({ id: crypto.randomUUID(), eventId, body, createdAt: Date.now() });
    save(b);
  }

  async logUnconfigured(triggerId: string, userId: string): Promise<void> {
    const b = load();
    b.unconfigured.push({ triggerId, userId, seenAt: Date.now() });
    save(b);
  }

  async readConfig(): Promise<ConfigOverrides> { return load().overrides; }

  async readSummary(range: DateRange): Promise<Summary> {
    const b = load();
    const inRange = b.events.filter((e) => within(e.shownAt, range));
    return {
      shown: inRange.filter((e) => e.outcome === "shown").length,
      answered: inRange.filter((e) => e.outcome === "answered").length,
      ignored: inRange.filter((e) => e.outcome === "ignored").length,
      notes: b.notes.filter((n) => within(n.createdAt, range)).length,
      unread: b.notes.filter((n) => !n.readAt).length,
    };
  }

  async readTriggerStats(range: DateRange): Promise<TriggerStat[]> {
    const b = load();
    const by = new Map<string, TriggerStat>();
    for (const e of b.events.filter((x) => within(x.shownAt, range))) {
      const s = by.get(e.triggerId) ?? { triggerId: e.triggerId, shown: 0, answered: 0, ignored: 0, byAnswer: { yes: 0, not_really: 0, unclear: 0 } };
      s.shown += 1;
      if (e.outcome === "answered") { s.answered += 1; if (e.answer && e.answer in s.byAnswer) s.byAnswer[e.answer as keyof typeof s.byAnswer] += 1; }
      if (e.outcome === "ignored") s.ignored += 1;
      by.set(e.triggerId, s);
    }
    return [...by.values()].sort((a, z) => a.triggerId.localeCompare(z.triggerId));
  }

  async readUnconfigured(): Promise<Unconfigured[]> {
    const b = load();
    const by = new Map<string, Unconfigured>();
    for (const u of b.unconfigured) {
      const c = by.get(u.triggerId) ?? { triggerId: u.triggerId, seen: 0, lastSeen: new Date(0).toISOString() };
      c.seen += 1;
      if (u.seenAt > Date.parse(c.lastSeen)) c.lastSeen = new Date(u.seenAt).toISOString();
      by.set(u.triggerId, c);
    }
    return [...by.values()].sort((a, z) => Date.parse(z.lastSeen) - Date.parse(a.lastSeen));
  }

  async readNotes(opts?: { unreadOnly?: boolean }): Promise<AdminNote[]> {
    const b = load();
    const evById = new Map(b.events.map((e) => [e.id, e]));
    return b.notes
      .filter((n) => !opts?.unreadOnly || !n.readAt)
      .sort((a, z) => z.createdAt - a.createdAt)
      .map((n) => {
        const e = evById.get(n.eventId);
        const answer = e?.answer;
        return { id: n.id, triggerId: e?.triggerId ?? "?", answer: (answer === "yes" || answer === "not_really" || answer === "unclear") ? answer : null, body: n.body, createdAt: new Date(n.createdAt).toISOString(), read: !!n.readAt,
          category: e?.category ?? null, context: (e?.context as unknown as Record<string, unknown>) ?? null };
      });
  }

  async markNoteRead(noteId: string): Promise<void> {
    const b = load(); const n = b.notes.find((x) => x.id === noteId);
    if (n && !n.readAt) { n.readAt = Date.now(); save(b); }
  }

  async deleteNote(noteId: string): Promise<void> {
    const b = load(); b.notes = b.notes.filter((n) => n.id !== noteId); save(b);
  }

  async purgeData(beforeDays: number | null): Promise<number> {
    const b = load();
    const cutoff = beforeDays == null ? Infinity : Date.now() - beforeDays * 86_400_000;
    const keep = beforeDays == null ? [] : b.events.filter((e) => e.shownAt >= cutoff);
    const removedIds = new Set(b.events.filter((e) => beforeDays == null || e.shownAt < cutoff).map((e) => e.id));
    const removed = removedIds.size;
    b.events = keep;
    b.notes = b.notes.filter((n) => !removedIds.has(n.eventId));
    b.unconfigured = beforeDays == null ? [] : b.unconfigured.filter((u) => u.seenAt >= cutoff);
    save(b);
    return removed;
  }

  async writeConfig(overrides: ConfigOverrides): Promise<void> {
    const b = load(); b.overrides = overrides; save(b);
  }
}
