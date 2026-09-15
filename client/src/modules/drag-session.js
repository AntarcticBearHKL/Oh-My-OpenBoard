let autoScrollInterval = null;
let lastTouchX = 0;
let lastTouchY = 0;
const COLLAPSED_DROP_HOVER_CLASS = 'is-drop-hover';
let isDraggingTask = false;
let activeTaskList = null;

export function isSwimlaneViewEnabled() {
  return document.getElementById('board-container')?.dataset?.viewMode === 'swimlanes';
}

function removePointerTracking() {
  document.removeEventListener('touchmove', trackPointer);
  document.removeEventListener('mousemove', trackPointer);
  document.removeEventListener('dragover', trackPointer);
}

export function cleanupTaskDragState({ restoreCollapsedDropZones = false } = {}) {
  document.body.classList.remove('dragging');
  isDraggingTask = false;
  activeTaskList = null;
  stopAutoScroll();
  removePointerTracking();
  clearCollapsedDropHover();
  if (restoreCollapsedDropZones) {
    hideCollapsedDropZones();
  }
}

// Auto-scroll logic for board and task-list scrolling during drag
function startAutoScroll() {
  const boardContainer = document.getElementById('board-container');
  if (!boardContainer || autoScrollInterval) return;
  
  autoScrollInterval = setInterval(() => {
    if (!boardContainer) return;
    
    const rect = boardContainer.getBoundingClientRect();
    const edgeSize = 80;
    const scrollSpeed = 12;
    
    if (lastTouchX > 0) {
      if (lastTouchX < rect.left + edgeSize && boardContainer.scrollLeft > 0) {
        boardContainer.scrollLeft -= scrollSpeed;
      } else if (lastTouchX > rect.right - edgeSize && 
                 boardContainer.scrollLeft < boardContainer.scrollWidth - boardContainer.clientWidth) {
        boardContainer.scrollLeft += scrollSpeed;
      }
    }

    autoScrollActiveTaskList();
  }, 16); // ~60fps
}

function stopAutoScroll() {
  if (autoScrollInterval) {
    clearInterval(autoScrollInterval);
    autoScrollInterval = null;
  }
  lastTouchX = 0;
  lastTouchY = 0;
}

function autoScrollActiveTaskList() {
  if (!isDraggingTask || !activeTaskList) return;
  const rect = activeTaskList.getBoundingClientRect();
  const edgeSize = 80;
  const maxSpeed = 20;
  let delta = 0;

  if (lastTouchY > 0) {
    if (lastTouchY < rect.top + edgeSize) {
      const dist = Math.max(0, lastTouchY - rect.top);
      const intensity = (edgeSize - dist) / edgeSize;
      delta = -Math.ceil(intensity * maxSpeed);
    } else if (lastTouchY > rect.bottom - edgeSize) {
      const dist = Math.max(0, rect.bottom - lastTouchY);
      const intensity = (edgeSize - dist) / edgeSize;
      delta = Math.ceil(intensity * maxSpeed);
    }
  }

  if (delta !== 0) {
    activeTaskList.scrollTop += delta;
  }
}

function showCollapsedDropZones() {
  document.querySelectorAll('.task-column.is-collapsed .tasks').forEach((tasksList) => {
    if (tasksList.classList.contains('hidden')) {
      tasksList.dataset.wasHidden = 'true';
      tasksList.classList.remove('hidden');
    }
  });
}

function hideCollapsedDropZones() {
  document.querySelectorAll('.task-column.is-collapsed .tasks').forEach((tasksList) => {
    if (tasksList.dataset.wasHidden === 'true') {
      tasksList.classList.add('hidden');
      delete tasksList.dataset.wasHidden;
    }
  });
}

function clearCollapsedDropHover() {
  document
    .querySelectorAll(`.task-column.is-collapsed.${COLLAPSED_DROP_HOVER_CLASS}`)
    .forEach((column) => column.classList.remove(COLLAPSED_DROP_HOVER_CLASS));
  document
    .querySelectorAll(`.swimlane-cell.is-column-collapsed.${COLLAPSED_DROP_HOVER_CLASS}`)
    .forEach((cell) => cell.classList.remove(COLLAPSED_DROP_HOVER_CLASS));
}

function setCollapsedDropHover(el) {
  clearCollapsedDropHover();
  if (el) el.classList.add(COLLAPSED_DROP_HOVER_CLASS);
}

// Track touch/mouse position globally during drag
function trackPointer(evt) {
  if (evt.touches && evt.touches[0]) {
    lastTouchX = evt.touches[0].clientX;
    lastTouchY = evt.touches[0].clientY;
  } else if (evt.clientX) {
    lastTouchX = evt.clientX;
    lastTouchY = evt.clientY;
  }
  updateCollapsedHoverFromPoint(lastTouchX, lastTouchY);
  autoScrollActiveTaskList();
}

function updateCollapsedHoverFromPoint(x, y) {
  if (!x && !y) return;
  const target = document.elementFromPoint(x, y);
  if (isSwimlaneViewEnabled()) {
    const cell = target?.closest?.('.swimlane-cell');
    if (cell && cell.classList.contains('is-column-collapsed')) {
      setCollapsedDropHover(cell);
    } else {
      clearCollapsedDropHover();
    }
  } else {
    const column = target?.closest?.('.task-column');
    if (column && column.classList.contains('is-collapsed')) {
      setCollapsedDropHover(column);
    } else {
      clearCollapsedDropHover();
    }
  }
}

export function startDragSession(evt) {
  document.body.classList.add('dragging');
  isDraggingTask = true;
  activeTaskList = evt.from || null;
  if (!isSwimlaneViewEnabled()) {
    showCollapsedDropZones();
  }
  startAutoScroll();
  // Add global move listener to track pointer
  document.addEventListener('touchmove', trackPointer, { passive: true });
  document.addEventListener('mousemove', trackPointer, { passive: true });
  document.addEventListener('dragover', trackPointer, { passive: true });
  updateCollapsedHoverFromPoint(lastTouchX, lastTouchY);
}

export function moveDragSession(evt) {
  activeTaskList = evt.to || activeTaskList;
  if (isSwimlaneViewEnabled()) {
    const targetCell = evt.to?.closest('.swimlane-cell');
    if (targetCell && targetCell.classList.contains('is-column-collapsed')) {
      setCollapsedDropHover(targetCell);
    } else {
      clearCollapsedDropHover();
    }
  } else {
    const targetColumn = evt.to?.closest('.task-column');
    if (targetColumn && targetColumn.classList.contains('is-collapsed')) {
      setCollapsedDropHover(targetColumn);
    } else {
      clearCollapsedDropHover();
    }
  }
}
