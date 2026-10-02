-- Augur 0.4.0 upgrade, for a database set up from the 0.3.0 sql/schema.sql (or
-- upgraded to it with 0.3.0.sql).
--
-- What it changes:
--   • New table augur_friction (label, page path, press count; no element text),
--     row-level security on, no client policies.
--   • New functions augur_log_friction() (signed-in users) and augur_admin_friction()
--     (admin read), not callable by signed-out visitors.
--   • augur_admin_purge() also clears old friction rows.
--
-- Additive only: nothing is renamed or removed, existing rows are untouched.
-- Safe to rerun: every statement is idempotent.

-- Friction (0.4): repeated presses on an element the host labelled data-augur="…".
-- Label and page path only; never element text or anything typed.
create table if not exists augur_friction (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  label      text not null,
  route      text not null default '',
  clicks     int  not null,
  created_at timestamptz not null default now()
);
create index if not exists augur_friction_label_idx on augur_friction (label, created_at desc);

alter table augur_friction enable row level security;

-- Friction write (signed-in users) and admin read. Inputs are bounded so a client
-- can't store long strings or absurd counts.
create or replace function public.augur_log_friction(p_label text, p_route text, p_clicks int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_label is null or length(btrim(p_label)) = 0 then return; end if;
  insert into augur_friction (user_id, label, route, clicks)
    values (auth.uid(), left(btrim(p_label), 80), left(coalesce(p_route, ''), 300), least(greatest(coalesce(p_clicks, 0), 1), 1000));
end $$;

create or replace function augur_admin_friction(p_from timestamptz, p_to timestamptz)
  returns table (label text, bursts bigint, people bigint, top_route text, last_seen timestamptz)
  language sql stable security definer set search_path = public, pg_temp as $$
  select f.label, count(*), count(distinct f.user_id),
    (select f2.route from augur_friction f2
      where f2.label = f.label and f2.created_at >= p_from and f2.created_at < p_to
      group by f2.route order by count(*) desc, f2.route limit 1),
    max(f.created_at)
  from augur_friction f
  where augur_is_admin() and f.created_at >= p_from and f.created_at < p_to
  group by f.label order by count(*) desc, f.label;
$$;

create or replace function public.augur_admin_purge(p_before_days int default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not augur_is_admin() then raise exception 'not authorized'; end if;
  with del as (
    delete from augur_events
    where p_before_days is null or shown_at < now() - make_interval(days => p_before_days)
    returning 1
  ) select count(*) into n from del;
  delete from augur_unconfigured
    where p_before_days is null or seen_at < now() - make_interval(days => p_before_days);
  delete from augur_friction
    where p_before_days is null or created_at < now() - make_interval(days => p_before_days);
  return coalesce(n, 0);
end $$;

revoke execute on function public.augur_log_friction(text, text, int)    from public, anon;
revoke execute on function augur_admin_friction(timestamptz, timestamptz) from public, anon;
grant  execute on function public.augur_log_friction(text, text, int)    to authenticated;
grant  execute on function augur_admin_friction(timestamptz, timestamptz) to authenticated;
