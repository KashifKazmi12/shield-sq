import nodemailer from "nodemailer";
import { prisma } from "./prisma";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!host) throw new Error("SMTP_HOST not configured");

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // implicit TLS on 465; STARTTLS elsewhere
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  return transporter;
}

export type NotifyPayload = {
  findingId: string;
  projectName: string;
  title: string;
  severity: string;
  description: string | null;
};

// The subset of NotifyPayload the actual Slack/email send logic needs —
// generalized so the same primitives serve both project-scoped Finding
// notifications (which also record to AlertNotification) and company-scoped
// LeakFinding/IdentityFinding notifications (which don't: AlertNotification.
// findingId is FK'd to Finding, so a LeakFinding/IdentityFinding id can't be
// recorded there without a schema change this feature doesn't need).
export type AlertItem = { title: string; severity: string; description: string | null };

type NotifyConfig = {
  slackWebhookUrl?: string | null;
  notifyEmail?: string | null;
} | null;

// Batches every finding from a single ingestion call into one Slack post and
// one email, instead of one message per finding — a Trivy report with 50 new
// criticals sends 1 summary, not 50 pages. Direct call today; swap the body
// for a real queue publish (e.g. BullMQ/SQS) later without touching
// ingestion call sites — they only know about this one function.
export async function enqueueFindingsNotification(findings: NotifyPayload[], config: NotifyConfig) {
  if (!config || findings.length === 0) return;
  const groupLabel = findings[0].projectName;

  if (config.slackWebhookUrl) {
    const status = await withRetry(() => postToSlack(config.slackWebhookUrl!, findings, groupLabel));
    await recordNotifications(findings, "slack", status);
  }
  if (config.notifyEmail) {
    const status = await withRetry(() => sendEmail(config.notifyEmail!, findings, groupLabel));
    await recordNotifications(findings, "email", status);
  }
}

// Company-scoped counterpart used by leak-checking / identity DNS findings
// (src/lib/leak-providers.ts, src/lib/identity-dns-checks.ts) — same
// Slack/email delivery and retry behavior, just without the
// project-Finding-specific AlertNotification audit row.
export async function enqueueCompanyAlert(items: AlertItem[], groupLabel: string, config: NotifyConfig) {
  if (!config || items.length === 0) return;
  if (config.slackWebhookUrl) await withRetry(() => postToSlack(config.slackWebhookUrl!, items, groupLabel));
  if (config.notifyEmail) await withRetry(() => sendEmail(config.notifyEmail!, items, groupLabel));
}

function severitySummaryLine(items: AlertItem[], groupLabel: string) {
  if (items.length === 1) {
    return `[${items[0].severity.toUpperCase()}] ${groupLabel}: ${items[0].title}`;
  }
  const topSeverity = items.map((f) => f.severity).sort((a, b) => severityRank(a) - severityRank(b))[0];
  return `${items.length} new ${topSeverity.toUpperCase()}+ findings in ${groupLabel}`;
}

// Local, tiny copy of the severity ordering to avoid a circular import with
// severity.ts (which doesn't depend on notify.ts, but keeps this module
// self-contained for a one-line comparison).
function severityRank(severity: string) {
  const order = ["critical", "high", "medium", "low", "info"];
  const idx = order.indexOf(severity);
  return idx === -1 ? order.length : idx;
}

async function recordNotifications(findings: NotifyPayload[], channel: "slack" | "email", status: "sent" | "failed") {
  await prisma.alertNotification.createMany({
    data: findings.map((f) => ({ findingId: f.findingId, channel, status })),
  });
}

// One retry after a short delay before giving up — covers the common
// transient case (a momentary network blip or the destination's own rate
// limit) without building a real retry queue. A failure that repeats on the
// second attempt is recorded as "failed" and left there; nothing re-attempts
// it later.
async function withRetry(fn: () => Promise<void>): Promise<"sent" | "failed"> {
  try {
    await fn();
    return "sent";
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      await fn();
      return "sent";
    } catch {
      return "failed";
    }
  }
}

async function postToSlack(webhookUrl: string, items: AlertItem[], groupLabel: string) {
  const lines = items.slice(0, 10).map((f) => `• [${f.severity.toUpperCase()}] ${f.title}`);
  if (items.length > 10) lines.push(`… and ${items.length - 10} more`);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: `:rotating_light: ${severitySummaryLine(items, groupLabel)}${items.length > 1 ? `\n${lines.join("\n")}` : ""}`,
    }),
  });
  if (!res.ok) throw new Error(`Slack webhook returned ${res.status}`);
}

async function sendEmail(to: string, items: AlertItem[], groupLabel: string) {
  const lines = items.map((f) => `[${f.severity.toUpperCase()}] ${f.title}${f.description ? ` — ${f.description}` : ""}`);

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM ?? "SQSecure Alerts <alerts@sqsecure.local>",
    to,
    subject: severitySummaryLine(items, groupLabel),
    text: lines.join("\n"),
  });
}
