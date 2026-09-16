import Sortable from 'sortablejs';
import { loadSettings, saveSettings } from './storage.js';
import {
  NO_GROUP_LANE_KEY,
  NO_GROUP_LANE_LABEL,
  SWIMLANE_GROUP_BY_LABEL_GROUP,
  getLabelsForSelectedGroup,
  normalizeGroupBy
} from './swimlane-lane-model.js';

let laneOrderSortable = null;

export function getAvailableLanes(groupByMode, labels, selectedLabelGroup) {
  const normalizedGroupBy = normalizeGroupBy(groupByMode);

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_LABEL_GROUP) {
    const groupLabels = getLabelsForSelectedGroup(labels, selectedLabelGroup);
    const lanes = groupLabels.map((label) => ({
      key: label.id,
      name: label.name,
      color: label.color || null
    }));
    lanes.push({ key: NO_GROUP_LANE_KEY, name: NO_GROUP_LANE_LABEL, color: null });
    return lanes;
  }

  // label mode: show all labels + No Group
  const lanes = [...labels.values()]
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
    .map((label) => ({
      key: label.id,
      name: label.name,
      color: label.color || null
    }));
  lanes.push({ key: NO_GROUP_LANE_KEY, name: NO_GROUP_LANE_LABEL, color: null });
  return lanes;
}

export function mergeWithSavedOrder(availableLanes, savedOrder) {
  if (!Array.isArray(savedOrder) || savedOrder.length === 0) return availableLanes;
  const laneMap = new Map(availableLanes.map((l) => [l.key, l]));
  const ordered = [];
  for (const key of savedOrder) {
    const lane = laneMap.get(key);
    if (lane) {
      ordered.push(lane);
      laneMap.delete(key);
    }
  }
  // Append any new lanes not in saved order
  for (const lane of laneMap.values()) {
    ordered.push(lane);
  }
  return ordered;
}

export function renderLaneOrderList(listEl, lanes) {
  listEl.innerHTML = '';
  for (const lane of lanes) {
    const li = document.createElement('li');
    li.className = 'swimlane-order-item';
    li.dataset.laneKey = lane.key;

    const handle = document.createElement('span');
    handle.className = 'swimlane-order-handle';
    handle.setAttribute('data-lucide', 'grip-vertical');
    handle.setAttribute('aria-hidden', 'true');
    li.appendChild(handle);

    if (lane.color) {
      const dot = document.createElement('span');
      dot.className = 'lane-color';
      dot.style.backgroundColor = lane.color;
      li.appendChild(dot);
    }

    const nameSpan = document.createElement('span');
    nameSpan.textContent = lane.name;
    li.appendChild(nameSpan);

    listEl.appendChild(li);
  }
}

export function initLaneOrderSortable(onChange) {
  const orderList = document.getElementById('settings-swimlane-order-list');
  if (!orderList) return;

  if (laneOrderSortable) {
    laneOrderSortable.destroy();
    laneOrderSortable = null;
  }

  laneOrderSortable = new Sortable(orderList, {
    animation: 150,
    delay: 150,
    delayOnTouchOnly: true,
    handle: '.swimlane-order-handle',
    ghostClass: 'swimlane-order-ghost',
    chosenClass: 'swimlane-order-chosen',
    draggable: '.swimlane-order-item',
    direction: 'vertical',
    onEnd() {
      const keys = [...orderList.children].map((li) => li.dataset.laneKey);
      const current = loadSettings();
      const next = { ...current, swimLaneOrder: keys };
      saveSettings(next);
      onChange?.(next);
    }
  });
}
