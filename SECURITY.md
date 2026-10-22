# Security

Augur stores feedback, diagnostic context and friction tied to your users, so we
treat security reports as the top priority.

## Reporting a vulnerability

Please **don't open a public issue.** Report it privately through GitHub:
[Security → Report a vulnerability](https://github.com/kaezee/Augur/security/advisories/new).

Include what an attacker could do, the steps to reproduce, and the version or
commit you tested. You'll get an acknowledgement within 3 working days. A fix
ships as a patch release with a credit in the advisory, unless you'd rather not
be named.

## Supported versions

Only the latest release gets fixes. Because Augur is copied into your app rather
than installed, upgrading means replacing your `augur/` folder and running any
new migration (see [Upgrading](./README.md#upgrading)).

## In scope

- The `augur/` folder: anything that leaks one person's data to another, records
  more than the README says it records, or runs script from stored text.
- `sql/`: RLS gaps, `SECURITY DEFINER` functions without their own guard, and
  grants wider than signed-in users for the write functions or admins for reads.

Your own store, backend, auth, and admin route guard are yours. If Augur's docs
led you to set one of them up unsafely, that's in scope too.

## How Augur protects your data

This covers the Supabase setup in [`sql/schema.sql`](./sql/schema.sql). With
`HttpStore` or your own store, the same rules are yours to enforce; the checklist at
the end of this section is a starting point.

### What's stored

Five tables, all in your own project. Nothing is sent anywhere else.

| Table | Holds | Never holds |
|---|---|---|
| `augur_events` | one row per prompt shown or feedback sent: user id, trigger id and version, outcome, answer, times; for the feedback button also the category and diagnostic context | anything the person typed outside Augur, page content, cookies |
| `augur_notes` | the optional line or feedback text the person chose to send, linked to its event | |
| `augur_friction` | user id, the `data-augur` label, the page path, the press count, the time | element text, keystrokes |
| `augur_unconfigured` | an `emit()` id that has no config entry, with the user id and time | |
| `augur_config` | admin's setting overrides (questions, caps, labels) | any user data |

`user_id` is whatever id your app passes in. Use your auth id, never an email. The
diagnostic context is listed under README → [Privacy](./README.md#privacy).

### Who can do what

| | Signed out | Signed-in user | Admin |
|---|---|---|---|
| Record their own prompts, notes, feedback and friction | no | yes, always as themselves | yes |
| Read any feedback, including their own | no | no | yes |
| Read the settings (needed to show prompts) | no | yes | yes |
| Change settings, mark notes read, delete or purge | no | no | yes |

An admin is a signed-in account whose id you list in `augur_is_admin()`. The list
ships empty, so nobody can read results until you add yourself.

### How it's enforced

- **Row-level security is on for every table.** There are no read (`select`)
  policies on events, notes, friction or unconfigured, so the anon key in your app
  can't read any of them, whoever is signed in.
- **Writes take the user from the login token.** Every collection function sets
  `user_id = auth.uid()` itself, so nobody can write a row as someone else. A note
  can only be added to the writer's own event.
- **Admin reads check the admin list inside the function.** They are `SECURITY
  DEFINER` functions that return nothing unless `augur_is_admin()` is true for the
  caller, and the write and delete ones raise an error instead.
- **Signed-out visitors can't call any function.** Execute is revoked from `public`
  and `anon` on every Augur function and granted to `authenticated` only, so a
  future function that forgot its own check still wouldn't be open.
- **Bounded friction input.** Labels are cut to 80 characters, paths to 300, and the
  press count is clamped to 1–1000.
- **Secrets are masked out of error messages.** Only the first line of each error
  is kept, never the stack trace. Before it's stored, emails, JWTs, `Bearer`/`Basic`
  credentials, long key-like strings and long numbers are replaced with `[redacted]`,
  and your own `redactError` runs first for anything specific to your app. It's set
  in code only; admin settings can't change it.
- **Stored text is shown as text.** Admin renders notes and context through React,
  never as HTML, so a note can't run script in your admin.

Your **service role key** and the Supabase dashboard bypass row-level security, as
they do for every table. Keep that key on the server.

### Known limits

- **No rate limit or size cap on notes and context.** A signed-in user can only
  write their own rows, but nothing stops one account from writing many, or very
  long ones. If that matters for your app, add a check such as
  `alter table augur_notes add constraint augur_notes_body_len check (length(body) <= 4000);`
  and rely on Supabase's auth rate limits for sign-ups.
- **Answers can be changed by their author.** A user can update the outcome of their
  own prompt rows. They can't touch anyone else's.

### Deleting data

- **Old data:** Admin → Settings → Maintenance clears feedback older than the days
  you pick, or all of it (`augur_admin_purge`).
- **One note:** delete it from Admin → Results.
- **One person, when they close their account:** Augur's rows have no foreign key to
  your users table, so add the three `delete … where user_id = …` lines from README →
  [Privacy](./README.md#privacy) to your account-deletion path.

### Check it yourself

Run these in the Supabase SQL editor.

```sql
-- Row-level security is on: every row should say true.
select relname, relrowsecurity from pg_class
where relkind = 'r' and relname like 'augur\_%';

-- Signed-out visitors can't call anything: every row should say false.
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_can_run
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'augur\_%';

-- Only the policies listed above exist (inserts, own-row updates, settings).
select tablename, policyname, cmd, roles from pg_policies where tablename like 'augur\_%';

-- Who is an admin: the uuids in this function's body.
select pg_get_functiondef('augur_is_admin'::regproc);
```

### If you use your own backend

Whatever stores Augur's data should, at a minimum:

- take the user from your own session on the server, never from the request body;
- let users write only their own rows, and let only admins read;
- render stored notes as text in any admin view;
- delete a person's rows when their account is deleted.
