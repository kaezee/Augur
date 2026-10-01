// The Supabase adapter — the ONE file in augur/ that names a table or an RPC.
// The client is injected (host owns auth + the singleton); this file never imports
// the host's client. Swap this out and Augur runs on any backend. To adopt Augur
// without Supabase, delete this file and use a different store.
//
// The client type is structural on purpose: augur/ takes no hard dependency on
// @supabase/supabase-js. Pass a real SupabaseClient and it fits.

import type { ConfigOverrides } from "../config";
import type { AdminNote, AugurStore, DateRange, Submission, Summary, TriggerStat, Unconfigured } from "../store";

type Result<T> = Promise<{ data: T | null; error: unknown }>;
interface Filter<T> { eq(col: string, val: unknown): Result<T>; }
interface QB {
  insert(row: Record<string, unknown> | Record<string, unknown>[]): Result<unknown>;
  update(row: Record<string, unknown>): { eq(col: string, val: unknown): Result<unknown> };
  select(cols?: string): { eq(col: string, val: unknown): { maybeSingle(): Result<{ overrides: unknown }> } };
}
export interface SupabaseLike {
  from(table: string): QB & Filter<unknown>;
  rpc(fn: string, args?: Record<string, unknown>): Result<unknown>;
}

export class SupabaseStore implements AugurStore {
  constructor(private readonly sb: SupabaseLike) {}

  // All collection writes go through SECURITY DEFINER RPCs that derive the user from
  // the JWT — the events/notes tables have no SELECT policy, so direct client writes
  // (and the notes-insert ownership check) silently failed under RLS.
  async logShown(e: { userId: string; triggerId: string; triggerVer: number }): Promise<string> {
    const { data, error } = await this.sb.rpc("augur_log_shown", { p_trigger_id: e.triggerId, p_trigger_ver: e.triggerVer });
    if (error) throw error;
    return data as unknown as string;
  }

  // One submission via augur_submit (user from the JWT): an answered event carrying
  // category + context, plus the note. Entry point goes in as the trigger id.
  async submit(s: Submission): Promise<void> {
    const { error } = await this.sb.rpc("augur_submit", {
      p_trigger_id: s.source, p_category: s.category ?? null, p_body: s.body, p_context: s.context ?? null,
    });
    if (error) throw error;
  }

  async logOutcome(eventId: string, outcome: "ignored" | "answered", answer?: string): Promise<void> {
    const { error } = await this.sb.rpc("augur_log_outcome", { p_event_id: eventId, p_outcome: outcome, p_answer: answer ?? null });
    if (error) throw error;
  }

  async logNote(eventId: string, body: string): Promise<void> {
    const { error } = await this.sb.rpc("augur_log_note", { p_event_id: eventId, p_body: body });
    if (error) throw error;
  }

  async logUnconfigured(triggerId: string): Promise<void> {
    const { error } = await this.sb.rpc("augur_log_unconfigured", { p_trigger_id: triggerId });
    if (error) throw error;
  }

  async readConfig(): Promise<ConfigOverrides> {
    const { data } = await this.sb.from("augur_config").select("overrides").eq("id", 1).maybeSingle();
    return (data?.overrides as ConfigOverrides) ?? {};
  }

  // ── admin (gated server-side on the allowlist; returns null/[] for non-admins) ──
  async readSummary(range: DateRange): Promise<Summary> {
    const { data } = await this.sb.rpc("augur_admin_summary", { p_from: range.from, p_to: range.to });
    const s = (data as Partial<Summary>) ?? {};
    return { shown: s.shown ?? 0, answered: s.answered ?? 0, ignored: s.ignored ?? 0, notes: s.notes ?? 0, unread: s.unread ?? 0 };
  }

  async readTriggerStats(range: DateRange): Promise<TriggerStat[]> {
    const { data } = await this.sb.rpc("augur_admin_trigger_stats", { p_from: range.from, p_to: range.to });
    const rows = (data as Array<Record<string, number | string>>) ?? [];
    return rows.map((r) => ({
      triggerId: String(r.trigger_id),
      shown: Number(r.shown), answered: Number(r.answered), ignored: Number(r.ignored),
      byAnswer: { yes: Number(r.yes), not_really: Number(r.not_really), unclear: Number(r.unclear) },
    }));
  }

  async readUnconfigured(): Promise<Unconfigured[]> {
    const { data } = await this.sb.rpc("augur_admin_unconfigured");
    const rows = (data as Array<Record<string, unknown>>) ?? [];
    return rows.map((r) => ({ triggerId: String(r.trigger_id), seen: Number(r.seen), lastSeen: String(r.last_seen) }));
  }

  async readNotes(opts?: { unreadOnly?: boolean }): Promise<AdminNote[]> {
    const { data } = await this.sb.rpc("augur_admin_notes", { p_unread_only: opts?.unreadOnly ?? false });
    const rows = (data as Array<Record<string, unknown>>) ?? [];
    return rows.map((r) => ({
      id: String(r.id), triggerId: String(r.trigger_id), answer: (r.answer as AdminNote["answer"]) ?? null,
      body: String(r.body), createdAt: String(r.created_at), read: Boolean(r.read),
      category: (r.category as string | null) ?? null, context: (r.context as Record<string, unknown> | null) ?? null,
    }));
  }

  async markNoteRead(noteId: string): Promise<void> {
    await this.sb.rpc("augur_admin_mark_note_read", { p_note_id: noteId });
  }

  async deleteNote(noteId: string): Promise<void> {
    const { error } = await this.sb.rpc("augur_admin_delete_note", { p_note_id: noteId });
    if (error) throw error;
  }

  async purgeData(beforeDays: number | null): Promise<number> {
    const { data, error } = await this.sb.rpc("augur_admin_purge", { p_before_days: beforeDays });
    if (error) throw error;
    return Number(data ?? 0);
  }

  async writeConfig(overrides: ConfigOverrides): Promise<void> {
    const { error } = await this.sb.from("augur_config")
      .update({ overrides, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw error;
  }
}
