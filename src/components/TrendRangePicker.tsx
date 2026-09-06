"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { usePendingRouter } from "@/components/NavigationPending";
import {
  TREND_PRESETS,
  formatIsoDate,
  parseIsoDate,
  type TrendPresetKey,
} from "@/lib/trend-range";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function monthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1)).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function startWeekday(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1)).getUTCDay();
}

function addMonths(year: number, month: number, delta: number) {
  const d = new Date(Date.UTC(year, month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

function isBefore(a: string, b: string) {
  return a < b;
}

function inRange(day: string, start: string | null, end: string | null) {
  if (!start || !end) return false;
  const lo = start <= end ? start : end;
  const hi = start <= end ? end : start;
  return day >= lo && day <= hi;
}

export function TrendRangePicker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { push, isPending } = usePendingRouter();
  const rootRef = useRef<HTMLDivElement>(null);

  const rangeParam = searchParams.get("range") ?? "7";
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const activePreset: TrendPresetKey | "custom" =
    rangeParam === "custom" || (!TREND_PRESETS.some((p) => p.key === rangeParam) && fromParam && toParam)
      ? "custom"
      : TREND_PRESETS.some((p) => p.key === rangeParam)
        ? (rangeParam as TrendPresetKey)
        : "7";

  const triggerLabel = useMemo(() => {
    if (activePreset === "custom" && fromParam && toParam) {
      return `${fromParam} → ${toParam}`;
    }
    return TREND_PRESETS.find((p) => p.key === activePreset)?.label ?? "7 days";
  }, [activePreset, fromParam, toParam]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const today = formatIsoDate(new Date());
  const initialFrom = parseIsoDate(fromParam) ?? parseIsoDate(today)!;
  const viewSeed = calendarOpen ? initialFrom : new Date();
  const [viewYear, setViewYear] = useState(viewSeed.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(viewSeed.getUTCMonth());
  const [draftStart, setDraftStart] = useState<string | null>(fromParam);
  const [draftEnd, setDraftEnd] = useState<string | null>(toParam);

  useEffect(() => {
    if (!menuOpen && !calendarOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setCalendarOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setCalendarOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, calendarOpen]);

  function applyParams(next: { range: string; from?: string; to?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", next.range);
    if (next.range === "custom" && next.from && next.to) {
      params.set("from", next.from);
      params.set("to", next.to);
    } else {
      params.delete("from");
      params.delete("to");
    }
    setMenuOpen(false);
    setCalendarOpen(false);
    push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function selectPreset(key: TrendPresetKey) {
    applyParams({ range: key });
  }

  function openCustom() {
    setMenuOpen(false);
    setDraftStart(fromParam);
    setDraftEnd(toParam);
    const seed = parseIsoDate(fromParam) ?? new Date();
    setViewYear(seed.getUTCFullYear());
    setViewMonth(seed.getUTCMonth());
    setCalendarOpen(true);
  }

  function onDayClick(day: string) {
    if (day > today) return;
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(day);
      setDraftEnd(null);
      return;
    }
    if (isBefore(day, draftStart)) {
      setDraftEnd(draftStart);
      setDraftStart(day);
    } else {
      setDraftEnd(day);
    }
  }

  function applyCustom() {
    if (!draftStart || !draftEnd) return;
    applyParams({ range: "custom", from: draftStart, to: draftEnd });
  }

  const cells = useMemo(() => {
    const leading = startWeekday(viewYear, viewMonth);
    const count = daysInMonth(viewYear, viewMonth);
    const out: Array<{ key: string; label: string; iso: string | null }> = [];
    for (let i = 0; i < leading; i++) {
      out.push({ key: `e-${i}`, label: "", iso: null });
    }
    for (let d = 1; d <= count; d++) {
      const iso = formatIsoDate(new Date(Date.UTC(viewYear, viewMonth, d)));
      out.push({ key: iso, label: String(d), iso });
    }
    return out;
  }, [viewYear, viewMonth]);

  const canApply = Boolean(draftStart && draftEnd);

  return (
    <div className="trend-range" ref={rootRef}>
      <button
        type="button"
        className="trend-range-trigger"
        aria-haspopup="listbox"
        aria-expanded={menuOpen || calendarOpen}
        disabled={isPending}
        onClick={() => {
          if (calendarOpen) {
            setCalendarOpen(false);
            return;
          }
          setMenuOpen((v) => !v);
        }}
      >
        <span>{triggerLabel}</span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M4.427 6.427 8 10l3.573-3.573a.25.25 0 0 1 .354.354l-3.75 3.75a.25.25 0 0 1-.354 0l-3.75-3.75a.25.25 0 0 1 .354-.354Z" />
        </svg>
      </button>

      {menuOpen && (
        <div className="trend-range-menu" role="listbox">
          {TREND_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="option"
              aria-selected={activePreset === p.key}
              className={activePreset === p.key ? "active" : undefined}
              onClick={() => selectPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            role="option"
            aria-selected={activePreset === "custom"}
            className={activePreset === "custom" ? "active" : undefined}
            onClick={openCustom}
          >
            Custom range…
          </button>
        </div>
      )}

      {calendarOpen && (
        <div className="trend-calendar" role="dialog" aria-label="Custom date range">
          <div className="trend-calendar-nav">
            <button
              type="button"
              className="secondary"
              aria-label="Previous month"
              onClick={() => {
                const next = addMonths(viewYear, viewMonth, -1);
                setViewYear(next.year);
                setViewMonth(next.month);
              }}
            >
              ‹
            </button>
            <strong>{monthLabel(viewYear, viewMonth)}</strong>
            <button
              type="button"
              className="secondary"
              aria-label="Next month"
              onClick={() => {
                const next = addMonths(viewYear, viewMonth, 1);
                setViewYear(next.year);
                setViewMonth(next.month);
              }}
            >
              ›
            </button>
          </div>

          <div className="trend-calendar-weekdays">
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          <div className="trend-calendar-grid">
            {cells.map((cell) => {
              if (!cell.iso) {
                return <span key={cell.key} className="trend-cal-empty" />;
              }
              const disabled = cell.iso > today;
              const isStart = cell.iso === draftStart;
              const isEnd = cell.iso === draftEnd;
              const mid = inRange(cell.iso, draftStart, draftEnd) && !isStart && !isEnd;
              return (
                <button
                  key={cell.key}
                  type="button"
                  disabled={disabled}
                  className={[
                    "trend-cal-day",
                    isStart || isEnd ? "selected" : "",
                    mid ? "in-range" : "",
                    cell.iso === today ? "today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onDayClick(cell.iso!)}
                >
                  {cell.label}
                </button>
              );
            })}
          </div>

          <div className="trend-calendar-footer">
            <span className="muted" style={{ fontSize: 12 }}>
              {draftStart && draftEnd
                ? `${draftStart} → ${draftEnd}`
                : draftStart
                  ? `${draftStart} → pick end`
                  : "Pick start date"}
            </span>
            <button type="button" disabled={!canApply || isPending} onClick={applyCustom}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
