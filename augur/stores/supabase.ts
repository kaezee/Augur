// The Supabase adapter — the ONE file in augur/ that names a table or an RPC.
// The client is injected (host owns auth + the singleton); this file never imports
// the host's client. Swap this out and Augur runs on any backend. To adopt Augur
// without Supabase, delete this file and use a different store.
//
// The client type is structural on purpose: augur/ takes no hard dependency on
// @supabase/supabase-js. Pass a real SupabaseClient and it fits.

import type { AugurConfig } from "../config";
import type { AdminNote, AugurStore, DateRange, Summary, TriggerStat, Unconfigured } from "../store";

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

  // The client mints the row id so it can update its own row later (events has no
  // SELECT policy — insert cannot return the generated id).
  async logShown(e: { userId: string; triggerId: string; triggerVer: number }): Promise<string> {
    const id = crypto.randomUUID();
    const { error } = await this.sb.from("augur_events").insert({
      id, user_id: e.userId, trigger_id: e.triggerId, trigger_ver: e.triggerVer, outcome: "shown",
    });
    if (error) throw error;
    return id;
  }

  async logOutcome(eventId: string, outcome: "ignored" | "answered", answer?: string): Promise<void> {
    const patch: Record<string, unknown> = { outcome };
    if (outcome === "answered") { patch.answer = answer ?? null; patch.answered_at = new Date().toISOString(); }
    const { error } = await this.sb.from("augur_events").update(patch).eq("id", eventId);
    if (error) throw error;
  }

  async logNote(eventId: string, body: string): Promise<void> {
    const { error } = await this.sb.from("augur_notes").insert({ event_id: eventId, body });
    if (error) throw error;
  }

  async logUnconfigured(triggerId: string, userId: string): Promise<void> {
    const { error } = await this.sb.from("augur_unconfigured").insert({ trigger_id: triggerId, user_id: userId });
    if (error) throw error;
  }

  async readConfig(): Promise<Partial<AugurConfig>> {
    const { data } = await this.sb.from("augur_config").select("overrides").eq("id", 1).maybeSingle();
    return (data?.overrides as Partial<AugurConfig>) ?? {};
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
    }));
  }

  async markNoteRead(noteId: string): Promise<void> {
    await this.sb.rpc("augur_admin_mark_note_read", { p_note_id: noteId });
  }

  async writeConfig(overrides: Partial<AugurConfig>): Promise<void> {
    const { error } = await this.sb.from("augur_config")
      .update({ overrides, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw error;
  }
}
