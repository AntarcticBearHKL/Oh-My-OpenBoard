// Labels manager + individual label modal — extracted from modals.js

import { loadLabels } from './storage.js';
import { deleteLabel, groupLabels } from './labels.js';
import { confirmDialog } from './dialog.js';
import { renderIcons } from './icons.js';
import { createAccordionSection } from './accordion.js';
import { labelTextColor } from './utils.js';
import { $id, h } from './dom.js';
import { showLabelModal, initializeLabelEditModalHandlers } from './label-edit-modal.js';

function getLabelsManagerSearchQuery() {
  const input = $id('labels-search');
  return (input?.value || '').trim().toLowerCase();
}

function createLabelListItem(label) {
  return h('div', { class: 'label-item' },
    h('span', {
      class: 'task-label',
      style: { backgroundColor: label.color, color: labelTextColor(label.color) }
    }, label.name),
    h('div', { class: 'label-actions' },
      h('button', {
        class: 'btn-small',
        title: 'Edit label',
        onClick: () => showLabelModal(label.id)
      }, h('span', { 'data-lucide': 'pencil' })),
      h('button', {
        class: 'btn-small btn-danger',
        title: 'Delete label',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Delete Label',
            message: `Delete label "${label.name}"? This will remove it from all tasks.`,
            confirmText: 'Delete'
          });
          if (ok) {
            deleteLabel(label.id);
            renderLabelsList();
          }
        }
      }, h('span', { 'data-lucide': 'trash-2' }))
    )
  );
}

function renderLabelsList() {
  const container = $id('labels-list');
  container.innerHTML = '';

  const labels = loadLabels();
  const query = getLabelsManagerSearchQuery();
  const filtered = query
    ? labels.filter((label) => {
        const name = (label.name || '').toLowerCase();
        const id = (label.id || '').toLowerCase();
        const group = (label.group || '').toLowerCase();
        return name.includes(query) || id.includes(query) || group.includes(query);
      })
    : labels;

  if (filtered.length === 0) {
    container.appendChild(h('div', { class: 'labels-empty' },
      query ? 'No matching labels' : 'No labels yet'
    ));
    return;
  }

  const { ungrouped, groupMap, sortedGroups } = groupLabels(filtered);

  let firstSection = true;

  if (ungrouped.length > 0) {
    container.appendChild(createAccordionSection('Ungrouped', ungrouped, firstSection, createLabelListItem));
    firstSection = false;
  }

  sortedGroups.forEach(groupName => {
    container.appendChild(createAccordionSection(groupName, groupMap.get(groupName), firstSection, createLabelListItem));
    firstSection = false;
  });

  renderIcons();
}

export function showLabelsModal() {
  const input = $id('labels-search');
  if (input) input.value = '';
  renderLabelsList();
  $id('labels-modal').classList.remove('hidden');
  $id('labels-search')?.focus();
}

function hideLabelsModal() {
  $id('labels-modal').classList.add('hidden');

  const input = $id('labels-search');
  if (input) input.value = '';
}

export function initializeLabelsModalHandlers(setupModalCloseHandlers) {
  $id('labels-search')?.addEventListener('input', renderLabelsList);

  $id('manage-labels-btn').addEventListener('click', showLabelsModal);
  $id('add-label-btn').addEventListener('click', () => showLabelModal());
  setupModalCloseHandlers('labels-modal', hideLabelsModal);

  initializeLabelEditModalHandlers(setupModalCloseHandlers, {
    refreshLabelsList: renderLabelsList
  });
}

export { hideLabelsModal };
