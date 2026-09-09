# SQSecure — Features & Scope

What SQSecure does today, end to end. This is the reference for "is X in scope"
questions during review.

## Purpose

Ingests vulnerability scan results from **Trivy** (CI/CD) and runtime threat
alerts from **Falco** (Kubernetes, via Falcosidekick), stores them centrally,
and renders them as one dashboard. No manual uploads — data arrives via
webhook/API from the client's own pipelines and clusters.

## Multi-tenancy

SQSecure is multi-tenant: every **Company** is an isolated tenant with its own
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
- **Bootstrapping a company**: the super admin clicks "New company" (a
  modal, not an inline form) and provides a name + initial admin email + a
  temporary password (shown once, like an ingest token) + which product
  features that company is entitled to — no email/invite system, and no
  feature is pre-selected (the super admin must deliberately choose at
  least one). That admin logs in and lands on the existing first-login
  onboarding wizard to create their first project.
- **Company features** — a company is entitled to any combination of
  `vulnerabilities`, `runtime_alerts`, `leak_checking`, `url_monitoring`
  (`Company.features`, a Postgres enum array). Set at creation and editable
  afterward from `/companies` — the table shows a compact "2 / 4 features"
  button per company that opens a modal (same checkboxes as the create
  form) rather than inline toggles. Gates both the sidebar (a disabled
  feature's section doesn't render) and the routes themselves
  (`requireCompanyFeatureSession`, checked fresh on every dashboard page
  load — same pattern as the `suspendedAt` check, not baked into the JWT):
  hitting a disabled feature's URL directly redirects to whichever feature
  the company *does* have, or to Settings if none. A disabled feature never
  blocks the Trivy/Falco ingest webhooks themselves — only the UI is gated.
- **Company ownership** — one admin per company is the designated "owner"
  (`Company.ownerId`), set automatically to the admin created alongside the
  company. `resetCompanyAdminPassword` always targets this specific person,
  even once a company has multiple admins (Settings → Team allows more than
  one) — the `/companies` table shows a dropdown to reassign the owner
  whenever a company has 2+ admins, otherwise just the one owner's email.
- **Role routing**: middleware confines a super_admin session to
  `/companies` and `/configuration` and confines everyone else out of both —
  a company admin hitting either directly is bounced to `/vulnerabilities`.

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
- **MonitoredIdentity** / **LeakFinding** — a company-scoped monitored
  email/username and its breach findings (Leak Checking; see below).
  Company-scoped rather than Project-scoped, unlike Trivy/Falco data — a
  leaked credential isn't tied to a codebase/repo the way a `Finding` is.
- **MonitoredSite** / **MonitoredEndpoint** / **SiteScanResult** — a
  company-scoped monitored URL, its discovered same-domain endpoints, and
  their health-check history (URL Monitoring; see below). Also
  company-scoped, not project-scoped, for the same reason.
- **LeakProviderConfig** / **LeakProviderUsage** / **LeakProviderLimits** —
  platform-level (not per-company) provider credentials/priority, an
  immutable per-call usage log, and quota policy for Leak Checking's
  external providers (see "Provider Configuration" below).

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

## Leak Checking (company feature: `leak_checking`)

Monitors emails/usernames for appearances in known credential-breach
databases — separate from Trivy/Falco, company-scoped rather than
project-scoped (see "Data model" above).

- **Monitor an identity**: pick email or username, an optional check
  interval (default 1440 minutes/daily). Adding one runs an immediate
  synchronous check — findings appear in the same request, not after
  waiting for a future scheduled sweep (there is no scheduler yet; see
  GAPS.md). A provider outage during that initial check doesn't fail
  creation — the identity is still added, marked `error` with a reason.
- **Provider fallback**: tries providers in the priority order set on
  `/configuration` (see "Provider Configuration" below); if the first
  returns nothing or fails, falls through to the next. Every attempt is
  logged (`LeakProviderUsage`) regardless of outcome.
- **Severity is computed, not fixed** — `high` when the raw entry included
  a password/hash field, `medium` for other PII (phone/address/breach
  name), `low` for email/username only.
- **Dedup on write** — a `dedupeKey` (hash of source + breach name + a
  stable identifying field, or the whole masked entry if nothing more
  specific exists) means re-syncing an identity against a breach it's
  already matched updates nothing instead of creating a duplicate finding.
- **Sensitive fields are masked before storage** — a plaintext password/hash
  from a provider is never stored or displayed in full (`maskSecret`,
  `src/lib/leak-providers.ts`).
- **Manual sync**, one identity at a time — no bulk "sync all," no interval
  configuration, no "next check" time shown anywhere: v1 has no scheduler
  (see GAPS.md), so the UI doesn't imply any automatic re-checking. Re-check
  a given identity by clicking "Sync" on its row whenever you want to.
- Findings drawer per identity: breach name, severity badge, source
  provider, leaked/found timestamps.
- **Dashboard** (top of `/leak-checking`, same time-window picker as
  Vulnerabilities/Runtime Alerts): stat cards (identities monitored, active
  identities, findings, high-severity findings — all scoped to the selected
  window except identity counts, which are a live snapshot), a severity
  breakdown bar chart, a per-day stacked severity trend chart, and a
  filterable (severity/provider) "Recent findings" table. Window/trend
  filtering is on `createdAt` (discovery time), not `leakedAt` (breach date,
  often null/imprecise from providers).

## URL Monitoring (company feature: `url_monitoring`)

Uptime + same-domain endpoint discovery for a monitored site — also
company-scoped, no provider/API key involved (plain outbound HTTP).

- **Monitor a site**: enter a URL; one fetch of the page (not repeated)
  drives both the root health check and same-domain link discovery
  (`cheerio`-based HTML parsing), capped at 50 unique links. Health check
  is HEAD-first, falling back to GET on `405`/`501`/network error.
- **Rescan** — re-checks the site root and every already-known endpoint;
  no new discovery.
- **Discover endpoints** — re-runs link discovery and records scans for any
  newly-found endpoints.
- Site list shows last status code/latency/endpoint count; a drawer per
  site shows full scan history (target, status, latency, timestamp).
- **Dashboard** (top of `/url-monitoring`): stat cards (sites monitored,
  endpoints monitored, sites down *now*, avg latency in the selected
  window), a current-status-breakdown bar chart (2xx/3xx/4xx/5xx/unreachable
  — always a live snapshot of each site's latest root scan, independent of
  the time window, since "is it up right now" isn't a windowed question), a
  per-day average-latency trend chart, and a filterable (up/down) "Recent
  scans" table.

## Provider Configuration (`super_admin` only, `/configuration`)

Platform-level management of Leak Checking's external providers
(CheckLeaked, LeakCheck) — shared infrastructure across every tenant, so
it lives at the same tier as `/companies`, not inside any one company.

- **API keys** — encrypted at rest (AES-256-GCM, `src/lib/secrets.ts`),
  entered/rotated via a "Change key" action that reveals a one-time input;
  every subsequent read shows only a fixed-format masked preview (e.g.
  `2297••••••••B20E`) — there is no "reveal full key" path anywhere in the
  app, by design. "Remove" clears a key entirely (that provider is then
  skipped, not fallback-attempted).
- **Priority** — a plain numeric dropdown (`1`, `2`, ... up to however many
  providers are registered) reassigns a provider's position in the
  fallback try-order; picking a value already held by another provider
  triggers a full resequence (1..N), not a broken tie — built to support
  more than two providers without further UI changes if more are added
  later (`PROVIDER_REGISTRY` in `src/lib/leak-providers.ts`).
- **"Try it"** — a real one-shot connectivity test against a fixed,
  harmless identifier, so a key can be verified immediately after saving
  without needing a real company/identity. Bypasses per-company/per-user
  quota (a platform diagnostic, not a company's usage) but still logs to
  the usage counter and the audit log.
- **Calls made** — a resettable per-provider counter ("Reset count",
  next to "Try it") separate from the immutable `LeakProviderUsage` audit
  log that powers quota enforcement and the Usage table below — resetting
  the visible counter never touches quota history.
- **Limits** — three independent, optional daily caps (global / per-company
  / per-user), checked before any provider call is attempted; a rejected
  check never counts against the limit and never falls through to the next
  provider.
- **Usage** — a today/7-day/30-day table of total/success/failure calls per
  provider, plus a top-companies-by-call-count breakdown.

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
  (enforced in `src/proxy.ts`); `/api/ingest/*` uses its own bearer-token
  auth, independent of user sessions. The proxy also splits the app by
  role: `super_admin` is confined to the platform-management routes
  (`/companies`, `/configuration`), everyone else is confined out of both.
- **RBAC guards are centralized**, not reimplemented per file:
  `src/lib/rbac.ts` exports `requireSuperAdmin`, `requireAdmin`,
  `requireOwnedProject` (tenant-scoping — a project/company id in a
  request must resolve through the caller's own company, not just pass a
  role check), and `requireCompanyFeature` (the feature-entitlement check
  used by every Leak Checking/URL Monitoring/Configuration action).
  `src/lib/session.ts`'s `requireCompanyFeatureSession` wraps the same
  feature check for page-level (not action-level) guards, checked fresh on
  every load rather than cached in the JWT.
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
- `src/app/icon.svg` — favicon (Next.js's file-based icon convention); the
  SecureQuanta company mark, not the SQSecure product logo (which stays the
  blue shield in the top header/login). A persistent floating badge
  (`src/components/SecureQuantaBadge.tsx`) with the same mark appears on
  every screen, fixed bottom-right, linking out to securequanta.com.
- `scripts/send-sample-data.sh` — posts both fixtures at the local ingest
  endpoints using a project's ingest token (from Settings or the onboarding
  wizard).
- `PROVIDER_SECRETS_KEY` env var — encrypts Leak Checking provider API keys
  at rest (`src/lib/secrets.ts`); generated the same way as
  `NEXTAUTH_SECRET` (`openssl rand -base64 32`).
- Test suite (`vitest`) covers Trivy/Falco payload parsing, severity
  normalization, idempotency-key derivation, RBAC's pure helpers, secret
  encryption round-tripping, Leak Checking's severity/masking logic, and
  URL Monitoring's same-domain link extraction — the highest-risk code
  since a bug there means silently dropped/duplicated findings or a leaked
  credential.

## Explicit non-goals (per the original brief)

- Multi-cluster Falco deployment automation.
- Pipeline-blocking logic — Trivy's own `--exit-code`/`--severity` flags
  handle that; SQSecure only reports.
- SSO/OAuth wiring — Credentials-only for now, config left extensible.
