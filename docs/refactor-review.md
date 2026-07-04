# Refactor review packet — `refactor/feature-modules`

This documents the judgment calls made while executing `docs/refactor-plan.md`,
with rationale, risk, and how to verify each.
The plan was treated as binding; where I departed from it, it is
listed here with the reason. **Please assess whether each deviation is the right
call and whether any behavior drift slipped through.**

Branch: `refactor/feature-modules` (16 commits, one per phase / Phase-4 feature).
Gate (`yarn tsc --noEmit && yarn eslint src --max-warnings=0 && yarn test`) passed
after every phase. Route snapshot (`test/routes.snapshot.txt`) stayed byte-identical
throughout except the one approved account addition.

---

## How to review efficiently

1. `git log --oneline main..refactor/feature-modules` — one commit per unit; each is independently gated.
2. `git diff main..HEAD -- test/routes.snapshot.txt` — should show **only** `+│   └── -reset (POST)` (the new `POST /api/account/password-reset`).
3. Wire-compat is the crux (plan §1.2: byte-identical responses except §8). The highest-risk diffs are the billing dedup and the response-schema declarations — see Deviations 3 and 6.
4. Re-run the gate. `yarn test` needs the dev DB from `.env` reachable (read-only).

---

## Deviations from the plan (the review surface)

### D1 — `shifts/` and `registrations/` kept as a single `index.ts`
**Plan wanted** (§2): split into `shifts/{index,resources,records,staff,tents}.ts` and `registrations/{index,create}.ts`.
**What I did:** all routes for each feature stay in one `index.ts`; logic still lives in colocated `*.service.ts`, schemas in `*.schemas.ts`.
**Why (two independently fatal reasons, both verified empirically):**
- `@fastify/autoload`, as configured in `src/app.ts`, loads **only** `index.ts` when a directory contains one — sibling plugin files are silently ignored (their routes never register). With no index, it prepends the **filename** to the path (`shifts/tents.ts` → `/api/shifts/tents/...`). Either way the snapshot breaks. (The plan's §2 note "directory names — not file names — determine prefixes" does not hold for this autoload setup.)
- `app.printRoutes()` preserves **insertion order**, including the method list at a shared path (`GET /` before `POST /` prints `(GET, HEAD, POST)`; reverse prints `(POST, GET, HEAD)`). The committed snapshot encodes that order, and §9 forbids regenerating it.
**Risk:** low — the plan's structural intent (inline handlers, thin services, colocated schemas) is fully met; only the physical route-file split is absent. `*.service.ts`/`*.schemas.ts` are safe next to `index.ts` because autoload ignores them (the `ignorePattern` is redundant belt-and-suspenders here).
**Verify:** the two probes are reproducible — a dir with `index.ts` + `create.ts` registers only the index's routes; `printRoutes` output reorders when registration order changes.
**Question for reviewer:** acceptable, or do you want the autoload config changed (e.g. `indexPattern`/`encapsulate`) to enable the split? That would be new surface and risks the snapshot.

### D2 — `--test-force-exit` added to the `test` script
**Plan's literal command** (§7) omits it. **Why added:** `PrismaSessionStore`'s `checkPeriod` interval keeps the Node test runner alive after `app.close()`, so the process hangs (2-min timeout) instead of exiting. `--test-force-exit` is the idiomatic fix; it changes nothing about what the tests assert.
**Risk:** negligible. **Verify:** remove the flag → `yarn test` hangs.

### D3 — null/empty and stream response bodies are **declared** on inline handlers
**Plan legend** (§5) says "streams and bare-null bodies get no schema." **What I did:** declared `[204]/[201]/[403-null]: Type.Null()` and stream `[200]: Type.Unknown()` wherever an inline handler emits them.
**Why:** the TypeBox type provider narrows `reply.status()` to the *declared* status set once any response is declared; an inline handler cannot then `.status()` an undeclared code without a cast. Declaring the code is the cast-free path and matches plan §1.2 ("declarations corrected to match what handlers send").
**Byte-identity proof (via `app.inject`):**
- `201` + `Type.Null()` + `send(null)` → body `"null"`, len 4 — identical to schemaless `send(null)`.
- `204` + `Type.Null()` + `send(null)`/`send()` → empty body, len 0 (204 strips regardless of schema).
- stream + `Type.Unknown()` → piped unserialized, `content-type` preserved.
**Risk:** low, but this is the single most repeated pattern — worth a spot check that no `Type.Null()` landed on a code that actually sends a JSON object. **Verify:** grep the route files for `Type.Null()` / `Type.Unknown()` and cross-check the adjacent `.send(...)`.

### D4 — extra `*.service.ts` files not in §2's sketch
Added `app.service.ts`, `grades.service.ts`, `teams.service.ts`, `notifications.service.ts` to honor the binding rule "zero Prisma imports in `routes/**`" (§3.1) for features whose §2 entry listed no service. Pure mechanical extraction; no logic change.

### D5 — `registrations` GET keeps inline view-flag disjunctions (not `getRegistrationViewFlags`)
**Plan §4.2** says replace all four registration-view or-chains with `getRegistrationViewFlags`. Three (shift pdf/emails/billing) were replaced via the `requireRegistrationView` guard. The **fourth** (registrations fetch) was not, because it needs the permission-**set size** to distinguish:
- `size === 0` → 200 **empty list** ("unpermitted", per §5), vs
- `size > 0` but all flags false (BASIC-only) → 200 list with **limited fields**.

`getRegistrationViewFlags(userId, shiftNr)` returns only the three booleans and re-queries, so using it would either change behavior or double-fetch. I kept the original single-fetch + size check + inline flags in `registrations.service.ts`.
**Risk:** behavior-preserving; the cost is one un-DRY'd or-chain. **Question:** accept, or would you prefer a `getRegistrationViewFlags` variant that also returns the set/size?

### D6 — billing `billId` scan unified to the create-path behavior *(highest-attention item)*
**Context:** §4.7 mandates a single shared `collectBillableCampers` used by both the bill **create** (`POST /api/bills`) and **send** (`POST /api/notifications/bills`) handlers. The two originals differed:
- `createBillHandler` scanned `billId` over **all** registrations (registered + reserve), first-wins.
- `sendBillHandler` scanned `billId` over **registered only**.

A single function can only do one. I chose **scan-all** (preserves `createBillHandler` exactly).
**Observable effect:** only when a **reserve** camper carries a stale `billId` **and** no registered camper for that email has one. Old `sendBill` → `billNr` stays null → **creates a new bill**. New `sendBill` → reuses the reserve camper's `billId`. (`billId` is only ever assigned to *registered* campers by `createAndAssignBill`, so this requires a previously-registered, now-reserve camper.)
**Why acceptable:** §4.7 forces unification and does not list this under §8; reusing an existing bill rather than minting a duplicate is the safer of the two outcomes. Not covered by tests.
**Question for reviewer:** is scan-all the right canonical choice, or should the shared helper mirror `sendBill` (registered-only)? This is the one place a real, if rare, behavior change was unavoidable and I'd value a second opinion.

### D7 — `POST /api/shifts/:shiftNr/tents/:tentNr` 201 body drops the stray `id`
Verified and accepted: response serialization strips the duplicate `id` field from the `TentScore` payload (only `scoreId`, `score`, `createdAt`, `tentNr` are emitted); `ml-tanstack` reads only `scoreId`, so no consumer impact.

### Other intentional changes — all from plan §8, not discretionary
Guard-before-query on `GET /api/shifts/:shiftNr/pdf` (403 before 404, §8.1); new rate limits (§8.2); prod 500 → `"Serveri viga."` (§8.3); HTML-escaped email interpolation (§8.4); invite bad-role → 422 not 500 via `Object.hasOwn` (§8.5); atomic registration-patch + record-toggle (§8.6); password-reset route split (§8.7). Estonian strings were copied byte-for-byte from source (403 messages, `"Tundmatu meiliaadress"` vs `"Tundmatu meiliaadress."` dot difference between the two bill endpoints preserved).

---

## Things I'd most like a second set of eyes on
1. **D6** — the billing `billId` scan choice (only genuine behavior change forced by dedup).
2. **D3** — that no `Type.Null()`/`Type.Unknown()` declaration accidentally suppresses a real body.
3. Response-schema **alignments** in the §5 table applied exactly: bills POST 200→201 + `{permissions}` moved 404-union→403; teams POST dead-400 removed + 403 added; shifts tents POST 200→201; teams GET 403 added; auth signup 422 added; registrations POST 500 added.
4. The **account split** branch fidelity: the email branch → `requestPasswordReset` (always 202, no enumeration), the token branch → `confirmPasswordReset` (token-expiry, `deleteUserSessions`, `resetToken.deleteMany` unchanged).

## Pending coordination (not actioned here, per instructions)
`ml-tanstack` must repoint its "request password reset" call to `POST /api/account/password-reset` (`{ email }`). `PUT /api/account/password` is now confirm-only (`{ token, password }`); an `{ email }` body there now 400s instead of sending mail. **`ml-tanstack` was not modified.**
