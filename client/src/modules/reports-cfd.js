import { isDoneColumn } from './constants.js';
import { isHexColor } from './normalize.js';
import { escapeHtml } from './security.js';
import { eachDayInclusive, formatIsoDate, getChartTheme, hexToRgba, safeDate } from './reports-utils.js';

// ---------------------------------------------------------------------------
// Data + chart: Cumulative Flow Diagram
// ---------------------------------------------------------------------------

function sortColumnsForCfd(columns) {
  const list = Array.isArray(columns) ? columns.slice() : [];
  const done = list.find((c) => isDoneColumn(c)) || null;
  const others = list.filter((c) => c?.id && !isDoneColumn(c));

  const indexed = others.map((c, idx) => ({ c, idx }));
  indexed.sort((a, b) => {
    const ao = Number.isFinite(a.c?.order) ? a.c.order : null;
    const bo = Number.isFinite(b.c?.order) ? b.c.order : null;
    if (ao != null && bo != null && ao !== bo) return ao - bo;
    if (ao != null && bo == null) return -1;
    if (ao == null && bo != null) return 1;
    return a.idx - b.idx;
  });

  const sorted = indexed.map((x) => x.c);
  if (done) sorted.push(done);
  return sorted;
}

function normalizeTaskColumnHistory(task) {
  const raw = task?.columnHistory;
  const entries = Array.isArray(raw) ? raw : [];
  const cleaned = entries
    .map((e) => {
      const column = typeof e?.column === 'string' ? e.column.trim() : '';
      const at = safeDate(e?.at);
      if (!column || !at) return null;
      return { column, at };
    })
    .filter(Boolean)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  if (cleaned.length > 0) return cleaned;

  const fallbackAt = safeDate(task?.creationDate) || safeDate(task?.changeDate) || safeDate(task?.doneDate);
  const fallbackColumn = typeof task?.column === 'string' ? task.column.trim() : '';
  if (!fallbackAt || !fallbackColumn) return [];
  return [{ column: fallbackColumn, at: fallbackAt }];
}

export function computeCumulativeFlow({ tasks, columns, rangeStart, rangeEnd, includeDone }) {
  const days = eachDayInclusive(rangeStart, rangeEnd);
  const dayEnds = days.map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999));
  const labels = days.map((d) => formatIsoDate(d));

  const countsByColumnId = new Map();
  const doneColumnIds = new Set((Array.isArray(columns) ? columns : []).filter((column) => isDoneColumn(column)).map((column) => column.id));
  const ensureSeries = (columnId) => {
    if (!countsByColumnId.has(columnId)) {
      countsByColumnId.set(columnId, new Array(labels.length).fill(0));
    }
    return countsByColumnId.get(columnId);
  };

  for (const task of tasks || []) {
    const history = normalizeTaskColumnHistory(task);
    if (!history.length) continue;

    let currentColumn = null;
    let eventIndex = -1;

    for (let dayIndex = 0; dayIndex < dayEnds.length; dayIndex++) {
      const dayEnd = dayEnds[dayIndex];
      while (eventIndex + 1 < history.length && history[eventIndex + 1].at <= dayEnd) {
        eventIndex += 1;
        currentColumn = history[eventIndex].column;
      }

      if (!currentColumn) continue;
      if (!includeDone && (doneColumnIds.has(currentColumn) || currentColumn === 'done')) continue;

      const series = ensureSeries(currentColumn);
      series[dayIndex] += 1;
    }
  }

  const sortedColumns = sortColumnsForCfd(columns);
  const columnById = new Map(sortedColumns.map((c) => [c.id, c]));

  const orderedIds = sortedColumns.map((c) => c.id);
  for (const id of countsByColumnId.keys()) {
    if (!orderedIds.includes(id)) orderedIds.push(id);
  }

  const seriesDefs = orderedIds
    .filter((id) => includeDone || (!doneColumnIds.has(id) && id !== 'done'))
    .map((id) => {
      const c = columnById.get(id);
      const name = typeof c?.name === 'string' && c.name.trim() ? c.name.trim() : ((doneColumnIds.has(id) || id === 'done') ? 'Done' : id);
      const color = isHexColor(c?.color) ? c.color.trim() : '#3b82f6';
      const data = countsByColumnId.get(id) || new Array(labels.length).fill(0);
      return { id, name, color, data };
    });

  return { labels, seriesDefs };
}

export function buildCfdOption({ labels, seriesDefs, boardName }) {
  const plotSeries = Array.isArray(seriesDefs) ? seriesDefs.slice().reverse() : [];
  const maxY = seriesDefs.length
    ? Math.max(1, ...labels.map((_, i) => seriesDefs.reduce((s, series) => s + (series.data[i] || 0), 0)))
    : 1;

  const theme = getChartTheme();

  return {
    backgroundColor: 'transparent',
    textStyle: { color: theme.text },
    title: {
      top: 12,
      left: 'center',
      text: `Cumulative flow — ${boardName}`,
      textStyle: { color: theme.text, fontSize: theme.fontMd, fontWeight: 600 }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.text },
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [];
        const date = escapeHtml(items[0]?.axisValueLabel || '');
        const lines = [`${date}`];
        let total = 0;
        for (const p of items) {
          const v = Number(p?.value) || 0;
          total += v;
          lines.push(`${escapeHtml(p?.seriesName || '')}: ${v}`);
        }
        lines.push(`<span style="opacity:.7">Total: ${total}</span>`);
        return lines.join('<br/>');
      }
    },
    legend: {
      top: 40,
      type: 'scroll',
      textStyle: { color: theme.muted, fontSize: theme.fontSm }
    },
    grid: { left: 40, right: 20, top: 80, bottom: 45 },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLabel: { hideOverlap: true, color: theme.muted, fontSize: theme.fontXs },
      axisLine: { lineStyle: { color: theme.borderSubtle } },
      axisTick: { lineStyle: { color: theme.borderSubtle } }
    },
    yAxis: {
      type: 'value',
      name: 'Tasks',
      min: 0,
      max: Math.ceil(maxY),
      nameTextStyle: { color: theme.muted, fontSize: theme.fontXs },
      axisLabel: { color: theme.muted, fontSize: theme.fontXs },
      axisLine: { lineStyle: { color: theme.borderSubtle } },
      axisTick: { lineStyle: { color: theme.borderSubtle } },
      splitLine: { lineStyle: { color: theme.borderSubtle } }
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'none' }
    ],
    series: plotSeries.map((s) => ({
      name: s.name,
      type: 'line',
      stack: 'total',
      symbol: 'none',
      data: s.data,
      lineStyle: { width: 1.5, color: s.color },
      itemStyle: { color: s.color },
      areaStyle: { color: hexToRgba(s.color, 0.28) },
      emphasis: { focus: 'series' }
    }))
  };
}
