import { generateUUID } from './utils.js';
import { FIXED_COLUMNS } from './constants.js';

// ── Default data ───────────────────────────────────────────────────────────────

export function defaultColumns() {
  return FIXED_COLUMNS.map((column) => ({ ...column }));
}

export function legacyDefaultColumns() {
  return FIXED_COLUMNS.map((column) => ({ ...column }));
}

export function defaultLabels() {
  return [
    { id: generateUUID(), name: 'Task', color: '#f59e0b', group: 'Activity' },
    { id: generateUUID(), name: 'Meeting', color: '#ffd001', group: 'Activity' },
    { id: generateUUID(), name: 'Email', color: '#d4a300', group: 'Activity' },
    { id: generateUUID(), name: 'Idea', color: '#25b631', group: '' },
    { id: generateUUID(), name: 'Goal', color: '#1b7cbd', group: '' },
  ];
}

function columnIdByName(columns, name) {
  return columns.find((column) => column.name === name)?.id || columns[0]?.id || '';
}

function labelIdByName(labels, name) {
  return labels.find((label) => label.name === name)?.id || '';
}


export function defaultBoardData(includeTasks = true) {
  const columns = defaultColumns();
  const labels = defaultLabels();
  return {
    columns,
    labels,
    tasks: [],
    settings: defaultSettings()
  };
}

// Deterministic column/label ids for the well-known default board, so two
// devices seeding their own default board emit identical column.created /
// label.created events that dedup on merge (see STABLE_DEFAULT_BOARD_ID).
function stableDefaultColumns() {
  return FIXED_COLUMNS.map((column) => ({ ...column }));
}

function stableDefaultLabels() {
  return [
    { id: '00000000-0000-4000-8000-000000000020', name: 'Task', color: '#f59e0b', group: 'Activity' },
    { id: '00000000-0000-4000-8000-000000000021', name: 'Meeting', color: '#ffd001', group: 'Activity' },
    { id: '00000000-0000-4000-8000-000000000022', name: 'Email', color: '#d4a300', group: 'Activity' },
    { id: '00000000-0000-4000-8000-000000000023', name: 'Idea', color: '#25b631', group: '' },
    { id: '00000000-0000-4000-8000-000000000024', name: 'Goal', color: '#1b7cbd', group: '' }
  ];
}

// Default board scaffold with stable ids. Demo tasks keep random ids and are
// intentionally local-only (not event-sourced): they are first-run flavour and
// random ids would duplicate on merge across devices.
export function stableDefaultBoardData() {
  const columns = stableDefaultColumns();
  const labels = stableDefaultLabels();
  return {
    columns,
    labels,
    tasks: [],
    settings: defaultSettings()
  };
}

export function defaultSettings() {
  const locale = (typeof navigator !== 'undefined' && typeof navigator.language === 'string')
    ? navigator.language
    : 'en-US';

  return {
    showPriority: true,
    showDueDate: true,
    showAge: true,
    showChangeDate: false,
    locale,
    defaultPriority: 'none',
    notificationDays: 3,
    countdownUrgentThreshold: 3,
    countdownWarningThreshold: 10,
    swimLanesEnabled: false,
    swimLaneGroupBy: 'label',
    swimLaneLabelGroup: '',
    swimLaneCollapsedKeys: [],
    swimLaneCellCollapsedKeys: [],
    swimLaneOrder: []
  };
}
