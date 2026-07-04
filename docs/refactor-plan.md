# Refactor plan: feature-based routes, inline handlers, thin services

This document is a complete specification for restructuring the codebase. It is written
so that an agent can execute it **without re-deriving any decisions**. Where this document
and the current code disagree about *structure*, this document wins. Where they disagree
about *behavior*, the current code wins unless the change is listed in §8 (Intentional
behavior changes).

---

## 1. Decisions & constraints (already made — do not revisit)

1. **Controllers are dissolved.** Route files contain inline handlers typed by the TypeBox
   type provider. Domain logic moves to service functions. `src/controllers/` is deleted
   at the end.
2. **Wire compatibility:** every currently-sent status code, response body, header, and
   Estonian message stays **byte-identical**, except the items in §8. Route *declarations*
   (response schemas) are corrected to match what handlers actually send — never the
   other way around.
3. **Prisma:** keep the shared singleton (`import prisma from "#app/lib/prisma"`).
   Remove the `fastify.prisma` decoration entirely. A minimal plugin keeps only the
   connect/disconnect lifecycle.
4. **Bundled low-risk fixes** (approved, exhaustively listed in §4 and §8): preHandler
   authorization guards, production error-message suppression, rate limits on public
   routes, HTML escaping in emails, `Object.hasOwn`, transaction around
   registration-patch + record-toggle.
5. **No new runtime dependencies.** Tests use built-in `node:test` via `tsx`.
6. **Out of scope — do NOT do:** Prisma schema/migration changes (no `Registration.year`),
   pricing relocation, `@fastify/helmet`, swagger, JSend `data: null` union changes,
   date/UTC cleanup, renaming any existing route path.
7. **One deliberate API addition:** the password-reset flow splits into two routes
   (§4.3, §5 /api/account, §8.7). This is the only route-table change in the whole
   refactor.

---

## 2. Target layout

```
src/
  server.ts                     # entrypoint: buildApp(), listen, signal handling ONLY
  app.ts                        # buildApp(opts): env, cors, rate-limit, autoloads
  config/
    env.ts                      # unchanged
  constants/
    auth.ts                     # unchanged
    permissions.ts              # unchanged
    pricing.ts                  # unchanged
    roles.ts                    # + absorbs RoleNameMap and getRoleDisplayName
  lib/                          # infrastructure & cross-cutting; NO feature knowledge
    prisma.ts                   # from utils/prisma.ts, unchanged content
    jsend.ts                    # merge of schemas/jsend.ts + utils/jsend.ts + schemas/responses.ts
    guards.ts                   # NEW — preHandler factories (§4.1)
    permissions.ts              # from utils/permissions.ts + fetchUserShiftPermissions
                                #   + NEW getRegistrationViewFlags (§4.2)
    session.ts                  # from utils/session.ts (getSessionUser, deleteUserSessions)
    password.ts                 # NEW — validatePasswordPolicy (from users.controller)
    html.ts                     # NEW — escapeHtml (§4.6)
    age.ts                      # from utils/age.ts
    camp-year.ts                # from utils/campYear.ts
  plugins/
    external/
      prisma.ts                 # lifecycle only, no decoration (§4.4)
      session.ts                # imports lib/prisma directly (§4.4)
    app/
      error-handler.ts          # + prod suppression (§4.5)
      nodemailer.ts             # + skip verify when NODE_ENV === "test"
      regorder.ts               # unchanged (imports lib/prisma)
      schemas.ts                # unchanged (imports lib/jsend)
  services/                     # domain logic used by 2+ features, or heavyweight (pdf/mail)
    mail.service.ts             # from services/mailService.ts
    billing.service.ts          # NEW — shared bill logic (§4.7)
    bill-pdf.service.ts         # from utils/bill-builder.ts
    shift-pdf.service.ts        # from utils/shift-pdf-builder.ts
    camp-records.service.ts     # toggleRecord (from records.controller.ts)
    email-templates.ts          # from utils/email-builder.ts, + escaping (§4.6)
    email-layout.ts             # from utils/email/email-registration-html.ts
  routes/api/                   # feature modules; prefix comes from directory path
    autohooks.ts                # unchanged
    app/index.ts
    auth/
      index.ts                  # me, login, signup, set-password, logout
      auth.service.ts           # formatUserInfo, signup pipeline
      auth.schemas.ts           # CredentialsSchema, PasswordSchema, SignupSchema, Auth type
    account/
      index.ts                  # POST /password-reset (request email) + PUT /password (confirm)
      account.service.ts        # requestPasswordReset, confirmPasswordReset
      account.schemas.ts        # PasswordResetRequestSchema, PasswordResetConfirmSchema
                                #   (split of the current ResetPasswordSchema union)
    users/
      index.ts                  # PATCH /:userId, POST /invites
      users.service.ts          # invite pipeline
      users.schemas.ts          # UserParamsSchema, PatchUserSchema, CreateInviteSchema,
                                #   UserInfoSchema
    registrations/
      index.ts                  # GET /, POST /sync, PATCH /:regId
      create.ts                 # POST /  (public, rate-limited)
      registrations.service.ts  # fetch/patch/sync logic
      create.service.ts         # parseIdCode, computePrice, registration pipeline,
                                #   sendRegistrationEmails
      registrations.schemas.ts  # all of schemas/registration.ts
    records/
      index.ts                  # GET /, POST /, PATCH /:recordId
      records.service.ts        # fetch/forceSync/patch logic
      records.schemas.ts        # all of schemas/record.ts
    shifts/
      index.ts                  # GET /
      resources.ts              # GET /:shiftNr/pdf, /users, /emails, /billing
      records.ts                # GET /:shiftNr/records
      staff.ts                  # GET /:shiftNr/staff
      tents.ts                  # GET /:shiftNr/tents, GET+POST /:shiftNr/tents/:tentNr
      shifts.service.ts         # shift/staff/tent query logic
      shifts.schemas.ts         # ShiftResourceFetchParams, ShiftTentQuerySchema,
                                #   AddGradeSchema, UserWithShiftRoleSchema,
                                #   CamperRecordSchema (from schemas/user.ts),
                                #   TentInfoSchema, TentScoreSchema (from schemas/tent.ts),
                                #   ParentBillSchema/ChildBillSchema (from schemas/billing.ts),
                                #   CertificateSchema, ShiftStaffSchema (from schemas/staff.ts)
    teams/
      index.ts
      teams.schemas.ts          # from schemas/team.ts
    bills/
      index.ts
      bills.schemas.ts          # from schemas/bill.ts
    grades/
      index.ts
      grades.schemas.ts         # from schemas/grades.ts
    notifications/
      index.ts                  # POST /bills
      notifications.schemas.ts  # SingleBillSendSchema (from schemas/shift.ts)
    app/
      index.ts
      app.schemas.ts            # from schemas/app.ts
test/
  helpers/build.ts              # builds app via buildApp({ rateLimit: false })
  routes.test.ts                # route-table snapshot test
  smoke.test.ts                 # endpoint smoke tests
  routes.snapshot.txt           # committed snapshot (generated in Phase 0)
docs/
  refactor-plan.md              # this file
```

Deleted at the end (§7 Phase F): `src/controllers/**`, `src/schemas/**`, `src/utils/**`,
`src/services/mailService.ts` (old name), `src/schemas/route.ts`.

**Autoload note (critical):** `.service.ts` and `.schemas.ts` files live inside `routes/`
but are not plugins. The routes autoload call MUST get:

```ts
ignorePattern: /\.(?:service|schemas)\.(?:ts|js)$/,
```

(`.js` included so the compiled `dist/` build also skips them.) This must be in place
**before** the first colocated file lands (it is added in Phase 0). Directory names — not
file names — determine URL prefixes, so e.g. `shifts/tents.ts` still registers under
`/api/shifts`.

---

## 3. Conventions

### 3.1 Route file skeleton (the only handler pattern to use)

```ts
import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";
// ... schema + service imports

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/:shiftNr/records",
    {
      preHandler: requireShiftPermission(Permissions.VIEW_SHIFT_BASIC, "params"),
      schema: {
        params: ShiftResourceFetchParams,
        response: {
          [StatusCodes.OK]: SuccessResponse(FetchShiftRecordsData),
          [StatusCodes.FORBIDDEN]: FailResponse(RequestPermissionsFail),
        },
      },
    },
    async (request, reply) => {
      // request.params.shiftNr is inferred — NO manual generics, NO Route<>,
      // NO FastifyRequest<IXxx> interfaces, NO `Promise<never>` return types.
      const records = await fetchShiftRecords(request.params.shiftNr);
      return reply.status(StatusCodes.OK).send(createSuccessResponse({ records }));
    },
  );
};

export default plugin;
```

Rules:
- Handlers are inline arrow functions. Target ≤ 25 lines; if longer, the excess belongs
  in the service.
- Handlers do: read validated input → call service → map result to reply. No Prisma
  calls in route files (exception: trivial single-query GET handlers already ≤ 10 lines,
  e.g. `GET /api/shifts/`, may keep their one query inline via the service anyway — put
  it in the service; zero Prisma imports in `routes/**` is the rule).
- Value-dependent authorization (e.g. "may edit price fields only with X") stays in the
  service, but must run **before** any data is written and before any data beyond what
  the check itself needs is read.
- Delete `src/schemas/route.ts` and every `type IXxxHandler` interface. They must not
  be recreated.

### 3.2 Services

- Plain exported async functions. No Fastify types except `FastifyBaseLogger` where a
  logger is genuinely needed (pass `request.log` in).
- Import `prisma` from `#app/lib/prisma` directly.
- Keep existing result-shape conventions: services return data or `false`/`null` for
  "not found / not permitted" exactly as the current controller functions do (e.g.
  `patchRegistrationData` returns `boolean`). Do not redesign error flows.
- Functions used by exactly one feature: colocate in `<feature>.service.ts`.
  Functions used by 2+ features: `src/services/` (the set is fixed in §2 — do not invent
  new shared services).

### 3.3 Schemas

- Feature schemas colocate in `<feature>.schemas.ts`. Shared JSend/permission-fail
  schemas live in `lib/jsend.ts` only.
- Do not alter any schema's validation content (types, formats, additionalProperties)
  — only move them and fix the response-code *declarations* listed in §5.
- Keep the existing `#app/*` import alias for all new paths.

### 3.4 Naming

- Files: `kebab-case.ts`; suffixes `.service.ts` / `.schemas.ts` exactly (the autoload
  ignorePattern depends on them).
- Route plugin files export `default plugin` like today.

---

## 4. Cross-cutting specifications

### 4.1 `lib/guards.ts` — preHandler factories

All guards assume the autohooks auth gate already ran (session exists). Signatures:

```ts
type ShiftNrSource = "params" | "query" | "body";

// 403 with { status:"fail", data:{ permissions: message } } when check fails.
export const requireShiftPermission = (
  permission: Permissions,
  source: ShiftNrSource,
  message = "Puuduvad õigused päringuks.",
): preHandlerAsyncHookHandler => ...

// Permission in ANY shift (wraps userHasPermissionInAnyShift).
export const requireAnyShiftPermission = (
  permission: Permissions,
  message: string,
): preHandlerAsyncHookHandler => ...

// Registration-view flag requirements (§4.2). `required` keys must all be true.
export const requireRegistrationView = (
  required: Array<"pii" | "financial" | "contact">,
  source: ShiftNrSource,
  message = "Puuduvad õigused päringuks.",
): preHandlerAsyncHookHandler => ...

// isSuperRoot check. On failure: reply.status(403).send()  — EMPTY body,
// matching current /registrations/sync behavior exactly.
export const requireRoot: preHandlerAsyncHookHandler = ...
```

Implementation notes:
- Read `shiftNr` from `request[source]` (body is parsed and validated before
  preHandler runs, so this is safe for POST bodies).
- Guards use `getSessionUser(request)` and the existing `lib/permissions.ts` helpers.
- The 403 body must be produced with `createFailResponse({ permissions: message })`.
- When a guard is applied to a route, **delete** the equivalent in-handler check. The
  per-route `message` values are in the §5 table; they reproduce today's messages.

### 4.2 `lib/permissions.ts` additions

Move `fetchUserShiftPermissions` here from `registrations.controller.ts` (unchanged).
Add:

```ts
export type RegistrationViewFlags = { pii: boolean; financial: boolean; contact: boolean };
export const getRegistrationViewFlags =
  async (userId: number, shiftNr: number): Promise<RegistrationViewFlags> => ...
```

implementing exactly the current three `VIEW_REGISTRATION_FULL || VIEW_REGISTRATION_*`
disjunctions (see `registrations.controller.ts:116-126`). Replace all four duplicated
or-chains (registrations fetch, shift pdf, shift emails, shift billing) with this.

### 4.3 Rate limits (public routes)

| Route | Current | New |
|---|---|---|
| `POST /api/auth/login` | max 3 / 1 minute | unchanged |
| `POST /api/auth/signup` | none | max 10 / 1 minute |
| `POST /api/account/password-reset` (new route — request email) | 1 / 1 hour shared with confirm | max 2 / 1 hour |
| `PUT /api/account/password` (now confirm-only) | 1 / 1 hour shared with request | max 5 / 1 hour |
| `POST /api/registrations` | none | max 10 / 1 minute |

The strict 2/hour limit belongs on the **email-sending** route only; the confirm route's
5/hour exists to throttle token guessing without locking out a user who mistypes their
new password a few times.

Same per-route `config.rateLimit` mechanism as login uses today.

### 4.4 Prisma access

- `plugins/external/prisma.ts` becomes lifecycle-only: import the singleton, `$connect()`
  on plugin load, `$disconnect()` in `onClose`. Delete `server.decorate("prisma", ...)`
  and the `declare module "fastify" { prisma }` block.
- `plugins/external/session.ts`: `new PrismaSessionStore(prisma, ...)` with the singleton
  import instead of `fastify.prisma`. Keep the `{ name: "session" }` plugin name; the
  fastify-plugin dependency ordering on the prisma plugin is no longer needed.
- Replace every remaining `fastify.prisma` / `req.server.prisma` / `PrismaClient`
  parameter-passing with the singleton import. Known sites: `routes/api/registrations/index.ts`
  (PATCH handler passes `fastify.prisma` to `patchRegistrationData`), and the
  `prisma: PrismaClient` parameters on `patchRegistrationData`, `getUsers`, `createUser`
  (the latter two are deleted as dead code anyway).

### 4.5 Error handler (`plugins/app/error-handler.ts`)

In the non-validation branch, when `server.config.NODE_ENV === "production"`, send
`message: "Serveri viga."` instead of `error.message`. Keep the existing
`req.log.error(...)` (full detail still logged), keep status-code passthrough
(`error.statusCode ?? 500`), keep the validation branch byte-identical.

### 4.6 HTML escaping in emails

`lib/html.ts`:

```ts
export const escapeHtml = (value: string): string => ...
// & < > " ' → &amp; &lt; &gt; &quot; &#39;
```

Apply `escapeHtml()` to **every** interpolated string in `services/email-templates.ts`
(the former `email-builder.ts`): `camper.name`, `camper.child.name`, `shift.bossName`,
`shift.bossEmail`, `shift.bossPhone`. Numbers (`shiftNr`, prices) need no escaping.
Do not escape the static template HTML itself.

### 4.7 `services/billing.service.ts` — deduplicate bills/notifications

Extract the logic currently duplicated between `createBillHandler` and `sendBillHandler`:

```ts
export const registrationInclude = { child: { select: { name: true } } };  // moved here
export type CamperBillingInfo = ...;                                        // moved here

// Fetch registrations by contactEmail; partition into registered/reserve;
// sum priceToPay over registered; find first existing billId (else null — replaces
// the NaN sentinel INTERNALLY; the existing createAndAssignBill(billNr: number, ...)
// external contract keeps working).
export const collectBillableCampers = async (email: string): Promise<{
  registered: CamperBillingInfo[];
  reserve: CamperBillingInfo[];
  registeredIds: number[];
  billTotal: number;
  billNr: number | null;
} | null> => ...   // null when no registrations exist for the email

export const createAndAssignBill = ...   // moved from bills.controller.ts, signature
                                         // changed to accept billNr: number | null
```

Both route handlers then reduce to: guard → `collectBillableCampers` → the two 404
branches (messages unchanged: `"Tundmatu meiliaadress"` / `"Tundmatu meiliaadress."` —
note the dot difference between the two endpoints; preserve each) → create/send → reply.

### 4.8 Transaction: registration patch + record toggle

In `patchRegistrationData` (moving to `registrations.service.ts`): wrap the
`registration.update` and the `toggleRecord` upsert in a single `prisma.$transaction`.
`toggleRecord` (moving to `services/camp-records.service.ts`) gains an optional
`tx: Prisma.TransactionClient` parameter (defaulting to the singleton) so
`forceSyncRecordsHandler`-style callers are unaffected.

### 4.9 `Object.hasOwn`

In the invite handler logic (moving to `users/users.service.ts`): replace
`desiredRole in permissionRoleMap` with `Object.hasOwn(permissionRoleMap, desiredRole)`.

### 4.10 `app.ts` / `server.ts` split

`buildApp(opts?: { rateLimit?: boolean })` (default `true`) contains everything currently
in `server.ts` except `listen`, signal handlers, and `start()`. When `opts.rateLimit`
is `false`, skip registering `@fastify/rate-limit` (per-route `config.rateLimit` is then
inert — used by tests to avoid 429 flakiness). `server.ts` keeps: create app via
`buildApp()`, `start()`, `closeGracefully`.

`plugins/app/nodemailer.ts`: wrap `await transporter.verify()` in
`if (server.config.NODE_ENV !== "test") { ... }`.

---

## 5. Route inventory — guards, rate limits, response-schema alignment

Legend: **Sent** = status codes the handler actually produces today (declare exactly
these, minus 429 which rate-limit produces on its own; streams and bare-null bodies get
no schema). *Alignment* = change to the route's `schema.response` only.

### /api/auth (`routes/api/auth/index.ts`)
| Route | Config | Guard | Sent | Alignment |
|---|---|---|---|---|
| GET `/me` | — | — (handler keeps its own 403-bare-`null` branch) | 200, 403(null) | none |
| POST `/login` | public, RL 3/min | — | 200, 401 | none |
| POST `/signup` | public, RL 10/min (new) | — | 201, 403, 409, 422, 500 | add 422 `FailResponse({password: string})` |
| POST `/password` | — | — (compares currentPassword itself) | 204, 401, 422 | none |
| POST `/logout` | — | — | 204 | none |

### /api/account (route split — see §8.7)
| Route | Config | Guard | Sent | Alignment |
|---|---|---|---|---|
| POST `/password-reset` (**new**) | public, RL 2/h | — | 202 | body `PasswordResetRequestSchema` = `{ email: string }`; always 202 (no user enumeration — preserve the current behavior of returning 202 for unknown emails and when the mail send fails) |
| PUT `/password` | public, RL 5/h (was 1/h) | — | 204, 403, 422 | body `PasswordResetConfirmSchema` = `{ token: string, password: string }`; an `{email}` body now fails validation (400) instead of triggering a reset email |

Split the current `resetPasswordHandler` along its existing `"email" in req.body`
branch: the email branch becomes `requestPasswordReset` (POST route), the token branch
becomes `confirmPasswordReset` (PUT route). Logic inside each branch is unchanged
(including token expiry check, `deleteUserSessions`, and `resetToken.deleteMany`).

### /api/users
| Route | Config | Guard | Sent | Alignment |
|---|---|---|---|---|
| PATCH `/:userId` | — | — (self-check + value-based shift check stay in handler/service) | 204, 403 | none |
| POST `/invites` | — | `requireShiftPermission(EDIT_SHIFT_MEMBERS, "body", "Puuduvad õigused kasutaja loomiseks!")` | 204, 403, 422, 500 | none |

### /api/registrations
| Route | Config | Guard | Sent | Alignment |
|---|---|---|---|---|
| GET `/` | — | — (returns 200 empty list when unpermitted — keep in service) | 200, 501 | none |
| POST `/sync` | — | `requireRoot` (empty 403 body) | 204, 403 | none |
| POST `/` | public, RL 10/min (new) | — | 201, 400, 500 | add 500 `ErrorResponseRef` |
| PATCH `/:regId` | — | — (value-based permission split stays in service; §4.8 transaction) | 204, 404 | none |

### /api/records
| Route | Config | Guard | Sent | Alignment |
|---|---|---|---|---|
| GET `/` | — | — (branch-dependent checks stay in service) | 200, 403 | none |
| POST `/` | — | `requireShiftPermission(EDIT_SHIFT_BASIC, "body")` | 204, 304, 403, 404 | none |
| PATCH `/:recordId` | — | — (record→shiftNr lookup then check; stays in service, check before team validation/update) | 204, 400, 403, 404, 422 | none |

### /api/shifts (files: `index.ts`, `resources.ts`, `records.ts`, `staff.ts`, `tents.ts`)
| Route | Guard | Sent | Alignment |
|---|---|---|---|
| GET `/` | — | 200 | none |
| GET `/:shiftNr/pdf` | `requireRegistrationView(["pii","contact"], "params", "Puuduvad detailse nimekirja nägemise õigused.")` — **before** the registrations query (§8.1) | 200(pdf), 403, 404, 500 | none |
| GET `/:shiftNr/users` | `requireShiftPermission(VIEW_SHIFT_PERMISSIONS, "params")` | 200, 403 | none |
| GET `/:shiftNr/billing` | `requireRegistrationView(["financial"], "params")` | 200, 403 | none |
| GET `/:shiftNr/records` | `requireShiftPermission(VIEW_SHIFT_BASIC, "params")` | 200, 403 | none |
| GET `/:shiftNr/emails` | `requireRegistrationView(["contact"], "params")` | 200, 403 | none |
| GET `/:shiftNr/staff` | `requireShiftPermission(VIEW_SHIFT_STAFF, "params")` | 200, 403 | none |
| GET `/:shiftNr/tents/:tentNr` | `requireShiftPermission(VIEW_SHIFT_BASIC, "params")` | 200, 403 | none |
| GET `/:shiftNr/tents` | `requireShiftPermission(VIEW_SHIFT_BASIC, "params")` | 200, 403 | none |
| POST `/:shiftNr/tents/:tentNr` | `requireShiftPermission(EDIT_SHIFT_BASIC, "params")` | 201, 403 | change declared 200 → **201** (same schema) |

### /api/teams
| Route | Guard | Sent | Alignment |
|---|---|---|---|
| GET `/` | `requireShiftPermission(VIEW_SHIFT_BASIC, "query")` | 200, 403 | add 403 `FailResponse(RequestPermissionsFail)` |
| POST `/` | `requireShiftPermission(EDIT_SHIFT_BASIC, "body")` | 201, 403 | **remove** dead 400 declaration (and now-unused `TeamCreationFailData`); add 403 |

### /api/bills
| Route | Guard | Sent | Alignment |
|---|---|---|---|
| GET `/:billId` | `requireAnyShiftPermission(EDIT_REGISTRATION_PRICE, "Puuduvad arve pärimise õigused")` | 200(pdf), 403, 404 | none |
| POST `/` | `requireAnyShiftPermission(EDIT_REGISTRATION_PRICE, "Puuduvad arve loomise õigused")` | 201, 403, 404, 500 | change declared 200 → **201**; move the `{permissions}` member out of the 404 union into a 403 declaration |

### /api/notifications
| Route | Guard | Sent | Alignment |
|---|---|---|---|
| POST `/bills` | `requireAnyShiftPermission(EDIT_REGISTRATION_PRICE, "Puuduvad arve saatmise õigused.")` | 204, 403, 404, 500 | none |

### /api/grades
| Route | Guard | Sent | Alignment |
|---|---|---|---|
| DELETE `/:gradeId` | — (grade→shiftNr lookup then check; stays in service) | 204, 403 | none |

### /api/app
| Route | Config | Sent | Alignment |
|---|---|---|---|
| GET `/version` | public | 200, 404 | none |

**Guard messages:** where the table gives no message, the default
`"Puuduvad õigused päringuks."` matches the current handler. One exception to watch:
`fetchShiftRecords`/`fetchCamperRecords` in records currently send
`"Ligipääsuõigused puuduvad"` — those checks stay in the service, so the message is
preserved automatically. Do not "unify" messages.

---

## 6. File mapping (complete)

| Current | Destination |
|---|---|
| `src/server.ts` | split → `src/server.ts` (thin) + `src/app.ts` |
| `src/utils/prisma.ts` | `src/lib/prisma.ts` |
| `src/utils/jsend.ts`, `src/schemas/jsend.ts`, `src/schemas/responses.ts` | `src/lib/jsend.ts` (single file; keep every current export name) |
| `src/utils/permissions.ts` (+ `fetchUserShiftPermissions` from registrations.controller) | `src/lib/permissions.ts` |
| `src/utils/session.ts` | `src/lib/session.ts` |
| `src/utils/age.ts` | `src/lib/age.ts` |
| `src/utils/campYear.ts` | `src/lib/camp-year.ts` |
| `validatePasswordPolicy` (users.controller) | `src/lib/password.ts` |
| `RoleNameMap`, `getRoleDisplayName` (schemas/shift.ts) | `src/constants/roles.ts` |
| `src/services/mailService.ts` | `src/services/mail.service.ts` |
| `src/utils/bill-builder.ts` | `src/services/bill-pdf.service.ts` |
| `src/utils/shift-pdf-builder.ts` | `src/services/shift-pdf.service.ts` |
| `src/utils/email-builder.ts` | `src/services/email-templates.ts` (+ escaping) |
| `src/utils/email/email-registration-html.ts` | `src/services/email-layout.ts` |
| `toggleRecord` (records.controller.ts) | `src/services/camp-records.service.ts` |
| `registrationInclude`, `CamperBillingInfo`, `createAndAssignBill`, shared handler logic (bills.controller.ts / billing.controller.ts) | `src/services/billing.service.ts` |
| `src/controllers/auth.controller.ts` | handlers → `routes/api/auth/index.ts`; `formatUserInfo` → `auth.service.ts` |
| `signupUserHandler` (users.controller.ts) | route → `routes/api/auth/index.ts`; pipeline → `auth.service.ts` |
| `resetPasswordHandler` (users.controller.ts) | split into two routes in `routes/api/account/index.ts`; branches → `requestPasswordReset` / `confirmPasswordReset` in `account.service.ts` (§5, §8.7) |
| `patchUserHandler`, `inviteUserHandler` (users.controller.ts) | `routes/api/users/index.ts` + `users.service.ts` |
| `getUsers`, `createUser`, `UserCreateSchema`, `UserCreateBasis` | **delete** (dead code) |
| `src/controllers/registration/*` | `routes/api/registrations/*` per §2 |
| `src/controllers/records.controller.ts`, `records/fetch.record.ts` | `routes/api/records/*`; `PatchRecordFailData*` schemas → `records.schemas.ts` |
| `src/controllers/shifts.controller.ts`, `staff/fetch.staff.ts`, `tent.controller.ts` | `routes/api/shifts/*` per §2; inline `Type.Object` response wrappers (`FetchShiftsData` etc.) → `shifts.schemas.ts` |
| `src/controllers/teams.controller.ts` | `routes/api/teams/index.ts` (+ small service if > 25-line handlers) |
| `src/controllers/bills.controller.ts` | `routes/api/bills/index.ts` + `services/billing.service.ts` |
| `src/controllers/notifications/billing.controller.ts` | `routes/api/notifications/index.ts` + `services/billing.service.ts` |
| `src/controllers/grades.controller.ts` | `routes/api/grades/index.ts` (+ `grades.service.ts` for lookup+delete) |
| `src/controllers/app.controller.ts` | `routes/api/app/index.ts` |
| `src/schemas/<feature>.ts` | `<feature>.schemas.ts` per §2 (shift.ts splits: see §2 shifts/notifications/constants) |
| `src/schemas/route.ts` | **delete** |
| commented-out `getTrackingLinkList` (email-builder), commented-out `onlyHasAllowedKeys` block usage notes | **delete** dead commented code while moving |

---

## 7. Phases & verification gates

Run after **every** phase (the GATE):

```
yarn tsc --noEmit && yarn eslint src --max-warnings=0 && yarn test
```

`yarn test` = `NODE_ENV=test node --import tsx --test test/*.test.ts` (added in Phase 0;
requires the dev database from `.env` to be reachable; tests must never write to the DB).
The route snapshot must be **identical in every phase after 0**, with exactly one
exception: the Phase-4 **account** feature adds `POST /api/account/password-reset`.
In that sub-phase only, regenerate the snapshot and verify the diff is exactly that
one added route before committing.

### Phase 0 — test harness + app split
1. Extract `buildApp(opts)` into `src/app.ts` (§4.10), including the routes-autoload
   `ignorePattern` (§2). Thin `src/server.ts`.
2. `nodemailer.ts`: skip `verify()` when `NODE_ENV === "test"`.
3. Add `test/helpers/build.ts` (build via `buildApp({ rateLimit: false })`, `await ready`).
4. `test/routes.test.ts`: snapshot `app.printRoutes({ commonPrefix: false })` against
   `test/routes.snapshot.txt`; on first run, generate and commit the snapshot.
5. `test/smoke.test.ts` (read-only, exact expectations):
   - `GET /api/app/version?platform=android` → status is 200 or 404; body parses as JSON
     with `status` ∈ {`success`, `error`}.
   - `GET /api/shifts` (no cookie) → 401, body `.status === "fail"`.
   - `POST /api/auth/login` body `{"username":"__refactor_smoke__","password":"x"}` →
     401, body `.status === "fail"`.
   - `POST /api/registrations` body `{}` → 400, body `.status === "fail"`.
6. Add `"test"` script to package.json.
GATE.

### Phase 1 — lib/ consolidation
Move/merge per §6 rows for `lib/` + `constants/roles.ts`; create `lib/guards.ts` (§4.1),
`lib/permissions.ts` additions (§4.2), `lib/password.ts`, `lib/html.ts`. Update all
imports project-wide (controllers still exist and now import from `#app/lib/...`).
Delete the old `utils/` files as they are emptied. GATE.

### Phase 2 — infrastructure fixes
Prisma de-decoration + session store + removal of all `fastify.prisma` uses (§4.4);
error-handler production suppression (§4.5). GATE.

### Phase 3 — shared services
Move mail/bill-pdf/shift-pdf/email templates per §6; apply HTML escaping (§4.6);
create `services/billing.service.ts` (§4.7) and `services/camp-records.service.ts`
(toggleRecord with optional `tx`, §4.8) — controllers updated to import from new
locations but otherwise untouched. GATE.

### Phase 4 — feature migration (one sub-phase per feature, GATE after each)
Order: **app → grades → teams → bills → notifications → records → shifts → users →
account → auth → registrations.**

For each feature:
1. Create the feature directory with `*.schemas.ts` (moved schemas) and, where needed,
   `*.service.ts` (logic lifted out of the controller, minus what Phase 3 already took).
2. Rewrite the route file with inline handlers per §3.1, applying the guard, rate-limit,
   and response-schema alignment from the §5 table, and deleting the in-handler checks
   the guard replaces.
3. Feature-specific bundled fixes land here: users → §4.9 `Object.hasOwn`;
   registrations → §4.8 transaction + POST rate limit; auth → §4.3 signup limit;
   account → route split per §5 (+ the one-route snapshot regeneration);
   shifts → guard-before-query on the pdf route.
4. Delete the now-empty controller file(s) and old schema file for that feature.
GATE after each feature. If the snapshot test fails, the migration of that feature is
wrong — fix it; never regenerate the snapshot.

### Phase F — cleanup
1. Delete `src/controllers/`, `src/schemas/`, `src/utils/` (must already be empty),
   `src/schemas/route.ts`, dead exports listed in §6.
2. `grep -rn "controllers\|#app/schemas/\|#app/utils/" src/` → must return nothing.
3. Full GATE + boot `yarn dev` and manually spot-check: `GET /api/app/version?platform=ios`,
   `GET /api/shifts` without cookie (401), server log clean of plugin errors.

---

## 8. Intentional behavior changes (exhaustive — nothing else may change)

1. **`GET /api/shifts/:shiftNr/pdf`:** authorization now runs before the registrations
   query. Users without pii+contact permission get **403 even when the shift is empty
   or unknown** (previously 404-first). Authorized users see identical behavior.
2. **Rate limits** added/loosened per §4.3 → new 429 responses possible on
   `/auth/signup`, `/registrations` POST; `/account/password` allows 5/h instead of 1/h.
3. **Production 500 bodies** become `{"status":"error","message":"Serveri viga."}`
   (statusCode preserved). Development/test behavior unchanged.
4. **Emails:** user- and DB-supplied strings are HTML-escaped; a name containing markup
   now renders as literal text.
5. **`POST /api/users/invites`** with `role` = `"constructor"`/`"toString"`/etc. now
   returns the existing 422 `"Roll '...' ei ole valikus."` instead of a 500.
6. **`PATCH /api/registrations/:regId`:** registration update and camp-record toggle are
   atomic; if the record upsert fails, the registration update now rolls back (previously
   it persisted). Success path unchanged.
7. **Password-reset route split:** requesting the reset email moves from
   `PUT /api/account/password` (union body) to the new `POST /api/account/password-reset`
   with body `{ email }` and a strict 2/hour rate limit. `PUT /api/account/password`
   becomes confirm-only (`{ token, password }`); an `{ email }` body there now returns a
   400 validation failure instead of sending an email. **Requires a coordinated change
   in ml-tanstack** (point its "request reset" call at the new route) — flag this in the
   final report; do not modify ml-tanstack.

---

## 9. Do-not list (for the executing agent)

- Do **not** change any existing route path, method, or prefix; the snapshot test
  enforces this. The only permitted addition is `POST /api/account/password-reset` (§8.7).
- Do **not** edit any Estonian user-facing string (messages in §5 are copied from the
  code — if a discrepancy is found, the code wins).
- Do **not** touch `prisma/schema.prisma`, migrations, or seed data.
- Do **not** modify `src/generated/**` or anything in `dist/`.
- Do **not** add dependencies (runtime or dev).
- Do **not** refactor logic beyond this document (no date-handling changes, no
  `forEach`→`map` sweeps, no renaming of service functions beyond the mapping in §6,
  no removal of the `SuccessResponse` null union, no "while I'm here" fixes).
- Do **not** regenerate `test/routes.snapshot.txt` after Phase 0, except once during
  the Phase-4 account feature, where the diff must be exactly the added
  `POST /api/account/password-reset` route.
- Keep commit granularity at one phase (or one Phase-4 feature) per commit, message
  format: `refactor(<area>): <phase summary>`.
