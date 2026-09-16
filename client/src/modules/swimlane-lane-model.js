export const SWIMLANE_GROUP_BY_LABEL = 'label';
export const SWIMLANE_GROUP_BY_LABEL_GROUP = 'label-group';
export const NO_GROUP_LANE_KEY = '__no-group__';
export const NO_GROUP_LANE_LABEL = 'No Group';
export const SWIMLANE_HIDDEN_DONE_COLUMN_ID = 'done';

const SWIMLANE_GROUP_BY_VALUES = new Set([
  SWIMLANE_GROUP_BY_LABEL,
  SWIMLANE_GROUP_BY_LABEL_GROUP
]);

export function normalizeSelectedLabelGroup(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeGroupBy(groupBy) {
  const normalized = (groupBy || '').toString().trim().toLowerCase();
  return SWIMLANE_GROUP_BY_VALUES.has(normalized) ? normalized : SWIMLANE_GROUP_BY_LABEL;
}

export function normalizeCollapsedLaneKeys(keys) {
  if (!Array.isArray(keys)) return [];

  const seen = new Set();
  return keys
    .map((key) => (typeof key === 'string' ? key.trim() : ''))
    .filter((key) => {
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeLabelCollection(labels) {
  if (labels instanceof Map) return labels;

  const byId = new Map();
  if (!Array.isArray(labels)) return byId;

  labels.forEach((label) => {
    if (!label || typeof label.id !== 'string') return;
    byId.set(label.id, label);
  });
  return byId;
}

export function getAvailableLabelGroupsFromCollection(labels) {
  const groups = new Set();

  labels.forEach((label) => {
    const group = normalizeSelectedLabelGroup(label?.group);
    if (group) groups.add(group);
  });

  return [...groups].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

export function getSelectedLabelGroup(group, labels) {
  const normalizedGroup = normalizeSelectedLabelGroup(group);
  const availableGroups = getAvailableLabelGroupsFromCollection(labels);
  if (availableGroups.includes(normalizedGroup)) return normalizedGroup;
  return availableGroups[0] || '';
}

export function getLabelsForSelectedGroup(labels, selectedLabelGroup) {
  const group = getSelectedLabelGroup(selectedLabelGroup, labels);
  if (!group) return [];

  return [...labels.values()]
    .filter((label) => normalizeSelectedLabelGroup(label?.group) === group)
    .sort((left, right) => {
      const leftName = (left?.name || '').toString();
      const rightName = (right?.name || '').toString();
      return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
    });
}

export function getSelectedGroupLaneLabel(task, labels, selectedLabelGroup) {
  const group = getSelectedLabelGroup(selectedLabelGroup, labels);
  if (!group) return null;

  const explicitLabelId = typeof task?.swimlaneLabelId === 'string' ? task.swimlaneLabelId.trim() : '';
  if (explicitLabelId) {
    const explicitLabel = labels.get(explicitLabelId);
    if (explicitLabel && normalizeSelectedLabelGroup(explicitLabel.group) === group) {
      return explicitLabel;
    }
  }

  return null;
}

export function getExplicitLaneValue(task, groupBy) {
  if (groupBy === SWIMLANE_GROUP_BY_LABEL) {
    return typeof task?.swimlaneLabelId === 'string' ? task.swimlaneLabelId.trim() : null;
  }

  if (groupBy === SWIMLANE_GROUP_BY_LABEL_GROUP) {
    return typeof task?.swimlaneLabelGroup === 'string' ? task.swimlaneLabelGroup.trim() : null;
  }

  return null;
}

export function getFallbackLaneDescriptor() {
  return {
    key: NO_GROUP_LANE_KEY,
    value: NO_GROUP_LANE_LABEL,
    isDefault: true
  };
}
