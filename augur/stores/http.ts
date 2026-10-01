// The hosted-collector seam (AUGUR-HANDOFF Phase 2). A store that POSTs to a
// configurable endpoint instead of a database. Adopt Augur without a backend of
// your own: point this at the collector and the module is unchanged. Collection
// only — admin reads stay optional and unset here (the collector owns its dashboard).
//
// Wire format is deliberately tiny and stable: { kind, ...payload }. The endpoint
// authenticates however the host chooses (a token header passed in at construction).

import type { ConfigOverrides } from "../config";
import type { AugurStore, Submission } from "../store";

export class HttpStore implements AugurStore {
  constructor(private readonly opts: { endpoint: string; headers?: Record<string, string> }) {}

  private async post<T>(kind: string, payload: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.opts.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...this.opts.headers },
      body: JSON.stringify({ kind, ...payload }),
    });
    if (!res.ok) throw new Error(`augur http ${kind}: ${res.status}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  async logShown(e: { userId: string; triggerId: string; triggerVer: number }): Promise<string> {
    const { id } = await this.post<{ id: string }>("shown", e);
    return id;
  }
  async logOutcome(eventId: string, outcome: "ignored" | "answered", answer?: string): Promise<void> {
    await this.post<void>("outcome", { eventId, outcome, answer });
  }
  async logNote(eventId: string, body: string): Promise<void> {
    await this.post<void>("note", { eventId, body });
  }
  async submit(s: Submission): Promise<void> {
    await this.post<void>("submit", { ...s });
  }
  async logUnconfigured(triggerId: string, userId: string): Promise<void> {
    await this.post<void>("unconfigured", { triggerId, userId });
  }
  async readConfig(): Promise<ConfigOverrides> {
    try {
      const res = await fetch(`${this.opts.endpoint}?kind=config`, { headers: this.opts.headers });
      return res.ok ? ((await res.json()) as ConfigOverrides) : {};
    } catch { return {}; }
  }
}
