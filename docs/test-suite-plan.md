# Test Suite Implementation Plan

Status: approved design, ready for implementation.
Audience: an implementing agent (Opus/Sonnet). All architectural decisions are
made here — follow them exactly; do not redesign. When this plan conflicts with
your own judgement, the plan wins. If the plan conflicts with observed reality
(e.g. a file has moved), stop and report rather than improvising.

## 1. Goals and non-goals

Goals:

- Integration tests that exercise the real HTTP surface (`app.inject`) against
  a real MariaDB, with the **permission matrix** (role × endpoint → status) as
  the centrepiece.
- Field-level filtering tests for `GET /api/registrations` (PII/financial/
  contact visibility per role).
- Auth lifecycle tests (login, logout, password change, signup tokens,
  password reset) asserting DB side effects.
- Unit tests for the pure functions (`parseIdCode`, `computePrice`,
  `getAgeAtDate`, date utils, password policy, guard hardening).
- GitHub Actions CI running lint, typecheck, build, and the full test suite
  against a MariaDB service container.
- A handful of small production fixes that are prerequisites for the tests to
  be correct (§3). Nothing else in production code changes.

Non-goals (explicitly out of scope — do not do these):

- No new test framework. Use `node:test` + `tsx`, as the repo already does.
- No mocking of Prisma. Tests hit the real test database.
- No coverage tooling, no test parallelism tuning beyond what §4 specifies.
- No refactoring of route files, services, or response shapes beyond §3. The
  wire API is frozen; tests **pin current behaviour**, including the quirks
  (empty 403 body from `requireRoot`, 200-with-empty-array for unauthorised
  registration reads, 304 from `POST /api/records`, 404-masking on
  registration patches).
- Do not split feature `index.ts` route files (project constraint).
- Do not touch `trustProxy`, bills/notifications dedup, or anything else from
  the broader review that isn't listed in §3.

## 2. Fixed decisions

| Topic | Decision |
|---|---|
| Framework | `node:test`, `tsx` loader, `assert/strict` (already in use) |
| DB engine | MariaDB **11.4** (pin image `mariadb:11.4` everywhere) |
| Local DB | Docker Compose file `compose.test.yml`, host port **3307**, tmpfs storage |
| CI DB | GitHub Actions service container, same image, mapped to host port **3307** so config is identical to local |
| DB credentials (test) | user `ml_test`, password `ml_test`, database `ml_test` — hardcoded in the test env helper |
| Schema creation | `prisma db push` (repo has no migrations directory) |
| Test isolation | One shared DB; test **files run sequentially** (`--test-concurrency=1`); each integration file calls `resetDb()` once in `before()`; tests within a file use disjoint fixtures (unique usernames/emails) and run serially (node:test default within a file) |
| DB reset | `TRUNCATE` every app table with `FOREIGN_KEY_CHECKS=0`, then re-seed roles/permissions |
| Safety guard | `resetDb()` throws unless `process.env.DATABASE_NAME === "ml_test"` |
| Env for tests | `test/helpers/test-env.ts` **unconditionally** sets all required env vars via `Object.assign(process.env, …)` before any `#app` import. `.env` values can never leak in (dotenv never overrides pre-set vars) |
| Mail | nodemailer `jsonTransport` when `NODE_ENV === "test"` (no network). Tests assert DB side effects, not email contents |
| Password hashing in fixtures | `bcrypt.hashSync(TEST_PASSWORD, 4)` — cost 4 keeps the suite fast; `bcrypt.compare` doesn't care about cost |
| Node version | 24 (matches dev machine) |
| CI triggers | `push` to `main` + all `pull_request` |
| Directory layout | `test/helpers/`, `test/unit/`, `test/integration/`; existing `smoke.test.ts`, `routes.test.ts` stay at `test/` root unchanged |

## 3. Phase 0 — prerequisite production changes

Small, wire-compatible changes. Each is required for the tests to be
implementable or trustworthy. Make them first, in one commit.

### 3.1 `DATABASE_PORT` support

The test DB listens on 3307; the MariaDB adapter currently hardcodes the
default port.

- `src/config/env.ts`: add to `EnvConfig`: `DATABASE_PORT: number;` and to
  `envSchema.properties`: `DATABASE_PORT: { type: "number", default: 3306 }`.
  Do **not** add it to `required` (the default covers it).
- `src/lib/prisma.ts`: add `port: Number(process.env.DATABASE_PORT ?? 3306),`
  to the `PrismaMariaDb` options.

### 3.2 Hermetic mailer in test env

`src/plugins/app/nodemailer.ts` — replace the transporter construction:

```ts
const transporter =
  server.config.NODE_ENV === "test"
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport(mg(config));
```

The `verify()` call is already skipped for `NODE_ENV === "test"`; leave that
as is.

### 3.3 Guard hardening (`getShiftNr`)

`src/lib/guards.ts` — replace the unchecked cast:

```ts
const getShiftNr = (request: FastifyRequest, source: ShiftNrSource): number => {
  const value = (request[source] as { shiftNr?: unknown } | undefined)?.shiftNr;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(
      `Guard misconfiguration: request.${source} does not contain an integer shiftNr`,
    );
  }
  return value;
};
```

Rationale: without this, a mis-wired guard passes `undefined` into Prisma,
which drops the `shiftNr` filter and silently broadens the permission check to
"any shift". The permission-matrix tests are only trustworthy with this fixed.
A throw surfaces as a 500 via the error handler — that is intended (it is a
programmer error, and access stays denied).

### 3.4 Numeric bounds on write schemas

Only these three fields (they map to unsigned DB columns; out-of-range values
currently surface as 500s instead of validation failures):

- `src/routes/api/registrations/registrations.schemas.ts`
  (`PatchRegistrationSchema`): `pricePaid: Type.Optional(Type.Integer({ minimum: 0 }))`,
  `priceToPay: Type.Optional(Type.Integer({ minimum: 0 }))`.
- `src/routes/api/shifts/shifts.schemas.ts` (`AddGradeSchema`):
  `score: Type.Integer({ minimum: 0, maximum: 255 })` (255 = DB `UnsignedTinyInt`
  bound; do not tighten further — the wire API is frozen and larger business
  bounds are not established).

Do not add bounds anywhere else.

### 3.5 Extract the seed into an importable function

Tests must seed roles/permissions programmatically after truncation.

- Create `prisma/seed-core.ts`: move `BASE_SHIFT_PERMISSIONS` and
  `ROLE_PERMISSIONS` from `prisma/seed.ts` into it verbatim, and export:

  ```ts
  export const seedRolesAndPermissions = async (client: PrismaClient): Promise<void>
  ```

  containing the current `main()` body (role upsert loop, permission-id cache,
  rolePermission upserts), parameterised on `client` instead of the imported
  singleton. Import `PrismaClient` as a type from `#app/generated/prisma/client`.
- Rewrite `prisma/seed.ts` as a thin wrapper: import the singleton
  `prisma` and `seedRolesAndPermissions`, call it, keep the existing
  `catch`/`finally` structure.
- While moving `ROLE_PERMISSIONS`, add `Permissions.EDIT_SHIFT_MEMBERS` to
  **both** the `root` and `boss` permission lists (approved seed fix: without
  it, `POST /api/users/invites` is 403 for every seeded role). The seed is
  upsert-based and idempotent, so this is additive on existing databases.
  Mention this seed change in the final report.

### 3.6 Single source for registration view flags

`src/lib/permissions.ts`:

```ts
export const deriveRegistrationViewFlags = (
  perms: ReadonlySet<string>,
): RegistrationViewFlags => ({
  pii:
    perms.has(Permissions.VIEW_REGISTRATION_FULL) ||
    perms.has(Permissions.VIEW_REGISTRATION_PERSONAL_INFO),
  financial:
    perms.has(Permissions.VIEW_REGISTRATION_FULL) ||
    perms.has(Permissions.VIEW_REGISTRATION_PRICE),
  contact:
    perms.has(Permissions.VIEW_REGISTRATION_FULL) ||
    perms.has(Permissions.VIEW_REGISTRATION_CONTACT),
});
```

`getRegistrationViewFlags` becomes `fetchUserShiftPermissions(...)` +
`deriveRegistrationViewFlags(...)`. In
`src/routes/api/registrations/registrations.service.ts`, replace the three
inline `canViewPII/canViewFinancial/canViewContact` computations with one
`deriveRegistrationViewFlags(shiftViewPermissions)` call (keep the
`size === 0 → empty result` early return). No behaviour change; the
field-filtering tests then cover the single implementation.

## 4. Phase 1 — test infrastructure

### 4.1 `compose.test.yml` (repo root)

```yaml
services:
  mariadb:
    image: mariadb:11.4
    environment:
      MARIADB_DATABASE: ml_test
      MARIADB_USER: ml_test
      MARIADB_PASSWORD: ml_test
      MARIADB_ROOT_PASSWORD: root
    ports:
      - "3307:3306"
    tmpfs:
      - /var/lib/mysql
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 5s
      timeout: 5s
      retries: 12
```

### 4.2 `package.json` script changes

```jsonc
"test":         "NODE_ENV=test node --import tsx --test --test-concurrency=1 --test-force-exit \"test/**/*.test.ts\"",
"test:db:up":   "docker compose -f compose.test.yml up -d --wait",
"test:db:down": "docker compose -f compose.test.yml down -v",
"test:db:push": "DATABASE_URL=mysql://ml_test:ml_test@127.0.0.1:3307/ml_test prisma db push --skip-generate",
"test:full":    "yarn test:db:up && yarn test:db:push && yarn gen:email && yarn test",
"typecheck":    "tsc -p test/tsconfig.json && tsc -p prisma/tsconfig.json"
```

Notes: `--test-concurrency=1` is load-bearing (shared DB; node runs test files
in parallel processes by default). The glob stays quoted so node, not the
shell, expands it. Keep `--test-force-exit` (the Prisma session store holds an
interval timer).

## 5. Phase 2 — test helpers

All helpers live in `test/helpers/`. Import order matters: **`test-env` must
be the first import** of any module that transitively imports `#app/*`.

### 5.1 `test/helpers/test-env.ts`

Side-effect module, no exports:

```ts
Object.assign(process.env, {
  NODE_ENV: "test",
  PORT: "0",
  APP_URL: "http://app.test.invalid",
  COOKIE_SECRET: "test-cookie-secret-0123456789-0123456789",
  MAILGUN_API_KEY: "test-key",
  EMAIL_SERV: "mail.test.invalid",
  DATABASE_HOST: "127.0.0.1",
  DATABASE_PORT: "3307",
  DATABASE_USER: "ml_test",
  DATABASE_PASSWORD: "ml_test",
  DATABASE_NAME: "ml_test",
});
delete process.env.COOKIE_DOMAIN;
delete process.env.DATABASE_URL;
```

Assignments are unconditional so a developer's `.env`/shell can never point
tests at a real database (dotenv never overrides already-set vars, in both
`lib/prisma.ts` and `@fastify/env`).

### 5.2 `test/helpers/build.ts` (edit existing)

Add `import "./test-env";` as the **first** import line. Everything else stays.

### 5.3 `test/helpers/db.ts`

```ts
import "./test-env";
import prisma from "#app/lib/prisma";
import { seedRolesAndPermissions } from "../../prisma/seed-core";
```

Export `resetDb(): Promise<void>`:

1. Throw if `process.env.DATABASE_NAME !== "ml_test"`.
2. `SET FOREIGN_KEY_CHECKS = 0` (via `$executeRawUnsafe`).
3. `TRUNCATE TABLE \`<t>\`` for each of (exact `@@map` names):
   `bills, certificates, children, documents, event_info, general_info,
   permissions, records, registrations, reset_tokens, role_permissions, roles,
   sessions, shift_staff, shifts, signup_tokens, teams, tent_scores,
   user_roles, users`.
4. `SET FOREIGN_KEY_CHECKS = 1`.
5. `await seedRolesAndPermissions(prisma)`.

Also export `prisma` re-exported from `#app/lib/prisma` so test files import
the client from one place.

### 5.4 `test/helpers/fixtures.ts`

`import "./test-env";` first. Exports (signatures are contracts — keep them):

```ts
export const TEST_PASSWORD = "test-password-123";

// ShiftInfo row. Defaults: bossName "Boss", bossEmail `boss${shiftNr}@test.invalid`,
// bossPhone "5550000", length 12, startDate = 90 days from now at UTC midnight,
// id = shiftNr. Overridable via `overrides`.
export const createShiftInfo = (shiftNr: number, overrides?: Partial<Prisma.ShiftInfoUncheckedCreateInput>) => Promise<ShiftInfo>;

// User + optional per-shift roles. Password is always TEST_PASSWORD hashed at cost 4.
// roles: e.g. [{ shiftNr: 1, roleName: "boss" }] -> looks up Role by roleName,
// creates UserRoles rows. superRoot: sets User.role = "root".
// email defaults to `${username}@test.invalid`, name to username, currentShift to
// the first role's shiftNr or 1.
export const createUser = (opts: {
  username: string;
  roles?: { shiftNr: number; roleName: RoleName }[];
  superRoot?: boolean;
  email?: string | null;
  currentShift?: number;
}) => Promise<User>;

// Child + Registration. Maintains a module-level regOrder counter.
// Defaults: sex "M", birthday 2014-05-05 UTC, tsSize "M", road/city/county "x",
// country "Eesti", contactName "Parent", contactNumber "5551234",
// contactEmail `parent${counter}@test.invalid`, isRegistered false, isOld true,
// priceToPay 250, regId = crypto.randomUUID(). All overridable.
export const createChildWithRegistration = (opts: {
  name: string;
  shiftNr: number;
  overrides?: Partial<Prisma.RegistrationUncheckedCreateInput>;
}) => Promise<{ child: Child; registration: Registration }>;

// Logs in via POST /api/auth/login and returns the cookie header value
// ("sessionId=..."), ready for inject({ headers: { cookie } }).
// Asserts the login itself returned 200.
export const loginAs = (app: FastifyInstance, username: string) => Promise<string>;
```

`loginAs` extracts the cookie from `res.cookies` (find `name === "sessionId"`)
and returns `` `${name}=${value}` ``.

## 6. Phase 3 — unit tests (`test/unit/`)

No DB, no app build. One file per subject; plain `test()` blocks.

- **`id-code.test.ts`** — `parseIdCode`: valid male code (starts `5`) →
  `{sex:"M", dob}` with correct ISO date; valid female (`6`); length ≠ 11 →
  error; non-digits → error; first digit `3` (adult) → error; embedded
  invalid date (e.g. month 13 or Feb 30) → error; leap-day code (e.g.
  `50402290...`) → valid.
- **`pricing.test.ts`** — `computePrice`: shift 1 new = 250, shift 1 old =
  240, shift 2 new = 360, shift 2 old = 340 (derive expected values from the
  `SHIFT_PRICES`/`SENIORITY_DISCOUNTS` constants, don't hardcode independently);
  shift 0 and shift 5 → -1.
- **`age.test.ts`** — `getAgeAtDate`: birthday later in target year (age not
  yet incremented), exact birthday, day before birthday, same month earlier
  day.
- **`password.test.ts`** — `validatePasswordPolicy`: 7 chars → message,
  8 chars → null.
- **`date.test.ts`** — `startOfUTCDay`, `addUTCDays` across month/year
  boundary, `subUTCMonths` day-overflow (Mar 31 − 1 month → Mar 2/3 behaviour
  as implemented — assert what the function actually does per its doc
  comment), `formatUTCDate` with an explicit locale.
- **`guards.test.ts`** — after §3.3: calling the handler returned by
  `requireShiftPermission(Permissions.VIEW_SHIFT_BASIC, "params")` with a fake
  request `{ params: {}, session: { user: { userId: 1 } } }` and a stub reply
  must **reject** (assert `assert.rejects`). No DB call happens because the
  throw precedes the Prisma query.

## 7. Phase 4 — integration tests (`test/integration/`)

Common skeleton for every file:

```ts
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { build } from "../helpers/build";
import { resetDb, prisma } from "../helpers/db";
import { /* fixtures */ } from "../helpers/fixtures";

let app: FastifyInstance;
before(async () => {
  await resetDb();
  // fixtures for this file
  app = await build();
});
after(async () => { await app.close(); });
```

Build the app **after** fixtures exist where boot-time state matters (the
`regorder` plugin reads max `regOrder` at startup).

### 7.1 `auth.test.ts`

Fixtures: shift 1 (`createShiftInfo(1)`); user `alice` with boss role on
shift 1.

- Login OK: `POST /api/auth/login` `{username:"alice", password:TEST_PASSWORD}`
  → 200, body `status:"success"`, `data.userId` matches, `data.isRoot === false`,
  `data.managedShifts` includes 1; a `sessionId` cookie is set.
- Username normalisation: login as `"  ALICE  "` → 200.
- Wrong password → 401, `status:"fail"`, `data.message` present.
- Unknown user → 401 (same shape — no enumeration).
- `GET /api/auth/me` with cookie → 200 + same UserInfo shape; without cookie
  → 401.
- Logout: `POST /api/auth/logout` → 204; the old cookie on `/me` → 401.
- Password change: login twice (two cookies A and B). With A,
  `POST /api/auth/password` wrong `currentPassword` → 401; new password 7
  chars → 422; valid change → 204. Then: cookie A still works on `/me`
  (session kept), cookie B → 401 (invalidated), login with the new password
  → 200, with the old → 401.

### 7.2 `signup.test.ts`

Fixtures: shift 1; boss user `boss1` (boss role, shift 1). The seeded boss
role has `EDIT_SHIFT_MEMBERS` (§3.5), so no extra grant is needed.

- Invite happy path: as boss, `POST /api/users/invites`
  `{email:"new@test.invalid", name:"New Person", shiftNr:1, role:"instructor"}`
  → 204; assert a `signup_tokens` row exists for that email with a `roleId`,
  and a `shift_staff` row (`role: "full"`) exists.
- Invalid role value → 422 with `data.role`.
- Signup happy path: `POST /api/auth/signup` with the stored token,
  `{username:"newbie", name:"New Person", password:"longenough1", token}` →
  201; login as `newbie` works; `user_roles` row exists (instructor, shift 1);
  token row has `isExpired: true` and a `usedDate`.
- Token reuse → 403 (`data.token`).
- Expired token: create a `signupToken` row directly with
  `createdAt: new Date(Date.now() - 25 * 3600 * 1000)` (set at **create**
  time; `createdAt` is settable, `updatedAt` is not) → signup → 403 and the
  row is now `isExpired: true`.
- Weak password → 422 (`data.password`).
- Duplicate username (`boss1`) with a fresh token → 409 (`data.conflict`).
- Invite as a helper-role user → 403 (the seed grants `EDIT_SHIFT_MEMBERS`
  only to root and boss).

### 7.3 `password-reset.test.ts`

Fixtures: shift 1; user `carol` (email `carol@test.invalid`).

- `POST /api/account/password-reset` unknown email → 202 and **no**
  `reset_tokens` row.
- Known email → 202 and a `reset_tokens` row for carol's userId (email send is
  jsonTransport, succeeds silently).
- `PUT /api/account/password` bad token → 403.
- Valid token + weak password → 422; token still usable afterwards.
- Valid token + good password → 204; login with new password works; all of
  carol's `reset_tokens` rows are gone; carol's pre-existing session cookie
  → 401.
- Expired token (row created with backdated `createdAt`) → 403 and the row is
  deleted.

### 7.4 `permissions.test.ts` — the matrix

Fixtures (in `before`):

- Shifts: `createShiftInfo(1)`, `createShiftInfo(2)`.
- Users (all on shift 1 unless noted):
  `superroot` (`superRoot: true`, plus boss role on shift 1 so `/me` works),
  `boss` (boss), `instructor` (instructor), `helper` (helper),
  `viewer` (reg-viewer-basic), `outsider` (boss role but on **shift 2**),
  `norole` (no roles at all).
- Data in shift 1: two children with registrations (one
  `isRegistered: true, visible: true`, contactEmail `bill-parent@test.invalid`,
  `priceToPay: 340`; one reserve), one `record` (via direct
  `prisma.record.create`, `year: current UTC year`, `isActive: true`), one
  `team` (current year), one `tentScore` (current year, tent 1).
- Helper also gets a role in **shift 99** (no ShiftInfo row exists — allowed,
  there's no FK) so "guard passes but resource missing" paths are reachable.
- Log in every user once in `before`; keep a `cookies: Record<string,string>`
  map.

Implementation pattern (node:test requires subtests for loop-generated cases):

```ts
void test("permission matrix", async (t) => {
  for (const c of cases) {
    await t.test(`${c.method} ${c.url} as ${c.as} -> ${c.expect}`, async () => {
      const res = await app.inject({
        method: c.method, url: c.url, payload: c.body,
        headers: { cookie: cookies[c.as] },
      });
      assert.equal(res.statusCode, c.expect);
    });
  }
});
```

Cases (`as` → expected status). Where a POST/PATCH body is needed it is given
once; reuse it for every user in that row. IDs come from the fixtures.

| Method & URL | body | superroot | boss | instructor | helper | viewer | outsider | norole |
|---|---|---|---|---|---|---|---|---|
| GET `/api/shifts` | — | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| GET `/api/shifts/1/users` | — | | 200 | 403 | 403 | 403 | 403 | 403 |
| GET `/api/shifts/1/billing` | — | | 200 | 403 | 403 | 403 | 403 | |
| GET `/api/shifts/1/records` | — | | 200 | 200 | 200 | 403 | 403 | 403 |
| GET `/api/shifts/1/emails` | — | | 200 | 200 | 403 | 403 | 403 | |
| GET `/api/shifts/1/staff` | — | | 200 | 200 | 200 | 403 | 403 | |
| GET `/api/shifts/1/pdf` | — | | 200 | 403 | 403 | 403 | 403 | |
| GET `/api/shifts/1/tents` | — | | 200 | 200 | 200 | 403 | 403 | |
| GET `/api/shifts/1/tents/1` | — | | 200 | | 200 | 403 | 403 | |
| POST `/api/shifts/1/tents/2` | `{score: 5}` | | 201 | 201 | 201 | 403 | 403 | 403 |
| GET `/api/teams?shiftNr=1` | — | | 200 | | 200 | 403 | 403 | |
| POST `/api/teams` | `{shiftNr: 1, name: "Uus"}` | | | | 201 | 403 | 403 | |
| GET `/api/registrations?shiftNr=1` | — | | 200 | 200 | 200 | 200 | 200 | 200 |
| PATCH `/api/registrations/:regId` | `{isRegistered: true}` | | 204 | 404 | 404 | 404 | 404 | 404 |
| PATCH `/api/registrations/:regId` | `{pricePaid: 10}` | | 204 | 404 | | | | |
| POST `/api/registrations/sync` | — | 204 | 403 | | 403 | | | 403 |
| POST `/api/bills` | `{email: "bill-parent@test.invalid"}` | | 201 | 403 | 403 | 403 | | 403 |
| GET `/api/bills/:billNr` (from the 201 above) | — | | 200 | | 403 | | | |
| GET `/api/bills/999999` | — | | 404 | | | | | |
| POST `/api/notifications/bills` | `{email: "bill-parent@test.invalid"}` | | 204 | 403 | 403 | | | |
| POST `/api/notifications/bills` | `{email: "nobody@test.invalid"}` | | 404 | | | | | |
| POST `/api/records` | `{shiftNr: 1, forceSync: true}` | | 204 | 204 | 204 | 403 | 403 | 403 |
| POST `/api/records` | `{shiftNr: 1, forceSync: false}` | | 304 | | | | | |
| POST `/api/records` | `{shiftNr: 99, forceSync: true}` | | 403 | | 404 (helper has role in 99; shift missing) | | | |
| PATCH `/api/records/:recordId` | `{tentNr: 3}` | | 204 | 204 | 204 | 403 | 403 | 403 |
| PATCH `/api/records/999999` | `{tentNr: 3}` | | 404 | | | | | |
| DELETE `/api/grades/:gradeId` | — | | | | 204 | 403 | 403 | |
| DELETE `/api/grades/999999` | — | | 204 | | | | | |
| PATCH `/api/users/:ownId` | `{currentShift: 1}` | | 204 (self) | | | | | |
| PATCH `/api/users/:bossId` as instructor | `{currentShift: 1}` | | | 403 | | | | |
| PATCH `/api/users/:ownId` | `{currentShift: 2}` (not a member) | | 403 | | | | | |
| GET `/api/records?childId=:childId` | — | | 200 | 200 | 200 | | 403 | 403 |
| POST `/api/users/invites` | `{email:"x@test.invalid", name:"X", shiftNr:1, role:"helper"}` | | 204 | 403 | 403 | | 403 | |

Blank cells = don't test that combination. The empty-body 403 from
`requireRoot` (sync row) should additionally assert `res.body === ""`.
Ordering constraints: run the two mutating PATCH-registration rows and
`POST /api/records` rows **after** the read-only rows (they change
`isRegistered` and records); the bills GET row needs the bills POST row first
— keep the cases array in the table's order and it works out, since
`GET /api/registrations` content assertions live in a different file (§7.5).

Additional single tests in the same file:

- Any protected URL without a cookie → 401 with
  `{status:"fail", data:{message}}`.
- Unknown path `/api/nonsense` (with cookie) → 404 with `data.path`.
- `GET /api/registrations?shiftNr=1` as `norole` → 200 **and**
  `data.registrations` is `[]` (pins the frozen "empty array instead of 403"
  behaviour).
- `GET /api/shifts/1/pdf` as boss: assert `content-type` starts with
  `application/pdf` and the payload is non-empty.
- After the `POST /api/notifications/bills` 204: the registered registration
  has `notifSent: true` in the DB.

### 7.5 `registration-visibility.test.ts`

Fixtures: shift 1; users `boss`, `instructor`, `helper`, `viewer` (as in
§7.4); one registration with **all** optional fields populated (addendum,
backupTel, billId null, etc.).

For `GET /api/registrations?shiftNr=1`, assert on the first element of
`data.registrations`:

- as `boss`: `birthday`, `road`, `county`, `country`, `addendum`,
  `pricePaid`, `priceToPay`, `notifSent`, `billId`, `contactName`,
  `contactNumber`, `contactEmail`, `backupTel` all **present**;
  `child.currentAge` is an integer.
- as `instructor` (contact only): `contactName`/`contactEmail`/
  `contactNumber` present; `birthday`, `road`, `pricePaid`, `priceToPay`,
  `billId` **absent** — assert with `assert.ok(!("birthday" in reg))`, not
  `undefined` equality.
- as `helper` and as `viewer` (basic only): all permission-gated fields
  absent; `id`, `childId`, `child.name`, `child.sex`, `child.currentAge`,
  `shiftNr`, `isRegistered`, `regOrder`, `isOld`, `tsSize` present.

### 7.6 `registration-create.test.ts`

Public endpoint — no login. Fixtures: shifts 1 and 2. Build app after
fixtures.

- Happy path with idCode: POST one entry with a **valid** 11-digit child code
  (construct one starting with `5`, digits 2–7 encoding a real date, any
  4-digit tail — the checksum is deliberately not validated) → 201,
  `data.registrationId` is a UUID; DB: `children` row created with sex/
  birthYear derived from the code; `registrations` row has `priceToPay ===
  computePrice(shiftNr, isOld)`.
- Happy path without idCode but with `sex` + `dob` → 201.
- Invalid idCode (bad date inside) → 400, `status:"fail"`, fail data keyed
  `"[0].idCode"`, and **no** child/registration rows created (transaction
  rolled back).
- Missing sex+dob and no idCode → 400 with `"[0].sex"` / `"[0].dob"` keys.
- Duplicate: register the same child (same idCode) for the same shift twice
  (two sequential requests) → both 201 (no leak), but the second
  `registrations` row has `visible: false`.
- Five entries in the array → 400 (schema `maxItems: 4`).
- `regOrder`: two sequential requests get strictly increasing `regOrder`
  values in the DB.

### 7.7 `validation.test.ts`

Login as `boss` (fixtures as in §7.4, one registration, one shift).

- `PATCH /api/registrations/:regId` `{pricePaid: -5}` → **400** with
  `status:"fail"` and fail-data key `pricePaid` (exercises §3.4 + the AJV
  error handler mapping).
- Same with `{priceToPay: -1}` → 400.
- `POST /api/shifts/1/tents/1` `{score: -1}` → 400; `{score: 9999}` → 400.
- `PATCH /api/registrations/:regId` `{unknownField: 1}` → 400
  (`additionalProperties: false`).
- `GET /api/app/version?platform=windows` → 400 (public route, enum
  validation).

### 7.8 Existing files

`test/smoke.test.ts` and `test/routes.test.ts` stay byte-identical. They pick
up the test DB automatically through the edited build helper. The route
snapshot must not change — none of the Phase 0 edits add/remove routes; if the
snapshot test fails, a Phase 0 edit went wrong (do **not** regenerate the
snapshot to make it pass).

## 8. Phase 5 — GitHub Actions

Create `.github/workflows/ci.yml` exactly:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      mariadb:
        image: mariadb:11.4
        env:
          MARIADB_DATABASE: ml_test
          MARIADB_USER: ml_test
          MARIADB_PASSWORD: ml_test
          MARIADB_ROOT_PASSWORD: root
        ports:
          - 3307:3306
        options: >-
          --health-cmd "healthcheck.sh --connect --innodb_initialized"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 12
    env:
      DATABASE_URL: mysql://ml_test:ml_test@127.0.0.1:3307/ml_test
    steps:
      - uses: actions/checkout@v4
      - run: corepack enable
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: yarn
      - run: yarn install --immutable
      - run: yarn gen:email
      - run: yarn prisma generate
      - run: yarn lint
      - run: yarn build
      - run: yarn typecheck
      - run: yarn prisma db push --skip-generate
      - run: yarn test
```

Notes baked into this design:

- `src/generated/**` is gitignored, so CI must run `gen:email` **and**
  `prisma generate` before anything that type-checks `src` (lint is
  type-aware; build is `tsc`).
- `corepack enable` must precede `setup-node` with `cache: yarn` (Yarn 4).
- `prisma.config.ts` reads `DATABASE_URL` at config load, hence the job-level
  env — it is needed even for `prisma generate`.
- The test-env helper hardcodes host `127.0.0.1:3307`, matching the service
  port mapping; no app-level env vars are needed in the workflow.

## 9. Phase 6 — verification & acceptance

1. `yarn test:db:up && yarn test:db:push` succeeds from a clean checkout
   (plus `yarn gen:email` and `yarn prisma generate` if not yet run).
2. `yarn test` passes; run it **twice in a row** without re-pushing the schema
   (proves `resetDb` isolation).
3. `yarn lint`, `yarn build`, `yarn typecheck` all pass.
4. Temporarily set `DATABASE_NAME=ml_dev` in the shell and confirm the suite
   still targets `ml_test` (test-env overrides) — then unset.
5. The route snapshot test passes unmodified.
6. Full suite wall-clock under ~2 minutes locally.
7. Push a branch, open a PR, confirm the workflow is green.

Definition of done: all of the above, plus a short summary in the PR/commit
description listing (a) the Phase 0 production changes, (b) the frozen quirks
the tests now pin, and (c) the §3.5 seed change (`EDIT_SHIFT_MEMBERS` now
granted to root and boss — run `yarn seed` against existing databases to
apply it).

## 10. Commit plan

One commit per phase, in order:

1. `Add test-suite prerequisites` (Phase 0, §3.1–3.6)
2. `Add test DB compose file and scripts` (Phase 1)
3. `Add test helpers` (Phase 2)
4. `Add unit tests` (Phase 3)
5. `Add integration tests` (Phase 4)
6. `Add CI workflow` (Phase 5)

Run the full verification (§9) before the final commit; fix forward within
the relevant phase's commit via amend or a follow-up `Fix …` commit.
