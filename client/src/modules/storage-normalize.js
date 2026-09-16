import {
  isHexColor,
  defaultColumnColor,
  normalizeStringKeys,
} from './normalize.js';
import { DONE_COLUMN_ROLE, FIXED_COLUMNS, isDoneColumn } from './constants.js';
import { defaultSettings } from './storage-defaults.js';

const ALLOWED_SWIMLANE_GROUP_BY = new Set(['label', 'label-group']);

export function normalizeColumn(c) {
  const color = isHexColor(c?.color) ? c.color.trim() : defaultColumnColor(c?.id);
  const collapsed = c?.collapsed === true;
  return { ...c, color, collapsed, ...(isDoneColumn(c) ? { role: DONE_COLUMN_ROLE } : {}) };
}

export function ensureFixedColumns(columns) {
  const stored = new Map(
    (Array.isArray(columns) ? columns : [])
      .filter((column) => column && typeof column.id === 'string')
      .map((column) => [column.id, column])
  );

  return FIXED_COLUMNS.map((template) => {
    const previous = stored.get(template.id) || {};
    return {
      ...template,
      color: isHexColor(previous.color) ? previous.color : template.color,
      collapsed: previous.collapsed === true,
      wipLimit: Number.isFinite(previous.wipLimit) ? previous.wipLimit : 0
    };
  });
}

function normalizeSwimLaneGroupBy(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  return ALLOWED_SWIMLANE_GROUP_BY.has(normalized) ? normalized : 'label';
}

function normalizeSwimLaneLabelGroup(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeSettings(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const locale = typeof obj.locale === 'string' && obj.locale.trim() ? obj.locale.trim() : defaultSettings().locale;
  const showChangeDate = obj.showChangeDate !== false;

  const swimLanesEnabled = obj.swimLanesEnabled === true;
  const swimLaneGroupBy = normalizeSwimLaneGroupBy(obj.swimLaneGroupBy);
  const swimLaneLabelGroup = normalizeSwimLaneLabelGroup(obj.swimLaneLabelGroup);
  const swimLaneCollapsedKeys = normalizeStringKeys(obj.swimLaneCollapsedKeys);
  const swimLaneCellCollapsedKeys = normalizeStringKeys(obj.swimLaneCellCollapsedKeys);
  const swimLaneOrder = normalizeStringKeys(obj.swimLaneOrder);
  const columnSummaries = obj.columnSummaries && typeof obj.columnSummaries === 'object' && !Array.isArray(obj.columnSummaries)
    ? obj.columnSummaries
    : {};

  return {
    showChangeDate,
    locale,
    swimLanesEnabled,
    swimLaneGroupBy,
    swimLaneLabelGroup,
    swimLaneCollapsedKeys,
    swimLaneCellCollapsedKeys,
    swimLaneOrder,
    columnSummaries
  };
}
