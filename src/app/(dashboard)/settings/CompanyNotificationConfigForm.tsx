"use client";

import { useState, useTransition } from "react";
import { updateCompanyNotificationConfig } from "./actions";

const LEAK_SEVERITIES = ["high", "medium", "low"];

type Config = {
  slackWebhookUrl: string | null;
  notifyEmail: string | null;
  severityThreshold: string;
};

// Company-scoped counterpart to NotificationConfigForm — controls alert
// delivery for Leak Checking findings and identity DNS (SPF/DMARC/DKIM)
// findings, which aren't tied to a single project.
export function CompanyNotificationConfigForm({ config }: { config: Config | null }) {
  const [slackWebhookUrl, setSlackWebhookUrl] = useState(config?.slackWebhookUrl ?? "");
  const [notifyEmail, setNotifyEmail] = useState(config?.notifyEmail ?? "");
  const [severityThreshold, setSeverityThreshold] = useState(config?.severityThreshold ?? "high");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await updateCompanyNotificationConfig({ slackWebhookUrl, notifyEmail, severityThreshold });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Alerts for Leak Checking findings (breached credentials, compromised
        passwords) and identity DNS findings (missing SPF/DMARC/DKIM) — not
        tied to a single project, since a monitored identity isn't either.
      </p>
      <div className="section">
        <label className="muted" style={{ display: "block", marginBottom: 4 }}>Slack webhook URL</label>
        <input
          type="text"
          style={{ width: "100%" }}
          value={slackWebhookUrl}
          onChange={(e) => setSlackWebhookUrl(e.target.value)}
          placeholder="https://hooks.slack.com/services/..."
        />
      </div>
      <div className="section">
        <label className="muted" style={{ display: "block", marginBottom: 4 }}>Notification email</label>
        <input
          type="email"
          style={{ width: "100%" }}
          value={notifyEmail}
          onChange={(e) => setNotifyEmail(e.target.value)}
          placeholder="security-team@example.com"
        />
      </div>
      <div className="section">
        <label className="muted" style={{ display: "block", marginBottom: 4 }}>Minimum severity to notify</label>
        <select value={severityThreshold} onChange={(e) => setSeverityThreshold(e.target.value)}>
          {LEAK_SEVERITIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <button onClick={handleSave} disabled={isPending}>
        {isPending ? (
          <>
            <span className="btn-spinner" aria-hidden="true" />
            Saving…
          </>
        ) : saved ? (
          "Saved"
        ) : (
          "Save"
        )}
      </button>
    </div>
  );
}
