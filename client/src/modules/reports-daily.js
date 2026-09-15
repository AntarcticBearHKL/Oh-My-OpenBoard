import { escapeHtml } from './security.js';
import { eachDayInclusive, formatIsoDate, getChartTheme, isoDateOnly } from './reports-utils.js';

// ---------------------------------------------------------------------------
// Data: daily update heatmap
// ---------------------------------------------------------------------------

export function computeDailyUpdateCounts(tasks, startDate, endDate) {
  const counts = new Map();

  for (const task of tasks || []) {
    const day = isoDateOnly(task?.changeDate);
    if (!day) continue;
    counts.set(day, (counts.get(day) || 0) + 1);
  }

  const allDays = eachDayInclusive(startDate, endDate);
  const data = allDays.map((d) => {
    const key = formatIsoDate(d);
    return [key, counts.get(key) || 0];
  });

  const max = data.reduce((m, [, v]) => Math.max(m, Number(v) || 0), 0);
  return { data, max };
}

export function buildDailyUpdatesOption({ rangeStart, rangeEnd, data, maxValue, boardName }) {
  const max = Math.max(1, maxValue || 0);
  const theme = getChartTheme();

  return {
    backgroundColor: 'transparent',
    textStyle: { color: theme.text },
    title: {
      top: 20,
      left: 'center',
      text: `Daily updates — ${boardName}`,
      textStyle: { color: theme.text, fontSize: theme.fontMd, fontWeight: 600 }
    },
    tooltip: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.text },
      formatter: (params) => {
        const date = escapeHtml(params?.value?.[0] || '');
        const value = params?.value?.[1] ?? 0;
        return `${date}: ${value} update${value === 1 ? '' : 's'}`;
      }
    },
    visualMap: {
      min: 0,
      max,
      type: 'piecewise',
      orient: 'horizontal',
      left: 'center',
      top: 55,
      textStyle: { color: theme.muted, fontSize: theme.fontXs }
    },
    calendar: {
      top: 110,
      left: 30,
      right: 30,
      cellSize: ['auto', 14],
      range: [formatIsoDate(rangeStart), formatIsoDate(rangeEnd)],
      itemStyle: {
        borderWidth: 0.5,
        borderColor: theme.borderSubtle
      },
      dayLabel: { color: theme.muted, fontSize: theme.fontXs },
      monthLabel: { color: theme.text, fontSize: theme.fontXs },
      yearLabel: { show: false }
    },
    series: {
      type: 'heatmap',
      coordinateSystem: 'calendar',
      data
    }
  };
}
