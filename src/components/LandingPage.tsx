"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  Bug,
  Check,
  Globe,
  KeyRound,
  Link2,
  Radar,
  Shield,
} from "lucide-react";
import { Logo } from "@/components/Logo";

const CONTACT = "inquiry@securequanta.com";

function mail(subject: string, body?: string) {
  const parts = [`subject=${encodeURIComponent(subject)}`];
  if (body) parts.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${CONTACT}?${parts.join("&")}`;
}

const FEATURE_SPOTLIGHTS = [
  {
    id: "vulnerabilities",
    eyebrow: "Vulnerability Management",
    title: "Find weaknesses before attackers do.",
    body: "Scan your infrastructure and applications for known and unknown vulnerabilities — then see what needs fixing first.",
    close: "Know what’s at risk. Know what needs fixing.",
    points: ["Continuous scanning from CI", "Risk prioritization by severity", "Actionable remediation guidance"],
    icon: Bug,
    visual: "vuln" as const,
  },
  {
    id: "runtime-alerts",
    eyebrow: "Runtime Alerts",
    title: "Spot danger while it’s happening.",
    body: "Get real-time alerts for suspicious activity, policy violations, and threats across your Kubernetes clusters.",
    close: "Less noise. More visibility. Faster response.",
    points: ["Real-time threat detection", "Context-rich Falco alerts", "Faster incident response"],
    icon: Activity,
    visual: "runtime" as const,
  },
  {
    id: "leak-checking",
    eyebrow: "Leak Checking",
    title: "Catch exposed credentials early.",
    body: "Scan breach sources for compromised emails, usernames, and passwords tied to your company identities.",
    close: "Find the problem before someone takes advantage of it.",
    points: [
      "Monitor multiple breach sources",
      "Detect email, username & password leaks",
      "Instant alerts and clear next steps",
    ],
    icon: KeyRound,
    visual: "leak" as const,
  },
  {
    id: "url-monitoring",
    eyebrow: "URL Monitoring",
    title: "Keep your public face healthy.",
    body: "Monitor your websites for downtime, slow responses, SSL issues, and configuration gaps customers can see.",
    close: "Your online presence is part of your security.",
    points: ["Uptime & performance monitoring", "SSL certificate checks", "Instant outage and incident alerts"],
    icon: Globe,
    visual: "url" as const,
  },
] as const;

function FeatureMock({ kind }: { kind: (typeof FEATURE_SPOTLIGHTS)[number]["visual"] }) {
  if (kind === "vuln") {
    return (
      <div className="lp-mock lp-mock-vuln">
        <div className="lp-mock-head">
          <strong>Vulnerabilities</strong>
          <span className="lp-pill lp-pill-ok">Scan completed</span>
        </div>
        <div className="lp-mock-vuln-body">
          <div className="lp-mock-graph">
            <svg viewBox="0 0 180 120" className="lp-mock-graph-svg" aria-hidden="true">
              <line x1="30" y1="90" x2="70" y2="55" stroke="#c9d8f5" strokeWidth="2" />
              <line x1="70" y1="55" x2="120" y2="40" stroke="#c9d8f5" strokeWidth="2" />
              <line x1="70" y1="55" x2="95" y2="95" stroke="#c9d8f5" strokeWidth="2" />
              <line x1="120" y1="40" x2="155" y2="70" stroke="#c9d8f5" strokeWidth="2" />
              <circle cx="30" cy="90" r="7" fill="#b6d4ff" />
              <circle cx="95" cy="95" r="6" fill="#ffe08a" />
              <circle cx="155" cy="70" r="7" fill="#ffc680" />
              <circle cx="70" cy="55" r="8" fill="#88c4ff" />
              <circle cx="120" cy="40" r="12" fill="#cf222e" />
              <text x="88" y="28" fill="#a40e26" fontSize="8" fontWeight="700">
                Critical CVE-2024-3094
              </text>
            </svg>
          </div>
          <div className="lp-mock-sev-panel">
            <div className="lp-mock-sev-total">
              Total found <strong>12</strong>
            </div>
            <ul>
              <li>
                <i className="crit" /> Critical <b>2</b>
              </li>
              <li>
                <i className="high" /> High <b>7</b>
              </li>
              <li>
                <i className="med" /> Medium <b>2</b>
              </li>
              <li>
                <i className="low" /> Low <b>1</b>
              </li>
            </ul>
          </div>
        </div>
        <div className="lp-mock-foot">Top risk: outdated package in api-gateway image</div>
      </div>
    );
  }

  if (kind === "runtime") {
    return (
      <div className="lp-mock lp-mock-runtime">
        <div className="lp-mock-runtime-shell">
          <aside className="lp-mock-side">
            <span className="on">Alerts</span>
            <span>Buckets</span>
            <span>Trends</span>
            <span>Settings</span>
          </aside>
          <div className="lp-mock-runtime-main">
            <div className="lp-mock-head">
              <strong>Runtime feed</strong>
              <span className="lp-pill lp-pill-live">Live</span>
            </div>
            <ul className="lp-mock-alerts">
              <li>
                <i className="crit" />
                <div>
                  <strong>Terminal shell in container</strong>
                  <span>pod/api-7f2 · 2 min ago</span>
                </div>
              </li>
              <li>
                <i className="high" />
                <div>
                  <strong>Unexpected outbound connection</strong>
                  <span>node-3 · 12 min ago</span>
                </div>
              </li>
              <li>
                <i className="med" />
                <div>
                  <strong>Write below /etc</strong>
                  <span>workload/worker · 28 min ago</span>
                </div>
              </li>
              <li>
                <i className="ok" />
                <div>
                  <strong>Sensitive mount detected</strong>
                  <span>ns/payments · 1 hr ago</span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "leak") {
    return (
      <div className="lp-mock lp-mock-leak">
        <div className="lp-mock-head">
          <strong>Credential scan</strong>
          <span className="lp-pill lp-pill-scan">Scanning…</span>
        </div>
        <div className="lp-mock-search">
          <KeyRound size={14} strokeWidth={2} />
          <span>jordan@acme.com</span>
        </div>
        <div className="lp-mock-progress">
          <div className="lp-mock-progress-bar" style={{ width: "68%" }} />
        </div>
        <p className="lp-mock-progress-label">Checking across breach sources… 68%</p>
        <div className="lp-mock-leak-split">
          <ul className="lp-mock-sources">
            <li className="done">
              <Check size={12} strokeWidth={2.5} /> Public breach DBs
            </li>
            <li className="done">
              <Check size={12} strokeWidth={2.5} /> Credential dumps
            </li>
            <li className="done">
              <Check size={12} strokeWidth={2.5} /> Identity DNS (SPF/DMARC)
            </li>
            <li className="pending">Provider APIs…</li>
          </ul>
          <div className="lp-mock-safe">
            <Check size={18} strokeWidth={2.5} />
            <strong>No exposure found</strong>
            <span>This identity looks clean right now.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lp-mock lp-mock-url">
      <div className="lp-mock-browser">
        <div className="lp-mock-browser-bar">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
          <div className="lp-mock-urlbar">https://acme.com</div>
          <span className="lp-pill lp-pill-ok">Online</span>
        </div>
        <div className="lp-mock-url-body">
          <div className="lp-mock-site-preview">
            <div className="lp-mock-site-hero" />
            <div className="lp-mock-site-lines">
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="lp-mock-url-stats">
            <div className="lp-mock-metric">
              <span>Uptime</span>
              <strong className="ok">99.92%</strong>
            </div>
            <div className="lp-mock-metric">
              <span>Response</span>
              <strong className="accent">142 ms</strong>
            </div>
            <svg className="lp-mock-spark" viewBox="0 0 120 36" aria-hidden="true">
              <polyline
                fill="none"
                stroke="#1a61ff"
                strokeWidth="2.5"
                points="0,28 16,22 32,24 48,14 64,18 80,10 96,12 120,6"
              />
            </svg>
          </div>
        </div>
        <div className="lp-mock-timeline">
          {["Now", "2h", "6h", "12h"].map((t) => (
            <div key={t}>
              <i />
              <span>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Plug in your tools",
    body: "Connect Trivy, Falco, or your monitors with a project token. Your pipelines keep running — we just listen.",
    icon: Link2,
  },
  {
    n: "02",
    title: "Get one clear picture",
    body: "Every finding uses the same severity scale, kept private to your company and projects. No mixed signals.",
    icon: Radar,
  },
  {
    n: "03",
    title: "Move on what matters",
    body: "Dashboards, history, and alerts highlight what changed and what’s urgent — so your team spends time fixing, not sorting.",
    icon: Shield,
  },
] as const;

const PLANS = [
  {
    name: "Starter",
    for: "Ideal when you want to prove value in one security area before expanding.",
    cta: "Get started",
    href: mail("SQSecure Starter"),
    featured: false,
    items: [
      "One security feature of your choice",
      "One project",
      "Unlimited findings",
      "Email & Slack alerts",
      "Clear security dashboard",
    ],
  },
  {
    name: "Team",
    for: "Built for growing teams that need full visibility across apps, clusters, and public sites.",
    cta: "Talk to us",
    href: mail("SQSecure Team"),
    featured: true,
    items: [
      "All four security features",
      "Multiple projects",
      "Admin & viewer roles",
      "Alerts, history & trends",
      "Sam — AI security assistant",
      "Priority onboarding help",
    ],
  },
  {
    name: "Enterprise",
    for: "For organizations that need stronger controls, longer retention, and hands-on support.",
    cta: "Contact sales",
    href: mail("SQSecure Enterprise"),
    featured: false,
    items: [
      "Everything in Team",
      "Multiple environments",
      "Custom data retention",
      "Dedicated onboarding",
      "Priority enterprise support",
      "Custom requirements welcome",
    ],
  },
] as const;

export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;
    html.style.backgroundColor = "#0d1a3d";
    body.style.backgroundColor = "#0d1a3d";

    return () => {
      window.removeEventListener("scroll", onScroll);
      html.style.backgroundColor = prevHtmlBg;
      body.style.backgroundColor = prevBodyBg;
    };
  }, []);

  function handleContactSubmit(e: FormEvent) {
    e.preventDefault();
    const name = nameRef.current?.value.trim() ?? "";
    const email = emailRef.current?.value.trim() ?? "";
    const message = messageRef.current?.value.trim() ?? "";
    const body = `From: ${name} (${email})\r\n\r\n${message || "(no message)"}`;
    window.location.href = mail("SQSecure early access request", body);
  }

  return (
    <div className="lp">
      <header className={`lp-bar${scrolled ? " scrolled" : ""}`}>
        <div className="lp-inner lp-bar-row">
          <a className="lp-brand" href="#top">
            <Logo size={28} color="#1a61ff" />
            <span>SQSecure</span>
          </a>
          <nav className="lp-nav" aria-label="Primary">
            <a href="#vulnerabilities">Features</a>
            <a href="#sam">Sam</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#contact">Contact</a>
          </nav>
          <div className="lp-bar-actions">
            <Link className="lp-btn lp-btn-ghost" href="/login">
              Log in
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="lp-hero-stage" aria-labelledby="lp-hero-title">
          <div
            className="lp-hero-bg"
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              pointerEvents: "none",
              overflow: "hidden",
              backgroundColor: "#0d1a3d",
              backgroundImage:
                "linear-gradient(90deg, #0d1a3d 0%, #0d1a3d 34%, rgba(13, 26, 61, 0.55) 52%, rgba(13, 26, 61, 0.15) 68%, transparent 82%), url(/hero-security.png)",
              backgroundSize: "cover",
              backgroundPosition: "right center",
              backgroundRepeat: "no-repeat",
            }}
          />

          <div className="lp-inner lp-hero">
            <div className="lp-hero-copy">
              <p className="lp-kicker">SecureQuanta · Security made clear</p>
              <h1 id="lp-hero-title">Know your risks. Fix what matters first.</h1>
              <p className="lp-lede">
                SQSecure brings vulnerability scans, runtime alerts, credential leaks, and website
                checks into one trusted dashboard — so your team stops chasing noise and starts
                protecting what counts.
              </p>
              <div className="lp-actions">
                <a className="lp-btn lp-btn-primary" href="#contact">
                  Request early access
                  <ArrowRight size={16} strokeWidth={2.25} />
                </a>
                <a className="lp-btn lp-btn-hero-secondary" href="#vulnerabilities">
                  Explore features
                </a>
              </div>
              <p className="lp-note">Works with the tools you already trust — including Trivy and Falco.</p>
            </div>
          </div>
        </section>

        {FEATURE_SPOTLIGHTS.map((spot, i) => {
          const Icon = spot.icon;
          const reverse = i % 2 === 1;
          return (
            <section
              key={spot.id}
              id={spot.id}
              className={`lp-spotlight${reverse ? " reverse" : ""}${i % 2 === 0 ? " tinted" : ""}`}
            >
              <div className="lp-inner lp-spotlight-grid">
                <div className="lp-spotlight-copy">
                  <p className="lp-spotlight-eyebrow">
                    <span className="lp-spotlight-icon">
                      <Icon size={16} strokeWidth={2} />
                    </span>
                    {spot.eyebrow}
                  </p>
                  <h2>{spot.title}</h2>
                  <p className="lp-spotlight-body">{spot.body}</p>
                  <ul className="lp-spotlight-points">
                    {spot.points.map((point) => (
                      <li key={point}>
                        <Check size={15} strokeWidth={2.5} />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="lp-spotlight-close">{spot.close}</p>
                </div>

                <aside className="lp-spotlight-visual" aria-hidden="true">
                  <div className="lp-mock-stage">
                    <span className="lp-mock-shadow" />
                    <FeatureMock kind={spot.visual} />
                  </div>
                </aside>
              </div>
            </section>
          );
        })}

        <section className="lp-sam" id="sam">
          <div className="lp-inner lp-sam-grid">
            <div className="lp-sam-copy">
              <p className="lp-spotlight-eyebrow">
                <span className="lp-spotlight-icon">
                  <Bot size={16} strokeWidth={2} />
                </span>
                Meet Sam
              </p>
              <h2>Your AI security assistant.</h2>
              <p className="lp-spotlight-body">
                Security data can be hard to read. Sam turns your company&apos;s findings into clear answers —
                what matters, what to fix first, and what an alert actually means.
              </p>
              <ul className="lp-sam-prompts">
                <li>&quot;What are my biggest security risks?&quot;</li>
                <li>&quot;What should we fix first?&quot;</li>
                <li>&quot;Explain this security issue to me.&quot;</li>
              </ul>
              <p className="lp-spotlight-close">Security expertise, without the jargon.</p>
            </div>
            <aside className="lp-chat" aria-hidden="true">
              <div className="lp-chat-head">
                <span className="lp-chat-avatar">
                  <Bot size={18} strokeWidth={2} />
                </span>
                <div>
                  <strong>Sam</strong>
                  <span>Security assistant</span>
                </div>
              </div>
              <div className="lp-bubble lp-bubble-user">What should we fix first?</div>
              <div className="lp-bubble lp-bubble-sam">
                Two critical CVEs on your main app, plus one new credential leak on a monitored
                identity. Want me to walk through why those matter most?
              </div>
            </aside>
          </div>
        </section>

        <section className="lp-inner lp-how" id="how">
          <div className="lp-sec-head">
            <h2>How it works</h2>
            <p>Three steps from scattered alerts to a security view your whole team can use.</p>
          </div>
          <ol className="lp-steps">
            {STEPS.map(({ n, title, body, icon: Icon }) => (
              <li key={n}>
                <div className="lp-step-top">
                  <span className="lp-step-n">{n}</span>
                  <span className="lp-step-icon">
                    <Icon size={16} strokeWidth={2} />
                  </span>
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-band" id="pricing">
          <div className="lp-inner">
            <div className="lp-sec-head">
              <h2>Simple plans that grow with you</h2>
              <p>Start with what you need today. Add features when your security program is ready.</p>
            </div>
            <div className="lp-pricing">
              {PLANS.map((plan) => (
                <article key={plan.name} className={`lp-plan${plan.featured ? " featured" : ""}`}>
                  {plan.featured && <span className="lp-plan-badge">Most popular</span>}
                  <h3>{plan.name}</h3>
                  <p className="lp-plan-for">{plan.for}</p>
                  <a className={`lp-btn${plan.featured ? " lp-btn-primary" : ""}`} href={plan.href}>
                    {plan.cta}
                  </a>
                  <ul>
                    {plan.items.map((item) => (
                      <li key={item}>
                        <Check size={14} strokeWidth={2.5} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-cta" id="contact">
          <div className="lp-inner lp-contact">
            <div className="lp-contact-intro">
              <p className="lp-contact-kicker">Early access</p>
              <h2>Ready to see your security in one place?</h2>
              <p>
                Tell us what you want to protect first — vulnerabilities, runtime threats, leaked
                credentials, or website health. We&apos;ll get you into early access.
              </p>
              <ul className="lp-contact-perks">
                <li>
                  <Check size={15} strokeWidth={2.5} />
                  No self-serve signup yet — we onboard you personally
                </li>
                <li>
                  <Check size={15} strokeWidth={2.5} />
                  Works with tools you already use, including Trivy &amp; Falco
                </li>
                <li>
                  <Check size={15} strokeWidth={2.5} />
                  Pick only the features your company needs
                </li>
              </ul>
              <Link className="lp-contact-login" href="/login">
                Already onboarded? Log in
                <ArrowRight size={14} strokeWidth={2.25} />
              </Link>
            </div>

            <form className="lp-form" onSubmit={handleContactSubmit}>
              <div className="lp-form-row">
                <div className="lp-field">
                  <label htmlFor="lp-name">Name</label>
                  <input
                    id="lp-name"
                    name="name"
                    type="text"
                    required
                    autoComplete="name"
                    placeholder="Jordan Rivera"
                    ref={nameRef}
                  />
                </div>
                <div className="lp-field">
                  <label htmlFor="lp-email">Work email</label>
                  <input
                    id="lp-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="jordan@company.com"
                    ref={emailRef}
                  />
                </div>
              </div>
              <div className="lp-field">
                <label htmlFor="lp-message">What are you hoping to protect first?</label>
                <textarea
                  id="lp-message"
                  name="message"
                  rows={4}
                  placeholder="e.g. we want one clear view of Trivy findings and leak alerts"
                  ref={messageRef}
                />
              </div>
              <button type="submit" className="lp-btn lp-btn-primary lp-form-submit">
                Request early access
                <ArrowRight size={16} strokeWidth={2.25} />
              </button>
              <p className="lp-form-note">
                Opens your email to {CONTACT} with this pre-filled — we reply from there.
              </p>
            </form>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-inner lp-foot-row">
          <div className="lp-foot-brand">
            <Logo size={22} color="#1a61ff" />
            <div>
              <strong>SQSecure</strong>
              <span>A product by SecureQuanta</span>
            </div>
          </div>
          <div className="lp-foot-links">
            <a href="#vulnerabilities">Features</a>
            <a href="#pricing">Pricing</a>
            <a href={mail("SQSecure inquiry")}>Contact</a>
          </div>
          <span className="lp-foot-copy">© SecureQuanta</span>
        </div>
      </footer>

      <style jsx>{`
        .lp {
          --canvas: #ffffff;
          --subtle: #f6f8fa;
          --border: #d0d7de;
          --border-muted: #d8dee4;
          --fg: #1f2328;
          --muted: #656d76;
          --subtle-fg: #6e7781;
          --accent: #1a61ff;
          --accent-soft: #edf6ff;
          --accent-bright: #50a2ff;
          --accent-deep: #0f37be;
          --accent-navy: #11225a;
          --success: #1f883d;
          --header: #11225a;
          --dark-2: #0d1a3d;
          --radius: 6px;
          --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
          --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial,
            sans-serif;

          min-height: 100vh;
          background: #0d1a3d;
          color: var(--fg);
          font-family: var(--sans);
          font-size: 15px;
          line-height: 1.5;
        }

        .lp-inner {
          max-width: 1080px;
          margin: 0 auto;
          padding-inline: 24px;
        }

        .lp-bar {
          position: sticky;
          top: 0;
          z-index: 20;
          background: transparent;
          border-bottom: 0;
          box-shadow: none;
          transition:
            background 0.22s ease,
            box-shadow 0.22s ease;
        }

        .lp-bar.scrolled {
          background: #0d1a3d;
          box-shadow: 0 8px 24px rgba(13, 26, 61, 0.45);
        }

        .lp-hero-stage {
          position: relative;
          overflow: hidden;
          background: #0d1a3d;
          color: #fff;
          isolation: isolate;
          margin-top: -58px;
          padding-top: 58px;
          min-height: min(88vh, 760px);
          display: flex;
          align-items: center;
        }

        .lp-bar-row {
          height: 58px;
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .lp-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #fff !important;
          font-weight: 650;
          font-size: 15px;
          text-decoration: none !important;
          flex-shrink: 0;
        }

        .lp-nav {
          display: flex;
          gap: 18px;
          margin-left: 8px;
          flex: 1;
        }

        .lp-nav a {
          color: rgba(255, 255, 255, 0.88) !important;
          font-size: 13.5px;
          font-weight: 500;
          text-decoration: none !important;
        }

        .lp-nav a:hover {
          color: #fff !important;
        }

        .lp-bar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .lp :global(.lp-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: var(--radius);
          border: 1px solid var(--border);
          background: var(--subtle);
          color: var(--fg);
          font-size: 13.5px;
          font-weight: 600;
          text-decoration: none !important;
          line-height: 1.2;
          transition: background 0.12s ease, border-color 0.12s ease;
        }

        .lp :global(.lp-btn:hover) {
          background: #eaeef2;
        }

        .lp :global(.lp-btn-primary) {
          background: var(--success);
          border-color: transparent;
          color: #fff;
          box-shadow: 0 1px 2px rgba(17, 34, 90, 0.18);
        }

        .lp :global(.lp-btn-primary:hover) {
          background: #1a7f37;
        }

        .lp :global(.lp-btn-ghost) {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.45);
          color: #fff;
        }

        .lp :global(.lp-btn-ghost:hover) {
          background: rgba(255, 255, 255, 0.16);
        }

        .lp :global(.lp-btn-on-dark) {
          background: #fff;
          border: none;
          color: #11225a;
        }

        .lp :global(.lp-btn-on-dark:hover) {
          background: #edf6ff;
        }

        .lp :global(.lp-btn-ghost-dark) {
          background: transparent;
          border-color: rgba(255, 255, 255, 0.4);
          color: #fff;
        }

        .lp :global(.lp-btn-ghost-dark:hover) {
          background: rgba(255, 255, 255, 0.1);
        }

        .lp :global(.lp-btn-hero-secondary) {
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(255, 255, 255, 0.55);
          color: #fff;
        }

        .lp :global(.lp-btn-hero-secondary:hover) {
          background: rgba(255, 255, 255, 0.22);
        }

        .lp-hero {
          position: relative;
          z-index: 1;
          width: 100%;
          padding-block: 88px 96px;
        }

        .lp-hero-stage > .lp-inner {
          width: 100%;
        }

        .lp-hero-copy {
          max-width: 640px;
        }

        .lp-kicker {
          margin: 0;
          font-size: 12px;
          font-weight: 650;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #8b949e;
        }

        .lp-hero h1 {
          margin: 14px 0 0;
          font-size: clamp(34px, 5vw, 52px);
          font-weight: 750;
          letter-spacing: -0.035em;
          line-height: 1.1;
          max-width: 14ch;
          color: #fff;
        }

        .lp-lede {
          margin: 18px 0 0;
          color: rgba(255, 255, 255, 0.78);
          font-size: 17px;
          max-width: 46ch;
          line-height: 1.55;
        }

        .lp-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 30px;
        }

        .lp-note {
          margin: 18px 0 0;
          font-size: 13px;
          color: #8b949e;
        }

        .lp-spotlight {
          padding-block: 88px;
          background: var(--canvas);
          scroll-margin-top: 72px;
        }

        .lp-spotlight.tinted {
          background: var(--subtle);
          border-block: 1px solid var(--border-muted);
        }

        .lp-spotlight-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 72px 80px;
          align-items: center;
        }

        .lp-spotlight.reverse .lp-spotlight-grid {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }

        .lp-spotlight.reverse .lp-spotlight-copy {
          order: 2;
        }

        .lp-spotlight.reverse .lp-spotlight-visual {
          order: 1;
        }

        .lp :global(.lp-spotlight-visual) {
          padding-inline: 8px;
        }

        .lp-spotlight-eyebrow {
          margin: 0;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--accent);
        }

        .lp-spotlight-icon {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-soft);
          color: var(--accent);
        }

        .lp-spotlight-copy h2 {
          margin: 12px 0 0;
          font-size: clamp(26px, 3.2vw, 36px);
          font-weight: 750;
          letter-spacing: -0.03em;
          line-height: 1.15;
          max-width: 16ch;
          color: var(--fg);
        }

        .lp-spotlight-body {
          margin: 14px 0 0;
          font-size: 16px;
          line-height: 1.55;
          color: var(--muted);
          max-width: 48ch;
        }

        .lp-spotlight-points {
          list-style: none;
          margin: 22px 0 0;
          padding: 0;
          display: grid;
          gap: 12px;
        }

        .lp-spotlight-points li {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          font-size: 14.5px;
          color: var(--fg);
          font-weight: 500;
        }

        .lp-spotlight-points li :global(svg) {
          color: var(--success);
          flex-shrink: 0;
          margin-top: 2px;
        }

        .lp-spotlight-close {
          margin: 22px 0 0;
          font-size: 15px;
          font-weight: 700;
          color: var(--fg);
        }

        .lp-sam {
          padding-block: 72px;
          background: #0d1a3d;
          color: #fff;
          scroll-margin-top: 72px;
        }

        .lp-sam-grid {
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          gap: 40px;
          align-items: center;
        }

        .lp-sam .lp-spotlight-eyebrow {
          color: #50a2ff;
        }

        .lp-sam .lp-spotlight-icon {
          background: rgba(80, 162, 255, 0.18);
          color: #50a2ff;
        }

        .lp-sam-copy h2 {
          margin: 12px 0 0;
          font-size: clamp(26px, 3.2vw, 36px);
          font-weight: 750;
          letter-spacing: -0.03em;
          color: #fff;
        }

        .lp-sam .lp-spotlight-body {
          color: rgba(255, 255, 255, 0.78);
        }

        .lp-sam .lp-spotlight-close {
          color: #fff;
        }

        .lp-sam-prompts {
          list-style: none;
          margin: 20px 0 0;
          padding: 0;
          display: grid;
          gap: 10px;
        }

        .lp-sam-prompts li {
          font-size: 14px;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          padding: 11px 14px;
          color: rgba(255, 255, 255, 0.92);
        }

        .lp-chat {
          background: #fff;
          color: var(--fg);
          border-radius: 16px;
          padding: 18px;
          box-shadow: 0 16px 40px rgba(13, 26, 61, 0.28);
        }

        .lp-chat-head {
          display: flex;
          align-items: center;
          gap: 10px;
          padding-bottom: 14px;
          margin-bottom: 14px;
          border-bottom: 1px solid var(--border-muted);
        }

        .lp-chat-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--accent);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .lp-chat-head strong {
          display: block;
          font-size: 14px;
        }

        .lp-chat-head span {
          display: block;
          font-size: 12px;
          color: var(--muted);
        }

        .lp-bubble {
          border-radius: 14px;
          padding: 11px 14px;
          font-size: 14px;
          line-height: 1.45;
          max-width: 92%;
          margin-bottom: 10px;
        }

        .lp-bubble-user {
          margin-left: auto;
          background: var(--accent);
          color: #fff;
          border-bottom-right-radius: 4px;
        }

        .lp-bubble-sam {
          background: var(--subtle);
          border: 1px solid var(--border-muted);
          border-bottom-left-radius: 4px;
        }

        .lp-band {
          background: var(--subtle);
          border-block: 1px solid var(--border-muted);
          padding-block: 56px;
        }

        .lp-sec-head {
          margin-bottom: 28px;
          max-width: 560px;
        }

        .lp-sec-head h2 {
          margin: 0;
          font-size: clamp(22px, 2.6vw, 28px);
          font-weight: 700;
          letter-spacing: -0.02em;
        }

        .lp-sec-head p {
          margin: 8px 0 0;
          color: var(--muted);
          font-size: 15px;
        }

        .lp-how {
          padding-block: 56px;
          background: var(--canvas);
        }

        .lp-steps {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }

        .lp-steps li {
          border-top: 2px solid var(--accent);
          padding-top: 14px;
        }

        .lp-step-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .lp-step-n {
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 600;
          color: var(--accent);
        }

        .lp-step-icon {
          color: var(--subtle-fg);
          display: inline-flex;
        }

        .lp-steps h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 650;
        }

        .lp-steps p {
          margin: 8px 0 0;
          font-size: 13.5px;
          color: var(--muted);
        }

        .lp-pricing {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          align-items: stretch;
        }

        .lp-plan {
          position: relative;
          display: flex;
          flex-direction: column;
          background: var(--canvas);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 22px;
        }

        .lp-plan.featured {
          border-color: var(--accent);
          box-shadow: 0 0 0 1px var(--accent);
        }

        .lp-plan-badge {
          position: absolute;
          top: -10px;
          left: 16px;
          background: var(--accent);
          color: #fff;
          font-size: 11px;
          font-weight: 650;
          padding: 2px 8px;
          border-radius: 999px;
        }

        .lp-plan h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
        }

        .lp-plan-for {
          margin: 8px 0 0;
          font-size: 13.5px;
          color: var(--muted);
          min-height: 3.2em;
        }

        .lp-plan :global(.lp-btn) {
          margin-top: 16px;
          width: 100%;
        }

        .lp-plan ul {
          list-style: none;
          margin: 18px 0 0;
          padding: 16px 0 0;
          border-top: 1px solid var(--border-muted);
          display: grid;
          gap: 10px;
          flex: 1;
        }

        .lp-plan li {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 13.5px;
        }

        .lp-plan li :global(svg) {
          color: var(--success);
          flex-shrink: 0;
          margin-top: 2px;
        }

        .lp-cta {
          background: linear-gradient(165deg, #0d1a3d 0%, #11225a 50%, #0f37be 100%);
          color: #e6edf3;
          padding-block: 72px;
          scroll-margin-top: 72px;
        }

        .lp-contact {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          align-items: start;
        }

        .lp-contact-kicker {
          margin: 0;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #7ee787;
        }

        .lp-contact-intro h2 {
          margin: 10px 0 0;
          font-size: clamp(24px, 3vw, 32px);
          font-weight: 750;
          color: #fff;
          letter-spacing: -0.025em;
          line-height: 1.15;
        }

        .lp-contact-intro > p {
          margin: 12px 0 0;
          color: rgba(255, 255, 255, 0.78);
          font-size: 15px;
          line-height: 1.55;
          max-width: 42ch;
        }

        .lp-contact-perks {
          list-style: none;
          margin: 24px 0 0;
          padding: 0;
          display: grid;
          gap: 12px;
        }

        .lp-contact-perks li {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.9);
          font-weight: 500;
        }

        .lp-contact-perks li :global(svg) {
          color: #7ee787;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .lp-contact-login {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 28px;
          font-size: 14px;
          font-weight: 600;
          color: #fff !important;
          text-decoration: none !important;
          opacity: 0.85;
        }

        .lp-contact-login:hover {
          opacity: 1;
        }

        .lp-form {
          background: rgba(255, 255, 255, 0.97);
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 18px 40px rgba(13, 26, 61, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.2);
          display: grid;
          gap: 14px;
        }

        .lp-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .lp-field {
          display: grid;
          gap: 6px;
        }

        .lp-field label {
          font-size: 13px;
          font-weight: 650;
          color: #1f2328;
        }

        .lp-field input,
        .lp-field textarea {
          font-family: var(--sans);
          font-size: 14px;
          color: #1f2328;
          background: #f6f8fa;
          border: 1px solid #d0d7de;
          border-radius: 8px;
          padding: 11px 12px;
          resize: vertical;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .lp-field input::placeholder,
        .lp-field textarea::placeholder {
          color: #6e7781;
        }

        .lp-field input:focus,
        .lp-field textarea:focus {
          border-color: #1a61ff;
          box-shadow: 0 0 0 3px rgba(26, 97, 255, 0.18);
          background: #fff;
        }

        .lp-form :global(.lp-form-submit) {
          width: 100%;
          margin-top: 4px;
          padding: 12px 16px;
          font-size: 15px;
        }

        .lp-form-note {
          margin: 0;
          text-align: center;
          font-size: 12px;
          color: #656d76;
          line-height: 1.4;
        }

        .lp-foot {
          border-top: 1px solid var(--border-muted);
          padding-block: 22px;
          background: var(--canvas);
          color: var(--fg);
        }

        .lp-foot-row {
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
        }

        .lp-foot-brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .lp-foot-brand strong {
          display: block;
          font-size: 13.5px;
        }

        .lp-foot-brand span {
          display: block;
          font-size: 12px;
          color: var(--subtle-fg);
        }

        .lp-foot-links {
          display: flex;
          gap: 16px;
          margin-left: auto;
        }

        .lp-foot-links a {
          font-size: 13px;
          color: var(--muted) !important;
          text-decoration: none !important;
        }

        .lp-foot-links a:hover {
          color: var(--accent) !important;
        }

        .lp-foot-copy {
          font-size: 12px;
          color: var(--subtle-fg);
        }

        @media (max-width: 900px) {
          .lp-nav {
            display: none;
          }

          .lp-hero {
            padding-block: 64px 72px;
          }

          .lp-hero h1 {
            max-width: none;
          }

          .lp-spotlight-grid,
          .lp-sam-grid,
          .lp-steps,
          .lp-pricing {
            grid-template-columns: 1fr;
          }

          .lp-spotlight-grid {
            gap: 40px;
          }

          .lp-spotlight.reverse .lp-spotlight-copy,
          .lp-spotlight.reverse .lp-spotlight-visual {
            order: unset;
          }

          .lp-spotlight-copy h2,
          .lp-sam-copy h2 {
            max-width: none;
          }

          .lp-spotlight,
          .lp-sam {
            padding-block: 64px;
          }

          .lp-contact,
          .lp-form-row {
            grid-template-columns: 1fr;
          }

          .lp-cta {
            padding-block: 52px;
          }

          .lp-foot-links {
            margin-left: 0;
            width: 100%;
          }
        }

      `}</style>
    </div>
  );
}
