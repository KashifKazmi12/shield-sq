"use client";

import { useState, useTransition } from "react";
import type { AiProvider } from "@prisma/client";
import {
  getAiProviderConfigs,
  updateAiApiKey,
  deleteAiApiKey,
  updateAiModel,
  fetchModelsForProvider,
  setActiveAiProvider,
  testAiConnection,
  loadMoreAiUsage,
} from "./ai-actions";
import { AI_PROVIDER_LABELS } from "@/lib/ai-provider-catalog";
import type { AiModelListEntry } from "@/lib/ai-client";
import { ScrollLoadingList } from "@/components/ScrollLoadingList";
import { StatusBadge } from "@/components/SeverityBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SettingsTabs } from "./SettingsTabs";

const PROVIDERS = Object.keys(AI_PROVIDER_LABELS) as AiProvider[];

type ProviderConfig = {
  provider: AiProvider;
  model: string | null;
  apiKeyPreview: string | null;
  isActive: boolean;
  hasKey: boolean;
};

type UsageRow = {
  id: string;
  provider: AiProvider;
  model: string;
  totalTokens: number | null;
  success: boolean;
  createdAt: string;
  detail: string | null;
};

function ProviderRow({ config, onChange }: { config: ProviderConfig; onChange: () => Promise<void> }) {
  const { provider } = config;
  const [apiKey, setApiKey] = useState("");
  const [editingKey, setEditingKey] = useState(!config.hasKey);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [dynamicModels, setDynamicModels] = useState<AiModelListEntry[] | null>(null);
  const [modelListError, setModelListError] = useState<string | null>(null);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  // model is read from config.model, not local state, so it can't go stale.

  // No static fallback list for any provider — "Refresh models" fetches the
  // real list live from the provider's own API using the saved key.
  const modelOptions = dynamicModels ?? [];
  // Keep the currently-set model selectable even if it isn't in the
  // freshly-fetched list.
  const options =
    config.model && !modelOptions.some((m) => m.id === config.model)
      ? [{ id: config.model, label: config.model }, ...modelOptions]
      : modelOptions;

  function handleFetchModels() {
    setModelListError(null);
    setIsFetchingModels(true);
    startTransition(async () => {
      try {
        const models = await fetchModelsForProvider(provider);
        setDynamicModels(models);
      } catch (err) {
        setModelListError(err instanceof Error ? err.message : "Couldn't fetch models");
      } finally {
        setIsFetchingModels(false);
      }
    });
  }

  function handleSaveKey() {
    if (!apiKey.trim()) return;
    startTransition(async () => {
      await updateAiApiKey(provider, apiKey);
      setApiKey("");
      setEditingKey(false);
      setTestResult(null);
      setDynamicModels(null);
      setModelListError(null);
      await onChange();
    });
  }

  function handleConfirmDelete() {
    setConfirmingDelete(false);
    startTransition(async () => {
      await deleteAiApiKey(provider);
      setEditingKey(true);
      setTestResult(null);
      setDynamicModels(null);
      setModelListError(null);
      await onChange();
    });
  }

  function handleModelChange(next: string) {
    startTransition(async () => {
      await updateAiModel(provider, next);
      setTestResult(null);
      await onChange();
    });
  }

  function handleSetActive() {
    startTransition(async () => {
      await setActiveAiProvider(provider);
      await onChange();
    });
  }

  function handleTestConnection() {
    startTransition(async () => {
      const result = await testAiConnection(provider);
      setTestResult(result);
      await onChange();
    });
  }

  return (
    <div>
      <div className="section">
        <label className="muted" style={{ display: "block", marginBottom: 4 }}>API key</label>
        {!editingKey && config.apiKeyPreview ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 13 }}>{config.apiKeyPreview}</span>
            <button className="secondary" onClick={() => setEditingKey(true)} disabled={isPending}>Change key</button>
            <button className="secondary" onClick={() => setConfirmingDelete(true)} disabled={isPending}>Delete key</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="password"
              style={{ flex: 1 }}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key"
            />
            <button onClick={handleSaveKey} disabled={isPending || !apiKey.trim()}>Save key</button>
            {config.hasKey && (
              <button className="secondary" onClick={() => { setEditingKey(false); setApiKey(""); }} disabled={isPending}>
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      <div className="section">
        <label className="muted" style={{ display: "block", marginBottom: 4 }}>Model</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            style={{ flex: 1 }}
            value={config.model ?? ""}
            onChange={(e) => handleModelChange(e.target.value)}
            disabled={isPending || !config.hasKey}
          >
            <option value="" disabled>{config.hasKey ? "Select a model" : "Save an API key first"}</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="secondary"
            onClick={handleFetchModels}
            disabled={isPending || !config.hasKey || isFetchingModels}
          >
            {isFetchingModels ? "Fetching…" : "Refresh models"}
          </button>
        </div>
        <p
          className={modelListError ? undefined : "muted"}
          style={{ fontSize: 12, marginTop: 4, marginBottom: 0, color: modelListError ? "var(--danger-fg)" : undefined }}
        >
          {modelListError
            ? modelListError
            : dynamicModels
              ? `Showing ${dynamicModels.length} model(s) fetched live from ${AI_PROVIDER_LABELS[provider]} using this key.`
              : "Click Refresh models to fetch what's available for this key."}
        </p>
      </div>

      <div className="section toolbar" style={{ margin: 0 }}>
        <button onClick={handleTestConnection} disabled={isPending || !config.hasKey || !config.model}>
          {isPending ? "Working…" : "Test connection"}
        </button>
        <button
          className="secondary"
          onClick={handleSetActive}
          disabled={isPending || !config.hasKey || !config.model || config.isActive}
        >
          {config.isActive ? "✅ Active" : "Set as active"}
        </button>
      </div>
      {testResult && (
        <p style={{ marginTop: 8, fontSize: 13, color: testResult.success ? "var(--success-fg)" : "var(--danger-fg)" }}>
          {testResult.success ? "✓ " : "✗ "}
          {testResult.message}
        </p>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete API key"
        message={`Delete the ${AI_PROVIDER_LABELS[provider]} key? This also clears its model and active status.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

export function AiAssistantForm({
  configs: initialConfigs,
  usage,
}: {
  configs: ProviderConfig[];
  usage: { totalCalls: number; totalTokens: number; recent: UsageRow[]; nextCursor: string | null };
}) {
  const [configs, setConfigs] = useState(initialConfigs);

  async function refresh() {
    setConfigs(await getAiProviderConfigs());
  }

  const byProvider = new Map(configs.map((c) => [c.provider, c]));
  const configFor = (provider: AiProvider): ProviderConfig =>
    byProvider.get(provider) ?? { provider, model: null, apiKeyPreview: null, isActive: false, hasKey: false };
  const defaultProviderTab = configs.find((c) => c.isActive)?.provider ?? PROVIDERS[0];

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Configure any or all of these providers — each keeps its own key and
        model.
      </p>

      <SettingsTabs
        defaultTab={defaultProviderTab}
        tabs={PROVIDERS.map((provider) => {
          const config = configFor(provider);
          return {
            key: provider,
            label: `${AI_PROVIDER_LABELS[provider]}${config.isActive ? " ✅" : config.hasKey ? " •" : ""}`,
            node: <ProviderRow config={config} onChange={refresh} />,
          };
        })}
      />

      <div className="section" style={{ marginTop: 24 }}>
        <h4>Usage</h4>
        <div className="card-grid">
          <div className="card">
            <div className="stat-label">Total calls</div>
            <div className="stat-value">{usage.totalCalls}</div>
          </div>
          <div className="card">
            <div className="stat-label">Total tokens</div>
            <div className="stat-value">{usage.totalTokens.toLocaleString()}</div>
          </div>
        </div>
        <ScrollLoadingList
          initialRows={usage.recent}
          initialCursor={usage.nextCursor}
          loadMore={loadMoreAiUsage}
          columns={[
            { id: "when", header: "When" },
            { id: "provider", header: "Provider" },
            { id: "model", header: "Model", mobileFullWidth: true },
            { id: "tokens", header: "Tokens" },
            { id: "status", header: "Status" },
          ]}
          toRow={(r) => ({
            key: r.id,
            cells: [
              new Date(r.createdAt).toLocaleString(),
              AI_PROVIDER_LABELS[r.provider],
              r.model,
              r.totalTokens ?? "—",
              <StatusBadge key="st" status={r.success ? "success" : "failed"} />,
            ],
          })}
          emptyMessage="No AI calls yet — use Test connection above to make one."
        />
      </div>
    </div>
  );
}
