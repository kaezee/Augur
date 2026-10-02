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
