import { SEVERITIES } from "./constants";

export const TREND_PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7", label: "7 days", days: 7 },
] as const;

export type TrendPresetKey = (typeof TREND_PRESETS)[number]["key"];

export type TrendWindow = {
  from: Date;
  to: Date;
  /** Preset key or "custom". */
  range: TrendPresetKey | "custom";
  label: string;
};

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function utcDayOffset(fromToday: number): Date {
  const today = startOfUtcDay(new Date());
  return new Date(today.getTime() + fromToday * 24 * 60 * 60 * 1000);
}

/** YYYY-MM-DD → UTC date, or null if invalid. */
export function parseIsoDate(value: string | undefined | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function resolveTrendWindow(params: {
  range?: string;
  from?: string;
  to?: string;
}): TrendWindow {
  if (params.range === "custom") {
    const from = parseIsoDate(params.from);
    const to = parseIsoDate(params.to);
    if (from && to && from.getTime() <= to.getTime()) {
      return {
        from: startOfUtcDay(from),
        to: endOfUtcDay(to),
        range: "custom",
        label: `${formatIsoDate(from)} → ${formatIsoDate(to)}`,
      };
    }
  }

  if (params.range === "today") {
    const day = utcDayOffset(0);
    return {
      from: startOfUtcDay(day),
      to: endOfUtcDay(day),
      range: "today",
      label: "Today",
    };
  }

  if (params.range === "yesterday") {
    const day = utcDayOffset(-1);
    return {
      from: startOfUtcDay(day),
      to: endOfUtcDay(day),
      range: "yesterday",
      label: "Yesterday",
    };
  }

  // Default / "7" — last 7 inclusive calendar days ending today.
  const to = endOfUtcDay(new Date());
  const from = startOfUtcDay(new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000));
  return {
    from,
    to,
    range: "7",
    label: "7 days",
  };
}

/** Inclusive list of YYYY-MM-DD between from and to (UTC days). */
export function eachUtcDay(from: Date, to: Date): string[] {
  const days: string[] = [];
  let cursor = startOfUtcDay(from);
  const end = startOfUtcDay(to);
  while (cursor.getTime() <= end.getTime()) {
    days.push(formatIsoDate(cursor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return days;
}

export function emptySeverityBucket(): Record<string, number> {
  return Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
}
