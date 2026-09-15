import { moveTaskToTopInColumn, setTaskBlockedReason } from './tasks.js';
import { updateTaskPositionsFromDrop } from './task-position.js';
import { emit, DATA_CHANGED, DRAG_RECONCILE_BEGIN, DRAG_RECONCILE_END } from './events.js';
import { promptDialog } from './dialog.js';
import { isSwimlaneViewEnabled, cleanupTaskDragState } from './drag-session.js';

function getTaskContainerElement(node) {
  return node?.closest?.('.task-column, .swimlane-cell, [data-column]') || null;
}

async function promptBlockedReason(taskId) {
  const reason = await promptDialog({
    title: 'Task blocked',
    message: 'Why is this task blocked? Leave empty to skip.',
    placeholder: 'e.g. Waiting on API keys',
    confirmText: 'Save reason',
    cancelText: 'Skip'
  });
  if (typeof reason === 'string' && reason.trim()) {
    setTaskBlockedReason(taskId, reason);
    return true;
  }
  return false;
}

export async function handleTaskDrop(evt) {
  const restoreCollapsedDropZones = !isSwimlaneViewEnabled();
  cleanupTaskDragState({ restoreCollapsedDropZones });

  const isSwimlaneView = isSwimlaneViewEnabled();

  // Swimlane drops need a full rebuild, so wait until the browser has
  // finished finalising native drag state before touching their DOM. The
  // standard board uses the in-place reconcile path immediately.
  if (isSwimlaneView) {
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }

  // Open a reconcile window for the whole mutation. Every DATA_CHANGED that
  // updateTaskPositionsFromDrop()/moveTaskToTopInColumn() emit synchronously
  // is routed through reconcileBoard() (patch in place) instead of
  // renderBoard() (full teardown), so the just-dragged node is never
  // detached. Counters, collapsed titles, due dates, and notifications are
  // reconcile's responsibility now — no manual sync pass here.
  const renderModule = isSwimlaneView ? await import('./render.js') : null;
  if (renderModule) renderModule.beginDragReconcile();
  else emit(DRAG_RECONCILE_BEGIN);
  let dropResult = null;
  try {
    dropResult = updateTaskPositionsFromDrop(evt);
    if (!dropResult) return;

    const toColumnEl = getTaskContainerElement(evt.to);

    if (!isSwimlaneView && toColumnEl?.classList.contains('is-collapsed')) {
      // Keep collapsed drops state-only so Sortable's detached drag node is
      // never re-parented here; reconcile repaints from state.
      moveTaskToTopInColumn(dropResult.movedTaskId, dropResult.toColumn);
    }

    if (isSwimlaneView && (dropResult.didChangeColumn || dropResult.didChangeLane)) {
      // Swimlane boards fall outside reconcile's scope; the emitted
      // DATA_CHANGED falls back to a full renderBoard() rebuild.
      emit(DATA_CHANGED);
    }
  } finally {
    if (renderModule) renderModule.endDragReconcile();
    else emit(DRAG_RECONCILE_END);
  }

  if (dropResult?.enteredBlocked) {
    const reasonStored = await promptBlockedReason(dropResult.movedTaskId);
    if (reasonStored) {
      // Reconcile only patches due dates on reused cards, so a full repaint
      // is what surfaces the new blocked indicator after the prompt closes.
      const { renderBoard } = await import('./render.js');
      renderBoard();
    }
  }
}
