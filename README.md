# ShieldSQ

**A product by SecureQuanta** — a unified, multi-tenant security dashboard
that ingests vulnerability scan results from **Trivy** (CI/CD pipelines) and
runtime threat alerts from **Falco** (Kubernetes, via Falcosidekick), stores
them centrally, and renders them as one dashboard per company. No manual
uploads — data flows in automatically via webhook/API from your own
pipelines and clusters.

## Contents

- [What it does](#what-it-does)
- [Tech stack](#tech-stack)
- [Architecture at a glance](#architecture-at-a-glance)
- [Getting started (local dev)](#getting-started-local-dev)
- [Environment variables](#environment-variables)
- [Sending it test data](#sending-it-test-data)
- [Running with Docker](#running-with-docker)
- [Deploying to Vercel](#deploying-to-vercel)
- [Wiring up real CI/CD and Kubernetes](#wiring-up-real-cicd-and-kubernetes)
- [Project structure](#project-structure)
- [Roles & multi-tenancy](#roles--multi-tenancy)
- [Testing](#testing)
- [Further reading](#further-reading)

## What it does

- **Ingests** Trivy scan output and Falco runtime alerts via two bearer-token-authenticated
  HTTP endpoints, normalizes them to a shared severity scale, and stores
  them per project.
- **Dashboards**: an overview with a health score and severity trends, a
  filterable Trivy vulnerabilities table with a CVE detail drawer, a Falco
  runtime alert feed, a pipeline runs list, and a trends page (30/90-day,
  mean-time-to-fix).
- **Multi-tenant**: every company is an isolated tenant with its own
  projects, ingest tokens, findings, and users — enforced server-side, not
  just hidden in the UI. A platform-level super admin creates and
  suspends companies but never sees tenant data.
- **Alerting**: Slack and/or email notifications on new findings at or
  above a per-project severity threshold, batched into one message per
  ingestion call.
- **Self-serve setup**: a first-login onboarding wizard walks a new
  company admin through creating a project, generating an ingest token,
  and copy-pasting the exact endpoint/curl commands needed to wire up
  Trivy and Falco.
- **Team management**: a company admin can add teammates (admin or viewer,
  temporary password shown once), reset their passwords, or remove them —
  no email/invite system, just direct account creation within your company.

For the full feature list, known limitations, and open product decisions,
see [FEATURES.md](FEATURES.md), [GAPS.md](GAPS.md), and
[DECISIONS.md](DECISIONS.md) — these are living documents, kept up to date
as the app changes, and are the most detailed reference for "does it do X."

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Turbopack by default) |
| Database | PostgreSQL + Prisma ORM |
| Auth | NextAuth.js (Credentials provider, JWT sessions) |
| Charts | Recharts |
| Email | Nodemailer (SMTP) |
| Local infra | Docker Compose |
| Tests | Vitest (unit), Playwright (available, ad hoc so far) |

## Architecture at a glance

```
Trivy (CI)  ──POST──▶  /api/ingest/trivy  ──┐
                                             ├──▶  Postgres (Prisma)  ──▶  Dashboard (Next.js)
Falco (K8s) ──POST──▶  /api/ingest/falco  ──┘                              │
                                                                            ├─▶ Slack webhook
                                                                            └─▶ SMTP email
```

Data model, top to bottom: **Company** (tenant) → **Project** (a repo or
cluster) → **Scan** (one CI run, or one hourly Falco alert bucket) →
**Finding** (one vulnerability or runtime alert). Every ingest token, scan,
and finding belongs to exactly one project, which belongs to exactly one
company — that chain is what the multi-tenant isolation is built on.

## Getting started (local dev)

### Prerequisites

- Node.js 20+
- Docker Desktop (for local Postgres)

### 1. Install dependencies

```bash
npm install
```

(`postinstall` runs `prisma generate` automatically.)

### 2. Configure environment

```bash
cp .env.example .env
```

Generate a real `NEXTAUTH_SECRET`:

```bash
openssl rand -base64 32
```

Paste the result into `.env`. See [Environment variables](#environment-variables)
below for what everything else does.

### 3. Start Postgres

```bash
npm run db:up
```

### 4. Run migrations

```bash
npx prisma migrate dev
```

### 5. Seed the database

```bash
npm run prisma:seed
```

This creates a **super admin** account and prints its credentials to the
console — save them, you'll need them to log in. It does *not* create a
demo company/project — you create those yourself through the app, starting
from the super admin.

Want a realistic-looking dashboard to look at instead of an empty one?
Run `npm run prisma:seed-demo` as well — it creates a separate "Demo
Company" with a sample project, an admin login, and ~90 days of varied
Trivy/Falco data. Safe to re-run anytime to reset that demo data.

### 6. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), log in as the super
admin, and create your first company from `/companies`. That company's
admin then logs in and lands on the onboarding wizard, which creates a
project and an ingest token and shows you exactly what to POST and where.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `NEXTAUTH_URL` | yes | Public base URL of the app (used for auth callbacks and the onboarding wizard's shown endpoint URLs) |
| `NEXTAUTH_SECRET` | yes | Session signing secret — generate with `openssl rand -base64 32` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | no | Outbound email relay for notifications. Leave `SMTP_HOST` empty to disable email sending entirely — Slack still works independently. |
| `FALCO_SCAN_BUCKET_MINUTES` | no (default `60`) | Falco alerts have no inherent "run" boundary, so they're grouped into one rolling `Scan` per project per this many minutes |

Note: there is deliberately **no** global `SLACK_WEBHOOK_URL`. Slack
destinations are per-project, configured in the app itself (Settings, or
during onboarding) — a single env var can't represent "every company has
its own Slack workspace."

## Sending it test data

Two ways to try ingestion without a real CI pipeline or cluster:

**Fixtures + script** (uses a token you already have):

```bash
INGEST_TOKEN=<your ingest token> ./scripts/send-sample-data.sh
```

Posts `fixtures/trivy-sample.json` and `fixtures/falco-sample.json` at the
local ingest endpoints.

**Direct curl**, e.g. for Trivy:

```bash
curl -X POST http://localhost:3000/api/ingest/trivy \
  -H "Authorization: Bearer <your ingest token>" \
  -H "Content-Type: application/json" \
  --data @fixtures/trivy-sample.json
```

Note: raw Trivy CLI output has no concept of git/CI, so `repo`/`branch`/
`commitSha`/`pipelineId` only show up in the dashboard if you wrap it:

```json
{
  "meta": { "repo": "org/repo", "branch": "main", "commitSha": "abc123", "pipelineId": "42" },
  "results": { "...raw trivy JSON..." }
}
```

Both endpoints are idempotent — re-posting the same payload returns the
original `Scan` instead of creating a duplicate.

## Running with Docker

A `Dockerfile` + `docker-compose.yml` build and run the whole app —
Postgres and the app itself, migrations included:

```bash
npm run docker:up        # docker compose up -d --build
npm run docker:seed      # one-time: creates the super admin
```

`docker-entrypoint.sh` runs `prisma migrate deploy` automatically before the
server starts, so a fresh checkout goes from zero to a running app with no
manual migration step. See [GAPS.md](GAPS.md) for the current image-size
tradeoff (it ships full `node_modules` rather than a trace-and-pruned
standalone build, to sidestep a Prisma-on-Alpine gotcha).

## Deploying to Vercel

The app is Vercel-ready: `prisma/schema.prisma` declares the
`rhel-openssl-3.0.x` binary target Vercel's serverless functions need, and
`package.json`'s `vercel-build` script (`prisma generate && prisma migrate
deploy && next build`) runs automatically in place of `next build` — no
dashboard build-command config needed.

1. **Get a free Postgres** — [Neon](https://neon.tech) has a serverless-friendly
   free tier. Use its **pooled** connection string, not the direct one
   (each concurrent serverless invocation opens its own connection —
   pooling matters here more than on a long-running server).
2. **Import the repo** at [vercel.com/new](https://vercel.com/new).
3. **Set environment variables** in the Vercel project (same table as
   above) before the first deploy — `NEXTAUTH_URL` should be your Vercel
   deployment URL.
4. **Deploy.** Migrations apply automatically via `vercel-build`.
5. **Seed the super admin once**, locally, pointed at production:
   ```bash
   DATABASE_URL="<your Neon pooled URL>" npx tsx prisma/seed.ts
   ```

See [DECISIONS.md](DECISIONS.md) for the tradeoffs of this path (notably:
the in-memory rate limiter doesn't work across serverless invocations).

## Wiring up real CI/CD and Kubernetes

- **Trivy**: [`.github/workflows/trivy-scan.yml`](.github/workflows/trivy-scan.yml)
  is a ready-to-adapt GitHub Actions job — build, scan, wrap the result
  with repo/branch/commit/pipeline metadata, POST to `/api/ingest/trivy`.
  If your CI platform isn't GitHub Actions, the same three steps (scan →
  wrap → POST) apply anywhere.
- **Falco**: [`deploy/falcosidekick-values.example.yaml`](deploy/falcosidekick-values.example.yaml)
  is a reference Helm values file wiring Falcosidekick's generic webhook
  output to `/api/ingest/falco` with a bearer token header.

Both are also linked directly from the in-app onboarding wizard, alongside
your project's actual token and endpoint URLs.

## Project structure

```
src/
  app/
    (dashboard)/        # Overview, Vulnerabilities, Runtime Alerts, Pipeline
                         # Runs, Trends, Settings, Companies — all behind auth
    api/
      auth/[...nextauth]/  # NextAuth route
      ingest/trivy/        # Trivy ingestion endpoint
      ingest/falco/        # Falco ingestion endpoint
    login/               # Sign-in page
    onboarding/          # First-login setup wizard
  components/            # Shared UI (badges, filters, charts, logo, ...)
  lib/                   # Domain logic: parsing, idempotency, auth, queries,
                          # notifications, rate limiting — the highest-value
                          # code to read first, and where most unit tests live
  types/                 # NextAuth type augmentation
prisma/
  schema.prisma          # Data model
  migrations/            # Applied migrations
  seed.ts                # Bootstraps the super admin account
fixtures/                # Sample Trivy/Falco payloads for local testing
scripts/                 # send-sample-data.sh and other dev helpers
deploy/                  # Reference Falcosidekick Helm values
.github/workflows/       # Reference GitHub Actions workflow
Dockerfile, docker-compose.yml, docker-entrypoint.sh  # Container deployment
```

## Roles & multi-tenancy

| Role | Scope | Can do |
|---|---|---|
| `super_admin` | Platform-wide, belongs to no company | Create/suspend companies, reset a company admin's password. Never sees tenant data. |
| `admin` | One company | Manage projects, ingest tokens, notification config, and teammates (add/remove/reset password) within their own company |
| `viewer` | One company | Read-only access to their own company's dashboards (Overview, Vulnerabilities, Runtime Alerts, Pipeline Runs, Trends). In Settings, only their own password change — no visibility into tokens, projects, notifications, or team. |

Company isolation is enforced at the query layer (every project lookup is
scoped by `companyId`, not just filtered in the UI), and a suspended
company's users are signed out within one request of suspension taking
effect — not just blocked from their next login attempt.

## Testing

```bash
npm test          # vitest run — unit tests
npm run test:watch
```

Unit tests cover the highest-risk logic: Trivy/Falco payload parsing,
severity normalization, idempotency-key derivation, and rate limiting.
Playwright is available as a devDependency and has been used repeatedly to
verify flows (onboarding, multi-tenant isolation, password reset,
suspension enforcement) during development, but no committed end-to-end
suite exists yet — see [DECISIONS.md](DECISIONS.md).

## Further reading

- [FEATURES.md](FEATURES.md) — the full feature list, in detail
- [GAPS.md](GAPS.md) — what's incomplete, simplified, or would need work
  before real production load
- [DECISIONS.md](DECISIONS.md) — open product/architecture questions that
  need a real answer, not a default
