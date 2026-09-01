"use client";

import { Suspense, useState, useEffect, type FormEvent } from "react";
import { signIn, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const suspended = searchParams.get("suspended") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // The redirect here means the DB says this session's company is
    // suspended — clear the (still technically valid) session cookie so
    // the user is actually signed out, not just repeatedly bounced back.
    if (suspended) signOut({ redirect: false });
  }, [suspended]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    setSubmitting(false);
    if (result?.error) {
      setError("Incorrect email or password.");
      return;
    }
    // Hard navigation, not router.push — the destination depends on
    // middleware's role check (super_admin -> /companies, un-onboarded
    // admin -> /onboarding), which needs a fresh request to evaluate.
    window.location.assign("/overview");
  }

  return (
    <div className="login-shell">
      <div className="login-card-wrap">
        <div className="login-brand">
          <Logo size={40} className="login-logo-ring" />
          <span className="login-brand-name">ShieldSQ</span>
          <span className="login-brand-sub">A product by SecureQuanta</span>
        </div>

        <div className="card">
          <h1 style={{ fontSize: 16, fontWeight: 600, marginTop: 0, marginBottom: 4, textAlign: "center" }}>
            Sign in to your account
          </h1>

          {suspended && (
            <p
              style={{
                fontSize: 13,
                color: "var(--danger-fg)",
                background: "var(--danger-subtle)",
                border: "1px solid var(--sev-critical-border)",
                borderRadius: 6,
                padding: "8px 10px",
                marginBottom: 16,
              }}
            >
              Your company's access has been suspended. Contact your administrator.
            </p>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="email" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ display: "block", width: "100%" }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="password" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ display: "block", width: "100%" }}
              />
            </div>
            {error && (
              <p style={{ color: "var(--danger-fg)", fontSize: 13, marginTop: 0, marginBottom: 12 }}>{error}</p>
            )}
            <button type="submit" disabled={submitting} style={{ width: "100%" }}>
              {submitting && <span className="spinner" aria-hidden="true" />}
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
