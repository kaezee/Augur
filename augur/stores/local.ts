// The zero-backend store: everything in localStorage. Two uses — a runnable demo
// for anyone adopting Augur (drop the folder in, mount with a LocalStore, it just
// works), and a reference implementation of the full AugurStore including the
// admin reads. Single-device, no auth, no network. Not for real collection.

import type { AugurConfig } from "../config";
import type { AdminNote, AugurStore, DateRange, Summary, TriggerStat, Unconfigured } from "../store";

interface Ev { id: string; userId: string; triggerId: string; triggerVer: number; outcome: "shown" | "ignored" | "answered"; answer?: string; shownAt: number; }
interface Note { id: string; eventId: string; body: string; createdAt: number; readAt?: number; }
interface Unc { triggerId: string; userId: string; seenAt: number; }
interface Bag { events: Ev[]; notes: Note[]; unconfigured: Unc[]; overrides: Partial<AugurConfig>; }

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

  async readConfig(): Promise<Partial<AugurConfig>> { return load().overrides; }

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
        return { id: n.id, triggerId: e?.triggerId ?? "?", answer: (answer === "yes" || answer === "not_really" || answer === "unclear") ? answer : null, body: n.body, createdAt: new Date(n.createdAt).toISOString(), read: !!n.readAt };
      });
  }

  async markNoteRead(noteId: string): Promise<void> {
    const b = load(); const n = b.notes.find((x) => x.id === noteId);
    if (n && !n.readAt) { n.readAt = Date.now(); save(b); }
  }

  async writeConfig(overrides: Partial<AugurConfig>): Promise<void> {
    const b = load(); b.overrides = overrides; save(b);
  }
}
