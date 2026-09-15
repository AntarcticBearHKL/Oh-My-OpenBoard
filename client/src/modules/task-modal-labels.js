// Label picker + search filtering for the task modal.

import { loadLabels } from './storage.js';
import { labelTextColor } from './utils.js';
import { groupLabels } from './labels.js';
import { $id, h, cx } from './dom.js';
import { state, CREATE_LABEL_SENTINEL } from './task-modal-state.js';

function getTaskLabelSearchQuery() {
  const input = $id('task-label-search');
  return (input?.value || '').trim().toLowerCase();
}
function renderActiveTaskLabels() {
  const container = $id('task-active-labels');
  if (!container) return;

  const allLabels = loadLabels();
  const uniqueSelected = [];
  for (const labelId of state.selectedTaskLabels) {
    if (!uniqueSelected.includes(labelId)) uniqueSelected.push(labelId);
  }
  state.selectedTaskLabels = uniqueSelected;

  const selectedLabels = uniqueSelected
    .map((id) => allLabels.find((l) => l.id === id))
    .filter(Boolean);

  container.innerHTML = '';
  container.style.display = selectedLabels.length > 0 ? 'flex' : 'none';

  selectedLabels.forEach((label) => {
    container.appendChild(h('span', {
      class: 'task-label',
      style: { backgroundColor: label.color, color: labelTextColor(label.color) }
    },
      label.name,
      h('button', {
        type: 'button',
        class: 'active-label-remove',
        'aria-label': `Remove label ${label.name}`,
        title: 'Remove label',
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          state.selectedTaskLabels = state.selectedTaskLabels.filter((id) => id !== label.id);
          renderActiveTaskLabels();
          updateTaskLabelsSelection();
        }
      }, '×')
    ));
  });
}
function temporarilyHideTaskModalForLabelsManager() {
  const taskModal = $id('task-modal');
  if (!taskModal) return;
  taskModal.classList.add('hidden');
}
export function restoreTaskModalAfterLabelsManager() {
  const taskModal = $id('task-modal');
  if (!taskModal) return;

  taskModal.classList.remove('hidden');
  const labelSearch = $id('task-label-search');
  if (labelSearch) labelSearch.value = '';
  state.labelSearchHighlightIndex = 0;
  updateTaskLabelsSelection();
  labelSearch?.focus();
  state.returnToTaskModalAfterLabelsManager = false;
}
function createLabelCheckboxItem(label, index) {
  const checkbox = h('input', { type: 'checkbox', value: label.id });
  checkbox.checked = state.selectedTaskLabels.includes(label.id);
  checkbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      if (!state.selectedTaskLabels.includes(label.id)) state.selectedTaskLabels.push(label.id);
    } else {
      state.selectedTaskLabels = state.selectedTaskLabels.filter(id => id !== label.id);
    }
    renderActiveTaskLabels();
  });

  return h('label', {
    class: cx('label-checkbox', index === state.labelSearchHighlightIndex && 'label-highlight'),
    'data-label-index': index
  },
    checkbox,
    h('span', {
      class: 'task-label label-color-swatch',
      style: { backgroundColor: label.color, color: labelTextColor(label.color) }
    }, label.name)
  );
}
export function updateTaskLabelsSelection() {
  renderActiveTaskLabels();
  const container = $id('task-labels-selection');
  container.innerHTML = '';

  const query = getTaskLabelSearchQuery();
  const labels = loadLabels();
  const filteredLabels = query
    ? labels.filter(label => {
        const name = (label.name || '').toLowerCase();
        const id = (label.id || '').toLowerCase();
        const group = (label.group || '').toLowerCase();
        return name.includes(query) || id.includes(query) || group.includes(query);
      })
    : labels;

  // Build flat ordered list of filtered label ids for keyboard navigation
  state.filteredLabelIds = [];

  if (filteredLabels.length === 0) {
    if (query) {
      // Add create-label sentinel so it participates in keyboard navigation
      state.filteredLabelIds.push(CREATE_LABEL_SENTINEL);
      container.appendChild(h('button', {
        type: 'button',
        class: cx('labels-empty-button', state.labelSearchHighlightIndex === 0 && 'label-highlight'),
        'data-label-index': '0',
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Dispatch event so labels-modal can handle it
          document.dispatchEvent(new CustomEvent('kanban:open-label-modal', {
            detail: { openedFromTaskEditor: true, initialName: query }
          }));
        }
      }, `No label found "${query}" - Create label`));
    } else {
      container.appendChild(h('div', { class: 'labels-empty' }, 'No matching labels'));
    }
    return;
  }

  const { ungrouped, groupMap, sortedGroups } = groupLabels(filteredLabels);
  ungrouped.forEach(l => state.filteredLabelIds.push(l.id));
  sortedGroups.forEach(gn => groupMap.get(gn).forEach(l => state.filteredLabelIds.push(l.id)));

  // Clamp highlight index
  if (state.labelSearchHighlightIndex >= state.filteredLabelIds.length) {
    state.labelSearchHighlightIndex = Math.max(0, state.filteredLabelIds.length - 1);
  }

  let idx = 0;
  ungrouped.forEach(label => {
    container.appendChild(createLabelCheckboxItem(label, idx++));
  });

  sortedGroups.forEach(groupName => {
    container.appendChild(h('div', { class: 'label-group-header label-group-header-picker' }, groupName));
    groupMap.get(groupName).forEach(label => {
      container.appendChild(createLabelCheckboxItem(label, idx++));
    });
  });
}
export function scrollHighlightedLabelIntoView() {
  const container = $id('task-labels-selection');
  if (!container) return;
  const highlighted = container.querySelector('.label-highlight');
  if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
}
