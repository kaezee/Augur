-- Augur — Supabase schema (for the bundled SupabaseStore). Run once against your
-- project. No foreign keys into your tables; user_id is a plain uuid. To remove
-- Augur entirely: drop these tables and the functions, delete the augur/ folder.
--
-- Not using Supabase? Ignore this file and write a store to the AugurStore
-- interface (see augur/store.ts) against whatever backend you have.

-- ── tables ───────────────────────────────────────────────────────────────────
create table if not exists augur_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,          -- plain, NO fk
  trigger_id    text not null,
  trigger_ver   int  not null,
  outcome       text not null check (outcome in ('shown', 'ignored', 'answered')),
  answer        text,                   -- choice3 key, custom choice key, or null
  shown_at      timestamptz not null default now(),
  answered_at   timestamptz
);
create index if not exists augur_events_user_idx on augur_events (user_id, shown_at desc);
create index if not exists augur_events_trigger_idx on augur_events (trigger_id, shown_at desc);

create table if not exists augur_notes (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references augur_events(id) on delete cascade,
  body       text not null,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists augur_notes_created_idx on augur_notes (created_at desc);

create table if not exists augur_config (
  id         int primary key default 1,
  overrides  jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into augur_config (id, overrides) values (1, '{}'::jsonb) on conflict (id) do nothing;

-- An emit() with no config entry: recorded, shown to nobody, surfaced in admin.
create table if not exists augur_unconfigured (
  id         uuid primary key default gen_random_uuid(),
  trigger_id text not null,
  user_id    uuid not null,
  seen_at    timestamptz not null default now()
);
create index if not exists augur_unconfigured_trigger_idx on augur_unconfigured (trigger_id, seen_at desc);

-- ── admin identity ───────────────────────────────────────────────────────────
-- The allowlist. Add the auth uuid(s) of whoever may read results and write config.
-- Empty = nobody is admin (collection still works; admin reads return null/[]).
create or replace function augur_is_admin() returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() = any (array[
    -- '00000000-0000-0000-0000-000000000000'   -- ← your admin account's auth uuid
  ]::uuid[]);
$$;
grant execute on function augur_is_admin() to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table augur_events       enable row level security;
alter table augur_notes        enable row level security;
alter table augur_config       enable row level security;
alter table augur_unconfigured enable row level security;

-- events: write only your own rows; no select (analytics go through the admin fns).
create policy augur_events_insert on augur_events
  for insert to authenticated with check (user_id = auth.uid());
create policy augur_events_update on augur_events
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notes: writable only against your own event; no select.
create policy augur_notes_insert on augur_notes
  for insert to authenticated
  with check (exists (select 1 from augur_events e where e.id = event_id and e.user_id = auth.uid()));

-- unconfigured: write your own; no select.
create policy augur_unconfigured_insert on augur_unconfigured
  for insert to authenticated with check (user_id = auth.uid());

-- config: any authenticated user reads (boot reads overrides); only admin writes.
create policy augur_config_select on augur_config for select to authenticated using (true);
create policy augur_config_update on augur_config
  for update to authenticated using (augur_is_admin()) with check (augur_is_admin());

-- ── admin reads (security definer, gated on the allowlist) ───────────────────
create or replace function augur_admin_summary(p_from timestamptz, p_to timestamptz) returns jsonb
  language sql stable security definer set search_path = public, pg_temp as $$
  select case when augur_is_admin() then jsonb_build_object(
    'shown',     (select count(*) from augur_events where outcome = 'shown'    and shown_at >= p_from and shown_at < p_to),
    'answered',  (select count(*) from augur_events where outcome = 'answered' and shown_at >= p_from and shown_at < p_to),
    'ignored',   (select count(*) from augur_events where outcome = 'ignored'  and shown_at >= p_from and shown_at < p_to),
    'notes',     (select count(*) from augur_notes  where created_at >= p_from and created_at < p_to),
    'unread',    (select count(*) from augur_notes  where read_at is null)
  ) else null end;
$$;

create or replace function augur_admin_trigger_stats(p_from timestamptz, p_to timestamptz)
  returns table (trigger_id text, shown bigint, answered bigint, ignored bigint, yes bigint, not_really bigint, unclear bigint)
  language sql stable security definer set search_path = public, pg_temp as $$
  select e.trigger_id, count(*),
    count(*) filter (where e.outcome = 'answered'),
    count(*) filter (where e.outcome = 'ignored'),
    count(*) filter (where e.answer = 'yes'),
    count(*) filter (where e.answer = 'not_really'),
    count(*) filter (where e.answer = 'unclear')
  from augur_events e
  where augur_is_admin() and e.shown_at >= p_from and e.shown_at < p_to
  group by e.trigger_id order by e.trigger_id;
$$;

create or replace function augur_admin_unconfigured()
  returns table (trigger_id text, seen bigint, last_seen timestamptz)
  language sql stable security definer set search_path = public, pg_temp as $$
  select u.trigger_id, count(*), max(u.seen_at)
  from augur_unconfigured u where augur_is_admin()
  group by u.trigger_id order by max(u.seen_at) desc;
$$;

create or replace function augur_admin_notes(p_unread_only boolean default false)
  returns table (id uuid, trigger_id text, answer text, body text, created_at timestamptz, read boolean)
  language sql stable security definer set search_path = public, pg_temp as $$
  select n.id, e.trigger_id, e.answer, n.body, n.created_at, (n.read_at is not null)
  from augur_notes n join augur_events e on e.id = n.event_id
  where augur_is_admin() and (not p_unread_only or n.read_at is null)
  order by n.created_at desc;
$$;

create or replace function augur_admin_mark_note_read(p_note_id uuid) returns void
  language sql volatile security definer set search_path = public, pg_temp as $$
  update augur_notes set read_at = now() where id = p_note_id and augur_is_admin() and read_at is null;
$$;

grant execute on function augur_admin_summary(timestamptz, timestamptz)       to authenticated;
grant execute on function augur_admin_trigger_stats(timestamptz, timestamptz) to authenticated;
grant execute on function augur_admin_unconfigured()                          to authenticated;
grant execute on function augur_admin_notes(boolean)                          to authenticated;
grant execute on function augur_admin_mark_note_read(uuid)                    to authenticated;

-- ── collection writes (SECURITY DEFINER; derive the user from the JWT) ────────
-- Required: events/notes have no SELECT policy, so direct client writes fail under
-- RLS (the notes ownership check can't see the event). The SupabaseStore calls these.
create or replace function public.augur_log_shown(p_trigger_id text, p_trigger_ver int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  insert into augur_events (user_id, trigger_id, trigger_ver, outcome)
    values (auth.uid(), p_trigger_id, p_trigger_ver, 'shown')
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.augur_log_outcome(p_event_id uuid, p_outcome text, p_answer text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update augur_events set
    outcome     = p_outcome,
    answer      = case when p_outcome = 'answered' then p_answer else answer end,
    answered_at = case when p_outcome = 'answered' then now() else answered_at end
  where id = p_event_id and user_id = auth.uid();
end $$;

create or replace function public.augur_log_note(p_event_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from augur_events where id = p_event_id and user_id = auth.uid()) then
    raise exception 'not your event';
  end if;
  insert into augur_notes (event_id, body) values (p_event_id, p_body);
end $$;

create or replace function public.augur_log_unconfigured(p_trigger_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into augur_unconfigured (trigger_id, user_id) values (p_trigger_id, auth.uid());
end $$;

grant execute on function public.augur_log_shown(text, int)          to authenticated;
grant execute on function public.augur_log_outcome(uuid, text, text) to authenticated;
grant execute on function public.augur_log_note(uuid, text)          to authenticated;
grant execute on function public.augur_log_unconfigured(text)        to authenticated;
