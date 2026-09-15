// Relationship picker + active-relationship badges for the task modal.

import { isDoneColumnId, loadTasks } from './storage.js';
import { $id, h, cx } from './dom.js';
import { state, RELATIONSHIP_LABELS } from './task-modal-state.js';

function shortId(id) {
  return '#' + (typeof id === 'string' ? id.slice(-5) : '');
}
export function renderActiveTaskRelationships(onOpenTask) {
  const container = $id('task-active-relationships');
  if (!container) return;

  container.innerHTML = '';
  container.style.display = state.selectedTaskRelationships.length > 0 ? 'flex' : 'none';

  state.selectedTaskRelationships.forEach((rel) => {
    container.appendChild(h('span', {
      class: `relationship-badge relationship-badge--${rel.type}`
    },
      h('span', { class: 'relationship-badge__type' }, RELATIONSHIP_LABELS[rel.type] || rel.type),
      h('button', {
        type: 'button',
        class: 'relationship-badge__id',
        'aria-label': `Open task ${shortId(rel.targetTaskId)}`,
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenTask(rel.targetTaskId);
        }
      }, shortId(rel.targetTaskId)),
      h('button', {
        type: 'button',
        class: 'relationship-badge__remove',
        'aria-label': `Remove relationship with ${shortId(rel.targetTaskId)}`,
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          state.selectedTaskRelationships = state.selectedTaskRelationships.filter((r) => r.targetTaskId !== rel.targetTaskId);
          renderActiveTaskRelationships(onOpenTask);
        }
      }, '×')
    ));
  });
}
export function updateRelationshipSearchResults(query, onOpenTask) {
  const resultsEl = $id('task-relationship-results');
  if (!resultsEl) return;

  const trimmed = (query || '').trim().toLowerCase();
  if (!trimmed) {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
    return;
  }

  const allTasks = loadTasks();
  const matches = allTasks.filter((t) => {
    if (t.id === state.editingTaskId) return false;
    if (isDoneColumnId(t.column)) return false;
    const sid = shortId(t.id).toLowerCase();
    const title = (t.title || '').toLowerCase();
    return sid.includes(trimmed) || title.includes(trimmed);
  }).slice(0, 8);

  resultsEl.innerHTML = '';

  if (matches.length === 0) {
    resultsEl.appendChild(h('div', { class: 'relationship-results__empty' }, 'No tasks found'));
    resultsEl.hidden = false;
    return;
  }

  matches.forEach((t) => {
    const existing = state.selectedTaskRelationships.find((r) => r.targetTaskId === t.id);
    resultsEl.appendChild(h('button', {
      type: 'button',
      class: cx('relationship-result-item', existing && 'relationship-result-item--linked'),
      onMousedown: (e) => {
        e.preventDefault();
        const typeSelect = $id('task-relationship-type');
        const selectedType = typeSelect?.value || 'related';
        // Upsert: replace if same target, otherwise add
        state.selectedTaskRelationships = state.selectedTaskRelationships.filter((r) => r.targetTaskId !== t.id);
        state.selectedTaskRelationships.push({ type: selectedType, targetTaskId: t.id });
        renderActiveTaskRelationships(onOpenTask);
        const searchInput = $id('task-relationship-search');
        if (searchInput) searchInput.value = '';
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
      }
    },
      existing ? h('span', { class: 'relationship-result-item__current-type' }, `[${RELATIONSHIP_LABELS[existing.type] || existing.type}]`) : null,
      h('span', { class: 'relationship-result-item__id' }, shortId(t.id)),
      h('span', { class: 'relationship-result-item__title' }, t.title || '(untitled)')
    ));
  });

  resultsEl.hidden = false;
}
