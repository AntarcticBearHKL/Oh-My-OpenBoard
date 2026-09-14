import { generateUUID } from './utils.js';
import { getActiveBoardId, isDoneColumnId, loadColumns, loadTasks } from './storage.js';
import { normalizeHexColor } from './normalize.js';
import { normalizeWipLimit } from './wip-limit.js';
import { scheduleDomainEvent } from './event-sourcing/emitter.js';

export function addColumn() {
  return false;
}

export function toggleColumnCollapsed(columnId) {
  const id = typeof columnId === 'string' ? columnId.trim() : '';
  if (!id) return false;

  const columns = loadColumns();
  const column = columns.find((c) => c.id === id);
  if (!column) return false;

  column.collapsed = column.collapsed !== true;
  scheduleDomainEvent({
    type: 'column.updated',
    boardId: getActiveBoardId(),
    entityId: column.id,
    payload: { fields: { collapsed: column.collapsed } }
  });
  return true;
}

// Update an existing column
export function updateColumn(columnId, name, color, wipLimit) {
  if (!name || name.trim() === '') return;
  
  const columns = loadColumns();
  const columnIndex = columns.findIndex(c => c.id === columnId);
  if (columnIndex !== -1) {
    const previousName = columns[columnIndex].name;
    columns[columnIndex].name = name.trim();
    columns[columnIndex].color = normalizeHexColor(color);
    columns[columnIndex].wipLimit = normalizeWipLimit(
      wipLimit === undefined ? columns[columnIndex].wipLimit : wipLimit
    );
    return scheduleDomainEvent({
      type: 'column.updated',
      boardId: getActiveBoardId(),
      entityId: columnId,
      payload: {
        fields: {
          name: columns[columnIndex].name,
          color: columns[columnIndex].color,
          wipLimit: columns[columnIndex].wipLimit
        }
      }
    });
  }

  return Promise.resolve();
}

export function deleteColumn() {
  return false;
}

// Update column positions after drag
export function updateColumnPositions() {
  const container = document.getElementById("board-container");
  const columnElements = container.querySelectorAll(".task-column");
  const columns = loadColumns();
  
  let anyMoved = false;
  columnElements.forEach((colEl, index) => {
    const columnId = colEl.dataset.column;
    const column = columns.find(c => c.id === columnId);
    if (column) {
      const nextOrder = index + 1;
      if (column.order !== nextOrder) {
        anyMoved = true;
      }
      column.order = nextOrder;
    }
  });

  // Emit a single event only when at least one column moved; details {} kept
  // minimal as the PRD does not specify a bulk payload shape.
  if (anyMoved) {
    scheduleDomainEvent({
      type: 'column.reordered',
      boardId: getActiveBoardId(),
      entityId: '',
      payload: { order: columns.map((column) => ({ id: column.id, order: column.order })) }
    });
  }
}
