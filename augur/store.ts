// The one persistence seam. Nothing in augur/ writes SQL, names a table, or imports
// a database client — it all goes through this interface. Collection needs the
// first six methods; the admin surface needs the rest (all optional).

import type { Answer, ConfigOverrides } from "./config";

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

// One recent uncaught error, as stored in context. Never a full stack.
export interface ErrorEntry { type: string; source: string; line: number; message: string }

// Diagnostic context on a person-initiated submission. Places, never words: see
// context.ts for the limits.
export interface SubmitContext {
  route: string;                     // location.pathname only
  appVersion?: string;
  viewport: { w: number; h: number };
  userAgent: string;
  timestamp: string;                 // ISO
  source: string;                    // entry point: "button", or the host's own label
  sessionId: string;
  errors: ErrorEntry[];              // last 5, newest last
}

// A person-initiated submission from the button's panel. One call on Send; nothing
// is written if the person closes without sending.
export interface Submission {
  userId: string;
  category?: string;
  body: string;
  source: string;
  context?: SubmitContext;
}

export interface AdminNote {
  id: string;
  triggerId: string;                 // a trigger id, or a submission's entry point
  answer: Answer | null;
  body: string;
  createdAt: string;
  read: boolean;
  category?: string | null;          // submissions only
  context?: Record<string, unknown> | null;   // submissions only; shape varies by version
}

// One burst of repeated presses on a labelled element (see friction.ts).
export interface FrictionEvent { userId: string; label: string; route: string; clicks: number }

// Admin view: bursts per label within a range.
export interface FrictionStat { label: string; bursts: number; people: number; topRoute: string | null; lastSeen: string }

export interface AugurStore {
  // ── collection (required) ──
  logShown(e: { userId: string; triggerId: string; triggerVer: number }): Promise<string>; // returns eventId
  logOutcome(eventId: string, outcome: "ignored" | "answered", answer?: string): Promise<void>;
  logNote(eventId: string, body: string): Promise<void>;
  logUnconfigured(triggerId: string, userId: string): Promise<void>;   // §5 — emit with no config
  submit(s: Submission): Promise<void>;                                 // the button's panel
  readConfig(): Promise<ConfigOverrides>;
  logFriction?(e: FrictionEvent): Promise<void>;                        // optional: friction (0.4)

  // ── admin reads (optional) ──
  readSummary?(range: DateRange): Promise<Summary>;
  readTriggerStats?(range: DateRange): Promise<TriggerStat[]>;
  readUnconfigured?(): Promise<Unconfigured[]>;
  readFriction?(range: DateRange): Promise<FrictionStat[]>;
  readNotes?(opts?: { unreadOnly?: boolean }): Promise<AdminNote[]>;
  markNoteRead?(noteId: string): Promise<void>;
  deleteNote?(noteId: string): Promise<void>;
  purgeData?(beforeDays: number | null): Promise<number>;   // null = everything; returns events removed
  writeConfig?(overrides: ConfigOverrides): Promise<void>;
}
