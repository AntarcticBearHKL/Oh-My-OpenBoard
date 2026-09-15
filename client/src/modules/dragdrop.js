import Sortable from 'sortablejs';
import { isDoneColumnId } from './storage.js';
import { startDragSession, moveDragSession, cleanupTaskDragState } from './drag-session.js';
import { handleTaskDrop } from './task-drop.js';

// Store Sortable instances for cleanup
let taskSortables = [];

function shouldForceFallbackForTasks() {
  // Native HTML5 drag/drop is unreliable or unavailable on most mobile/touch
  // environments, so the JS fallback is what makes touch drag work. Prefer
  // native DnD on fine pointers (mouse/trackpad), where it is dependable.
  const hasTouchPoints =
    typeof navigator !== 'undefined' &&
    (navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0);

  const isCoarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

  return hasTouchPoints || isCoarsePointer;
}

// Initialize all drag and drop functionality
export function initDragDrop() {
  destroySortables();
  initTaskSortables();
}

// Clean up existing sortable instances
function destroySortables() {
  taskSortables.forEach(sortable => sortable.destroy());
  taskSortables = [];

  cleanupTaskDragState({ restoreCollapsedDropZones: true });
}

// Initialize sortable for tasks within columns
function initTaskSortables() {
  const taskLists = document.querySelectorAll('.tasks');
  const forceFallback = shouldForceFallbackForTasks();

  taskLists.forEach(taskList => {
    // Disable sorting within the Done column for performance.
    // Tasks dropped into Done are placed at the top automatically;
    // internal reordering among completed tasks is unnecessary.
    const columnEl = taskList.closest('.task-column');
    const isDoneColumn = isDoneColumnId(columnEl?.dataset?.column);

    const sortable = new Sortable(taskList, {
      group: {
        name: 'tasks',
        pull: true,
        put: true
      },
      sort: !isDoneColumn, // Skip position calculations for Done column
      animation: 150,
      delay: 150, // Delay before drag starts (allows scrolling on mobile)
      delayOnTouchOnly: true, // Only apply delay on touch devices
      touchStartThreshold: 5, // Pixels to move before canceling delayed drag
      ghostClass: 'task-ghost',
      chosenClass: 'task-chosen',
      dragClass: 'task-drag',
      draggable: '.task',
      forceFallback, // Fallback on touch; native HTML5 DnD on desktop
      fallbackClass: 'task-fallback',
      fallbackOnBody: true,
      fallbackTolerance: 0,
      swapThreshold: 0.65,
      emptyInsertThreshold: 20, // Pixels around empty list where items can be dropped
      direction: 'vertical',
      scroll: true,
      scrollSensitivity: 120,
      scrollSpeed: 22,
      bubbleScroll: true,
      onStart: startDragSession,

      onMove: moveDragSession,

      onEnd: handleTaskDrop
    });
    
    taskSortables.push(sortable);
  });
}