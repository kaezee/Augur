-- Augur 0.3.0 upgrade, for a database set up from the 0.2.0 sql/schema.sql.
--
-- What it changes:
--   • augur_events gains two nullable columns: category, context (button submissions).
--   • New function augur_submit(): one submission from the feedback button.
--   • augur_admin_notes() also returns category and context (dropped and recreated,
--     because its return type changes).
--   • Signed-out visitors (anon) can no longer execute any augur_* function.
--
-- Additive only: nothing is renamed or removed, existing rows are untouched.
-- Safe to rerun: every statement is idempotent.

alter table augur_events add column if not exists category text;
alter table augur_events add column if not exists context  jsonb;

-- One submission from the feedback button: an answered event carrying the category
-- and diagnostic context, plus the note. The entry point ("button", or the host's
-- own label) goes in as the trigger id.
create or replace function public.augur_submit(
  p_trigger_id text, p_category text, p_body text, p_context jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  insert into augur_events (user_id, trigger_id, trigger_ver, outcome, answered_at, category, context)
    values (auth.uid(), coalesce(nullif(btrim(p_trigger_id), ''), 'button'), 0, 'answered', now(), p_category, p_context)
  returning id into v_id;
  if p_body is not null and length(btrim(p_body)) > 0 then
    insert into augur_notes (event_id, body) values (v_id, p_body);
  end if;
  return v_id;
end $$;

drop function if exists augur_admin_notes(boolean);
create function augur_admin_notes(p_unread_only boolean default false)
  returns table (id uuid, trigger_id text, answer text, body text, created_at timestamptz, read boolean, category text, context jsonb)
  language sql stable security definer set search_path = public, pg_temp as $$
  select n.id, e.trigger_id, e.answer, n.body, n.created_at, (n.read_at is not null), e.category, e.context
  from augur_notes n join augur_events e on e.id = n.event_id
  where augur_is_admin() and (not p_unread_only or n.read_at is null)
  order by n.created_at desc;
$$;

-- ── permissions ──────────────────────────────────────────────────────────────
-- Postgres lets every role execute a new function by default. Every function above
-- checks auth.uid() or augur_is_admin() itself, but signed-out visitors (anon) should
-- not be able to call them at all, so a future function that forgets its check
-- still isn't open. Revoke from public + anon, then grant to signed-in users.
revoke execute on function augur_is_admin()                                   from public, anon;
revoke execute on function augur_admin_summary(timestamptz, timestamptz)       from public, anon;
revoke execute on function augur_admin_trigger_stats(timestamptz, timestamptz) from public, anon;
revoke execute on function augur_admin_unconfigured()                          from public, anon;
revoke execute on function augur_admin_notes(boolean)                          from public, anon;
revoke execute on function augur_admin_mark_note_read(uuid)                    from public, anon;
revoke execute on function public.augur_log_shown(text, int)                   from public, anon;
revoke execute on function public.augur_log_outcome(uuid, text, text)          from public, anon;
revoke execute on function public.augur_log_note(uuid, text)                   from public, anon;
revoke execute on function public.augur_log_unconfigured(text)                 from public, anon;
revoke execute on function public.augur_submit(text, text, text, jsonb)        from public, anon;
revoke execute on function public.augur_admin_delete_note(uuid)                from public, anon;
revoke execute on function public.augur_admin_purge(int)                       from public, anon;

grant execute on function augur_is_admin()                                   to authenticated;
grant execute on function augur_admin_summary(timestamptz, timestamptz)       to authenticated;
grant execute on function augur_admin_trigger_stats(timestamptz, timestamptz) to authenticated;
grant execute on function augur_admin_unconfigured()                          to authenticated;
grant execute on function augur_admin_notes(boolean)                          to authenticated;
grant execute on function augur_admin_mark_note_read(uuid)                    to authenticated;
grant execute on function public.augur_log_shown(text, int)                   to authenticated;
grant execute on function public.augur_log_outcome(uuid, text, text)          to authenticated;
grant execute on function public.augur_log_note(uuid, text)                   to authenticated;
grant execute on function public.augur_log_unconfigured(text)                 to authenticated;
grant execute on function public.augur_submit(text, text, text, jsonb)        to authenticated;
grant execute on function public.augur_admin_delete_note(uuid)                to authenticated;
grant execute on function public.augur_admin_purge(int)                       to authenticated;
