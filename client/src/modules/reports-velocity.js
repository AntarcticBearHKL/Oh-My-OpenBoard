import { isDoneColumn } from './constants.js';
import { loadColumnsForBoard, loadTasksForBoard } from './storage.js';
import { addDays, eachDayInclusive, formatIsoDate, getChartTheme, hexToRgba, safeDate } from './reports-utils.js';

function resolveDoneColumnId(columns) {
  const done = (Array.isArray(columns) ? columns : []).find((column) => isDoneColumn(column));
  return done?.id || 'done';
}

function taskPoints(task) {
  return Number.isFinite(task?.estimate) ? task.estimate : 0;
}

export function computeVelocityRows(boards) {
  return (Array.isArray(boards) ? boards : []).map((board) => {
    const tasks = loadTasksForBoard(board.id);
    const doneId = resolveDoneColumnId(loadColumnsForBoard(board.id));
    const done = tasks.filter((task) => task.column === doneId && task.doneDate);
    return {
      name: (board.name || 'Board').toString(),
      completedPoints: done.reduce((sum, task) => sum + taskPoints(task), 0),
      totalPoints: tasks.reduce((sum, task) => sum + taskPoints(task), 0),
      completedTasks: done.length
    };
  });
}

export function computeBurndownSeries(tasks, columns, days, iteration) {
  const end = iteration?.end ? new Date(iteration.end) : new Date();
  end.setHours(23, 59, 59, 999);
  const start = iteration?.start ? new Date(iteration.start) : addDays(end, -(days - 1));
  start.setHours(0, 0, 0, 0);

  const rows = eachDayInclusive(start, end).slice(-120).map((day) => {
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
    const remaining = (tasks || [])
      .filter((task) => (!task.creationDate || safeDate(task.creationDate) <= dayEnd) && (!task.doneDate || safeDate(task.doneDate) > dayEnd))
      .reduce((sum, task) => sum + taskPoints(task), 0);
    return { date: formatIsoDate(day), remaining };
  });

  const scope = (tasks || []).reduce((sum, task) => sum + taskPoints(task), 0);
  const ideal = rows.map((_, index) => (rows.length > 1 ? Number((scope * (1 - index / (rows.length - 1))).toFixed(1)) : scope));
  return { labels: rows.map((row) => row.date), remaining: rows.map((row) => row.remaining), ideal };
}

export function computeCycleDistribution(tasks, columns) {
  const doneId = resolveDoneColumnId(columns);
  const edges = [1, 2, 3, 5, 8, 13, 21];
  const labels = ['<1', '1-2', '2-3', '3-5', '5-8', '8-13', '13-21', '21+'];
  const counts = new Array(labels.length).fill(0);
  const values = [];

  for (const task of tasks || []) {
    if (task.column !== doneId || !task.doneDate) continue;
    const doneAt = safeDate(task.doneDate);
    if (!doneAt) continue;
    const history = Array.isArray(task.columnHistory) ? task.columnHistory : [];
    const firstWorking = history.find((entry) => entry?.column && entry.column !== doneId && safeDate(entry.at));
    const startedAt = firstWorking ? safeDate(firstWorking.at) : safeDate(task.creationDate);
    if (!startedAt) continue;
    const days = (doneAt - startedAt) / 86400000;
    if (!Number.isFinite(days) || days < 0) continue;
    values.push(days);
    let bucket = edges.findIndex((edge) => days < edge);
    if (bucket === -1) bucket = labels.length - 1;
    counts[bucket] += 1;
  }

  const sorted = values.slice().sort((a, b) => a - b);
  const round = (n) => Math.round(n * 10) / 10;
  const stats = sorted.length
    ? {
        count: sorted.length,
        avg: round(sorted.reduce((sum, n) => sum + n, 0) / sorted.length),
        median: round(sorted[Math.floor(sorted.length / 2)]),
        p90: round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))])
      }
    : { count: 0, avg: 0, median: 0, p90: 0 };

  return { labels, counts, stats };
}

export function buildBurndownOption({ labels, remaining, ideal }) {
  const theme = getChartTheme();
  return {
    backgroundColor: 'transparent',
    textStyle: { color: theme.text },
    legend: { top: 0, textStyle: { color: theme.muted, fontSize: theme.fontSm } },
    grid: { left: 44, right: 20, top: 30, bottom: 40 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.text }
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { hideOverlap: true, color: theme.muted, fontSize: theme.fontXs },
      axisLine: { lineStyle: { color: theme.borderSubtle } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: 'Points',
      min: 0,
      nameTextStyle: { color: theme.muted, fontSize: theme.fontXs },
      axisLabel: { color: theme.muted, fontSize: theme.fontXs },
      axisLine: { lineStyle: { color: theme.borderSubtle } },
      splitLine: { lineStyle: { color: theme.borderSubtle } }
    },
    series: [
      {
        name: 'Remaining',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: remaining,
        lineStyle: { width: 2.5, color: '#3b82f6' },
        itemStyle: { color: '#3b82f6' },
        areaStyle: { color: hexToRgba('#3b82f6', 0.15) }
      },
      {
        name: 'Ideal',
        type: 'line',
        symbol: 'none',
        data: ideal,
        lineStyle: { width: 2, type: 'dashed', color: '#9ca3af' },
        itemStyle: { color: '#9ca3af' }
      }
    ]
  };
}
