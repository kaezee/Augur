# Contributing

Issues are welcome: bugs, rough edges, and questions about fitting Augur into
your app. Security problems go through [SECURITY.md](./SECURITY.md) instead.

**Pull requests: discuss first.** Open an issue describing the change before
writing code. Augur is deliberately small, and many reasonable features (star
ratings, multi-question surveys, NPS) are things it has chosen not to do; see
[Design principles](./README.md#design-principles) and [DECISIONS.md](./DECISIONS.md).
Small fixes (typos, a failing case, docs) can go straight to a PR.

## Working on it

```sh
npm ci
npm run typecheck
npm test
npm run demo        # the live demo against your local augur/ folder
```

- `augur/` has no runtime dependencies and stays that way.
- Add a test with any behaviour change.
- A database change needs both `sql/schema.sql` and a new file in
  `sql/migrations/`. Migrations are additive and safe to rerun.
- Note user-facing changes in [CHANGELOG.md](./CHANGELOG.md).
- When a CHANGELOG release gets its version heading, bump `AUGUR_VERSION` in
  `augur/version.ts` to match. It's shown at the bottom of the admin panel and sent
  with each report, and a test fails if the two disagree.

By contributing you agree your work is released under the [MIT license](./LICENSE).
