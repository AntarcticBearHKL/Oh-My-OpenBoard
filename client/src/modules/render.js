// Thin orchestrator — delegates to task-card.js, column-element.js, swimlane-renderer.js

import { listBoards, loadColumns, loadTasks, loadLabels, loadSettings } from './storage.js';
import { initDragDrop } from './dragdrop.js';
import { renderIcons } from './icons.js';
import { syncSwimLaneControls } from './swimlane-controls.js';
import { on, DATA_CHANGED, DRAG_RECONCILE_BEGIN, DRAG_RECONCILE_END } from './events.js';
import { createTaskElement } from './task-card.js';
import { createColumnElement } from './column-element.js';
import { renderSwimlaneBoard } from './swimlane-renderer.js';
import { syncColumnWip } from './wip-limit.js';
import { selectVisibleTasks, buildShowMoreButton, selectColumnRenderPlan } from './board-filters.js';

// Depth of the current drag-reconcile window. While open (> 0), a projected
// DATA_CHANGED patches the board in place via reconcileBoard() instead of the
// full renderBoard() teardown — so the just-dragged node Chrome's DnD engine
// still references is never detached. A counter (not a boolean) survives the
// several DATA_CHANGED events one drop can emit.
let dragReconcileDepth = 0;

export function beginDragReconcile() {
  dragReconcileDepth += 1;
}

export function endDragReconcile() {
  dragReconcileDepth = Math.max(0, dragReconcileDepth - 1);
}

on(DRAG_RECONCILE_BEGIN, beginDragReconcile);
on(DRAG_RECONCILE_END, endDragReconcile);

// Subscribe to the event bus so any module can trigger a re-render
// without importing render.js directly (eliminates circular deps).
on(DATA_CHANGED, (event) => {
  // A skills or board-group change (tagged affectsBoard:false) is out-of-band
  // state: it refreshes its own UI — the skills modal and the board sidebar
  // both listen on DATA_CHANGED — but never changes what the board shows, so
  // it must not pay for a full rebuild. Every other DATA_CHANGED still renders.
  if (event.detail?.affectsBoard === false) return;
  if (dragReconcileDepth > 0 && reconcileBoard()) return;
  renderBoard();
});

function renderStandardBoard(container, sortedColumns, visibleTasks, settings) {
  sortedColumns.forEach(column => {
    const columnEl = createColumnElement(column);
    container.appendChild(columnEl);

    const tasksList = columnEl.querySelector('.tasks');

    const { columnTasks, tasksToRender, remaining } = selectColumnRenderPlan(column.id, visibleTasks);

    tasksToRender.forEach(task => {
      tasksList.appendChild(createTaskElement(task, settings));
    });

    if (remaining > 0) {
      tasksList.appendChild(buildShowMoreButton(remaining, renderBoard));
    }

    syncColumnWip(columnEl, columnTasks.length, column);
  });
}

/**
 * reconcile adapter — patch the standard board DOM in place to match the
 * projected read model, reusing existing card nodes instead of tearing the
 * board down. Used on the drag-drop path so the just-dragged node (which
 * Chrome's DnD engine still references) is never detached by an innerHTML
 * reset. Returns true when it handled the update; false when a structural or
 * swimlane change means the caller must fall back to renderBoard().
 */
export function reconcileBoard() {
  const container = document.getElementById('board-container');
  if (!container) return false;
  if (listBoards().length === 0) return false;

  const settings = loadSettings();
  // Swimlane boards have a different DOM shape; the reconcile adapter only
  // handles the standard board. Defer to a full rebuild otherwise.
  if (settings.swimLanesEnabled === true) return false;

  const columns = loadColumns();
  const tasks = loadTasks();
  const visibleTasks = selectVisibleTasks(tasks);

  // Structural changes (a column added or removed) need a rebuild — the DOM
  // has no node to patch. A pure task move never changes the column set.
  const domColumnIds = new Set(
    [...container.querySelectorAll('.task-column')].map((el) => el.dataset.column)
  );
  const stateColumnIds = columns.map((c) => c.id);
  if (
    domColumnIds.size !== stateColumnIds.length ||
    stateColumnIds.some((id) => !domColumnIds.has(id))
  ) {
    return false;
  }

  // Index every card currently on the board by task id, so a task that changed
  // column is re-parented (node kept alive) rather than removed and recreated.
  const existingCards = new Map();
  container.querySelectorAll('.task[data-task-id]').forEach((el) => {
    existingCards.set(el.dataset.taskId, el);
  });

  const usedIds = new Set();
  const sortedColumns = [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  sortedColumns.forEach((column) => {
    const columnEl = container.querySelector(`.task-column[data-column="${column.id}"]`);
    if (!columnEl) return;
    const tasksList = columnEl.querySelector('.tasks');
    if (!tasksList) return;

    const { columnTasks, tasksToRender, remaining } = selectColumnRenderPlan(column.id, visibleTasks);

    tasksList.querySelector('.show-more-btn')?.remove();

    tasksToRender.forEach((task) => {
      let card = existingCards.get(task.id);
      const reused = card !== undefined;
      if (!reused) {
        card = createTaskElement(task, settings);
      }
      // appendChild moves an already-attached node to the correct position.
      tasksList.appendChild(card);
      usedIds.add(task.id);
    });

    if (remaining > 0) {
      tasksList.appendChild(buildShowMoreButton(remaining, renderBoard));
    }

    syncColumnWip(columnEl, columnTasks.length, column);
  });

  existingCards.forEach((el, id) => {
    if (!usedIds.has(id)) el.remove();
  });

  performance.mark('openagile:board-render:reconcile');

  return true;
}

// Render all columns and tasks
export function renderBoard() {
  const boardContainer = document.getElementById('board-container');
  if (boardContainer && listBoards().length === 0) {
    boardContainer.innerHTML = '<div class="board-empty-state"><p class="board-empty-title">No iterations yet</p><p class="board-empty-hint">Create one with the + button in a group on the left.</p></div>';
    boardContainer.dataset.viewMode = 'empty';
    boardContainer.classList.remove('board-container-swimlanes');
    renderIcons();
    return;
  }

  const columns = loadColumns();
  const tasks = loadTasks();
  const labels = loadLabels();
  const settings = loadSettings();
  syncSwimLaneControls(settings);

  const visibleTasks = selectVisibleTasks(tasks);
  const container = document.getElementById('board-container');
  container.innerHTML = '';
  container.dataset.viewMode = settings.swimLanesEnabled === true ? 'swimlanes' : 'columns';
  container.dataset.swimlaneGroupBy = settings.swimLaneGroupBy || '';
  container.dataset.swimlaneLabelGroup = settings.swimLaneLabelGroup || '';
  container.classList.toggle('board-container-swimlanes', settings.swimLanesEnabled === true);

  const sortedColumns = [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (settings.swimLanesEnabled === true) {
    renderSwimlaneBoard(container, sortedColumns, visibleTasks, labels, settings);
  } else {
    renderStandardBoard(container, sortedColumns, visibleTasks, settings);
  }

  initDragDrop();
  renderIcons();

  performance.mark('openagile:board-render:full');
}
