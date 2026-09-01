# ShieldSQ — Known Gaps

Things that are built but incomplete, simplified, or would break under real
production load. Not bugs — deliberate scope cuts or shortcuts made to ship
Phases 1–4 without blocking on unconfirmed client details. Read alongside
DECISIONS.md (things that need *your* input) and FEATURES.md (what exists).

## Multi-tenancy

- **No self-service company signup.** Every company is created by the
  super admin manually — there's no public "start a trial" flow. Fits a
  vendor-managed rollout, not product-led growth.
- **Only one role per user, and it's whole-company.** A user can't be
  `admin` on one project and `viewer` on another within the same company —
  role is company-wide. Also no concept of multiple admins collaborating
  with different permission levels (e.g. "can manage tokens" vs "can manage
  billing") — just admin/viewer.
- **The super admin is bootstrap-only.** There's no UI to create additional
  super admins or to demote/promote between super_admin and company roles —
  only via direct database access (as done for the initial seed).
- **No cross-company reporting for the super admin — by design, not an
  oversight.** `/companies` shows counts (users, projects) but no rollup of
  findings/severity across tenants, because the super admin role is scoped
  to platform management (companies, suspension, password resets), not
  tenant security data. If an operational "which companies have unresolved
  criticals" view is ever wanted, that's a deliberate scope expansion to
  discuss, not a bug to fix.

## Ingestion & data integrity

- **Rate limiting is in-memory, per-process.** Fine for one long-running
  instance; silently stops working (no shared counter) behind multiple
  instances/replicas — and on a serverless platform (Vercel), it's
  effectively meaningless, since concurrent invocations can each be a
  different, isolated function instance with no shared memory at all.
  Needs a shared store (e.g. Upstash Redis) before it does anything useful
  in either of those setups.
- **Trivy idempotency without repo/commit metadata falls back to a content
  hash.** If a client posts raw Trivy JSON (no wrapper) and genuinely
  re-scans the exact same image with the exact same result, that re-scan is
  silently deduped instead of recorded. Only matters for clients that skip
  the `{meta, results}` wrapper.
- ~~The payload size limit only checks declared Content-Length, not a
  streamed byte count.~~ **Fixed.** `readJsonWithLimit` now counts bytes as
  the body streams in and aborts as soon as the cap is exceeded, so a client
  that lies about (or omits) Content-Length is stopped too, not just one
  that reports it honestly. Verified live: an 11MB body sent with chunked
  transfer-encoding (no usable Content-Length) still gets rejected `413`.
  The cheap Content-Length pre-check stays as a first-pass short-circuit.

## Dashboard

- **Mean-time-to-fix is approximated, not exact.** It's derived by matching
  `(title, resource)` between consecutive Trivy scans and measuring the gap
  until a finding stops appearing — there's no explicit "resolved" state on
  `Finding`. A renamed package or a finding that briefly disappears then
  reappears will skew this.
- **Falco "live" feed is polling, not push.** The live toggle refreshes the
  page every 10 seconds; there's no WebSocket/SSE stream, so multi-second
  latency exists and it stops working if you close the tab (obviously) or
  the polling interval is too coarse for high-alert-volume clusters.
- ~~Cursor pagination has no "previous page" of its own~~ **Fixed.** The
  Vulnerabilities/Runtime Alerts/Pipeline Runs tables now share a
  `Pagination` component (`src/components/Pagination.tsx`) with real
  Previous/First buttons — the visited cursors are tracked as a stack in the
  URL (`prevCursors`) instead of relying on the browser's own back button,
  so a bookmarked or shared link to page 3 lands exactly on page 3 (verified
  live: reloaded a page-3 URL directly, got page 3 back, not page 1). Also
  shows a real "Showing 26–50 of 68" range and "Page 2 of 3" — a `count()`
  query now runs alongside each list query for the total. What's still
  missing: jumping directly to an arbitrary *middle* page (e.g. typing "17")
  isn't supported — cursor pagination has no cheap way to do that without
  walking every page in between, so only First/Prev/Next exist.
- **Health score formula is a first pass** (flat weighted deduction per
  severity: critical -10, high -4, medium -1, low -0.25) — not validated
  against any real risk model or client expectation.
- **No saved views / no export** (CSV, PDF) of any table.
- **No dark theme** — the dashboard is a single Primer-inspired light theme;
  no toggle or `prefers-color-scheme` support.
- **Recharts is on the 2.x branch** (actively maintained but no longer the
  lead branch — 3.x exists) — noted by npm at install time, not urgent.

## Onboarding

- **Onboarding gate is per-user, mostly resolved for the common case.**
  `onboardedAt` is still a `User` field, not a `Company` field — but every
  teammate added via Settings → Team (admin or viewer) is now created with
  `onboardedAt` already set, so they land straight on the dashboard instead
  of redoing a wizard for a workspace that already has projects/tokens. The
  gap that remains is narrow: a user created any other way (direct DB
  access, a future signup path) wouldn't get that flag for free.
- **"Skip for now" has no way back.** Once skipped, there's no in-app
  "resume setup" — the admin just uses Settings to create a project/token
  manually. Acceptable since Settings covers the same ground, just without
  the guided copy-paste steps.
- **The base URL shown in the wizard is best-effort.** It prefers
  `NEXTAUTH_URL`, else derives from the request's `Host` header — correct
  behind a simple reverse proxy, but hasn't been tested behind more exotic
  setups (multiple domains, path-based routing).

## Auth & access control

- **Roles are company-wide, not per-project.** An `admin` is admin for
  every project inside their company; there's no "admin of project A,
  viewer of project B" model within one tenant.
- **A viewer has no Settings page at all** (redirected to `/overview`,
  sidebar link hidden) — no read-only view of their company's ingest tokens,
  notification config, team roster, or projects, even though a viewer can
  otherwise see all of that company's dashboard data. Their own password
  change lives in the header account menu instead, reachable from anywhere,
  not gated behind Settings. Simpler to reason about (no risk of a read-only
  view drifting out of sync with what admins can actually do), but means a
  viewer who wants to know "who else has access" or "is Slack configured"
  has to ask an admin rather than check themselves.
- **No self-service signup or email-based invite flow.** A company admin
  can now add teammates directly (Settings → Team: email + role, temp
  password shown once — no invite email, they're just handed the
  credentials out of band) and remove them (blocked from removing
  themselves or the company's last admin). But there's still no
  self-service "request access" or emailed-invite-link path — every account
  is created by an admin (their own teammates) or the super admin (a
  company's first admin) typing someone's email in and handing over a
  password directly.
- ~~No audit trail for who changed Settings~~ **Fixed.** A new
  `AdminAuditLog` table records every admin-driven change (token
  create/revoke, team add/remove/password-reset, project create,
  notification config update) with who did it and when, shown as an
  "Activity" table at the bottom of Settings (last 20 entries, admin-only).
  Self-service password changes aren't logged here — only actions an admin
  takes on the company's shared config, not a user's own account. Verified
  live: created an ingest token, confirmed `token.create` appeared in
  Activity with the actor's email.
- ~~Session cookie lifetime uses NextAuth defaults~~ **Fixed.** Set
  explicitly to 30 days (`src/lib/auth.ts`) — a deliberate default for
  "small team, periodic dashboard checks," not NextAuth's own default.
  Revisit if a tighter posture (shorter sessions, forced re-auth) is wanted.

## Testing

- **Unit tests cover ingestion parsing/idempotency, severity normalization,
  rate limiting, and the streamed payload-size enforcement** — the
  highest-risk logic. There is still no test coverage for: dashboard queries
  (`src/lib/queries.ts`), server actions (token create/revoke, notification
  config, password change/reset), RBAC enforcement, or the
  notification-sending code path. These all require a real (or mocked)
  Prisma/`getServerSession` context to test meaningfully — bigger lift than
  the pure-function tests that exist today, left as-is rather than adding
  shallow tests that don't actually exercise the auth/scoping logic.
- **No end-to-end tests committed.** Playwright is a devDependency (used
  repeatedly during this build — and again in a dedicated security/load pass,
  see DECISIONS.md — to drive real browser flows and API probes for manual
  verification) but every run was a throwaway script, not a committed
  suite. See DECISIONS.md for whether to turn this into one.
- **Load testing is a local concurrency smoke test, not a real load test.**
  60 concurrent Falco alerts into the same time bucket (all correctly
  upserted to one `Scan` row, no race-created duplicates) and 150 concurrent
  mixed Trivy/Falco requests (all `201`, ~107 req/s, zero errors) were run
  against the local dev server — see DECISIONS.md for the full pass. This
  confirms there's no obvious concurrency bug in the ingest path, but it is
  not a sustained/high-volume test, doesn't exercise a production-shaped
  deployment (connection pooling, multiple replicas, real network latency),
  and wasn't run against Vercel's serverless path at all.

## Operational readiness

- **No hosting target chosen yet.** A `Dockerfile` + `docker-compose.yml`
  build and run the whole app for a self-hosted/container target (verified
  live). The Prisma client is also now built with the binary target Vercel's
  serverless functions need, and a `vercel-build` script exists, so a
  serverless deploy is code-ready too — but no target has actually been
  picked, no CI pipeline exists for ShieldSQ's own tests, and there's no
  TLS/reverse-proxy story for the self-hosted path.
- **The app image is large (~1.9GB), not size-optimized.** It ships the full
  production `node_modules` rather than using Next's `output: "standalone"`
  trace-and-prune mode, to sidestep the well-known gotcha where standalone
  tracing can miss Prisma's native query-engine binary. Correct and
  reproducible, just not lean — worth revisiting (selectively copying
  `node_modules/.prisma` and `@prisma/client` into a standalone build)
  before shipping this to a registry/CI pipeline where image size and pull
  time matter. Doesn't apply to a Vercel deploy (Vercel builds it directly,
  no image involved).
- **`docker-entrypoint.sh` runs `prisma migrate deploy` on every container
  start**, including every replica in a future multi-replica deployment —
  fine for a single instance, but concurrent migration attempts from
  multiple replicas starting simultaneously aren't guarded against (Prisma
  handles this reasonably well via its own migration lock table, but it's
  untested here beyond single-instance). On Vercel, the equivalent risk is
  concurrent preview-deployment builds each running `migrate deploy`
  against the same production database — same caveat.
- **No data retention/archival policy** — findings and scans accumulate
  forever; nothing prunes old data.
- **No backup/restore story** for the Postgres data — doubly relevant on a
  hosted free-tier Postgres (Neon/Vercel Postgres), which may have its own
  retention limits on the free plan.
- ~~Notification delivery has no retry.~~ **Partially fixed.** Each Slack
  post / SMTP send now retries once after a 1s delay before being recorded
  as `failed` — covers the common transient blip (a momentary network hiccup
  or the destination's own rate limit). What's still missing: a real retry
  queue for a failure that persists past that second attempt (e.g. Slack
  webhook down for an hour) — that needs a durable queue (BullMQ/SQS/etc.),
  which is a real infrastructure addition, not a one-line fix.
- **Serverless cold starts + a single-connection-limited free Postgres
  plan can exhaust connections under concurrent ingestion traffic** if
  deployed to Vercel without a pooled connection string (e.g. Neon's
  `-pooler` host, or Prisma Accelerate) — each concurrent function
  invocation opens its own Postgres connection. Not an issue on the Docker
  path (one long-running process, one connection pool).
