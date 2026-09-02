"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding, skipOnboarding, type OnboardingResult } from "./actions";
import { SEVERITIES } from "@/lib/constants";
import { CopyButton } from "@/components/CopyButton";
import { Logo } from "@/components/Logo";

type Step = "details" | "configure";

function CodeRow({ value }: { value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
      <pre style={{ flex: "1 1 220px", margin: 0, minWidth: 0, wordBreak: "break-all", whiteSpace: "pre-wrap" }}>{value}</pre>
      <CopyButton value={value} />
    </div>
  );
}

export function OnboardingWizard({ baseUrl }: { baseUrl: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [projectName, setProjectName] = useState("");
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [severityThreshold, setSeverityThreshold] = useState("critical");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await completeOnboarding({ projectName, slackWebhookUrl, notifyEmail, severityThreshold });
        setResult(res);
        setStep("configure");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleSkip() {
    startTransition(async () => {
      await skipOnboarding();
      router.push("/overview");
      router.refresh();
    });
  }

  function handleFinish() {
    // Land on the project just created, not whichever project happens to
    // sort first — otherwise a fresh setup opens onto stale/seed data.
    router.push(result ? `/overview?project=${result.projectId}` : "/overview");
    router.refresh();
  }

  const trivyUrl = `${baseUrl}/api/ingest/trivy`;
  const falcoUrl = `${baseUrl}/api/ingest/falco`;

  return (
    <main style={{ maxWidth: 640, margin: "48px auto", padding: "0 16px 48px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 24 }}>
        <Logo size={34} />
        <span style={{ fontSize: 20, fontWeight: 700 }}>ShieldSQ</span>
      </div>

      <div className="toolbar" style={{ justifyContent: "center", marginBottom: 20 }}>
        <span className={`badge ${step === "details" ? "badge-low" : "badge-info"}`}>1. Project details</span>
        <span className="muted">→</span>
        <span className={`badge ${step === "configure" ? "badge-low" : "badge-info"}`}>2. Connect your pipelines</span>
      </div>

      {step === "details" && (
        <div className="card">
          <h1 style={{ fontSize: 16, fontWeight: 600, marginTop: 0 }}>Welcome to ShieldSQ 👋</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Let&apos;s set up your first project. This takes about a minute — you can change any of this
            later in Settings.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="projectName" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Project name
              </label>
              <input
                id="projectName"
                type="text"
                required
                placeholder="e.g. Payments Service, or your team/repo name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                style={{ display: "block", width: "100%" }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label htmlFor="slack" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Slack webhook URL <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="slack"
                type="text"
                placeholder="https://hooks.slack.com/services/..."
                value={slackWebhookUrl}
                onChange={(e) => setSlackWebhookUrl(e.target.value)}
                style={{ display: "block", width: "100%" }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label htmlFor="email" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Notification email <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="email"
                type="email"
                placeholder="security-team@example.com"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                style={{ display: "block", width: "100%" }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="threshold" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Notify me when a finding is at least
              </label>
              <select id="threshold" value={severityThreshold} onChange={(e) => setSeverityThreshold(e.target.value)}>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {error && <p style={{ color: "var(--danger-fg)", fontSize: 13 }}>{error}</p>}

            <div className="toolbar" style={{ justifyContent: "flex-end", marginBottom: 0 }}>
              <button type="button" className="secondary" onClick={handleSkip} disabled={isPending}>
                Skip for now
              </button>
              <button type="submit" disabled={isPending}>
                {isPending ? "Creating…" : "Continue"}
              </button>
            </div>
          </form>
        </div>
      )}

      {step === "configure" && result && (
        <div>
          <div className="card section">
            <h1 style={{ fontSize: 16, fontWeight: 600, marginTop: 0 }}>
              &ldquo;{result.projectName}&rdquo; is ready
            </h1>
            <p className="muted" style={{ marginTop: 0 }}>
              Use the token and endpoints below to send scan results into ShieldSQ. Nothing needs to be
              uploaded manually once this is wired up — your pipelines push data automatically.
            </p>

            <div className="card" style={{ borderColor: "var(--attention-fg)", background: "var(--attention-subtle)" }}>
              <strong>Ingest token — copy it now, it won&apos;t be shown again:</strong>
              <CodeRow value={result.ingestToken} />
            </div>
          </div>

          <div className="card section">
            <h3>Step 1 — Store the token as a CI/CD secret</h3>
            <p className="muted">
              Add these as secrets in your CI platform (e.g. GitHub Actions repo secrets) and in your
              Kubernetes cluster (e.g. a Helm values override or sealed secret) — never commit the raw
              token to source control.
            </p>
            <p style={{ marginBottom: 4, fontSize: 13, fontWeight: 600 }}>SHIELDSQ_INGEST_URL</p>
            <CodeRow value={baseUrl} />
            <p style={{ marginBottom: 4, marginTop: 12, fontSize: 13, fontWeight: 600 }}>SHIELDSQ_INGEST_TOKEN</p>
            <CodeRow value={result.ingestToken} />
          </div>

          <div className="card section">
            <h3>Step 2 — Trivy (CI/CD pipeline)</h3>
            <p className="muted">
              Point your CI job at the Trivy ingest endpoint after running a scan. A ready-to-use
              GitHub Actions example is at <code>.github/workflows/trivy-scan.yml</code> — swap the
              build/test steps for your own, keep the last step as-is.
            </p>
            <p className="muted" style={{ background: "var(--canvas-subtle)", border: "1px solid var(--border-muted)", borderRadius: 6, padding: "8px 10px" }}>
              <strong>Repo, branch, commit, and pipeline ID won&apos;t show up</strong> unless you wrap
              Trivy&apos;s own JSON output like this — Trivy itself has no concept of git or CI, so that
              context has to come from your pipeline:
              <br />
              <code>{`{ "meta": { "repo", "branch", "commitSha", "pipelineId" }, "results": <raw trivy JSON> }`}</code>
              <br />
              The reference GitHub Actions workflow above already does this for you.
            </p>
            <p style={{ marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Endpoint</p>
            <CodeRow value={`POST ${trivyUrl}`} />
            <p style={{ marginBottom: 4, marginTop: 12, fontSize: 13, fontWeight: 600 }}>Quick local test</p>
            <CodeRow
              value={`curl -X POST ${trivyUrl} \\\n  -H "Authorization: Bearer ${result.ingestToken}" \\\n  -H "Content-Type: application/json" \\\n  --data @fixtures/trivy-sample.json`}
            />
          </div>

          <div className="card section">
            <h3>Step 3 — Falco (Kubernetes runtime alerts)</h3>
            <p className="muted">
              Falco alerts reach ShieldSQ through Falcosidekick&apos;s generic webhook output. A ready-to-use
              Helm values example is at <code>deploy/falcosidekick-values.example.yaml</code> — set its
              webhook address and Authorization header to the values below.
            </p>
            <p style={{ marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Endpoint</p>
            <CodeRow value={`POST ${falcoUrl}`} />
            <p style={{ marginBottom: 4, marginTop: 12, fontSize: 13, fontWeight: 600 }}>Authorization header</p>
            <CodeRow value={`Authorization: Bearer ${result.ingestToken}`} />
            <p style={{ marginBottom: 4, marginTop: 12, fontSize: 13, fontWeight: 600 }}>Quick local test</p>
            <CodeRow
              value={`curl -X POST ${falcoUrl} \\\n  -H "Authorization: Bearer ${result.ingestToken}" \\\n  -H "Content-Type: application/json" \\\n  --data @fixtures/falco-sample.json`}
            />
          </div>

          <div className="card section">
            <h3>Step 4 — Verify</h3>
            <p className="muted" style={{ marginBottom: 12 }}>
              Once your pipeline (or the test command above) has posted at least once, findings will
              show up on the Overview and Trivy/Falco pages. You can always create more tokens per
              project, or revoke this one, from Settings.
            </p>
            <div className="toolbar" style={{ justifyContent: "flex-end", marginBottom: 0 }}>
              <button onClick={handleFinish}>Go to dashboard</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
