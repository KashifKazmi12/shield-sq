import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateIngestToken, hashToken } from "../src/lib/token";
import { falcoBucketStart, falcoScanIdempotencyKey, falcoDedupeKey } from "../src/lib/falco";
import { normalizeFalcoPriority } from "../src/lib/severity";

// Optional, opt-in richer demo dataset — NOT run by `prisma db seed` /
// `npm run prisma:seed` (that's the minimal super-admin-only seed.ts).
// Run this directly when you want a realistic-looking company + Trivy/Falco
// history to demo the dashboard against:
//
//   npx tsx prisma/seed-demo.ts
//
// Safely re-runnable: wipes and regenerates Demo Company's scan/finding/
// token data each time rather than accumulating duplicates.

const prisma = new PrismaClient();

function daysAgo(n: number, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
  return d;
}

function randomHex(len: number) {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickMany<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// A pool of realistic-looking CVEs to draw from — varied severity, package,
// and fixed-vs-unfixed status so the filters on the Vulnerabilities page
// actually have something to demonstrate.
const CVE_POOL = [
  { id: "CVE-2024-3094", pkg: "xz-utils", severity: "critical", fixed: "5.6.1", title: "xz-utils: backdoored liblzma via malicious build scripts" },
  { id: "CVE-2023-5678", pkg: "openssl", severity: "critical", fixed: "3.1.4", title: "openssl: DH key generation timing side-channel" },
  { id: "CVE-2023-45853", pkg: "minizip", severity: "critical", fixed: null, title: "zlib/minizip: integer overflow leading to heap buffer overflow" },
  { id: "CVE-2023-44487", pkg: "http2", severity: "high", fixed: "1.59.0", title: "HTTP/2 Rapid Reset denial of service" },
  { id: "CVE-2023-4911", pkg: "glibc", severity: "high", fixed: null, title: "glibc: buffer overflow in dynamic loader ld.so (Looney Tunables)" },
  { id: "CVE-2022-37434", pkg: "zlib", severity: "high", fixed: "1.2.13", title: "zlib: heap buffer over-read in inflate()" },
  { id: "CVE-2023-38545", pkg: "curl", severity: "high", fixed: "8.4.0", title: "curl: SOCKS5 heap buffer overflow" },
  { id: "CVE-2020-8203", pkg: "lodash", severity: "high", fixed: "4.17.19", title: "lodash: prototype pollution in zipObjectDeep" },
  { id: "CVE-2023-1255", pkg: "openssl", severity: "medium", fixed: "3.1.2", title: "openssl: denial of service via crafted AES-XTS key" },
  { id: "CVE-2021-23337", pkg: "lodash", severity: "medium", fixed: "4.17.21", title: "lodash: command injection via template" },
  { id: "CVE-2023-26136", pkg: "tough-cookie", severity: "medium", fixed: "4.1.3", title: "tough-cookie: prototype pollution" },
  { id: "CVE-2024-28849", pkg: "follow-redirects", severity: "medium", fixed: "1.15.6", title: "follow-redirects: proxy-authorization header leak" },
  { id: "CVE-2022-25883", pkg: "semver", severity: "low", fixed: "7.5.2", title: "semver: regular expression denial of service" },
  { id: "CVE-2023-28484", pkg: "cross-spawn", severity: "low", fixed: "7.0.3", title: "cross-spawn: regular expression denial of service" },
  { id: "CVE-2021-3807", pkg: "ansi-regex", severity: "low", fixed: "6.0.1", title: "ansi-regex: regular expression denial of service" },
];

const TRIVY_REPOS = [
  { repo: "org/payments-api", image: "payments-api", branch: "main" },
  { repo: "org/auth-service", image: "auth-service", branch: "main" },
  { repo: "org/web-frontend", image: "web-frontend", branch: "main" },
  { repo: "org/notifications-worker", image: "notifications-worker", branch: "develop" },
];

const FALCO_RULES = [
  { rule: "Terminal shell in container", priority: "Warning", proc: "sh" },
  { rule: "Outbound connection to C2 server", priority: "Critical", proc: "curl" },
  { rule: "Unexpected read of sensitive file", priority: "Error", proc: "cat" },
  { rule: "Contact K8S API Server from container", priority: "Warning", proc: "curl" },
  { rule: "Write below binary dir", priority: "Error", proc: "cp" },
  { rule: "Launch Privileged Container", priority: "Critical", proc: "runc" },
  { rule: "Detect crypto miners using the process name", priority: "Critical", proc: "xmrig" },
];

const FALCO_WORKLOADS = [
  { ns: "default", pod: "payments-api-6d9f8b7c5d-x2k9j", container: "payments-api" },
  { ns: "default", pod: "auth-service-7c5d9f8b6f-p3n7m", container: "auth-service" },
  { ns: "staging", pod: "web-frontend-5f7d8c9b4d-q8j2k", container: "web-frontend" },
  { ns: "kube-system", pod: "notifications-worker-8b6d7f9c5-r4t9w", container: "notifications-worker" },
];

async function seedTrivyData(projectId: string) {
  let pipelineCounter = 1000;

  for (const { repo, image, branch } of TRIVY_REPOS) {
    // ~7 scans per repo, spread roughly every 12 days over the last ~90 days.
    for (let i = 0; i < 7; i++) {
      const day = i * 12 + Math.floor(Math.random() * 4);
      const createdAt = daysAgo(day);
      const commitSha = randomHex(7);
      const pipelineId = String(pipelineCounter++);
      const findingCount = 2 + Math.floor(Math.random() * 4);
      const cves = pickMany(CVE_POOL, findingCount);
      const hasCritical = cves.some((c) => c.severity === "critical");

      const scan = await prisma.scan.create({
        data: {
          projectId,
          source: "trivy",
          repo,
          branch: Math.random() > 0.85 ? `feature/${randomHex(4)}` : branch,
          commitSha,
          pipelineId,
          status: hasCritical ? "warning" : "success",
          idempotencyKey: `trivy:${projectId}:${repo}:${commitSha}:${pipelineId}`,
          createdAt,
          rawPayload: {},
          findings: {
            create: cves.map((cve) => ({
              projectId,
              tool: "trivy",
              severity: cve.severity,
              title: `${cve.id} in ${cve.pkg}`,
              description: cve.title,
              resource: `${image}:latest`,
              fixedVersion: cve.fixed,
              detectedAt: createdAt,
              status: "opened",
              openIntervals: [{ start: createdAt.toISOString(), end: null }],
            })),
          },
        },
        include: { findings: true },
      });

      if (scan.findings.length > 0) {
        await prisma.scanFinding.createMany({
          data: scan.findings.map((f) => ({
            scanId: scan.id,
            findingId: f.id,
            observedAt: createdAt,
          })),
          skipDuplicates: true,
        });
      }
    }
  }
}

async function seedFalcoData(projectId: string) {
  // ~35 alerts spread over the last 10 days, landing in whichever hourly
  // bucket their timestamp falls into — same grouping the real ingestion
  // endpoint uses, so the Runtime Alerts feed looks like genuine traffic
  // rather than one alert per neat hour.
  const alerts = Array.from({ length: 35 }, () => {
    const day = Math.floor(Math.random() * 10);
    const hour = Math.floor(Math.random() * 24);
    const time = daysAgo(day, hour);
    const rule = pick(FALCO_RULES);
    const workload = pick(FALCO_WORKLOADS);
    const output = `${time.toISOString()}: ${rule.priority} ${rule.rule} (proc=${rule.proc} container=${workload.container} pod=${workload.pod} ns=${workload.ns})`;
    return { time, rule, workload, output };
  }).sort((a, b) => a.time.getTime() - b.time.getTime());

  const bucketCache = new Map<string, string>();

  for (const alert of alerts) {
    const bucketStart = falcoBucketStart(alert.time);
    const scanIdempotencyKey = falcoScanIdempotencyKey(projectId, bucketStart);

    let scanId = bucketCache.get(scanIdempotencyKey);
    if (!scanId) {
      const scan = await prisma.scan.upsert({
        where: { idempotencyKey: scanIdempotencyKey },
        update: {},
        create: {
          projectId,
          source: "falco",
          status: "warning",
          idempotencyKey: scanIdempotencyKey,
          createdAt: bucketStart,
          rawPayload: { bucketStart: bucketStart.toISOString() },
        },
      });
      scanId = scan.id;
      bucketCache.set(scanIdempotencyKey, scanId);
    }

    const dedupeKey = falcoDedupeKey({ rule: alert.rule.rule, output: alert.output, time: alert.time.toISOString() });

    const finding = await prisma.finding.upsert({
      where: { projectId_dedupeKey: { projectId, dedupeKey } },
      update: {},
      create: {
        scanId,
        projectId,
        tool: "falco",
        severity: normalizeFalcoPriority(alert.rule.priority),
        title: alert.rule.rule,
        description: alert.output,
        resource: `${alert.workload.ns}/${alert.workload.pod}/${alert.workload.container}`,
        ruleName: alert.rule.rule,
        dedupeKey,
        detectedAt: alert.time,
        status: "opened",
        openIntervals: [{ start: alert.time.toISOString(), end: null }],
      },
    });

    await prisma.scanFinding.createMany({
      data: [{ scanId, findingId: finding.id, observedAt: alert.time }],
      skipDuplicates: true,
    });
  }
}

async function main() {
  const company = await prisma.company.upsert({
    where: { slug: "demo-company" },
    update: {},
    create: { id: "demo-company", name: "Demo Company", slug: "demo-company" },
  });

  const project = await prisma.project.upsert({
    where: { id: "demo-project" },
    update: {},
    create: {
      id: "demo-project",
      companyId: company.id,
      name: "Demo Project",
    },
  });

  await prisma.notificationConfig.upsert({
    where: { projectId: project.id },
    update: {},
    create: {
      projectId: project.id,
      severityThreshold: "critical",
    },
  });

  const adminEmail = "admin@sqsecure.local";
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash("changeme123", 10),
      role: "admin",
      companyId: company.id,
      // The demo project/token already exist, so the setup wizard would be
      // redundant for this account.
      onboardedAt: new Date(),
    },
  });

  // Wipe the demo *data* (scans/findings/notifications/audit log/tokens) so
  // this script is safely re-runnable to reset to a fresh, richer demo
  // dataset — the account, company, and project itself are left alone
  // (upserted above, not recreated). Tokens are wiped too: a fresh ingest
  // token is generated below on every run, so stale ones would otherwise
  // just accumulate in Settings across repeated reseeds.
  await prisma.alertNotification.deleteMany({ where: { finding: { scan: { projectId: project.id } } } });
  await prisma.finding.deleteMany({ where: { scan: { projectId: project.id } } });
  await prisma.scan.deleteMany({ where: { projectId: project.id } });
  await prisma.ingestAuditLog.deleteMany({ where: { projectId: project.id } });
  await prisma.ingestToken.deleteMany({ where: { projectId: project.id } });

  const rawToken = generateIngestToken();
  await prisma.ingestToken.create({
    data: {
      projectId: project.id,
      tokenHash: hashToken(rawToken),
      label: "seed-token",
    },
  });

  await seedTrivyData(project.id);
  await seedFalcoData(project.id);

  const [scanCount, findingCount] = await Promise.all([
    prisma.scan.count({ where: { projectId: project.id } }),
    prisma.finding.count({ where: { scan: { projectId: project.id } } }),
  ]);

  console.log("Demo seed complete.");
  console.log(`Demo company: ${company.name} (${company.id})`);
  console.log(`Demo project id: ${project.id}`);
  console.log(`Company admin login: ${adminEmail} / changeme123`);
  console.log(`Ingest token (save this, it won't be shown again): ${rawToken}`);
  console.log(`Seeded ${scanCount} scans and ${findingCount} findings.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
