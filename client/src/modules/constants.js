// Domain constants — single source of truth for values used across modules.

export const LEGACY_DONE_COLUMN_ID = 'done';
export const DONE_COLUMN_ROLE = 'done';
export const DONE_COLUMN_ID = LEGACY_DONE_COLUMN_ID;

export function isDoneColumn(column) {
  return column?.role === DONE_COLUMN_ROLE || column?.id === LEGACY_DONE_COLUMN_ID;
}

export const FIXED_COLUMNS = [
  { id: '00000000-0000-4000-8000-000000000030', name: 'Backlog', color: '#3583ff', order: 1 },
  { id: '00000000-0000-4000-8000-000000000031', name: 'In Progress', color: '#f59e0b', order: 2 },
  { id: '00000000-0000-4000-8000-000000000032', name: 'Blocked', color: '#ef4444', order: 3 },
  { id: '00000000-0000-4000-8000-000000000033', name: 'Archived', color: '#16a34a', order: 4, role: DONE_COLUMN_ROLE }
];

export const FIXED_COLUMN_IDS = FIXED_COLUMNS.map((column) => column.id);

export function isFixedColumn(columnId) {
  return typeof columnId === 'string' && FIXED_COLUMN_IDS.includes(columnId);
}

export const APP_NAME = 'OpenAgile';

export const NO_BOARDS_KEY = 'openagile:noBoards';

export const LEGACY_COLUMN_ALIASES = new Map([
  ['todo', FIXED_COLUMNS[0].id],
  ['inprogress', FIXED_COLUMNS[1].id],
  ['done', FIXED_COLUMNS[3].id],
  ['00000000-0000-4000-8000-000000000010', FIXED_COLUMNS[0].id],
  ['00000000-0000-4000-8000-000000000011', FIXED_COLUMNS[1].id],
  ['00000000-0000-4000-8000-000000000012', FIXED_COLUMNS[3].id]
]);

export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'];
export const PRIORITY_SET = new Set(PRIORITIES);

export const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

export const DEFAULT_PRIORITY = 'none';
export const DEFAULT_COLUMN_COLOR = '#3b82f6';

export const MAX_LABEL_NAME_LENGTH = 40;

export const DEFAULT_APP_KEYBINDINGS = {
  openBoardsModal: { key: 'b', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false }
};

export function matchesKey(event, binding) {
  return event.key?.toLowerCase() === binding.key.toLowerCase()
    && Boolean(event.ctrlKey) === binding.ctrlKey
    && Boolean(event.shiftKey) === binding.shiftKey
    && Boolean(event.altKey) === binding.altKey
    && Boolean(event.metaKey) === binding.metaKey;
}
