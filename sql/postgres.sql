-- Augur — plain Postgres schema (13+), for HttpStore with your own endpoint.
-- The same tables as schema.sql, without the Supabase parts (auth.uid(), roles,
-- row-level security, RPC functions). Your endpoint does that job instead: it takes
-- the user from your own session and only lets people write their own rows. See
-- README → "Plain Postgres" and example/postgres-route.ts.
--
-- test/postgres-schema.test.ts keeps these tables identical to schema.sql's.

create table if not exists augur_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,          -- plain, NO fk
  trigger_id    text not null,
  trigger_ver   int  not null,
  outcome       text not null check (outcome in ('shown', 'ignored', 'answered')),
  answer        text,                   -- choice3 key, custom choice key, or null
  shown_at      timestamptz not null default now(),
  answered_at   timestamptz,
  category      text,                   -- button submissions: the chosen category, or null
  context       jsonb                   -- button submissions: diagnostic context (places, never words)
);
create index if not exists augur_events_user_idx on augur_events (user_id, shown_at desc);
create index if not exists augur_events_trigger_idx on augur_events (trigger_id, shown_at desc);
create index if not exists augur_events_shown_idx on augur_events (shown_at);   -- admin's date-range counts

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
