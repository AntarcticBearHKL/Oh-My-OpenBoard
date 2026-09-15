import { loadLabels, loadSettings, saveSettings } from './storage.js';
import {
  SWIMLANE_GROUP_BY_LABEL_GROUP,
  getAvailableLabelGroupsFromCollection,
  getSelectedLabelGroup,
  normalizeGroupBy,
  normalizeLabelCollection,
  normalizeSelectedLabelGroup
} from './swimlane-lane-model.js';
import {
  getAvailableLanes,
  initLaneOrderSortable,
  mergeWithSavedOrder,
  renderLaneOrderList
} from './swimlane-order.js';

export function syncSwimLaneControls(settings = loadSettings()) {
  const toggle = document.getElementById('settings-swimlane-enabled');
  const quickToggle = document.getElementById('swimlane-quick-toggle');
  const groupBy = document.getElementById('settings-swimlane-group-by');
  const labelGroup = document.getElementById('settings-swimlane-label-group');
  const labelGroupField = document.getElementById('settings-swimlane-label-group-field');
  if (!toggle || !groupBy) return;

  const labels = normalizeLabelCollection(loadLabels());
  const availableGroups = getAvailableLabelGroupsFromCollection(labels);
  const selectedGroup = getSelectedLabelGroup(settings?.swimLaneLabelGroup, labels);
  const showLabelGroupSelector = settings.swimLanesEnabled === true && normalizeGroupBy(settings?.swimLaneGroupBy) === SWIMLANE_GROUP_BY_LABEL_GROUP;

  toggle.checked = settings.swimLanesEnabled === true;
  if (quickToggle) quickToggle.checked = settings.swimLanesEnabled === true;
  groupBy.value = normalizeGroupBy(settings.swimLaneGroupBy);
  groupBy.disabled = settings.swimLanesEnabled !== true;

  if (labelGroup && labelGroupField) {
    labelGroup.innerHTML = '';

    if (availableGroups.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No label groups available';
      labelGroup.appendChild(option);
    } else {
      availableGroups.forEach((group) => {
        const option = document.createElement('option');
        option.value = group;
        option.textContent = group;
        labelGroup.appendChild(option);
      });
      labelGroup.value = selectedGroup;
    }

    labelGroupField.hidden = !showLabelGroupSelector;
    labelGroup.disabled = !showLabelGroupSelector || availableGroups.length === 0;
  }

  // Populate the lane order list
  const orderField = document.getElementById('settings-swimlane-order-field');
  const orderList = document.getElementById('settings-swimlane-order-list');
  if (orderField && orderList) {
    const isEnabled = settings.swimLanesEnabled === true;
    const currentGroupBy = normalizeGroupBy(settings.swimLaneGroupBy);
    if (isEnabled) {
      const availableLanes = getAvailableLanes(currentGroupBy, labels, selectedGroup);
      const orderedLanes = mergeWithSavedOrder(availableLanes, settings.swimLaneOrder);
      renderLaneOrderList(orderList, orderedLanes);
      // Re-render icons for the grip handles
      import('./icons.js').then((m) => m.renderIcons());
    }
    orderField.hidden = !isEnabled;
  }
}

export function initializeSwimLaneControls(onChange) {
  const toggle = document.getElementById('settings-swimlane-enabled');
  const quickToggle = document.getElementById('swimlane-quick-toggle');
  const groupBy = document.getElementById('settings-swimlane-group-by');
  const labelGroup = document.getElementById('settings-swimlane-label-group');
  if (!toggle || !groupBy) return;

  syncSwimLaneControls();
  initLaneOrderSortable(onChange);

  quickToggle?.addEventListener('change', () => {
    const current = loadSettings();
    const labels = normalizeLabelCollection(loadLabels());
    const next = {
      ...current,
      swimLanesEnabled: quickToggle.checked === true,
      swimLaneLabelGroup: normalizeGroupBy(current.swimLaneGroupBy) === SWIMLANE_GROUP_BY_LABEL_GROUP
        ? getSelectedLabelGroup(current.swimLaneLabelGroup, labels)
        : current.swimLaneLabelGroup
    };
    saveSettings(next);
    syncSwimLaneControls(next);
    onChange?.(next);
  });

  toggle.addEventListener('change', () => {
    const current = loadSettings();
    const labels = normalizeLabelCollection(loadLabels());
    const next = {
      ...current,
      swimLanesEnabled: toggle.checked === true,
      swimLaneLabelGroup: normalizeGroupBy(current.swimLaneGroupBy) === SWIMLANE_GROUP_BY_LABEL_GROUP
        ? getSelectedLabelGroup(current.swimLaneLabelGroup, labels)
        : current.swimLaneLabelGroup
    };
    saveSettings(next);
    syncSwimLaneControls(next);
    onChange?.(next);
  });

  groupBy.addEventListener('change', () => {
    const current = loadSettings();
    const labels = normalizeLabelCollection(loadLabels());
    const nextGroupBy = normalizeGroupBy(groupBy.value);
    const next = {
      ...current,
      swimLaneGroupBy: nextGroupBy,
      swimLaneOrder: [],
      swimLaneLabelGroup: nextGroupBy === SWIMLANE_GROUP_BY_LABEL_GROUP
        ? getSelectedLabelGroup(current.swimLaneLabelGroup, labels)
        : current.swimLaneLabelGroup
    };
    saveSettings(next);
    syncSwimLaneControls(next);
    onChange?.(next);
  });

  labelGroup?.addEventListener('change', () => {
    const current = loadSettings();
    const next = {
      ...current,
      swimLaneLabelGroup: normalizeSelectedLabelGroup(labelGroup.value),
      swimLaneOrder: []
    };
    saveSettings(next);
    syncSwimLaneControls(next);
    onChange?.(next);
  });
}
