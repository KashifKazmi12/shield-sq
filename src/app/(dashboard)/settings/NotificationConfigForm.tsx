"use client";

import { useState, useTransition } from "react";
import { updateNotificationConfig } from "./actions";
import { SEVERITIES } from "@/lib/constants";

type Config = {
  slackWebhookUrl: string | null;
  notifyEmail: string | null;
  severityThreshold: string;
};

export function NotificationConfigForm({ projectId, config }: { projectId: string; config: Config | null }) {
  const [slackWebhookUrl, setSlackWebhookUrl] = useState(config?.slackWebhookUrl ?? "");
  const [notifyEmail, setNotifyEmail] = useState(config?.notifyEmail ?? "");
  const [severityThreshold, setSeverityThreshold] = useState(config?.severityThreshold ?? "critical");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await updateNotificationConfig(projectId, { slackWebhookUrl, notifyEmail, severityThreshold });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div>
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
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <button onClick={handleSave} disabled={isPending}>{saved ? "Saved" : "Save"}</button>
    </div>
  );
}
