# ShieldSQ — Features & Scope

What ShieldSQ does today, end to end. This is the reference for "is X in scope"
questions during review.

## Purpose

Ingests vulnerability scan results from **Trivy** (CI/CD) and runtime threat
alerts from **Falco** (Kubernetes, via Falcosidekick), stores them centrally,
and renders them as one dashboard. No manual uploads — data arrives via
webhook/API from the client's own pipelines and clusters.

## Multi-tenancy

ShieldSQ is multi-tenant: every **Company** is an isolated tenant with its own
projects, tokens, findings, and users. A **super_admin** operates the
platform (creates/suspends companies) but belongs to no company itself and
never sees tenant data; a company's **admin**/**viewer** users only ever see
their own company's data — enforced server-side (`resolveProject`,
`listProjects`, and every Settings mutation re-check `companyId` ownership,
not just role), not just hidden in the UI. Verified live, not just by code
review: created a second company and project, then tried reaching the
second project from the first company's admin session via
`?project=<other-company's-id>` on every dashboard page and in Settings —
every page silently fell back to the caller's own project, never leaked the
other tenant's data (see DECISIONS.md for the full pass).

- **Company** — a tenant. Has a name, a unique slug, and a `suspendedAt`
  flag the super admin can toggle to block every one of its users from
  logging in without deleting their data. Enforcement isn't limited to the
  next login: every dashboard page load re-checks the company's
  `suspendedAt` against the database, so an already-logged-in session gets
  signed out and redirected within one request of a suspension taking
  effect, not just blocked from its next login attempt.
- Sidebar section label reads the company's name (e.g. "ACME CORP") for
  admin/viewer, or "Platform" for the super admin — replaces the old
  generic "Dashboards" label.
- **Bootstrapping a company**: the super admin creates it with a name +
  initial admin email + a temporary password (shown once, like an ingest
  token) — no email/invite system. That admin logs in and lands on the
  existing first-login onboarding wizard to create their first project.
- **Role routing**: middleware confines a super_admin session to
  `/companies` and confines everyone else out of it — a company admin
  hitting `/companies` directly is bounced to `/overview`.

## Data model

- **Company** — the tenant boundary (see above).
- **Project** — a repo/cluster scope, belongs to exactly one Company. A
  company can have multiple projects (added via onboarding, or "New
  project" in Settings); the UI shows a project switcher whenever more than
  one exists for that company.
- **IngestToken** — per-project bearer token, stored as a SHA-256 hash,
  create/revoke only (never re-displayed after creation).
- **Scan** — one CI run (Trivy) or one hourly alert bucket (Falco), holds the
  raw payload and a unique `idempotencyKey`.
- **Finding** — one vulnerability (Trivy) or one runtime alert (Falco),
  normalized to a shared `severity` scale (`critical/high/medium/low/info`).
- **NotificationConfig** — per-project Slack webhook / email / severity
  threshold for critical-finding alerts.
- **User** — `super_admin` (platform, no company), or `admin`/`viewer`
  scoped to exactly one Company via `companyId`. Credentials login.
- **IngestAuditLog** — every rejected ingest request (bad token, malformed
  body), for debugging client pipeline misconfigurations.

## Ingestion

### `POST /api/ingest/trivy`
- Bearer token auth, scoped to a project, hashed comparison.
- Accepts raw `trivy image -f json` output, or a `{ meta, results }` wrapper
  when repo/branch/commit metadata needs to travel alongside Trivy's own
  output. Tolerates real Trivy quirks like `"Vulnerabilities": null` on a
  scanned-but-clean target (e.g. a clean `requirements.txt` next to a
  vulnerable `package-lock.json` in the same report) — only rejects a
  target if its shape is actually wrong, not just empty.
- Rejects anything that isn't recognizable Trivy JSON with `422` and a
  specific error body — never silently drops a malformed payload.
- Idempotent: repeat calls with the same `(repo, commitSha, pipelineId)`
  return the original `Scan` (`200`) instead of creating a duplicate.
- 60 requests/minute per token; over-limit returns `429` with a
  `Retry-After` header (seconds until the window resets). **Currently
  disabled** (`RATE_LIMITING_ENABLED = false` in `src/lib/ingest-auth.ts`)
  while integrations are being tested — flip that back to `true` before
  this is exposed to anything but you.
- Rejects a request whose declared `Content-Length` exceeds 10MB with `413`
  before the body is even read (cheap pre-check), and separately enforces
  the same 10MB cap against the actual streamed byte count as the body
  arrives (`readJsonWithLimit`) — a client that sends no or an understated
  `Content-Length` is stopped too, not just one that reports it honestly.
- Every rejected call (bad token, malformed body, rate limit, oversized
  payload) is logged to `IngestAuditLog`.

### `POST /api/ingest/falco` (Falcosidekick webhook target)
- Same auth/rate-limit/audit-logging as Trivy.
- Accepts either a single alert object (Falcosidekick's default, one POST
  per alert) or a JSON array of alert objects in one request, for
  forwarders/configs that batch them. A single-alert POST keeps the flat
  `{scanId, findingId}` response shape; a batch gets `{results: [...]}`,
  one entry per alert, and the response is `200` only if every alert in
  the batch was already-seen (deduped), `201` if any were newly created.
- Groups alerts into one rolling `Scan` per project per hour
  (`FALCO_SCAN_BUCKET_MINUTES`, default 60) — Falco alerts have no inherent
  pipeline boundary, so this stands in for one. Alerts in a batch are
  processed sequentially (not in parallel) so two alerts landing in the
  same not-yet-existing bucket don't race each other's `Scan` upsert.
- Each alert is deduped independently (via the Falcosidekick alert UUID, or
  a hash of rule+output+time when no UUID is sent) — a webhook retry does
  not create a duplicate `Finding`. Deduping is scoped **per project**
  (`Finding.projectId` + `dedupeKey` together are the unique key, not
  `dedupeKey` alone) — two different projects that happen to receive
  byte-identical alert content (e.g. the same test fixture posted to two
  projects) each get their own `Finding`, never one project's ingest
  silently resolving to another project's data.
- `Finding.resource` (shown as "Host / pod" in Runtime Alerts) prefers
  Kubernetes-shaped `output_fields` (`k8s.ns.name`/`k8s.pod.name`/
  `container.name`) when present, and **falls back to the alert's bare
  `hostname` field** when they're not — covering a non-Kubernetes,
  host-based Falco deployment (a VM running Falco directly against Docker,
  with no `output_fields` at all) as well as a Kubernetes one.

### Notifications
- On ingest, every `Finding` at or above the project's configured severity
  threshold from that call is batched into **one** Slack post and **one**
  email — not one message per finding. The message names the count and
  highest severity (e.g. "3 new CRITICAL+ findings in Payments API") and
  lists up to 10 titles plus a "+N more" line; a single finding gets a
  plain one-line message instead of a "1 new finding" summary.
- Implemented as a direct call behind a single function
  (`enqueueFindingsNotification`) so a real queue can replace it later
  without touching ingestion code.
- Every notification attempt (sent or failed) is recorded in
  `AlertNotification`, one row per finding even though the send is batched.
- Each send (Slack post or SMTP email) retries once after a 1s delay before
  being recorded as `failed` — covers a transient blip, not a sustained
  outage (see GAPS.md for what a real retry queue would add).

## Dashboard pages

1. **Overview** — health score (0–100, weighted deduction by severity),
   findings-by-severity bar chart, 30-day stacked severity trend, recent
   scan/alert activity table filterable by source (Trivy/Falco) and status,
   linking into per-run detail.
2. **Trivy — Vulnerabilities** — server-paginated (cursor-based) findings
   table; filter by severity, repo, fixed-vs-unfixed, and free-text
   image/target search; click a row to open a CVE detail drawer
   (description, target, fix version, repo/branch/commit/pipeline); top-5
   offending images table.
3. **Falco — Runtime Alerts** — server-paginated feed; filter by severity,
   rule, and free-text host/pod/namespace search; optional 10-second
   polling "live" toggle.
4. **Pipeline Runs** — list of Trivy scan runs with status/repo/branch/
   commit/finding-count; filter by status and repo; click through to a
   per-run detail page listing every finding in that run.

   **Pagination** (Vulnerabilities, Runtime Alerts, Pipeline Runs — the
   three server-paginated tables) is a shared `Pagination` component: a
   "Showing 26–50 of 68" range, "Page 2 of 3", and working First/Previous/
   Next buttons. Cursor pagination has no cheap way to jump to an arbitrary
   page, but Previous/First don't rely on the browser's back button either
   — the cursors already visited are tracked as a stack in the URL
   (`prevCursors`), so a bookmarked or shared link to a specific page
   lands back on that exact page, not page 1. Changing a filter, the
   free-text search, or the selected project all reset pagination back to
   page 1, since a cursor from a different result set doesn't mean
   anything once the rows underneath it have changed.
5. **Trends** — filter by tool (Trivy/Falco/all); 30-day and 90-day stacked
   severity trend charts, current severity distribution, mean-time-to-fix
   for Trivy findings (see GAPS.md for how MTTF is approximated).
6. **Settings** (`admin` only — a `viewer` is redirected to `/overview`, and
   the sidebar doesn't even link there for them, since there's nothing left
   to configure or view) — a project switcher plus "New project" (add more
   repos/clusters to your own company beyond the one created during
   onboarding) always visible, with per-project ingest token management,
   Slack/email notification config + severity threshold, team management,
   and the activity log grouped into subtabs below (see "Subtabs" note
   under Dashboard pages).
7. **Companies** (`super_admin` only) — create a company (name + admin
   email + temporary password, credentials shown once), suspend/reactivate
   a company, reset a company's admin password on demand (new temporary
   password shown once), search by name and filter by status, see each
   company's user/project counts.

Settings also has (grouped into horizontal subtabs — Team / Ingest tokens /
Notifications / Activity — beneath the always-visible Projects section):
- **Team** (`admin` only) — add another `admin` or `viewer` to your own
  company: email + role, a temporary password is generated and shown once
  (same one-time-reveal pattern as ingest tokens and company creation).
  Reset a teammate's password on demand, or remove them — you can't remove
  your own account here, or remove the company's last remaining admin.
- **Activity** (`admin` only) — the last 20 admin-driven changes to your
  company (token create/revoke, team add/remove/password-reset, project
  create, notification config update), each with who did it and when
  (`AdminAuditLog`). Self-service password changes aren't included — this is
  specifically actions an admin takes on shared company config.

**Change your own password** (any role) has moved out of Settings entirely —
it's now a modal opened from the account menu in the top header (click your
email/avatar → "Change password"), alongside "Sign out". Reachable from
every page, not just Settings, which is why a `viewer` (who had nothing else
in Settings) no longer needs a Settings page at all.

## First-login setup wizard

- The first time an `admin` user logs in (tracked via `User.onboardedAt`),
  they land on `/onboarding` instead of the dashboard.
- **Step 1 — project details**: name, optional Slack webhook, optional
  notification email, severity threshold. Submitting creates the `Project`,
  its `NotificationConfig`, and a first ingest token in one action, and
  marks the admin as onboarded. "Skip for now" marks onboarding done without
  creating anything (falls back to whatever's already seeded).
- **Step 2 — connect your pipelines**: shows the one-time ingest token,
  the resolved base URL, and copy-ready Trivy/Falco endpoint URLs,
  Authorization header, and curl test commands (matching the fixtures),
  plus pointers to the Phase 3 reference configs
  ([.github/workflows/trivy-scan.yml](.github/workflows/trivy-scan.yml),
  [deploy/falcosidekick-values.example.yaml](deploy/falcosidekick-values.example.yaml)).
  Finishing lands on the Overview page pre-selected to the project just
  created (not whichever project happens to sort first).
- A `viewer` account, or an admin who has already completed onboarding,
  is redirected straight to `/overview` if it navigates to `/onboarding`.

## Auth & access

- NextAuth Credentials provider (email/password, bcrypt-hashed), JWT
  sessions, 30-day session lifetime (`maxAge` in `src/lib/auth.ts`). Config
  leaves room to add an OAuth provider later.
- Three roles: `super_admin` (platform, manages Companies), `admin`
  (manage their company's tokens/notifications/projects/team), `viewer`
  (read-only on the dashboards — Overview, Vulnerabilities, Runtime Alerts,
  Pipeline Runs, Trends — but Settings shows them nothing beyond their own
  password change; no read-only view of tokens/projects/notifications/team).
- Every page except `/login` and `/api/ingest/*` requires a session
  (enforced in middleware); `/api/ingest/*` uses its own bearer-token auth,
  independent of user sessions. Middleware also splits the app by role:
  `super_admin` is confined to `/companies`, everyone else is confined out
  of it.
- Logging in as a user whose company has been suspended fails outright,
  even with the correct password.
- Server actions that mutate Settings state (`createIngestToken`,
  `revokeIngestToken`, `updateNotificationConfig`, `createProject`)
  re-check both the admin role *and* that the target project belongs to
  the caller's own company — not just hidden in the UI, and not just a
  role check. Same pattern for `createCompany`/`suspendCompany`/
  `reactivateCompany`, gated to `super_admin`.

## CI/CD reference configs (Phase 3)

- `.github/workflows/trivy-scan.yml` — example GitHub Actions job: build,
  scan with Trivy, wrap with repo/branch/commit/pipeline metadata, POST to
  `/api/ingest/trivy`.
- `deploy/falcosidekick-values.example.yaml` — example Helm values wiring
  Falcosidekick's generic webhook output to `/api/ingest/falco` with a
  bearer token header.
- Both are reference configs for whatever the client's actual CI platform
  and cluster setup turn out to be — see DECISIONS.md.

## Local dev

- `docker-compose.yml` — Postgres, plus an `app` service that builds and
  runs the whole Next.js app (`Dockerfile`, multi-stage: full install for
  the build, a separate `--omit=dev` install for the runtime image,
  `next build`, then a lean(er) runtime stage). `docker-entrypoint.sh` runs
  `prisma migrate deploy` before the server starts, so `docker compose up
  -d --build` takes a fresh checkout to a fully migrated, running app with
  no manual steps. `npm run docker:up` / `docker:migrate` / `docker:seed`
  wrap the common commands. Verified live end to end (build, migrate,
  login, dashboard, ingest).
- **Vercel-ready**: `prisma/schema.prisma`'s generator declares
  `binaryTargets = ["native", "rhel-openssl-3.0.x"]` (the target Vercel's
  Node.js serverless functions run on — without it, Prisma works locally
  but throws "query engine not found" in production on Vercel), and
  `package.json` has a `vercel-build` script (`prisma generate && prisma
  migrate deploy && next build`) that Vercel runs automatically in place of
  `next build` when it's present — no dashboard build-command config
  needed.
- `prisma/seed.ts` — minimal bootstrap: creates only the platform super
  admin (printed to console). No company, project, or dummy data — you
  create those yourself from `/companies` onward, same as a real deployment.
- `prisma/seed-demo.ts` (`npm run prisma:seed-demo`) — opt-in, separate from
  the default seed: Demo Company, a demo project, an admin user, an ingest
  token (printed once to console), and a varied Trivy + Falco dataset
  (~28 scans across 4 repos over ~90 days with a real-looking CVE mix of
  severities/fixed-status, ~35 runtime alerts across 7 rule types and 4
  workloads over ~10 days, grouped into hourly buckets the same way the
  real ingestion endpoint does). Safely re-runnable: it wipes and
  regenerates the demo scan/finding/token data each time rather than
  accumulating duplicates.
- `fixtures/trivy-sample.json`, `fixtures/falco-sample.json` — real-shaped
  sample payloads.
- `src/app/icon.svg` — favicon (Next.js's file-based icon convention),
  matching the top-header brand mark.
- `scripts/send-sample-data.sh` — posts both fixtures at the local ingest
  endpoints using a project's ingest token (from Settings or the onboarding
  wizard).
- Test suite (`vitest`) covers Trivy/Falco payload parsing, severity
  normalization, and idempotency-key derivation — the highest-risk code
  since a bug there means silently dropped or duplicated findings.

## Explicit non-goals (per the original brief)

- Multi-cluster Falco deployment automation.
- Pipeline-blocking logic — Trivy's own `--exit-code`/`--severity` flags
  handle that; ShieldSQ only reports.
- SSO/OAuth wiring — Credentials-only for now, config left extensible.
