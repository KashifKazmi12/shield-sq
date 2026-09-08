# SQSecure — Decisions Needing Your Input

Everything below was built with a reasonable default so work wouldn't block,
per the original brief ("make a reasonable default, note the assumption,
keep going"). Each one is a real fork in the road — your answer could change
code, not just config. Grouped by urgency.

## Before this goes anywhere near production

1. **CI platform.** Phase 3's reference workflow
   ([.github/workflows/trivy-scan.yml](.github/workflows/trivy-scan.yml))
   assumes GitHub Actions. If the client actually runs GitLab CI, Jenkins,
   Azure DevOps, CircleCI, etc., that file needs a rewrite (same idea: build
   → Trivy scan → wrap with meta → POST to `/api/ingest/trivy`) — the
   ingestion endpoint itself doesn't care.

2. **Kubernetes / Falco deployment shape.** The Falcosidekick values example
   ([deploy/falcosidekick-values.example.yaml](deploy/falcosidekick-values.example.yaml))
   assumes a single cluster with the standard `falcosecurity/falco` Helm
   chart and Falcosidekick's generic webhook output. Confirm: single cluster
   or multiple? Managed Falco (e.g. a cloud provider's runtime security
   product) instead of self-hosted? Also worth confirming upfront: **Falco
   is Linux-kernel-only** (eBPF/kernel module) — it runs on EC2 (Linux),
   self-managed Kubernetes, and ECS's EC2 launch type, but has no path onto
   Windows/IIS, AWS Fargate, or Vercel (none of those expose the kernel-level
   access Falco needs). Trivy, by contrast, is close to platform-agnostic —
   it's a plain binary (Linux/macOS/Windows) that scans images/filesystems/
   repos and just needs to `curl` the result somewhere, so it runs
   essentially anywhere CI runs. If the client's runtime targets include any
   of those Falco-incompatible platforms, runtime monitoring there needs a
   different tool (or is simply out of scope) — the ingestion endpoint
   itself doesn't care what produced the alert, but Falco itself won't run
   there. Also confirm: **is the real target Kubernetes at all, or bare
   VMs running Falco directly against Docker/containerd?** The ingestion
   endpoint and dashboard handle both (`Finding.resource` falls back to
   the alert's `hostname` when there's no Kubernetes `output_fields`), but
   [deploy/falcosidekick-values.example.yaml](deploy/falcosidekick-values.example.yaml)
   is Helm/Kubernetes-specific — a VM deployment needs a different
   reference config (Falcosidekick can run standalone, e.g. as a systemd
   service reading Falco's local output and forwarding to the same generic
   webhook — just not documented here yet).

3. **Hosting target for SQSecure itself: container or serverless?** Both
   paths are now code-ready: `Dockerfile` + `docker-compose.yml` for a
   self-hosted/container target (verified live), or Vercel — Prisma's
   client now builds with the `rhel-openssl-3.0.x` binary target Vercel's
   functions need, and a `vercel-build` script runs migrations on deploy.
   Still an open question: which one, and (if a container) where it runs —
   the client's own infra, a managed host, bare VM? This determines
   Postgres, secrets, TLS, and the ingest endpoints' public reachability.
   See the deployment walkthrough for the free-tier Vercel path.

4. **Rate limiting is currently switched off entirely** (`RATE_LIMITING_ENABLED
   = false` in `src/lib/ingest-auth.ts`) at your request, to stop test/CI
   runs from tripping 429s while integrations are being validated. This is
   a real, unguarded exposure the moment either ingest endpoint is reachable
   by anything other than you — re-enable that flag before then. Separately,
   even re-enabled, it still needs a real backing store before it handles
   serious traffic: it's in-memory (see GAPS.md) — meaningless on serverless
   (each invocation can be an isolated instance) and unshared across
   replicas anywhere else. Upstash Redis (free tier exists, pairs naturally
   with a Vercel deploy) is the natural next step.

## Before real alerting goes live

5. **Slack webhook URL(s) and/or SMTP credentials.** Slack destinations are
   per-project — set per company in Settings (or during onboarding), stored
   in `NotificationConfig`, never a global env var (there's no single
   webhook that could serve every tenant's own Slack workspace). SMTP is
   the platform's shared outbound relay and does live in `.env.example` as
   empty placeholders (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM`).
   Notifications are wired and tested against the abstraction (including
   batching — one summary message per ingestion call, not one per finding),
   but nothing fires for real until a project's Slack URL is set in
   Settings and the SMTP env vars are set.

6. **Severity threshold default.** Currently defaults to `critical` only.
   Confirm whether `high`-and-above should also page someone, and whether
   that should differ per project.

## Lower urgency, but worth a real answer eventually

7. **Per-project roles within a company?** A company's admin is admin for
   every project it owns; there's no "admin of Project A, viewer of
   Project B" split within one tenant. Worth it once a company has enough
   internal teams/repos that this matters, but adds real complexity (see
   GAPS.md).

8. **Turn Playwright into a real e2e suite, or drop it?** It's been used
   repeatedly throughout this build to drive real browser flows (onboarding,
   multi-tenant isolation, password reset, suspension enforcement) for
   manual verification, but every run was a throwaway script — no test file
   is committed. Worth keeping and building into a real suite, or should it
   come out until there's time to do it properly?

9. **OAuth provider.** NextAuth is configured for Credentials only, with the
   config left extensible per the brief's non-goals. If/when SSO is wanted,
   which provider (Google Workspace? Azure AD? Okta?) determines the actual
   wiring — and whether it's per-company (each tenant brings its own IdP)
   or platform-wide.

10. **Data retention.** No pruning exists — findings and scans accumulate
    indefinitely (see GAPS.md). Is there a retention window (e.g. 1 year) or
    archival requirement? Might also differ per company/plan tier.

11. **Health score formula.** The Overview page's 0–100 score
    (`computeHealthScore` in [src/lib/queries.ts](src/lib/queries.ts)) uses
    an unvalidated weighting (critical -10, high -4, medium -1, low -0.25
    per open finding). Worth a real conversation about what "healthy" should
    mean here before anyone relies on the number.

12. **Falco bucket size.** Defaults to 60 minutes
    (`FALCO_SCAN_BUCKET_MINUTES`). Fine for the demo; a high-alert-volume
    cluster might want a shorter bucket (more granular "runs") or a longer
    one (fewer, denser scans).

## Resolved this pass (previously open questions)

- **Company admin password recovery** — resolved with code, not just a
  policy answer: any signed-in user can change their own password in
  Settings, and the super admin can reset a company admin's password
  on-demand from `/companies` (shown once, same pattern as ingest tokens).
  No email-based self-service reset yet (see GAPS.md).
- **Suspended-company session cutoff** — resolved to "within one request,"
  not instantly at the JWT layer: every dashboard page load re-checks the
  company's `suspendedAt` against the database and force-signs-out if set,
  so an already-logged-in session can't wander the app indefinitely after
  suspension — verified live (suspend mid-session → next navigation bounces
  to `/login?suspended=1` and clears the cookie).
- **Notification batching** — implemented: one Slack message and one email
  per ingestion call (not per finding), listing up to 10 findings plus a
  "+N more" count.
- **"How does an admin add teammates?"** — there was no answer; now there
  is. Settings → Team lets a company admin add another admin or viewer
  (temp password shown once), reset a teammate's password, or remove them
  — guarded against removing yourself or the company's last admin. Verified
  live: created a viewer and a second admin, confirmed both could log in,
  reset the viewer's password and confirmed the new one worked, removed
  both and confirmed the removed viewer's login then failed.

## Dependency upgrade this pass (Next.js 14 → 16, nodemailer 7 → 9)

`npm audit` reported 9 vulnerabilities (1 critical) all rooted in three
packages — `next` (14.2.15), `nodemailer` (7.0.13), and `postcss` (bundled
with Next) — every fix requiring a major-version bump. At your direction,
ran it through:

- **`next` 14.2.15 → 16.3.4**, **`nodemailer` 7.0.13 → 9.1.0**. `npm audit
  fix --force`'s first pass also silently downgraded `next-auth` from
  `^4.24.8` to `^1.12.1` — a years-old, API-incompatible major version — to
  dodge an unrelated vulnerability in a transitive dependency chain
  (`babel-core`/`json5`/`node-fetch`/`passport`/`uuid`) that only matters to
  next-auth features this app doesn't use (OAuth/passport strategies). That
  would have broken authentication outright; caught before restarting the
  app, and corrected by explicitly pinning `next-auth@4.24.15` (the version
  npm's own report named as satisfying those transitive fixes) with
  `--legacy-peer-deps` to override its peerOptional `nodemailer@^7` range
  (only exercised by next-auth's own Email/magic-link provider, which this
  app doesn't use — it calls `nodemailer` directly for its own SMTP alerts).
  Final state: **0 vulnerabilities**, `next-auth` still on the same major
  (4.x) this app was built against.
- Next 16 fully removes synchronous `params`/`searchParams`/`headers()`
  access (a Next 15 deprecation, non-optional as of 16) — updated every page
  that destructured them synchronously (`settings`, `trends`, `overview`,
  `runs`, `runs/[id]`, `vulnerabilities`, `runtime-alerts`,
  `onboarding`'s `headers()` call) to `Promise<...>` + `await`. **This one
  is worth flagging**: `tsc --noEmit` and even `next build`'s own type pass
  didn't catch it, because these pages type their props inline rather than
  with Next's generated `PageProps` helper, and Next's route-validator type
  only checks `params`, not `searchParams`. Caught by live-testing project
  switching (`?project=`) after the upgrade — it silently fell back to the
  first project instead of erroring, which is the dangerous failure mode
  here (wrong behavior, not a crash). Fixed and re-verified live for every
  affected route, plus the ingest endpoints, role-based redirects, and
  everything built in this session's earlier passes (Settings subtabs,
  header account menu, audit trail, streamed payload limit).
- `middleware.ts` renamed to `proxy.ts` (`export function middleware` →
  `export function proxy`) — Next 16 deprecates the old convention/name;
  same file, same behavior, confirmed via live role-redirect tests
  (super_admin confined to `/companies`, unauthenticated → `/login`).
- Node 20.9+ required by Next 16 — already satisfied (Docker image is
  `node:20-alpine`; local dev is on a much newer Node).
- Next 16's App Router now runs on a React 19.2 canary internally (bundled
  with Next, not a `package.json` dependency bump on our side) — not
  something this app opted into deliberately, just what Next 16 requires.
  No code here uses new React 19 APIs; flagging in case something in this
  area (e.g. `useEffectEvent`, `Activity`) becomes useful later.

## Migration history squashed, full app + security + load test pass

**Migration squash.** 7 migrations (accumulated across this build, including
the mid-session dedupe-key fix and its rolled-back-then-retried step) were
collapsed into a single `20260901121054_init`. Data-preserving, not a reset:
the live dev database already matched `schema.prisma` exactly (no drift), so
this used Prisma's baseline technique — generate one migration's SQL via
`prisma migrate diff --from-empty`, clear the `_prisma_migrations` tracking
table, then `prisma migrate resolve --applied` to mark it applied without
re-running any SQL against the real tables. Verified two ways: row counts
identical before/after (1 company, 4 users, 2 projects, 6→8 scans as testing
added a couple, 14→21 findings likewise) and the new single migration
deploys cleanly against a genuinely empty scratch database
(`secuq_migration_check`, created and dropped for this check only).

**Full functional pass.** Every page (Overview, Vulnerabilities, Runtime
Alerts, Pipeline Runs, Trends, Settings incl. all 4 subtabs, Companies) with
zero browser console/page errors; project switching via `?project=`; a
dynamic run-detail page; both ingest endpoints; role-based routing
(super_admin confined to `/companies`, unauthenticated → `/login`); the
header account menu + password-change modal; the admin audit trail — see
the previous "Dependency upgrade" section for the async-`searchParams` bug
this caught.

**Your sample JSON, both files, ingested for real** (root
`trivy-sample.json` / `falco-sample.json`, not the `fixtures/` copies) —
both had already been posted earlier in this build and correctly deduped
(Trivy via content-hash fallback since there's no `{meta,results}` wrapper;
Falco via rule+output+time hash since there's no `uuid`), which is *correct*
idempotency behavior, not a no-op test. Re-verified the creation path too by
reposting each with a mutated timestamp — 3 fresh Trivy findings (2
critical/high with real `fixedVersion`s, 1 medium), 4 fresh Falco findings
across all four of your priority levels (Critical→critical,
Warning→medium, Notice→low, Informational→info, resource strings built
correctly from `k8s.ns.name`/`k8s.pod.name`/`container.name`).

**Security pass** (your own local app, authorized self-testing):
- **SQL injection**: not applicable in practice — grepped the whole `src/`
  tree, zero uses of `$queryRaw`/`$executeRaw`/`*Unsafe`. Everything goes
  through Prisma's parameterized query builder.
- **XSS**: posted a Falco alert with `<script>...</script>`, an `onerror`
  handler, and a `'; DROP TABLE "Finding"; --` string across the rule,
  output, and hostname fields. Confirmed live in a real browser: the script
  never executed (`window.__xss_fired` stayed `false`, no `alert()`
  fired), the raw `<script>` tag never appears verbatim in the rendered
  DOM, and the text renders inertly as plain text. React's default escaping
  plus zero `dangerouslySetInnerHTML` anywhere in the codebase is why.
- **Auth bypass**: malformed bearer token, missing `Authorization` header,
  wrong scheme (`Basic` instead of `Bearer`), a revoked token, and a
  SQL-injection-shaped string as the token itself — all correctly `401`.
- **Cross-tenant IDOR**: created a second company ("Rival Corp") via the
  real super-admin flow and a project under it, then tried reaching it as
  `admin@taha.com` (a *different* company's admin) via `?project=<rival-id>`
  on every dashboard page and Settings — every page silently fell back to
  the caller's own project, never the rival's; zero ingest tokens existed
  for the rival project afterward. `resolveProject`'s `companyId` scoping
  (`src/lib/current-project.ts`) held under direct, deliberate probing, not
  just code review.
- **Privilege escalation**: a `viewer` session hitting `/companies` and
  `/settings` directly (bypassing the hidden sidebar link) — both
  server-side redirected away (to `/overview`), no admin-only data or
  config exposed in the response.
- Test company/project/findings from this pass were all deleted afterward;
  production data (the real Taha Company data) untouched throughout.

**Load test** (local concurrency smoke test — see the caveats on scope in
GAPS.md): 60 concurrent Falco POSTs landing in the same hourly bucket all
correctly upserted to **one** `Scan` row (`Prisma.upsert` + the DB's own
unique constraint held under the race, no duplicate-scan bug); 150 mixed
concurrent Trivy/Falco POSTs all returned `201` in ~1.4s (~107 req/s) with
zero network or HTTP errors and nothing in the server log. This is a
reasonable proxy for "a burst of CI jobs finishing at once" or "a Falco
alert storm," not a sustained/production-scale test — see GAPS.md.

## Real bug fixed this pass (not a decision — a correctness fix)

- **Falco `Finding.dedupeKey` was globally unique across the whole
  database, not scoped per project.** Caught by re-posting the same
  `falco-sample.json` fixture to two different projects: the second
  project's ingest reported `201`/success with 4 "results," but all four
  were silently `deduped: true` against the **first** project's findings —
  the second project's scan ended up with **zero** findings even though
  the API said everything worked. Root cause: the alert's dedupe identity
  (UUID or a hash of rule+output+time) is content-based, not project-based,
  so two projects that ever receive byte-identical alert content (in
  practice: shared test fixtures; vanishingly unlikely for genuine
  production traffic, since real alerts embed cluster-specific container/
  pod/host identifiers) would collide and the second one's data would
  vanish into the first's. Fixed by making `Finding.projectId` +
  `dedupeKey` the compound unique key instead of `dedupeKey` alone
  (migration + backfill on existing rows). Verified live: re-posted the
  same fixture to project B — now creates B's own findings (`deduped:
  false`) instead of resolving to project A's; re-posting to the *same*
  project still correctly dedupes.
