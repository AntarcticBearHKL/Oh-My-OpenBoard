import * as echarts from 'echarts/core';
import { renderIcons } from './icons.js';
import { initializeThemeToggle } from './theme.js';
import { ensureBoardsInitialized, getActiveBoardId, getActiveBoardName, getBoardById, listBoards, loadColumns, loadTasks } from './storage.js';
import { addDays, buildBarChartOption } from './reports-utils.js';
import { buildDailyUpdatesOption, computeDailyUpdateCounts } from './reports-daily.js';
import { buildLeadTimeOption, computeCompletions, computeSameDayCompletions, computeWeeklyLeadTimeAndCompletions } from './reports-completions.js';
import { buildCfdOption, computeCumulativeFlow } from './reports-cfd.js';
import { buildBurndownOption, computeBurndownSeries, computeCycleDistribution, computeVelocityRows } from './reports-velocity.js';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function main() {
  initializeThemeToggle();
  ensureBoardsInitialized();
  renderIcons();

  const boardName = getActiveBoardName();
  const boardId = getActiveBoardId();
  const displayName = boardName || (boardId || 'Active board');

  const badge = document.getElementById('reports-board-badge');
  if (badge) badge.textContent = (boardName || 'Board').slice(0, 2).toUpperCase();

  const tasks = loadTasks();
  const columns = loadColumns();

  // Collect all chart instances for a single resize handler
  const charts = [];

  // --- Daily updates (last 365 days) ---
  const dailyEnd = new Date();
  const dailyStart = addDays(dailyEnd, -364);

  const daily = computeDailyUpdateCounts(tasks, dailyStart, dailyEnd);
  const dailyDom = document.getElementById('reports-chart');
  if (dailyDom) {
    const dailyChart = echarts.init(dailyDom);
    dailyChart.setOption(buildDailyUpdatesOption({
      rangeStart: dailyStart,
      rangeEnd: dailyEnd,
      data: daily.data,
      maxValue: daily.max,
      boardName: displayName
    }));
    charts.push(dailyChart);
  }

  // --- 12-week range (shared by completion, same-day, and lead time) ---
  const now = new Date();
  const endWeekRange = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startWeekRange = addDays(endWeekRange, -7 * 11);

  // --- Lead time + KPIs (weekly only) ---
  const weekly = computeWeeklyLeadTimeAndCompletions(tasks, startWeekRange, endWeekRange);

  const setTextById = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setTextById('reports-completed-this-week', String(weekly.completedCounts[weekly.completedCounts.length - 1] || 0));
  setTextById('reports-completed-last-week', String(weekly.completedCounts[weekly.completedCounts.length - 2] || 0));
  setTextById('reports-avg-leadtime-12w', Number.isFinite(weekly.avgLeadOverall) ? `${weekly.avgLeadOverall.toFixed(1)}d` : '–');
  setTextById('reports-completion-badge', String(weekly.totalCompleted));
  setTextById('reports-leadtime-badge', String(weekly.totalCompleted));

  // --- Task completion chart (dynamic granularity) ---
  const sparkDom = document.getElementById('reports-completed-spark');
  const completionGranularityEl = document.getElementById('reports-completion-granularity');
  if (sparkDom) {
    const spark = echarts.init(sparkDom);
    charts.push(spark);

    const updateCompletionChart = () => {
      const granularity = completionGranularityEl?.value || 'weekly';
      const data = computeCompletions(tasks, startWeekRange, endWeekRange, granularity);
      spark.setOption(buildBarChartOption({
        labels: data.labels,
        seriesList: [{ data: data.completedCounts, color: '#3b82f6' }],
        granularity,
        legend: false
      }), true);
    };

    updateCompletionChart();
    completionGranularityEl?.addEventListener('change', updateCompletionChart);
  }

  // --- Same-day completions (dynamic granularity) ---
  const sameDayWeekly = computeSameDayCompletions(tasks, startWeekRange, endWeekRange, 'weekly');

  setTextById('reports-sameday-this-week', String(sameDayWeekly.sameDayCounts[sameDayWeekly.sameDayCounts.length - 1] || 0));
  setTextById('reports-sameday-last-week', String(sameDayWeekly.sameDayCounts[sameDayWeekly.sameDayCounts.length - 2] || 0));
  setTextById('reports-sameday-avg', sameDayWeekly.sameDayCounts.length
    ? (sameDayWeekly.total / sameDayWeekly.sameDayCounts.length).toFixed(1)
    : '–');
  setTextById('reports-sameday-badge', String(sameDayWeekly.total));

  const sdSparkDom = document.getElementById('reports-sameday-spark');
  const sdGranularityEl = document.getElementById('reports-sameday-granularity');
  if (sdSparkDom) {
    const sdSpark = echarts.init(sdSparkDom);
    charts.push(sdSpark);

    const updateSameDayChart = () => {
      const granularity = sdGranularityEl?.value || 'weekly';
      const data = computeSameDayCompletions(tasks, startWeekRange, endWeekRange, granularity);
      sdSpark.setOption(buildBarChartOption({
        labels: data.labels,
        seriesList: [
          { name: 'Same-day', data: data.sameDayCounts, color: '#f59e0b' },
          { name: 'Planned', data: data.plannedCounts, color: '#3b82f6' }
        ],
        granularity,
        legend: true
      }), true);
    };

    updateSameDayChart();
    sdGranularityEl?.addEventListener('change', updateSameDayChart);
  }

  // --- Lead time chart ---
  const leadDom = document.getElementById('reports-leadtime-chart');
  if (leadDom) {
    const leadChart = echarts.init(leadDom);
    leadChart.setOption(buildLeadTimeOption({
      labels: weekly.labels,
      avgLeadDays: weekly.avgLeadDays,
      trendLeadDays: weekly.trendLeadDays,
      completedCounts: weekly.completedCounts
    }));
    charts.push(leadChart);
  }

  // --- Cumulative Flow Diagram ---
  const cfdDom = document.getElementById('reports-cfd-chart');
  const cfdRangeEl = document.getElementById('reports-cfd-range');
  const cfdIncludeDoneEl = document.getElementById('reports-cfd-include-done');
  if (cfdDom) {
    const cfdChart = echarts.init(cfdDom);
    charts.push(cfdChart);

    const updateCfd = () => {
      const rangeDaysRaw = Number.parseInt((cfdRangeEl?.value ?? '90').toString(), 10);
      const rangeDays = Number.isFinite(rangeDaysRaw) ? Math.min(365, Math.max(7, rangeDaysRaw)) : 90;
      const includeDone = cfdIncludeDoneEl ? cfdIncludeDoneEl.checked === true : true;

      const cfdEnd = new Date();
      const cfdStart = addDays(cfdEnd, -(rangeDays - 1));

      const { labels, seriesDefs } = computeCumulativeFlow({
        tasks,
        columns,
        rangeStart: cfdStart,
        rangeEnd: cfdEnd,
        includeDone
      });

      cfdChart.setOption(buildCfdOption({ labels, seriesDefs, boardName: displayName }), true);
    };

    updateCfd();
    cfdRangeEl?.addEventListener('change', updateCfd);
    cfdIncludeDoneEl?.addEventListener('change', updateCfd);
  }

  const velocityRows = computeVelocityRows(listBoards());
  const velocityPoints = velocityRows.map((row) => row.completedPoints);
  const velocityAvg = velocityPoints.length
    ? velocityPoints.reduce((sum, value) => sum + value, 0) / velocityPoints.length
    : 0;
  setTextById('reports-velocity-avg', velocityPoints.length ? velocityAvg.toFixed(1) : '–');
  setTextById('reports-velocity-last', velocityPoints.length ? String(velocityPoints[velocityPoints.length - 1]) : '–');
  setTextById('reports-velocity-count', String(velocityRows.length));
  setTextById('reports-velocity-badge', String(velocityRows.length));

  const velocityDom = document.getElementById('reports-velocity-chart');
  if (velocityDom) {
    const velocityChart = echarts.init(velocityDom);
    velocityChart.setOption(buildBarChartOption({
      labels: velocityRows.map((row) => row.name),
      seriesList: [{ name: 'Completed points', data: velocityPoints, color: '#3b82f6' }],
      granularity: 'weekly',
      legend: false,
      yName: 'Points'
    }));
    charts.push(velocityChart);
  }

  const burndownDom = document.getElementById('reports-burndown-chart');
  const burndownRangeEl = document.getElementById('reports-burndown-range');
  const activeBoard = getBoardById(boardId);
  const iterationWindow = activeBoard?.startDate && activeBoard?.endDate
    ? { start: activeBoard.startDate, end: activeBoard.endDate }
    : null;
  if (burndownDom) {
    const burndownChart = echarts.init(burndownDom);
    charts.push(burndownChart);

    const updateBurndown = () => {
      const raw = Number.parseInt((burndownRangeEl?.value ?? '30').toString(), 10);
      const days = Number.isFinite(raw) ? Math.min(365, Math.max(7, raw)) : 30;
      const data = computeBurndownSeries(tasks, columns, days, iterationWindow);
      burndownChart.setOption(buildBurndownOption(data), true);
      setTextById('reports-burndown-badge', String(data.remaining[data.remaining.length - 1] ?? 0));
    };

    updateBurndown();
    burndownRangeEl?.addEventListener('change', updateBurndown);
  }

  const cycle = computeCycleDistribution(tasks, columns);
  setTextById('reports-cycle-median', cycle.stats.count ? `${cycle.stats.median}d` : '–');
  setTextById('reports-cycle-avg', cycle.stats.count ? `${cycle.stats.avg}d` : '–');
  setTextById('reports-cycle-p90', cycle.stats.count ? `${cycle.stats.p90}d` : '–');
  setTextById('reports-cycle-badge', String(cycle.stats.count));

  const cycleDom = document.getElementById('reports-cycle-chart');
  if (cycleDom) {
    const cycleChart = echarts.init(cycleDom);
    cycleChart.setOption(buildBarChartOption({
      labels: cycle.labels,
      seriesList: [{ name: 'Completed tasks', data: cycle.counts, color: '#8b5cf6' }],
      granularity: 'weekly',
      legend: false,
      yName: 'Tasks'
    }));
    charts.push(cycleChart);
  }

  // Single resize handler for all charts
  window.addEventListener('resize', () => {
    for (const chart of charts) chart.resize();
  });
}
