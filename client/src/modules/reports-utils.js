import { isHexColor } from './normalize.js';

// ---------------------------------------------------------------------------
// Theme helpers
// ---------------------------------------------------------------------------

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function cssVarPx(name, fallback) {
  const parsed = Number.parseFloat(cssVar(name, `${fallback}px`));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getChartTheme() {
  return {
    text: cssVar('--text', '#111827'),
    muted: cssVar('--text-muted', '#6b7280'),
    border: cssVar('--border', '#d1d5db'),
    borderSubtle: cssVar('--border-subtle', '#e5e7eb'),
    surface: cssVar('--surface', '#ffffff'),
    fontXs: cssVarPx('--text-xs', 11),
    fontSm: cssVarPx('--text-sm', 12),
    fontMd: cssVarPx('--text-md', 13)
  };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function isoDateOnly(value) {
  const s = (value || '').toString().trim();
  if (!s) return '';
  if (s.length >= 10) return s.slice(0, 10);
  return '';
}

export function formatIsoDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatShortDate(d) {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMonthLabel(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function safeDate(value) {
  const raw = (value || '').toString().trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfWeekMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const delta = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - delta);
  return d;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function eachDayInclusive(start, end) {
  const days = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (d <= last) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function eachWeekStartInclusive(rangeStart, rangeEnd) {
  const weeks = [];
  const d = new Date(startOfWeekMonday(rangeStart));
  const end = startOfWeekMonday(rangeEnd);
  while (d <= end) {
    weeks.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

function eachMonthInclusive(rangeStart, rangeEnd) {
  const months = [];
  const d = startOfMonth(rangeStart);
  const last = startOfMonth(rangeEnd);
  while (d <= last) {
    months.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

// ---------------------------------------------------------------------------
// Shared granularity bucketing
// ---------------------------------------------------------------------------

export function bucketKeyForDate(date, granularity) {
  if (granularity === 'daily') return formatIsoDate(date);
  if (granularity === 'monthly') return formatMonthLabel(date);
  return formatIsoDate(startOfWeekMonday(date));
}

export function generateTimeSlots(rangeStart, rangeEnd, granularity) {
  if (granularity === 'daily') {
    const days = eachDayInclusive(rangeStart, rangeEnd);
    return { keys: days.map(formatIsoDate), labels: days.map(formatShortDate) };
  }
  if (granularity === 'monthly') {
    const months = eachMonthInclusive(rangeStart, rangeEnd);
    const keys = months.map(formatMonthLabel);
    return { keys, labels: keys };
  }
  const weekStarts = eachWeekStartInclusive(rangeStart, rangeEnd);
  return {
    keys: weekStarts.map(formatIsoDate),
    labels: weekStarts.map((ws) => `${formatShortDate(ws)} → ${formatShortDate(addDays(ws, 6))}`)
  };
}

// ---------------------------------------------------------------------------
// Shared bar chart builder
// ---------------------------------------------------------------------------

export function buildBarChartOption({ labels, seriesList, granularity, legend, yName = 'Tasks' }) {
  const theme = getChartTheme();
  const showBarLabels = granularity !== 'daily';
  const barLabel = showBarLabels
    ? { show: true, position: 'top', fontSize: theme.fontXs, color: theme.text, formatter: (p) => p.value > 0 ? String(p.value) : '' }
    : { show: false };

  return {
    backgroundColor: 'transparent',
    grid: { left: 40, right: 40, top: legend ? 30 : 8, bottom: 32 },
    legend: legend
      ? { top: 0, textStyle: { color: theme.muted, fontSize: theme.fontSm } }
      : undefined,
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { show: true, fontSize: theme.fontXs, color: theme.muted, rotate: 30, hideOverlap: true },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: yName,
      min: 0,
      nameTextStyle: { color: theme.muted, fontSize: theme.fontXs },
      axisLabel: { color: theme.muted, fontSize: theme.fontXs },
      axisLine: { lineStyle: { color: theme.borderSubtle } },
      axisTick: { lineStyle: { color: theme.borderSubtle } },
      splitLine: { lineStyle: { color: theme.borderSubtle } }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.text }
    },
    dataZoom: granularity === 'daily'
      ? [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }]
      : [],
    series: seriesList.map((s) => ({
      name: s.name,
      type: 'bar',
      data: s.data,
      itemStyle: { color: s.color, borderRadius: [2, 2, 0, 0] },
      label: barLabel
    }))
  };
}

export function hexToRgba(hex, alpha) {
  const a = Math.max(0, Math.min(1, Number(alpha)));
  if (!isHexColor(hex)) return `rgba(59,130,246,${a})`;
  const raw = hex.trim().slice(1);
  const full = raw.length === 3
    ? raw.split('').map((c) => c + c).join('')
    : raw;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
