// The one persistence seam. Nothing in augur/ writes SQL, names a table, or imports
// a database client — it all goes through this interface. Collection needs the
// first five methods; the admin surface needs the rest (all optional).

import type { Answer, AugurConfig } from "./config";

export interface DateRange { from: string; to: string }   // ISO; [from, to)

export interface Summary {
  shown: number;
  answered: number;
  ignored: number;
  notes: number;
  unread: number;   // total unread notes (range-independent)
}

export interface TriggerStat {
  triggerId: string;
  shown: number;
  answered: number;
  ignored: number;
  byAnswer: Record<Answer, number>;   // choice3 only; other types leave these at 0
}

export interface Unconfigured {
  triggerId: string;
  seen: number;
  lastSeen: string;
}

export interface AdminNote {
  id: string;
  triggerId: string;
  answer: Answer | null;
  body: string;
  createdAt: string;
  read: boolean;
}

export interface AugurStore {
  // ── collection (required) ──
  logShown(e: { userId: string; triggerId: string; triggerVer: number }): Promise<string>; // returns eventId
  logOutcome(eventId: string, outcome: "ignored" | "answered", answer?: string): Promise<void>;
  logNote(eventId: string, body: string): Promise<void>;
  logUnconfigured(triggerId: string, userId: string): Promise<void>;   // §5 — emit with no config
  readConfig(): Promise<Partial<AugurConfig>>;

  // ── admin reads (optional) ──
  readSummary?(range: DateRange): Promise<Summary>;
  readTriggerStats?(range: DateRange): Promise<TriggerStat[]>;
  readUnconfigured?(): Promise<Unconfigured[]>;
  readNotes?(opts?: { unreadOnly?: boolean }): Promise<AdminNote[]>;
  markNoteRead?(noteId: string): Promise<void>;
  deleteNote?(noteId: string): Promise<void>;
  purgeData?(beforeDays: number | null): Promise<number>;   // null = everything; returns events removed
  writeConfig?(overrides: Partial<AugurConfig>): Promise<void>;
}
