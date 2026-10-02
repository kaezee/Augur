-- Augur (next, from 0.4): admin that holds up as feedback grows.
-- Notes are read a page at a time with category/unread filtered in the database,
-- submission tallies are counted in the database, and an index backs the date-range
-- counts. Additive and safe to rerun. augur_admin_notes keeps its name and its
-- first argument, so callers that pass only p_unread_only get every note, as before.

create index if not exists augur_events_shown_idx on augur_events (shown_at);

drop function if exists augur_admin_notes(boolean);   -- replaced by the paged version below
create or replace function augur_admin_notes(p_unread_only boolean default false, p_category text default null,
                                             p_before timestamptz default null, p_before_id uuid default null,
                                             p_limit int default null)
  returns table (id uuid, trigger_id text, answer text, body text, created_at timestamptz, read boolean, category text, context jsonb)
  language sql stable security definer set search_path = public, pg_temp as $$
  select n.id, e.trigger_id, e.answer, n.body, n.created_at, (n.read_at is not null), e.category, e.context
  from augur_notes n join augur_events e on e.id = n.event_id
  where augur_is_admin() and (not p_unread_only or n.read_at is null)
    and (p_category is null or e.category = p_category)
    and (p_before is null or (n.created_at, n.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff')))
  order by n.created_at desc, n.id desc   -- (created_at, id) is the page cursor, so ties are never skipped
  limit case when p_limit is null then null else least(greatest(p_limit, 1), 200) end;   -- null = all (older callers)
$$;

-- Button-panel submissions in a range, per entry point and category ("manual" is the
-- pre-0.3 name for the built-in button).
create or replace function augur_admin_submissions(p_from timestamptz, p_to timestamptz)
  returns table (source text, category text, n bigint)
  language sql stable security definer set search_path = public, pg_temp as $$
  select case when e.trigger_id = 'manual' then 'button' else e.trigger_id end, e.category, count(*)
  from augur_events e
  where augur_is_admin() and (e.category is not null or e.context is not null)
    and e.shown_at >= p_from and e.shown_at < p_to
  group by 1, 2;
$$;

revoke execute on function augur_admin_notes(boolean, text, timestamptz, uuid, int) from public, anon;
revoke execute on function augur_admin_submissions(timestamptz, timestamptz)   from public, anon;
grant  execute on function augur_admin_notes(boolean, text, timestamptz, uuid, int) to authenticated;
grant  execute on function augur_admin_submissions(timestamptz, timestamptz)   to authenticated;
