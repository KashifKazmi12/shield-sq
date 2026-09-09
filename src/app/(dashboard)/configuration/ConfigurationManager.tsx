"use client";

import { useState, useTransition } from "react";
import { DataTable } from "@/components/DataTable";
import type { LeakProvider } from "@prisma/client";
import {
  updateProviderKey,
  clearProviderKey,
  setProviderEnabled,
  setProviderPriority,
  resetProviderUsageCount,
  testProvider,
  updateProviderLimits,
  getProviderUsage,
} from "./actions";
import { PROVIDER_LABELS } from "@/lib/leak-provider-meta";

type ProviderConfig = {
  provider: LeakProvider;
  apiKeyPreview: string | null;
  priority: number;
  enabled: boolean;
  usageCount: number;
  updatedAt: Date | string;
};

type Limits = {
  globalDailyLimit: number | null;
  perCompanyDailyLimit: number | null;
  perUserDailyLimit: number | null;
};

type Usage = {
  byProvider: Record<string, { total: number; success: number; failure: number }>;
  topCompanies: { name: string; count: number }[];
  totalCalls: number;
};

function ProviderRow({
  config,
  providerCount,
  isPending,
  onError,
}: {
  config: ProviderConfig;
  providerCount: number;
  isPending: boolean;
  onError: (msg: string) => void;
}) {
  const [isChangingKey, setIsChangingKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [, startTransition] = useTransition();

  function handleSaveKey() {
    if (!keyInput.trim()) return;
    startTransition(async () => {
      try {
        await updateProviderKey(config.provider, keyInput);
        setKeyInput("");
        setIsChangingKey(false);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleCancelChangeKey() {
    setKeyInput("");
    setIsChangingKey(false);
  }

  function handleClearKey() {
    startTransition(async () => {
      try {
        await clearProviderKey(config.provider);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleToggleEnabled() {
    startTransition(async () => {
      try {
        await setProviderEnabled(config.provider, !config.enabled);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handlePriorityChange(next: number) {
    startTransition(async () => {
      try {
        await setProviderPriority(config.provider, next);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleTryIt() {
    setTestResult(null);
    startTransition(async () => {
      try {
        const result = await testProvider(config.provider);
        setTestResult({
          ok: true,
          message: `Reachable — test call returned ${result.findingsCount} result${result.findingsCount === 1 ? "" : "s"}.`,
        });
      } catch (err) {
        setTestResult({ ok: false, message: err instanceof Error ? err.message : "Test failed" });
      }
    });
  }

  function handleResetCount() {
    startTransition(async () => {
      try {
        await resetProviderUsageCount(config.provider);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="card section" style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 14,
          marginBottom: 16,
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              display: "inline-block",
              background: config.enabled ? "var(--success-fg)" : "var(--border-default)",
            }}
          />
          <strong style={{ fontSize: 15 }}>{PROVIDER_LABELS[config.provider]}</strong>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg-muted)" }}>
          <input
            type="checkbox"
            checked={config.enabled}
            disabled={isPending}
            onChange={handleToggleEnabled}
          />
          Enabled
        </label>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 20,
          marginBottom: 16,
        }}
      >
        <div>
          <div className="stat-label">API key</div>
          <code>{config.apiKeyPreview ?? "Not configured"}</code>
        </div>
        <div>
          <div className="stat-label">Priority</div>
          <select
            value={config.priority}
            disabled={isPending}
            style={{ width: 72 }}
            onChange={(e) => handlePriorityChange(Number(e.target.value))}
          >
            {Array.from({ length: providerCount }, (_, i) => i + 1).map((position) => (
              <option key={position} value={position}>
                {position}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="stat-label">Calls made</div>
          <span style={{ fontSize: 20, fontWeight: 600, lineHeight: 1 }}>{config.usageCount}</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          paddingTop: 14,
          borderTop: "1px solid var(--border-default)",
        }}
      >
        <button
          type="button"
          className="secondary"
          disabled={isPending || !config.apiKeyPreview}
          onClick={handleTryIt}
        >
          Try it
        </button>
        <button
          type="button"
          className="secondary"
          disabled={isPending || config.usageCount === 0}
          onClick={handleResetCount}
          title="Reset this count to zero"
        >
          Reset count
        </button>
        {!isChangingKey && (
          <button type="button" className="secondary" disabled={isPending} onClick={() => setIsChangingKey(true)}>
            Change key
          </button>
        )}
        {config.apiKeyPreview && !isChangingKey && (
          <button type="button" className="danger" disabled={isPending} onClick={handleClearKey}>
            Remove
          </button>
        )}
      </div>

      {testResult && (
        <p
          style={{
            fontSize: 13,
            marginTop: 12,
            marginBottom: 0,
            color: testResult.ok ? "var(--success-fg)" : "var(--danger-fg)",
          }}
        >
          {testResult.message}
        </p>
      )}

      {isChangingKey && (
        <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
          <input
            type="password"
            placeholder="Paste new API key"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
            autoComplete="off"
            autoFocus
          />
          <button onClick={handleSaveKey} disabled={isPending || !keyInput.trim()}>
            Save key
          </button>
          <button type="button" className="secondary" disabled={isPending} onClick={handleCancelChangeKey}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function ConfigurationManager({
  providers,
  limits,
  initialUsage,
}: {
  providers: ProviderConfig[];
  limits: Limits;
  initialUsage: Usage;
}) {
  const [error, setError] = useState<string | null>(null);
  const [globalDailyLimit, setGlobalDailyLimit] = useState(limits.globalDailyLimit?.toString() ?? "");
  const [perCompanyDailyLimit, setPerCompanyDailyLimit] = useState(limits.perCompanyDailyLimit?.toString() ?? "");
  const [perUserDailyLimit, setPerUserDailyLimit] = useState(limits.perUserDailyLimit?.toString() ?? "");
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const [usage, setUsage] = useState(initialUsage);
  const [window_, setWindow] = useState<1 | 7 | 30>(1);
  const [isPending, startTransition] = useTransition();

  function handleSaveLimits() {
    setLimitsError(null);
    startTransition(async () => {
      try {
        await updateProviderLimits({
          globalDailyLimit: globalDailyLimit.trim() ? Number(globalDailyLimit) : null,
          perCompanyDailyLimit: perCompanyDailyLimit.trim() ? Number(perCompanyDailyLimit) : null,
          perUserDailyLimit: perUserDailyLimit.trim() ? Number(perUserDailyLimit) : null,
        });
      } catch (err) {
        setLimitsError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleWindowChange(days: 1 | 7 | 30) {
    setWindow(days);
    startTransition(async () => {
      const next = await getProviderUsage(days);
      setUsage(next);
    });
  }

  const sorted = [...providers].sort((a, b) => a.priority - b.priority);

  return (
    <div>
      {error && <p style={{ color: "var(--danger-fg)", fontSize: 13 }}>{error}</p>}

      <h3>Providers</h3>
      {sorted.map((config) => (
        <ProviderRow
          key={config.provider}
          config={config}
          providerCount={sorted.length}
          isPending={isPending}
          onError={setError}
        />
      ))}

      <div className="card section">
        <h3>Limits</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Blank = unlimited. Applied before any provider call is attempted.
        </p>
        <div className="toolbar" style={{ flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Global calls/day
            </label>
            <input
              type="number"
              min={0}
              value={globalDailyLimit}
              onChange={(e) => setGlobalDailyLimit(e.target.value)}
              style={{ width: 140 }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Per-company calls/day
            </label>
            <input
              type="number"
              min={0}
              value={perCompanyDailyLimit}
              onChange={(e) => setPerCompanyDailyLimit(e.target.value)}
              style={{ width: 140 }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Per-user calls/day
            </label>
            <input
              type="number"
              min={0}
              value={perUserDailyLimit}
              onChange={(e) => setPerUserDailyLimit(e.target.value)}
              style={{ width: 140 }}
            />
          </div>
        </div>
        {limitsError && <p style={{ color: "var(--danger-fg)", fontSize: 13 }}>{limitsError}</p>}
        <button style={{ marginTop: 12 }} onClick={handleSaveLimits} disabled={isPending}>
          Save limits
        </button>
      </div>

      <div className="card">
        <h3>Usage</h3>
        <div className="toolbar">
          <select value={window_} onChange={(e) => handleWindowChange(Number(e.target.value) as 1 | 7 | 30)}>
            <option value={1}>Today</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>

        <DataTable
          columns={[
            { id: "provider", header: "Provider" },
            { id: "total", header: "Total calls" },
            { id: "success", header: "Success" },
            { id: "failure", header: "Failure" },
          ]}
          rows={Object.entries(usage.byProvider).map(([provider, stats]) => ({
            key: provider,
            cells: [PROVIDER_LABELS[provider as LeakProvider] ?? provider, stats.total, stats.success, stats.failure],
          }))}
          emptyMessage="No provider calls in this window."
        />

        <h4 style={{ marginTop: 20 }}>Top companies by call count</h4>
        <DataTable
          columns={[
            { id: "name", header: "Company" },
            { id: "count", header: "Calls" },
          ]}
          rows={usage.topCompanies.map((c, i) => ({
            key: `${c.name}-${i}`,
            cells: [c.name, c.count],
          }))}
          emptyMessage="No company activity in this window."
        />
      </div>
    </div>
  );
}
