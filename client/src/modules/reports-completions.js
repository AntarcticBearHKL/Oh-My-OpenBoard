import { escapeHtml } from './security.js';
import { bucketKeyForDate, formatIsoDate, generateTimeSlots, getChartTheme, isoDateOnly, safeDate, startOfWeekMonday } from './reports-utils.js';

// ---------------------------------------------------------------------------
// Data: task completions (generic, granularity-aware)
// ---------------------------------------------------------------------------

export function computeCompletions(tasks, rangeStart, rangeEnd, granularity) {
  const buckets = new Map();

  for (const task of tasks || []) {
    const done = safeDate(task?.doneDate);
    if (!done || done < rangeStart || done > rangeEnd) continue;
    const key = bucketKeyForDate(done, granularity);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  const { keys, labels } = generateTimeSlots(rangeStart, rangeEnd, granularity);
  const completedCounts = keys.map((k) => buckets.get(k) || 0);
  return { labels, completedCounts };
}

// ---------------------------------------------------------------------------
// Data: same-day vs planned completions (granularity-aware)
// ---------------------------------------------------------------------------

export function computeSameDayCompletions(tasks, rangeStart, rangeEnd, granularity) {
  const sameDayBuckets = new Map();
  const plannedBuckets = new Map();

  for (const task of tasks || []) {
    const created = isoDateOnly(task?.creationDate);
    const done = isoDateOnly(task?.doneDate);
    if (!created || !done) continue;

    const doneDate = safeDate(done);
    if (!doneDate || doneDate < rangeStart || doneDate > rangeEnd) continue;

    const key = bucketKeyForDate(doneDate, granularity);
    if (created === done) {
      sameDayBuckets.set(key, (sameDayBuckets.get(key) || 0) + 1);
    } else {
      plannedBuckets.set(key, (plannedBuckets.get(key) || 0) + 1);
    }
  }

  const { keys, labels } = generateTimeSlots(rangeStart, rangeEnd, granularity);
  const sameDayCounts = keys.map((k) => sameDayBuckets.get(k) || 0);
  const plannedCounts = keys.map((k) => plannedBuckets.get(k) || 0);
  const total = sameDayCounts.reduce((s, v) => s + v, 0);

  return { labels, sameDayCounts, plannedCounts, total };
}

// ---------------------------------------------------------------------------
// Data: lead time (weekly only — used for the lead time chart + KPIs)
// ---------------------------------------------------------------------------

function movingAverage(values, windowSize) {
  const w = Math.max(1, Number(windowSize) || 1);
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - w + 1);
    const slice = values.slice(start, i + 1).filter((v) => Number.isFinite(v));
    if (slice.length === 0) {
      out.push(null);
      continue;
    }
    const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
    out.push(Number(avg.toFixed(2)));
  }
  return out;
}

export function computeWeeklyLeadTimeAndCompletions(tasks, rangeStart, rangeEnd) {
  const buckets = new Map();

  for (const task of tasks) {
    const created = safeDate(task?.creationDate);
    const done = safeDate(task?.doneDate);
    if (!created || !done) continue;
    if (done < rangeStart || done > rangeEnd) continue;

    const key = formatIsoDate(startOfWeekMonday(done));
    const leadDays = (done.getTime() - created.getTime()) / (24 * 60 * 60 * 1000);
    if (!Number.isFinite(leadDays) || leadDays < 0) continue;

    const bucket = buckets.get(key) || { count: 0, leadSumDays: 0 };
    bucket.count += 1;
    bucket.leadSumDays += leadDays;
    buckets.set(key, bucket);
  }

  const { keys, labels } = generateTimeSlots(rangeStart, rangeEnd, 'weekly');

  const completedCounts = keys.map((k) => buckets.get(k)?.count || 0);
  const avgLeadDays = keys.map((k) => {
    const b = buckets.get(k);
    if (!b || b.count === 0) return null;
    return Number((b.leadSumDays / b.count).toFixed(2));
  });

  const totalCompleted = completedCounts.reduce((s, v) => s + v, 0);
  const leadDaysAll = avgLeadDays.filter((v) => Number.isFinite(v));
  const avgLeadOverall = leadDaysAll.length
    ? (leadDaysAll.reduce((s, v) => s + v, 0) / leadDaysAll.length)
    : null;

  return {
    labels,
    completedCounts,
    avgLeadDays,
    trendLeadDays: movingAverage(avgLeadDays.map((v) => (v == null ? NaN : v)), 4),
    totalCompleted,
    avgLeadOverall
  };
}

export function buildLeadTimeOption({ labels, avgLeadDays, trendLeadDays, completedCounts }) {
  const maxLead = Math.max(1, ...avgLeadDays.map((v) => (Number.isFinite(v) ? v : 0)));
  const theme = getChartTheme();

  return {
    backgroundColor: 'transparent',
    textStyle: { color: theme.text },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.text },
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [];
        const header = escapeHtml(items[0]?.axisValueLabel || '');
        const byName = new Map(items.map((p) => [p.seriesName, p.value]));
        const avg = byName.get('Avg lead time (days)');
        const trend = byName.get('Trend (4-week MA)');
        const completed = byName.get('Completed');
        const avgText = Number.isFinite(avg) ? `${avg}d` : '—';
        const trendText = Number.isFinite(trend) ? `${trend}d` : '—';
        const completedText = Number.isFinite(completed) ? `${completed}` : '0';
        return `${header}<br/>Completed: ${completedText}<br/>Avg lead time: ${avgText}<br/>Trend: ${trendText}`;
      }
    },
    legend: {
      top: 8,
      textStyle: { color: theme.muted, fontSize: theme.fontSm }
    },
    grid: { left: 40, right: 40, top: 50, bottom: 40 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { interval: 1, rotate: 20, color: theme.muted, fontSize: theme.fontXs },
      axisLine: { lineStyle: { color: theme.borderSubtle } },
      axisTick: { lineStyle: { color: theme.borderSubtle } }
    },
    yAxis: [
      {
        type: 'value',
        name: 'Days',
        min: 0,
        max: Math.ceil(maxLead),
        nameTextStyle: { color: theme.muted, fontSize: theme.fontXs },
        axisLabel: { color: theme.muted, fontSize: theme.fontXs },
        axisLine: { lineStyle: { color: theme.borderSubtle } },
        axisTick: { lineStyle: { color: theme.borderSubtle } },
        splitLine: { lineStyle: { color: theme.borderSubtle } }
      },
      {
        type: 'value',
        name: 'Completed',
        min: 0,
        nameTextStyle: { color: theme.muted, fontSize: theme.fontXs },
        axisLabel: { formatter: '{value}', color: theme.muted, fontSize: theme.fontXs },
        axisLine: { lineStyle: { color: theme.borderSubtle } },
        axisTick: { lineStyle: { color: theme.borderSubtle } },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: 'Completed',
        type: 'bar',
        data: completedCounts,
        itemStyle: { color: '#3b82f6' },
        yAxisIndex: 1
      },
      {
        name: 'Avg lead time (days)',
        type: 'line',
        data: avgLeadDays.map((v) => (v == null ? null : v)),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 3, color: '#16a34a' },
        itemStyle: { color: '#16a34a' },
        yAxisIndex: 0
      },
      {
        name: 'Trend (4-week MA)',
        type: 'line',
        data: trendLeadDays.map((v) => (v == null ? null : v)),
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, type: 'dashed', color: '#6b7280' },
        itemStyle: { color: '#6b7280' },
        yAxisIndex: 0
      }
    ]
  };
}
