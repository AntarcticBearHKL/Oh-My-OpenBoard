import { renderIcons } from './icons.js';
import { initializeThemeToggle } from './theme.js';
import { escapeHtml } from './security.js';
import {
  initStorage,
  ensureBoardsInitialized,
  getActiveBoardName,
  listBoards,
  loadColumnsForBoard,
  loadTasksForBoard
} from './storage.js';
import { isDoneColumn } from './constants.js';

function safeDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function pointsOf(task) {
  return Number.isFinite(task?.estimate) ? task.estimate : 0;
}

function iterationRows() {
  return listBoards().map((board) => {
    const tasks = loadTasksForBoard(board.id);
    const columns = loadColumnsForBoard(board.id);
    const doneColumnId = (columns.find(isDoneColumn) || {}).id || '';
    const doneTasks = tasks.filter((task) => task.column === doneColumnId);
    const dates = [];
    for (const task of tasks) {
      const created = safeDate(task.creationDate);
      const done = safeDate(task.doneDate);
      if (created) dates.push(created.getTime());
      if (done) dates.push(done.getTime());
    }
    const start = safeDate(board.startDate) || (dates.length ? new Date(Math.min(...dates)) : null);
    const end = safeDate(board.endDate) || (dates.length ? new Date(Math.max(...dates)) : null);
    return {
      id: board.id,
      name: board.name || 'Board',
      goal: board.goal || '',
      start,
      end,
      tasks: tasks.length,
      doneTasks: doneTasks.length,
      points: tasks.reduce((sum, task) => sum + pointsOf(task), 0),
      donePoints: doneTasks.reduce((sum, task) => sum + pointsOf(task), 0)
    };
  });
}

function renderTimeline(rows, min, max, span) {
  const listEl = document.getElementById('roadmap-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  for (const row of rows) {
    const startMs = (row.start || row.end).getTime();
    const endMs = (row.end || row.start).getTime();
    const left = ((startMs - min) / span) * 100;
    const width = Math.max(3, ((endMs - startMs) / span) * 100);

    const name = document.createElement('div');
    name.className = 'roadmap-name';
    name.textContent = row.name;

    const bar = document.createElement('div');
    bar.className = 'roadmap-bar';
    bar.style.left = `${left}%`;
    bar.style.width = `${width}%`;
    bar.textContent = row.donePoints ? `${row.donePoints}/${row.points}` : '';
    bar.title = `${row.name}: ${row.start ? formatDay(row.start) : '?'} → ${row.end ? formatDay(row.end) : '?'}`;

    const track = document.createElement('div');
    track.className = 'roadmap-track';
    track.appendChild(bar);

    const meta = document.createElement('div');
    meta.className = 'roadmap-meta';
    meta.textContent = `${row.doneTasks}/${row.tasks} done · ${row.donePoints}/${row.points} pts`;

    const line = document.createElement('div');
    line.className = 'roadmap-row';
    line.setAttribute('role', 'listitem');
    line.append(name, track, meta);
    listEl.appendChild(line);
  }
}

function renderTable(rows) {
  const tableEl = document.getElementById('roadmap-table');
  if (!tableEl) return;
  const header = '<div class="roadmap-cell roadmap-cell--head">Iteration</div>'
    + '<div class="roadmap-cell roadmap-cell--head">Start</div>'
    + '<div class="roadmap-cell roadmap-cell--head">End</div>'
    + '<div class="roadmap-cell roadmap-cell--head">Goal</div>'
    + '<div class="roadmap-cell roadmap-cell--head">Tasks</div>'
    + '<div class="roadmap-cell roadmap-cell--head">Points</div>';
  const body = rows.map((row) => (
    `<div class="roadmap-cell">${escapeHtml(row.name)}</div>`
    + `<div class="roadmap-cell">${row.start ? formatDay(row.start) : '–'}</div>`
    + `<div class="roadmap-cell">${row.end ? formatDay(row.end) : '–'}</div>`
    + `<div class="roadmap-cell">${escapeHtml(row.goal || '–')}</div>`
    + `<div class="roadmap-cell">${row.doneTasks}/${row.tasks}</div>`
    + `<div class="roadmap-cell">${row.donePoints}/${row.points}</div>`
  )).join('');
  tableEl.innerHTML = header + body;
}

function render() {
  const rows = iterationRows().filter((row) => row.start || row.end);
  const countEl = document.getElementById('roadmap-count');
  if (countEl) countEl.textContent = String(rows.length);

  if (rows.length === 0) {
    const listEl = document.getElementById('roadmap-list');
    if (listEl) listEl.innerHTML = '<div class="roadmap-empty">No iterations with dates yet.</div>';
    renderTable([]);
    return;
  }

  const min = Math.min(...rows.map((row) => (row.start || row.end).getTime()));
  const max = Math.max(...rows.map((row) => (row.end || row.start).getTime()));
  const span = Math.max(1, max - min);

  const rangeEl = document.getElementById('roadmap-range-label');
  if (rangeEl) rangeEl.textContent = `${formatDay(new Date(min))}  →  ${formatDay(new Date(max))}`;

  renderTimeline(rows, min, max, span);
  renderTable(rows);
}

function main() {
  initializeThemeToggle();
  ensureBoardsInitialized();
  renderIcons();

  const badge = document.getElementById('roadmap-board-badge');
  const boardName = getActiveBoardName();
  if (badge) badge.textContent = (boardName || 'Board').slice(0, 2).toUpperCase();

  render();
}

initStorage().then(main).catch((err) => {
  console.error('[OpenAgile] Failed to initialise storage for roadmap:', err);
  main();
});
