# Test Suite — Implementation Report

Status: implemented, all phases committed on branch `test-suite`.
Audience: a reviewer (Fable) checking this implementation against
`docs/test-suite-plan.md`. Every deviation from the plan is called out
explicitly under **Deviations** — those are the highest-value things to review.

## 1. What was built

The plan (`test-suite-plan.md`) was followed phase by phase, one commit each.

| Commit    | Phase | Contents |
|-----------|-------|----------|
| `0b26562` | 0     | Prerequisite production changes (§3.1–3.6) |
| `e48e940` | 1     | `compose.test.yml`, `package.json` scripts, `test/tsconfig.json` |
| `d437263` | 2     | `test/helpers/{test-env,build,db,fixtures}.ts` |
| `91371e9` | 3     | `test/unit/*.test.ts` |
| `a0c6810` | —     | Follow-up fix to `resetDb` (see Deviation D1) |
| `04d5bf0` | 4     | `test/integration/*.test.ts` |
| `dd203bb` | 5     | `.github/workflows/ci.yml` |

Result: `yarn test:full` → **196 pass, 0 fail**, ~10 s test wall-clock.
`yarn lint`, `yarn build`, `yarn typecheck` all clean. Route snapshot unchanged.

## 2. Verification performed (§9)

1. `yarn test:db:up && yarn test:db:push` — succeeds; schema in sync.
2. `yarn test` run **twice consecutively** without re-pushing — 196 pass both
   times (proves `resetDb` isolation).
3. `yarn lint`, `yarn build`, `yarn typecheck` — all pass.
4. **`DATABASE_NAME` override safety**: ran the suite with `DATABASE_NAME=ml_dev`
   exported in the shell; tests still pass because `test-env.ts` unconditionally
   forces `ml_test` (if the override leaked, `resetDb`'s guard would throw).
5. Route snapshot test passes unmodified (`test/routes.snapshot.txt` untouched
   since before this work — verify with `git log -- test/routes.snapshot.txt`).
6. Wall-clock ~10 s, far under the ~2 min budget.
7. **Not done**: pushing the branch / opening the PR / confirming CI green — this
   is an outward-facing action left for the maintainer to trigger.

## 3. Deviations from the plan (review these first)

### D1 — `resetDb` required an interactive transaction (`a0c6810`)

**The plan's §5.3 sequence did not work as written and was corrected.**

Plan §5.3 said to run, on the shared `prisma` singleton:
`SET FOREIGN_KEY_CHECKS = 0` → `TRUNCATE` each table → `SET FOREIGN_KEY_CHECKS = 1`
as separate `$executeRawUnsafe` calls.

At runtime this fails immediately:
```
Cannot truncate a table referenced in a foreign key constraint
(`ml_test`.`registrations`, CONSTRAINT `registrations_billId_fkey` ...)
```
`SET FOREIGN_KEY_CHECKS` is a **per-connection session variable**, but the
`@prisma/adapter-mariadb` driver pools connections. The `SET` landed on one
pooled connection and the `TRUNCATE`s on others where checks were still on, so
MariaDB refused to truncate any FK-referenced table — independent of whether any
rows existed.

Fix (`test/helpers/db.ts`): wrap the whole sequence in an interactive
transaction so every statement runs on one pinned connection. `TRUNCATE`
auto-commits but leaves the session flag intact for the connection's lifetime,
so the disabled FK checks apply to every truncate:

```ts
await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of TABLES) {
    await tx.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
  }
  await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
});
```

Semantics are identical to the plan (truncate all tables with FK checks off,
then reseed). Only the connection-pinning mechanism changed. Landed as its own
`Fix …` commit because Phase 2 was already committed (plan §10 permits a
follow-up fix commit).

**Reviewer check:** confirm this is the minimal correct fix and that no
behaviour beyond connection-pinning changed.

### D2 — `--skip-generate` dropped from `prisma db push` (Phases 1 & 5)

Prisma 7 removed the `--skip-generate` flag. The plan's `test:db:push` script
(§4.2) and the CI `prisma db push` step (§8) both used it. Both were written
**without** the flag. Verified `prisma db push` still works and does not
implicitly regenerate the client. This was already flagged as expected in the
pre-compaction notes; calling it out here for completeness.

### D3 — explicit `Transporter` annotation in the mailer (§3.2)

`src/plugins/app/nodemailer.ts`: the plan's snippet was
`const transporter = server.config.NODE_ENV === "test" ? … : …`. The two
`nodemailer.createTransport` calls yield different `Transporter<SentMessageInfo>`
instantiations whose union is not assignable to the decorated `Transporter`
type, causing TS2345. Added an explicit `const transporter: Transporter =`
annotation. No runtime change.

### D4 — signup payloads include `email` (§7.2)

`SignupSchema` (in `auth.schemas.ts`) requires `email: Type.String()`. The
plan's example signup payloads omitted it (e.g.
`{username, name, password, token}`), which would fail schema validation with a
400 before reaching the service. All signup test payloads include `email` so
they exercise the intended 201/403/409/422 paths. The service ignores
`body.email` (it uses the token's email), so this only satisfies validation.

### D5 — test typing choices (no behaviour impact)

- `permissions.test.ts` uses a local `Method = "GET"|"POST"|"PATCH"|"DELETE"`
  union and `body?: object` for the matrix-case type. Using fastify's
  `HTTPMethods` (which includes verbs light-my-request rejects) or `unknown`
  bodies broke `app.inject` overload resolution under `tsc`/eslint. `object` is
  assignable to `InjectPayload`; the narrow verb union matches inject's method
  type.
- `validation.test.ts`: the PATCH calls are inlined rather than routed through a
  `patchReg(body: unknown)` helper, because a helper returning `app.inject(...)`
  with a loosely-typed body lost the overload resolution and produced
  `no-unsafe-*` eslint errors. Direct `app.inject({...})` calls type cleanly.

## 4. How the permission matrix is structured (§7.4)

`test/integration/permissions.test.ts` builds a flat `cases` array via an
`add(method, url, body, expectations, opts?)` helper, then iterates it inside one
`test("permission matrix")` with a `t.test(...)` subtest per cell (node:test
requires subtests for loop-generated cases). Notable mechanics a reviewer should
sanity-check:

- **Dynamic ids** (`regId`, `recordId`, `gradeId`, `billNr`, `userId`) are
  passed as `url` **thunks** (`() => \`/api/bills/${capturedBillNr}\``) evaluated
  at inject time, so ids captured earlier in the run are visible.
- **`billNr` capture**: the `POST /api/bills` row carries a `capture` callback
  that reads `data.billNr` from the 201 response into a module variable; the
  subsequent `GET /api/bills/:billNr` row's thunk reads it. Table order (POST
  before GET) guarantees ordering.
- **Ordering constraints deliberately encoded in cell order:**
  - `DELETE /api/grades/:gradeId` lists `viewer(403), outsider(403), helper(204)`
    — the denied cases must run **before** helper's successful delete, otherwise
    the grade is already gone and `deleteGrade` returns `true` (204) for a
    missing grade, so viewer/outsider would wrongly get 204.
  - The mutating registration PATCH rows target the **reserve** registration, not
    the billable one, so the billing rows (which key off `bill-parent@test.invalid`)
    stay stable.
  - `POST /api/records` mutating rows run after the read rows (per plan).
- **Empty-body assertion**: the `requireRoot` sync row sets `assertEmptyBody`,
  and the runner asserts `res.body === ""` only on the 403 responses.
- **Fixture record** belongs to the billable (registered) child with
  `isActive: true`, so `forceSyncRecords` sees it in-sync and never tries to
  `createMany` a duplicate (which would hit the `record_meta_unique` constraint).

The five §7.4 "additional single tests" (401 without cookie, unknown-path 404,
`norole` empty-array quirk, PDF content-type/non-empty, `notifSent` side effect)
run as separate top-level tests after the matrix.

## 5. Files added / changed

**Production (Phase 0):** `src/config/env.ts`, `src/lib/prisma.ts`,
`src/plugins/app/nodemailer.ts`, `src/lib/guards.ts`,
`src/routes/api/registrations/registrations.schemas.ts`,
`src/routes/api/shifts/shifts.schemas.ts`, `src/lib/permissions.ts`,
`src/routes/api/registrations/registrations.service.ts`,
`prisma/seed-core.ts` (new), `prisma/seed.ts`.

**Seed behaviour change (§3.5):** `EDIT_SHIFT_MEMBERS` added to the `root` and
`boss` permission lists in `seed-core.ts`. Idempotent upsert — **run
`yarn seed` against existing databases** to apply it. Without it,
`POST /api/users/invites` was 403 for every seeded role.

**Infra:** `compose.test.yml`, `.github/workflows/ci.yml`, `package.json`
scripts, `test/tsconfig.json` (added `../src` to `include` so the
`FastifyContextConfig.public` augmentation in `routes/api/autohooks.ts` is in
the typecheck graph).

**Helpers:** `test/helpers/{test-env,build,db,fixtures}.ts`.

**Unit tests:** `test/unit/{id-code,pricing,age,password,date,guards}.test.ts`.

**Integration tests:** `test/integration/{auth,signup,password-reset,`
`permissions,registration-visibility,registration-create,validation}.test.ts`.

## 6. Open questions for the reviewer

1. **D1** — is pinning `resetDb` to an interactive transaction acceptable, or is
   there a preference for a different mechanism (e.g. `DELETE` instead of
   `TRUNCATE`, or a dedicated single-connection client)? The plan's literal
   sequence cannot work under the pooled adapter.
2. Should the `resetDb` fix have been squashed into the Phase 2 commit
   (`d437263`) via rebase rather than landed as a follow-up `Fix …` commit? Kept
   as a separate commit to avoid rewriting already-made history.
3. The seed grant of `EDIT_SHIFT_MEMBERS` to root/boss (§3.5) is a real
   production behaviour change shipped with the test work — confirm this is the
   intended fix and that operators know to re-run `yarn seed`.
