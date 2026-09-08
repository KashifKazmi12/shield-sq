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

  if (config.slackWebhookUrl) {
    await sendSlackNotification(findings, config.slackWebhookUrl);
  }
  if (config.notifyEmail) {
    await sendEmailNotification(findings, config.notifyEmail);
  }
}

function severitySummaryLine(findings: NotifyPayload[]) {
  const projectName = findings[0].projectName;
  if (findings.length === 1) {
    const f = findings[0];
    return `[${f.severity.toUpperCase()}] ${projectName}: ${f.title}`;
  }
  const topSeverity = findings
    .map((f) => f.severity)
    .sort((a, b) => severityRank(a) - severityRank(b))[0];
  return `${findings.length} new ${topSeverity.toUpperCase()}+ findings in ${projectName}`;
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

async function sendSlackNotification(findings: NotifyPayload[], webhookUrl: string) {
  const status = await withRetry(() => postToSlack(webhookUrl, findings));
  await recordNotifications(findings, "slack", status);
}

async function sendEmailNotification(findings: NotifyPayload[], email: string) {
  const status = await withRetry(() => sendEmail(email, findings));
  await recordNotifications(findings, "email", status);
}

async function postToSlack(webhookUrl: string, findings: NotifyPayload[]) {
  const lines = findings.slice(0, 10).map((f) => `• [${f.severity.toUpperCase()}] ${f.title}`);
  if (findings.length > 10) lines.push(`… and ${findings.length - 10} more`);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: `:rotating_light: ${severitySummaryLine(findings)}${findings.length > 1 ? `\n${lines.join("\n")}` : ""}`,
    }),
  });
  if (!res.ok) throw new Error(`Slack webhook returned ${res.status}`);
}

async function sendEmail(to: string, findings: NotifyPayload[]) {
  const lines = findings.map((f) => `[${f.severity.toUpperCase()}] ${f.title}${f.description ? ` — ${f.description}` : ""}`);

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM ?? "SQSecure Alerts <alerts@sqsecure.local>",
    to,
    subject: severitySummaryLine(findings),
    text: lines.join("\n"),
  });
}
