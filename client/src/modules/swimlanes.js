import { PRIORITIES } from './constants.js';
import { isDoneColumnId } from './storage.js';
import {
  NO_GROUP_LANE_KEY,
  NO_GROUP_LANE_LABEL,
  SWIMLANE_GROUP_BY_LABEL,
  SWIMLANE_GROUP_BY_LABEL_GROUP,
  SWIMLANE_GROUP_BY_PRIORITY,
  getExplicitLaneValue,
  getFallbackLaneDescriptor,
  getLabelsForSelectedGroup,
  getPriorityLaneDescriptor,
  getSelectedGroupLaneLabel,
  getSelectedLabelGroup,
  getTaskLabelIds,
  normalizeGroupBy,
  normalizeLabelCollection,
  normalizePriorityLaneKey,
  normalizeSelectedLabelGroup
} from './swimlane-lane-model.js';

export function getSwimLaneDescriptor(task, groupBy, labelsInput, selectedLabelGroup = '') {
  const normalizedGroupBy = normalizeGroupBy(groupBy);
  const labels = normalizeLabelCollection(labelsInput);
  const explicitValue = getExplicitLaneValue(task, normalizedGroupBy);

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_PRIORITY) {
    return getPriorityLaneDescriptor(explicitValue);
  }

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_LABEL_GROUP) {
    const selectedLaneLabel = getSelectedGroupLaneLabel(task, labels, selectedLabelGroup);
    if (selectedLaneLabel) {
      return {
        key: selectedLaneLabel.id,
        value: selectedLaneLabel.name,
        isDefault: false
      };
    }

    return {
      key: NO_GROUP_LANE_KEY,
      value: NO_GROUP_LANE_LABEL,
      isDefault: true
    };
  }

  if (explicitValue === '') {
    return {
      key: NO_GROUP_LANE_KEY,
      value: NO_GROUP_LANE_LABEL,
      isDefault: true
    };
  }

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_LABEL && explicitValue) {
    const label = labels.get(explicitValue);
    if (label) {
      return {
        key: label.id,
        value: label.name,
        isDefault: false
      };
    }
  }

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_LABEL_GROUP && explicitValue) {
    return {
      key: explicitValue,
      value: explicitValue,
      isDefault: false
    };
  }

  return getFallbackLaneDescriptor(task, normalizedGroupBy, labels);
}

export function groupTasksBySwimLane(tasks, groupBy, labelsInput, selectedLabelGroup = '', swimLaneOrder = []) {
  const labels = normalizeLabelCollection(labelsInput);
  const normalizedGroupBy = normalizeGroupBy(groupBy);
  const byLane = new Map();

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_LABEL_GROUP) {
    getLabelsForSelectedGroup(labels, selectedLabelGroup).forEach((label) => {
      byLane.set(label.id, {
        key: label.id,
        value: label.name,
        isDefault: false,
        tasks: []
      });
    });
  }

  (Array.isArray(tasks) ? tasks : []).forEach((task) => {
    const lane = getSwimLaneDescriptor(task, normalizedGroupBy, labels, selectedLabelGroup);
    if (!byLane.has(lane.key)) {
      byLane.set(lane.key, {
        key: lane.key,
        value: lane.value,
        isDefault: lane.isDefault,
        tasks: []
      });
    }
    byLane.get(lane.key).tasks.push(task);
  });

  const defaultSort = (left, right) => {
    if (normalizedGroupBy === SWIMLANE_GROUP_BY_PRIORITY) {
      return PRIORITIES.indexOf(left.key) - PRIORITIES.indexOf(right.key);
    }
    if (left.isDefault && !right.isDefault) return 1;
    if (!left.isDefault && right.isDefault) return -1;
    return left.value.localeCompare(right.value, undefined, { sensitivity: 'base' });
  };

  const lanes = [...byLane.values()];

  if (Array.isArray(swimLaneOrder) && swimLaneOrder.length > 0) {
    return lanes.sort((a, b) => {
      const ai = swimLaneOrder.indexOf(a.key);
      const bi = swimLaneOrder.indexOf(b.key);
      if (ai === -1 && bi === -1) return defaultSort(a, b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }

  return lanes.sort(defaultSort);
}

export function buildBoardGrid(columns, swimLanes, tasks, groupBy, labelsInput, selectedLabelGroup = '') {
  const labels = normalizeLabelCollection(labelsInput);
  const normalizedColumns = Array.isArray(columns) ? columns : [];
  const normalizedLanes = Array.isArray(swimLanes) ? swimLanes : [];
  const cellsByLane = new Map();

  normalizedLanes.forEach((lane) => {
    const cells = {};
    normalizedColumns.forEach((column) => {
      cells[column.id] = [];
    });
    cellsByLane.set(lane.key, cells);
  });

  (Array.isArray(tasks) ? tasks : []).forEach((task) => {
    const lane = getSwimLaneDescriptor(task, groupBy, labels, selectedLabelGroup);
    const laneCells = cellsByLane.get(lane.key);
    if (!laneCells) return;
    if (!laneCells[task.column]) return;
    laneCells[task.column].push(task);
  });

  return normalizedLanes.map((lane) => ({
    ...lane,
    cells: cellsByLane.get(lane.key) || {}
  }));
}

export function getVisibleTasksForLane(tasksInCell, columnId) {
  const normalizedTasks = Array.isArray(tasksInCell) ? tasksInCell : [];
  return isDoneColumnId(columnId) ? [] : normalizedTasks;
}

export function getHiddenTaskCountForLane(tasksInCell, columnId) {
  if (!isDoneColumnId(columnId)) return 0;
  return Array.isArray(tasksInCell) ? tasksInCell.length : 0;
}

export function applySwimLaneAssignment(task, groupBy, laneKey, labelsInput, selectedLabelGroup = '') {
  const normalizedGroupBy = normalizeGroupBy(groupBy);
  const labels = normalizeLabelCollection(labelsInput);
  const nextLaneKey = typeof laneKey === 'string' && laneKey.trim() ? laneKey.trim() : NO_GROUP_LANE_KEY;
  const nextTask = {
    ...task,
    labels: getTaskLabelIds(task)
  };

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_LABEL) {
    if (nextLaneKey === NO_GROUP_LANE_KEY) {
      nextTask.swimlaneLabelId = '';
      return nextTask;
    }

    const label = labels.get(nextLaneKey);
    if (!label) return nextTask;

    nextTask.swimlaneLabelId = label.id;
    nextTask.labels = [
      label.id,
      ...nextTask.labels.filter((labelId) => labelId !== label.id)
    ];
    return nextTask;
  }

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_PRIORITY) {
    nextTask.priority = normalizePriorityLaneKey(nextLaneKey);
    return nextTask;
  }

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_LABEL_GROUP) {
    const group = getSelectedLabelGroup(selectedLabelGroup, labels);
    const groupLabels = getLabelsForSelectedGroup(labels, group);
    const groupLabelIds = new Set(groupLabels.map((label) => label.id));

    nextTask.labels = nextTask.labels.filter((labelId) => !groupLabelIds.has(labelId));

    if (nextLaneKey === NO_GROUP_LANE_KEY || !group) {
      nextTask.swimlaneLabelId = '';
      nextTask.swimlaneLabelGroup = '';
      return nextTask;
    }

    const label = labels.get(nextLaneKey);
    if (!label || normalizeSelectedLabelGroup(label.group) !== group) return nextTask;

    nextTask.swimlaneLabelId = label.id;
    nextTask.swimlaneLabelGroup = group;
    nextTask.labels = [
      label.id,
      ...nextTask.labels.filter((labelId) => labelId !== label.id)
    ];
    return nextTask;
  }

  if (nextLaneKey === NO_GROUP_LANE_KEY) {
    nextTask.swimlaneLabelGroup = '';
    return nextTask;
  }

  nextTask.swimlaneLabelGroup = nextLaneKey;
  return nextTask;
}
