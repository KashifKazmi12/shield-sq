import { formatIsoDate, parseIsoDate } from "./trend-range";

export const ALERT_WINDOWS = [
  { key: "1m", label: "Last 1 min", ms: 60_000 },
  { key: "5m", label: "Last 5 min", ms: 5 * 60_000 },
  { key: "1h", label: "Last 1 hour", ms: 60 * 60_000 },
  { key: "24h", label: "Last 24 hours", ms: 24 * 60 * 60_000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60_000 },
  { key: "all", label: "All time", ms: null },
] as const;

export type AlertWindowPresetKey = (typeof ALERT_WINDOWS)[number]["key"];
export type AlertWindowKey = AlertWindowPresetKey | "custom";

export type AlertWindow = {
  key: AlertWindowKey;
  label: string;
  /** Lower bound for filters; `null` means all time (no lower bound). */
  from: Date | null;
  to: Date;
};

const DEFAULT_KEY: AlertWindowPresetKey = "all";

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

export type ResolveAlertWindowParams = {
  window?: string | null;
  from?: string | null;
  to?: string | null;
};

/** Accepts `{ window, from, to }` or a bare window key string (alerts feed). */
export function resolveAlertWindow(
  params?: ResolveAlertWindowParams | string | null,
  now: Date = new Date()
): AlertWindow {
  const normalized: ResolveAlertWindowParams =
    typeof params === "string" || params == null
      ? { window: params }
      : params;

  if (normalized.window === "custom") {
    const from = parseIsoDate(normalized.from);
    const to = parseIsoDate(normalized.to);
    if (from && to && from.getTime() <= to.getTime()) {
      return {
        key: "custom",
        label: `${formatIsoDate(from)} → ${formatIsoDate(to)}`,
        from: startOfUtcDay(from),
        to: endOfUtcDay(to),
      };
    }
  }

  const preset =
    ALERT_WINDOWS.find((w) => w.key === normalized.window) ??
    ALERT_WINDOWS.find((w) => w.key === DEFAULT_KEY)!;

  if (preset.ms === null) {
    return {
      key: preset.key,
      label: preset.label,
      from: null,
      to: now,
    };
  }

  return {
    key: preset.key,
    label: preset.label,
    from: new Date(now.getTime() - preset.ms),
    to: now,
  };
}

/** Concrete from for charts when the window is all-time. */
export function chartFromForWindow(window: AlertWindow, lookbackDays = 90): Date {
  if (window.from) return window.from;
  return new Date(window.to.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
}
