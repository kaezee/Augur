// A plain-Postgres backend for HttpStore, written as one Next.js App Router route
// (app/api/augur/route.ts). It uses only the standard Request and Response, so it
// ports to any framework that has them. Run sql/postgres.sql once first, then:
//
//   <Augur userId={session.user.id} store={new HttpStore({ endpoint: "/api/augur" })} config={MY_AUGUR} />
//
// Two rules keep it safe. The user always comes from YOUR session, never from the
// request body (the `userId` Augur sends is ignored). And a user can only touch
// their own events.

// @ts-expect-error -- install "pg" in your app
import { Pool } from "pg";
// @ts-expect-error -- placeholder: your app's own session lookup, returning the user's id or null
import { getSessionUserId } from "./your-auth";

declare const process: { env: Record<string, string | undefined> };   // Node's, without @types/node here
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
const status = (code: number) => new Response(null, { status: code });

// Admin settings overrides (questions, caps). Read on every page load, so keep it cheap.
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("kind") !== "config") return status(404);
  const { rows } = await db.query("select overrides from augur_config where id = 1");
  return Response.json(rows[0]?.overrides ?? {});
}

export async function POST(req: Request) {
  const userId: string | null = await getSessionUserId(req);
  if (!userId) return status(401);
  const b = await req.json().catch(() => null);
  if (!b || typeof b.kind !== "string") return status(400);

  try {
    switch (b.kind) {
      case "shown": {   // a triggered prompt appeared; Augur needs the new event id back
        const { rows } = await db.query(
          "insert into augur_events (user_id, trigger_id, trigger_ver, outcome) values ($1, $2, $3, 'shown') returning id",
          [userId, str(b.triggerId, 100), Number(b.triggerVer) || 0]);
        return Response.json({ id: rows[0].id });
      }
      case "outcome": {   // answered (with the answer key) or ignored
        if (b.outcome !== "answered" && b.outcome !== "ignored") return status(400);
        await db.query(
          `update augur_events set outcome = $3,
             answer      = case when $3 = 'answered' then $4 else answer end,
             answered_at = case when $3 = 'answered' then now() else answered_at end
           where id = $1 and user_id = $2`,
          [b.eventId, userId, b.outcome, str(b.answer, 40)]);
        return status(204);
      }
      case "note": {   // the optional line after an answer, only on the writer's own event
        const r = await db.query(
          "insert into augur_notes (event_id, body) select id, $3 from augur_events where id = $1 and user_id = $2",
          [b.eventId, userId, str(b.body, 4000)]);
        return status(r.rowCount ? 204 : 404);
      }
      case "submit": {   // the Feedback button: category, text and diagnostic context
        const context = b.context && JSON.stringify(b.context).length <= 8000 ? JSON.stringify(b.context) : null;
        await db.query(
          `with e as (
             insert into augur_events (user_id, trigger_id, trigger_ver, outcome, answered_at, category, context)
             values ($1, coalesce(nullif($2, ''), 'button'), 0, 'answered', now(), $3, $4::jsonb) returning id)
           insert into augur_notes (event_id, body) select id, $5 from e where length(btrim(coalesce($5, ''))) > 0`,
          [userId, str(b.source, 100), str(b.category, 40), context, str(b.body, 4000)]);
        return status(204);
      }
      case "friction": {   // repeated presses on a data-augur label
        await db.query(
          "insert into augur_friction (user_id, label, route, clicks) values ($1, $2, $3, $4)",
          [userId, str(b.label, 80) ?? "", str(b.route, 300) ?? "", Math.min(Math.max(Number(b.clicks) || 1, 1), 1000)]);
        return status(204);
      }
      case "unconfigured": {   // an emit() with no config entry
        await db.query("insert into augur_unconfigured (trigger_id, user_id) values ($1, $2)", [str(b.triggerId, 100), userId]);
        return status(204);
      }
      default:
        return status(400);
    }
  } catch {
    // Augur shows "didn't send" and keeps the person's text, so a failure is never silent.
    return status(500);
  }
}
