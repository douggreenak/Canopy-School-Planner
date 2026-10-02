# Backend Security Audit — Canopy School Planner

Scope: every API route under `src/app/api/**`, `src/lib/auth.ts`, `src/lib/db.ts`,
`src/lib/crypto.ts`, `src/lib/config.ts`, `src/lib/powerschoolClient.ts` /
`powerschoolSync.ts` / `powerschool.ts`, and `vercel.json` (cron auth). This is a
read-only audit — **no code was changed**. Findings are ordered by severity.

---

## CRITICAL

### C1. PowerSchool password logged in plaintext to Vercel logs
**File:** `src/app/api/powerschool/route.ts:17`
```ts
body = await request.json();
console.log("POST /api/powerschool payload:", body);
```
`body` includes the user's PowerSchool `password` field whenever they type
credentials into the sync dialog instead of using the saved ones. Vercel
function logs are retained, searchable, and visible to anyone with log access
(the whole team, log drains, etc.) — this writes the plaintext PowerSchool
password for every such request straight into that log stream.

**Fix:** delete the `console.log`, or redact (`{ ...body, password: body.password ? '[redacted]' : undefined }`) before logging. This is a one-line, zero-risk fix and should be the first thing patched regardless of when the rest of this report is acted on.

### C2. Any authenticated user can read and overwrite the app-wide Google OAuth client secret
**File:** `src/app/api/setup/route.ts` (`generate-setup-code`, `use-setup-code`, `logout` actions), backed by `src/lib/config.ts`.

`config.ts` stores `googleClientId` / `googleClientSecret` / `calendarSecretToken` in a **single shared `config.json` file for the entire deployment** — it is not per-user. But the API actions that read/write it only check `getSessionUserId(request)` (i.e. "is someone logged in"), never `role === 'admin'`:

- `generate-setup-code` embeds the *global* `googleClientSecret` into an encrypted blob and returns it to whichever user asked, encrypted with a passphrase **that same user supplied** (`src/app/api/setup/route.ts:79-90`). Any regular user can therefore self-serve the shared OAuth client secret used by every tenant.
- `use-setup-code` lets any logged-in user overwrite the global `googleClientId`/`googleClientSecret` for the whole app (`:110-113`).
- `logout` wipes the global `googleClientId`, `googleClientSecret`, and `calendarSecretToken` for *everyone* when a single user calls it (`:134-140`) — any user logging out (or hitting this endpoint) breaks Google Classroom import for the entire install.

This is a broken-access-control issue with real multi-tenant blast radius: one non-admin user can exfiltrate a shared secret or knock out a shared integration for all other users.

**Fix:**
- Gate `use-setup-code`, `generate-setup-code` (for the parts that touch `googleClientId`/`googleClientSecret`), and the config-clearing branch of `logout` behind `role === 'admin'`, same as `export-config` already is.
- Longer term, this config shouldn't be a single shared file at all in a multi-user deployment — it's a per-install secret masquerading as something every user's browser can round-trip through a "setup code." If Classroom OAuth needs to vary per user/school eventually (see multi-school work), move it into the same per-user encrypted-settings path already used for PowerSchool credentials.

### C3. Cron endpoint is open to the public if `CRON_SECRET` is unset
**File:** `src/app/api/powerschool/cron/route.ts:35-38`
```ts
const authHeader = request.headers.get('authorization') ?? '';
if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
```
This fails **open**: if the `CRON_SECRET` env var is never set (easy to miss — it's not in the documented required env vars in README, only `DATABASE_URL`/`ADMIN_*`), the check is skipped entirely and `GET /api/powerschool/cron` becomes a public, unauthenticated endpoint that triggers a full headless-Chromium PowerSchool scrape for every user with auto-sync on. That's both a cost-abuse vector (repeated requests burn Vercel compute/Puppeteer invocations — directly undermines the compute-cost goal elsewhere in this project) and, if an attacker can force many concurrent/rapid calls, a way to repeatedly exercise every user's stored PowerSchool login against the school's real PowerSchool instance.

**Fix:** fail closed — if `CRON_SECRET` is not configured, reject all requests rather than allow them:
```ts
if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
```
And document `CRON_SECRET` as a required env var in the README/deployment checklist.

---

## HIGH

### H1. `CREDENTIAL_KEY` silently falls back to `DATABASE_URL` as the encryption key
**File:** `src/lib/db.ts:959-963`
```ts
function credentialKey(): Buffer {
  const secret = process.env.CREDENTIAL_KEY || process.env.DATABASE_URL || '';
  return crypto.createHash('sha256').update(secret).digest();
}
```
This is the key used to AES-256-GCM-encrypt every user's PowerSchool password at rest. If `CREDENTIAL_KEY` is never set (and nothing enforces that it is), the encryption key is derived from the database connection string — which:
- is itself present in plaintext in Vercel's env var UI, in `.env` files, in anyone with "read env vars" access, and often in CI logs/build output:  it's not really a secret *in addition to* the DB credentials, it's deriving one secret from another that's already broadly held.
- never rotates independently — rotating `DATABASE_URL` (e.g. a routine password rotation on the MySQL side) silently re-derives the encryption key and makes every previously-encrypted PowerSchool password undecryptable (already partially handled by the `catch { password = ''; }` fallback in `getPowerSchoolCredentials`, but that's a silent data-loss path, not a fix).

**Fix:** require `CREDENTIAL_KEY` to be set and fail startup / fail the specific operation loudly if it isn't, rather than silently reusing `DATABASE_URL`. Generate it once with `openssl rand -hex 32`, store only in the deployment's secret manager, and document it in README alongside `ADMIN_PASSWORD`.

### H2. No login rate limiting / brute-force protection
**File:** `src/app/api/auth/route.ts` (`login` action)

`verifyPassword` is timing-safe, but there's no attempt limiting, lockout, or delay per username/IP. Combined with `MIN_PASSWORD_LEN = 1` (line 25 — a 1-character password is accepted at registration), this makes credential stuffing / brute force against weak accounts practical, especially since usernames are enumerable via the distinct "already taken" (409) vs. generic login error responses (register leaks whether a username exists; login does not — that asymmetry is itself a minor username-enumeration oracle via `/api/auth` `register`).

**Fix:** add a per-IP + per-username rate limit (even a simple in-memory/Redis-backed sliding window, or Vercel's WAF rate limiting) on `action: 'login'` and `action: 'register'`, and raise `MIN_PASSWORD_LEN` to something reasonable (8+), surfaced in the UI.

### H3. Plaintext-at-rest data model (the user's original concern)
**File:** `src/lib/db.ts` schema (classes, homework, exams, tasks, grade_history, sync_log tables)

Grades, assignment titles/scores, class names/teachers, and sync history are all stored as plain `TEXT`/`VARCHAR`/`DECIMAL` columns — no column-level encryption. This is real, but worth sizing correctly before reaching for "encrypt everything":

- **What's actually at risk:** this is K-12 homework/grade data (FERPA-adjacent, not SSNs/health/financial data). The realistic threat model is (a) a leaked/stolen `DATABASE_URL` or direct DB access by someone who shouldn't have it, (b) a SQL-injection or IDOR bug exposing other users' rows (audited below — none found; every data query is parameterized and user-scoped), (c) a compromised Vercel account/DB host.
- **Full field-level encryption** of every grade/assignment column would: break every `ORDER BY`/`GROUP BY`/aggregate query already in `db.ts` (`ORDER BY period, name`, `ORDER BY due_date`, admin stats aggregates, etc. — all would need rework or a dual plaintext-index/encrypted-value pattern), make the PowerSchool sync's name-matching logic (`normalizeName`, class/homework diffing) significantly harder, and add real latency to hot paths, for a threat model where the bigger wins are elsewhere.

**Pragmatic recommendation (in priority order):**
1. **Close the actual access-control gaps first** (C1–C3, H1, H2 above) — these are real, exploitable issues; column encryption does nothing against a bug that returns another user's row to the wrong user.
2. **Turn on encryption-at-rest at the database layer** (managed MySQL providers — PlanetScale, RDS, Cloud SQL — all support this as a checkbox, transparent to the application, no query/index breakage). This is the standard, proportionate control for "protect data if the disk/backups are stolen."
3. **Enforce TLS on the `DATABASE_URL` connection** (`ssl: { rejectUnauthorized: true }` in the mysql2 pool config) if not already the case for the production provider — confirm this explicitly; it wasn't verified as part of this audit since it depends on the connection string's actual host.
4. If there's a specific compliance requirement (a school district contract clause, etc.) driving "must be encrypted," that's worth getting in writing before investing in field-level encryption — otherwise recommend holding off and revisiting if/when that requirement is concrete. If it *is* required, the smallest useful scope is the `score`/`score_percent`/`grade`/`grade_percent` columns only, following the exact pattern already used for `powerschoolPassword` (AES-256-GCM, server-only key) — not a blanket re-encryption of every text column.

### H4. `powerschoolAutoSync` and other settings are client-validated but not type-checked server-side beyond string length
**File:** `src/app/api/settings/route.ts`

`ALLOWED_KEYS` correctly whitelists which setting keys can be written (good — prevents arbitrary key injection), and length is capped at 10,000 chars. But values aren't otherwise validated (e.g. `lathropMode`/`powerschoolAutoSync` accept any string, not just `'true'`/`'false'`/valid JSON), so a malformed value can end up stored and later break a `JSON.parse` call downstream (several of which already defensively `catch`, e.g. `getUsersWithAutoSyncEnabled` in `db.ts:927-935` — good) or silently misbehave. Low exploitability (an attacker can only corrupt their *own* settings), but worth a schema check per key while touching this file for the opt-out-confirmation work.

---

## MEDIUM

### M1. No CSRF token, relying solely on `SameSite=Strict`
**File:** `src/lib/auth.ts:34` (`createSession`)

`SameSite=Strict` is a strong default and blocks the classic cross-site form-POST CSRF case, but it does mean the session cookie also isn't sent on top-level cross-site navigations (e.g. clicking a link from email/Slack to the app) until the user interacts with the page again — a UX note more than a vuln. No actual CSRF gap found given `SameSite=Strict` + no GET-based state mutations (all mutating routes are POST/PUT/DELETE, not GET-with-side-effects). No action required unless `SameSite` is ever loosened for some other feature — flag that if it comes up.

### M2. Internal error detail returned to client on bad PowerSchool payload
**File:** `src/app/api/powerschool/route.ts:20`
```ts
return Response.json({ error: "Invalid payload", details: error }, { status: 400 });
```
`error` here is a caught exception object (JSON-parse failure) — serializing it directly into the response can leak stack traces / internal messages to the client. Every other route in the codebase correctly logs the error server-side and returns a generic message; this is the one exception.

**Fix:** `return Response.json({ error: 'Invalid payload' }, { status: 400 });` and keep the `console.error` (redacted per C1) for diagnostics.

### M3. Admin endpoints trust a role flag with no secondary signal
**Files:** `src/app/api/admin/stats/route.ts`, `src/app/api/admin/users/route.ts`

Role check is correct and consistent (`user.role !== 'admin'` → 403), and the admin account is seeded from env vars, not user-controlled registration — good. The only gap: `createOrUpdateAdminUser` re-applies the `ADMIN_PASSWORD` env var's hash on **every cold start** (`src/app/api/auth/route.ts:31-36`), so if `ADMIN_PASSWORD` is ever left at the README's documented example value (`changeme`) in a real deployment, the admin account is trivially compromised and self-heals back to that password on every redeploy even if someone manually changed it in the DB. Not a code bug, but worth a loud runtime check: refuse to boot (or log a prominent warning) if `ADMIN_PASSWORD` is unset or equals a known-default string.

### M4. No rate limiting on the public `/api/calendar` ICS feed
**File:** `src/app/api/calendar/route.ts`

Token is `crypto.randomUUID()` (122 bits of entropy) and compared with `timingSafeEqual` — brute-forcing it is infeasible, so this is low actual risk, but the endpoint is unauthenticated-by-design (that's the point of a subscribable calendar URL) and has no rate limiting, so it's a minor amplification vector if a token ever leaks (forwarded email, shared link, browser history on a public computer). Recommend documenting "treat your calendar link like a password" in the Settings UI copy, and keep the existing "Regenerate link" button prominent.

---

## LOW

### L1. `GET /api/setup` leaks whether PowerSchool credentials exist to any session, including none
Actually gated correctly (`userId ? ... : empty`) — no finding; confirmed clean on recheck.

### L2. `scrypt` cost parameters are Node defaults
**File:** `src/lib/auth.ts:13-16`

`scrypt(password, salt, 64)` uses Node's default N/r/p cost parameters. These are reasonable but not tuned; consider explicitly setting `{ N: 16384, r: 8, p: 1 }` (or higher) and documenting the choice, so the cost doesn't silently change across Node versions.

### L3. `deleteUserAndAllData` / account deletion has no soft-delete or audit trail
**File:** `src/lib/db.ts:580-589`

A deleted account's data (and the admin stats that reference it) is gone immediately and permanently. Not a security vulnerability, but worth a deliberate decision (e.g. a short grace-period soft-delete) rather than an accident of implementation, especially combined with the admin's ability to delete *other* users' accounts (`/api/admin/users` DELETE) with only a username, no confirmation step server-side (the UI presumably confirms, but the API trusts it blindly).

---

## What was checked and found clean
- **SQL injection:** every query in `db.ts` uses parameterized placeholders (`?`); no string-concatenated SQL found anywhere, including the dynamic `inClause()` builder (placeholders generated, values passed separately).
- **IDOR on per-user data:** every classes/homework/exams/tasks/disruptions/grade-history/sync-log route scopes both reads and writes by the session's `userId`, and the DB layer additionally requires `AND user_id = ?` on every update/delete — an attacker who guesses another user's row ID cannot read or mutate it.
- **Session handling:** `HttpOnly`, `SameSite=Strict`, `Secure` in production, 30-day server-side-revocable sessions (not stateless JWTs — logout actually invalidates), timing-safe password comparison.
- **PowerSchool password at rest:** correctly AES-256-GCM encrypted (modulo the key-derivation issue in H1) and never returned to the client (`getSettings` explicitly excludes `powerschoolPassword` from the generic settings bag — `db.ts:877-887`).

---

## Prioritized action list
1. **C1** — remove/redact the PowerSchool-password `console.log` in `powerschool/route.ts`. Trivial, do it immediately.
2. **C3** — make the cron auth check fail closed when `CRON_SECRET` is unset; document it as required.
3. **C2** — admin-gate the setup-code generate/use/logout actions that touch shared `config.json`.
4. **H1** — require `CREDENTIAL_KEY` explicitly; stop falling back to `DATABASE_URL`.
5. **H2** — add login/register rate limiting; raise minimum password length.
6. **M2** — stop echoing raw caught errors to the client on the one route that does.
7. **M3** — warn loudly (or refuse to boot) if `ADMIN_PASSWORD` is unset/default.
8. **H3** — enable DB-provider encryption-at-rest + confirm TLS on the DB connection; hold off on field-level encryption of grades/classes unless a specific compliance requirement makes it worth the query/index rework.
9. Everything else (H4, L1–L3) — fold into normal hardening work, no urgency.

No code was modified as part of this audit, per the request.
