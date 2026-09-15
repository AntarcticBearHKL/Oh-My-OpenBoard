import { renderIcons } from './icons.js';
import { initializeThemeToggle } from './theme.js';
import { initStorage, ensureBoardsInitialized, getActiveBoardId, getActiveBoardName, loadTasks } from './storage.js';
import {
  formatIsoDate, formatMonthKey, formatMonthLabel, eachDayInclusive, weekdayIndexMonday0,
  startOfMonth, endOfMonth, extractTaskTitle, isTaskOverdue, groupTasksByDueDateForMonth
} from './calendar-utils.js';

function renderDueDateCalendar({ tasks, monthDate, boardId }) {
  const calendarEl = document.getElementById('calendar-grid');
  const monthLabelEl = document.getElementById('calendar-month-label');
  const listTitleEl = document.getElementById('calendar-list-title');
  const listEl = document.getElementById('calendar-list');
  if (!calendarEl || !monthLabelEl || !listTitleEl || !listEl) return;

  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);

  const todayIso = formatIsoDate(new Date());
  const { tasksByDate, overdueCountByDate } = groupTasksByDueDateForMonth(tasks, monthDate, todayIso);
  const monthKey = formatMonthKey(monthDate);

  const selectedDefault = todayIso.startsWith(monthKey)
    ? todayIso
    : formatIsoDate(monthStart);

  let selectedIso = selectedDefault;

  const renderSelectedList = () => {
    const items = (tasksByDate.get(selectedIso) || []).slice();
    items.sort((a, b) => extractTaskTitle(a).localeCompare(extractTaskTitle(b)));

    listTitleEl.textContent = `Tasks due ${selectedIso} (${items.length})`;
    listEl.textContent = '';

    if (items.length === 0) {
      const li = document.createElement('li');
      li.className = 'rpt-due-empty';
      li.textContent = 'No tasks due.';
      listEl.appendChild(li);
      return;
    }

    for (const task of items) {
      const li = document.createElement('li');
      li.className = 'rpt-due-item';

      const overdue = isTaskOverdue(task, todayIso);
      if (overdue) li.classList.add('is-overdue');

      const a = document.createElement('a');
      a.className = 'rpt-due-tasklink';
      if (overdue) a.classList.add('is-overdue');
      const id = (task?.id || '').toString();
      const bid = (boardId || '').toString();
      const qs = new URLSearchParams();
      qs.set('openTaskId', id);
      if (bid) qs.set('openTaskBoardId', bid);
      a.href = `./index.html?${qs.toString()}`;
      a.textContent = extractTaskTitle(task);

      li.appendChild(a);
      listEl.appendChild(li);
    }
  };

  const renderGrid = () => {
    monthLabelEl.textContent = formatMonthLabel(monthDate);
    calendarEl.textContent = '';

    const firstDow = weekdayIndexMonday0(monthStart);
    const gridStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate() - firstDow);

    const lastDow = weekdayIndexMonday0(monthEnd);
    const gridEnd = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate() + (6 - lastDow));

    const frag = document.createDocumentFragment();

    const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (const label of dows) {
      const el = document.createElement('div');
      el.className = 'rpt-due-dow';
      el.textContent = label;
      frag.appendChild(el);
    }

    const days = eachDayInclusive(gridStart, gridEnd);
    for (const d of days) {
      const iso = formatIsoDate(d);
      const count = tasksByDate.get(iso)?.length || 0;
      const overdueCount = overdueCountByDate.get(iso) || 0;
      const outside = d.getMonth() !== monthDate.getMonth();
      const isToday = iso === todayIso;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rpt-due-day';
      if (outside) btn.classList.add('is-outside');
      if (isToday) btn.classList.add('is-today');
      if (overdueCount > 0) btn.classList.add('is-overdue');
      btn.dataset.date = iso;
      btn.setAttribute('aria-pressed', iso === selectedIso ? 'true' : 'false');
      btn.title = overdueCount > 0
        ? `${iso}: ${count} task${count === 1 ? '' : 's'} due (${overdueCount} overdue)`
        : `${iso}: ${count} task${count === 1 ? '' : 's'} due`;

      const num = document.createElement('div');
      num.className = 'rpt-due-num';
      num.textContent = String(d.getDate());
      btn.appendChild(num);

      if (count > 0) {
        const badge = document.createElement('div');
        badge.className = 'rpt-due-count';
        if (overdueCount > 0) badge.classList.add('is-overdue');
        badge.textContent = String(count);
        btn.appendChild(badge);
      }

      frag.appendChild(btn);
    }

    calendarEl.appendChild(frag);
  };

  const handleCalendarClick = (evt) => {
    const target = evt?.target;
    const btn = target instanceof Element ? target.closest('button.rpt-due-day') : null;
    const iso = btn?.dataset?.date;
    if (!iso) return;

    selectedIso = iso;
    calendarEl.querySelectorAll('button.rpt-due-day[aria-pressed="true"]')
      .forEach((el) => el.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', 'true');
    renderSelectedList();
  };

  if (!calendarEl.dataset.bound) {
    calendarEl.addEventListener('click', handleCalendarClick);
    calendarEl.dataset.bound = 'true';
  }

  renderGrid();
  renderSelectedList();
}

function main() {
  initializeThemeToggle();
  ensureBoardsInitialized();
  renderIcons();

  const boardName = getActiveBoardName();
  const boardId = getActiveBoardId();

  const badge = document.getElementById('calendar-board-badge');
  if (badge) badge.textContent = (boardName || 'Board').slice(0, 2).toUpperCase();

  const tasks = loadTasks();

  let viewMonth = new Date();
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);

  const prevEl = document.getElementById('calendar-prev');
  const nextEl = document.getElementById('calendar-next');

  const update = () => {
    renderDueDateCalendar({ tasks, monthDate: viewMonth, boardId });
  };

  prevEl?.addEventListener('click', () => {
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
    update();
  });

  nextEl?.addEventListener('click', () => {
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
    update();
  });

  update();
}

initStorage().then(main).catch((err) => {
  console.error('[OpenAgile] Failed to initialise storage for calendar:', err);
  main();
});
