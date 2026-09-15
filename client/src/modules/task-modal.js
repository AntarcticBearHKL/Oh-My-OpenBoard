// Task add/edit modal — extracted from modals.js

import { isDoneColumnId, loadLabels, loadColumns, loadSettings, loadTasks } from './storage.js';
import { addAnnotation, addTask, isTaskLocked, removeAnnotation, setTaskBlockedReason, updateTask } from './tasks.js';
import { renderIcons } from './icons.js';
import { validateAndShowTaskTitleError, clearFieldError } from './validation.js';
import { createAccordionSection } from './accordion.js';
import { generateUUID, labelTextColor, URL_RE } from './utils.js';
import { promptDialog } from './dialog.js';
import { normalizePriority } from './normalize.js';
import {
  isBlockedColumnId,
  normalizeAcceptanceCriteria,
  normalizeAttachments,
  normalizeComments,
  normalizeCustomFields,
  normalizeEstimate,
  normalizeTaskType, TASK_TYPE_LABELS } from './agile.js';
import Sortable from 'sortablejs';
import { $id, h, cx } from './dom.js';

// Task modal state
let currentColumn = 'todo';
let editingTaskId = null;
let selectedTaskLabels = [];
let selectedTaskRelationships = []; // [{ type, targetTaskId }]
let selectedTaskSubTasks = []; // [{ id, title, completed, order }]
let selectedTaskAcceptanceCriteria = []; // [{ id, text, done }]
let selectedTaskComments = []; // [{ id, author, text, at }]
let selectedTaskAnnotations = []; // [{ id, text, author, at }]
let selectedTaskAttachments = []; // [{ id, name, url }]
let selectedTaskCustomFields = {}; // { [key]: value }
let subtaskSortable = null;
let returnToTaskModalAfterLabelsManager = false;
let selectCreatedLabelInTaskEditor = false;
let labelSearchHighlightIndex = 0;
let filteredLabelIds = []; // may contain '__create__' sentinel for the create-label button
const CREATE_LABEL_SENTINEL = '__create__';
const COMMENT_AUTHOR_KEY = 'openagile:commentAuthor';

const RELATIONSHIP_LABELS = { prerequisite: 'Prerequisite', dependent: 'Dependent', related: 'Related' };
const RELATIONSHIP_DESCRIPTIONS = {
  prerequisite: 'Another task must be completed before this one can begin.',
  dependent: 'This task is needed by another task before that task can start.',
  related: 'A general connection between two tasks without implying order.',
};

function shortId(id) {
  return '#' + (typeof id === 'string' ? id.slice(-5) : '');
}

// Expose state getters/setters for coordination with labels-modal
export function getSelectedTaskLabels() { return selectedTaskLabels; }
export function setSelectedTaskLabels(labels) { selectedTaskLabels = labels; }
export function getReturnToTaskModalFlag() { return returnToTaskModalAfterLabelsManager; }
export function setReturnToTaskModalFlag(val) { returnToTaskModalAfterLabelsManager = val; }
export function getSelectCreatedLabelFlag() { return selectCreatedLabelInTaskEditor; }
export function setSelectCreatedLabelFlag(val) { selectCreatedLabelInTaskEditor = val; }

function setTaskModalFullscreen(isFullscreen) {
  const modal = $id('task-modal');
  if (!modal) return;
  modal.classList.toggle('fullscreen', !!isFullscreen);

  const btn = $id('task-fullpage-btn');
  btn?.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');

  if (btn) {
    const icon = btn.querySelector('[data-lucide]');
    if (icon) {
      icon.setAttribute('data-lucide', isFullscreen ? 'minimize-2' : 'maximize-2');
    }
    btn.title = isFullscreen ? 'Exit full page' : 'Open in full page';
  }

  renderIcons();
}

function getTaskLabelSearchQuery() {
  const input = $id('task-label-search');
  return (input?.value || '').trim().toLowerCase();
}

function renderActiveTaskLabels() {
  const container = $id('task-active-labels');
  if (!container) return;

  const allLabels = loadLabels();
  const uniqueSelected = [];
  for (const labelId of selectedTaskLabels) {
    if (!uniqueSelected.includes(labelId)) uniqueSelected.push(labelId);
  }
  selectedTaskLabels = uniqueSelected;

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
          selectedTaskLabels = selectedTaskLabels.filter((id) => id !== label.id);
          renderActiveTaskLabels();
          updateTaskLabelsSelection();
        }
      }, '×')
    ));
  });
}

function renderActiveTaskRelationships() {
  const container = $id('task-active-relationships');
  if (!container) return;

  container.innerHTML = '';
  container.style.display = selectedTaskRelationships.length > 0 ? 'flex' : 'none';

  selectedTaskRelationships.forEach((rel) => {
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
          showEditModal(rel.targetTaskId);
        }
      }, shortId(rel.targetTaskId)),
      h('button', {
        type: 'button',
        class: 'relationship-badge__remove',
        'aria-label': `Remove relationship with ${shortId(rel.targetTaskId)}`,
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          selectedTaskRelationships = selectedTaskRelationships.filter((r) => r.targetTaskId !== rel.targetTaskId);
          renderActiveTaskRelationships();
        }
      }, '×')
    ));
  });
}

function updateRelationshipSearchResults(query) {
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
    if (t.id === editingTaskId) return false;
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
    const existing = selectedTaskRelationships.find((r) => r.targetTaskId === t.id);
    resultsEl.appendChild(h('button', {
      type: 'button',
      class: cx('relationship-result-item', existing && 'relationship-result-item--linked'),
      onMousedown: (e) => {
        e.preventDefault();
        const typeSelect = $id('task-relationship-type');
        const selectedType = typeSelect?.value || 'related';
        // Upsert: replace if same target, otherwise add
        selectedTaskRelationships = selectedTaskRelationships.filter((r) => r.targetTaskId !== t.id);
        selectedTaskRelationships.push({ type: selectedType, targetTaskId: t.id });
        renderActiveTaskRelationships();
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
  labelSearchHighlightIndex = 0;
  updateTaskLabelsSelection();
  labelSearch?.focus();
  returnToTaskModalAfterLabelsManager = false;
}

function groupLabels(labels) {
  const ungrouped = labels.filter(l => !(l.group || '').trim());
  const groupMap = new Map();
  labels.forEach(label => {
    const group = (label.group || '').trim();
    if (!group) return;
    if (!groupMap.has(group)) groupMap.set(group, []);
    groupMap.get(group).push(label);
  });
  const sortedGroups = [...groupMap.keys()].sort((a, b) => a.localeCompare(b));
  return { ungrouped, groupMap, sortedGroups };
}

function createLabelCheckboxItem(label, index) {
  const checkbox = h('input', { type: 'checkbox', value: label.id });
  checkbox.checked = selectedTaskLabels.includes(label.id);
  checkbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      if (!selectedTaskLabels.includes(label.id)) selectedTaskLabels.push(label.id);
    } else {
      selectedTaskLabels = selectedTaskLabels.filter(id => id !== label.id);
    }
    renderActiveTaskLabels();
  });

  return h('label', {
    class: cx('label-checkbox', index === labelSearchHighlightIndex && 'label-highlight'),
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
  filteredLabelIds = [];

  if (filteredLabels.length === 0) {
    if (query) {
      // Add create-label sentinel so it participates in keyboard navigation
      filteredLabelIds.push(CREATE_LABEL_SENTINEL);
      container.appendChild(h('button', {
        type: 'button',
        class: cx('labels-empty-button', labelSearchHighlightIndex === 0 && 'label-highlight'),
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
  ungrouped.forEach(l => filteredLabelIds.push(l.id));
  sortedGroups.forEach(gn => groupMap.get(gn).forEach(l => filteredLabelIds.push(l.id)));

  // Clamp highlight index
  if (labelSearchHighlightIndex >= filteredLabelIds.length) {
    labelSearchHighlightIndex = Math.max(0, filteredLabelIds.length - 1);
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

function updateSubTasksProgressLegend() {
  const legend = $id('task-subtasks-progress-legend');
  if (!legend) return;
  const total = selectedTaskSubTasks.length;
  if (total === 0) {
    legend.hidden = true;
    legend.textContent = '';
  } else {
    const completed = selectedTaskSubTasks.filter((s) => s.completed).length;
    legend.textContent = `${completed} / ${total}`;
    legend.hidden = false;
  }
}

function activateSubTaskInlineEdit(li, subtaskId) {
  const titleSpan = li.querySelector('.subtask-title');
  if (!titleSpan || li.querySelector('.subtask-inline-input')) return;

  const st = selectedTaskSubTasks.find((s) => s.id === subtaskId);
  if (!st) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.classList.add('subtask-inline-input');
  input.value = st.title;
  input.maxLength = 200;
  titleSpan.replaceWith(input);
  input.focus();
  input.select();

  let cancelled = false;

  function commit() {
    if (cancelled) return;
    const val = input.value.trim();
    if (val) st.title = val;
    renderSubTaskList();
  }

  function cancel() {
    cancelled = true;
    renderSubTaskList();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', commit);
}

function renderSubTaskList() {
  const listEl = $id('task-subtasks-list');
  if (!listEl) return;

  // Sort by order before rendering
  const sorted = [...selectedTaskSubTasks].sort((a, b) => a.order - b.order);

  listEl.innerHTML = '';
  sorted.forEach((st) => {
    const li = document.createElement('li');
    li.classList.add('subtask-item');
    if (st.completed) li.classList.add('subtask-completed');
    li.dataset.subtaskId = st.id;

    const handle = document.createElement('span');
    handle.classList.add('subtask-drag-handle');
    handle.setAttribute('aria-hidden', 'true');
    handle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = st.completed;
    checkbox.setAttribute('aria-label', `Mark "${st.title}" complete`);
    checkbox.addEventListener('change', () => {
      st.completed = checkbox.checked;
      li.classList.toggle('subtask-completed', st.completed);
      updateSubTasksProgressLegend();
    });

    const titleSpan = document.createElement('span');
    titleSpan.classList.add('subtask-title');
    titleSpan.textContent = st.title;
    titleSpan.title = 'Click to edit';
    titleSpan.addEventListener('click', () => activateSubTaskInlineEdit(li, st.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.classList.add('subtask-delete-btn');
    deleteBtn.setAttribute('aria-label', `Delete sub-task "${st.title}"`);
    deleteBtn.title = 'Delete sub-task';
    deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    deleteBtn.addEventListener('click', () => {
      selectedTaskSubTasks = selectedTaskSubTasks.filter((s) => s.id !== st.id);
      renderSubTaskList();
      updateSubTasksProgressLegend();
    });

    li.appendChild(handle);
    li.appendChild(checkbox);
    li.appendChild(titleSpan);
    li.appendChild(deleteBtn);
    listEl.appendChild(li);
  });

  // Init/reinit SortableJS
  if (subtaskSortable) subtaskSortable.destroy();
  subtaskSortable = new Sortable(listEl, {
    animation: 150,
    handle: '.subtask-drag-handle',
    onEnd: () => {
      const items = listEl.querySelectorAll('[data-subtask-id]');
      items.forEach((el, i) => {
        const s = selectedTaskSubTasks.find((x) => x.id === el.dataset.subtaskId);
        if (s) s.order = i + 1;
      });
    }
  });

  updateSubTasksProgressLegend();
}

function loadCommentAuthor() {
  try {
    const stored = localStorage.getItem(COMMENT_AUTHOR_KEY);
    return (stored || '').trim() || 'You';
  } catch {
    return 'You';
  }
}

function saveCommentAuthor(author) {
  try {
    localStorage.setItem(COMMENT_AUTHOR_KEY, author);
  } catch {
    return;
  }
}

function formatCommentTimestamp(at) {
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? (at || '') : parsed.toLocaleString();
}


function formatRelativeTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const minutes = Math.floor((Date.now() - parsed.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return parsed.toLocaleDateString();
}

function setSummaryType(value) {
  const el = $id('task-summary-type');
  if (!el) return;
  const type = normalizeTaskType(value);
  el.textContent = TASK_TYPE_LABELS[type];
  el.className = `task-type task-type--${type}`;
}

function setSummaryEstimate(value) {
  const el = $id('task-summary-estimate');
  if (!el) return;
  const estimate = normalizeEstimate(value);
  el.textContent = estimate === null ? '' : `${estimate} pt${estimate === 1 ? '' : 's'}`;
  el.classList.toggle('hidden', estimate === null);
}

function setSummaryPriority(value) {
  const el = $id('task-summary-priority');
  if (!el) return;
  const priority = normalizePriority(value);
  el.textContent = priority === 'none' ? 'No priority' : priority;
  el.className = `task-priority priority-${priority}`;
}

function setSummaryDue(value) {
  const el = $id('task-summary-due');
  if (!el) return;
  const raw = (value || '').toString().trim();
  if (!raw) {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }
  const parsed = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  el.textContent = Number.isNaN(parsed.getTime()) ? raw : `Due ${parsed.toLocaleDateString()}`;
  el.classList.remove('hidden');
}

function setSummaryColumn(columnId) {
  const el = $id('task-summary-column');
  if (!el) return;
  const name = loadColumns().find((column) => column.id === columnId)?.name || '';
  if (!name) {
    el.textContent = '';
    el.classList.add('hidden');
    el.removeAttribute('title');
    el.removeAttribute('aria-label');
    return;
  }
  el.textContent = /^in\s/i.test(name) ? name : `In ${name}`;
  el.title = `Column: ${name}`;
  el.setAttribute('aria-label', `Column: ${name}`);
  el.classList.remove('hidden');
}

function updateTaskSummary(task) {
  const summary = $id('task-summary');
  if (!summary) return;
  summary.classList.remove('hidden');

  const keyEl = $id('task-modal-key');
  if (keyEl) {
    const key = typeof task.key === 'string' ? task.key.trim() : '';
    keyEl.textContent = key;
    keyEl.classList.toggle('hidden', !key);
  }

  setSummaryType(task.type);
  setSummaryEstimate(task.estimate);
  setSummaryPriority(task.priority);
  setSummaryDue(task.dueDate);
  setSummaryColumn(task.column);

  const claimChip = $id('task-claim-chip');
  const claimAgent = $id('task-claim-agent');
  const claimTime = $id('task-claim-time');
  const claimedBy = typeof task.claimedBy === 'string' ? task.claimedBy.trim() : '';
  if (claimChip && claimAgent && claimTime) {
    claimChip.classList.toggle('hidden', !claimedBy);
    claimAgent.textContent = claimedBy;
    claimTime.textContent = claimedBy ? formatRelativeTime(task.claimedAt) : '';
  }
}

function syncSummaryFromForm() {
  if ($id('task-summary')?.classList.contains('hidden')) return;
  setSummaryType($id('task-type')?.value);
  setSummaryEstimate($id('task-estimate')?.value);
  setSummaryPriority($id('task-priority')?.value);
  setSummaryDue($id('task-due-date')?.value);
  setSummaryColumn($id('task-column')?.value);
}

function renderAnnotationsList() {
  const listEl = $id('task-annotations-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (selectedTaskAnnotations.length === 0) {
    listEl.appendChild(h('li', { class: 'annotations-empty' }, 'No annotations yet.'));
  } else {
    selectedTaskAnnotations.forEach((annotation) => {
      const author = annotation.author || 'human';
      listEl.appendChild(h('li', {
        class: 'annotation-item',
        'data-annotation-id': annotation.id
      },
        h('div', { class: 'annotation-text' }, annotation.text),
        h('div', { class: 'annotation-meta' },
          h('span', { class: 'annotation-author' }, author),
          h('span', { class: 'annotation-sep', 'aria-hidden': 'true' }, '·'),
          h('span', { class: 'annotation-at' }, formatCommentTimestamp(annotation.at))
        ),
        h('button', {
          type: 'button',
          class: 'annotation-remove-btn',
          title: 'Remove annotation',
          'aria-label': `Remove annotation by ${author}`,
          onClick: () => removeAnnotationEntry(annotation.id)
        }, '×')
      ));
    });
  }

  const countEl = $id('task-annotations-count');
  if (countEl) {
    countEl.hidden = selectedTaskAnnotations.length === 0;
    countEl.textContent = String(selectedTaskAnnotations.length);
  }
}

function removeAnnotationEntry(annotationId) {
  if (!editingTaskId) return;
  const removed = removeAnnotation(editingTaskId, annotationId);
  if (removed === false) return;
  selectedTaskAnnotations = selectedTaskAnnotations.filter((entry) => entry.id !== annotationId);
  renderAnnotationsList();
}

function addAnnotationFromInput() {
  const input = $id('task-annotation-input');
  const text = (input?.value || '').trim();
  if (!text || !editingTaskId) return;
  const annotation = addAnnotation(editingTaskId, text, 'human');
  if (!annotation) return;
  selectedTaskAnnotations.push(annotation);
  input.value = '';
  renderAnnotationsList();
}

function setTaskLocked(locked, task) {
  const form = $id('task-form');
  if (form) {
    form.classList.toggle('task-form--locked', locked);
    form.querySelectorAll('input, select, textarea, button').forEach((control) => {
      if (control.id === 'cancel-task-btn') return;
      control.disabled = locked;
    });
  }

  const annotations = $id('task-annotations-fieldset');
  if (annotations) {
    annotations.querySelectorAll('input, button').forEach((control) => {
      control.disabled = locked;
    });
  }

  const notice = $id('task-lock-notice');
  if (notice) {
    const claimedBy = task && typeof task.claimedBy === 'string' ? task.claimedBy.trim() : '';
    notice.textContent = locked
      ? (claimedBy
          ? `Subagent ${claimedBy} is working on this task — everything is read-only, including annotations.`
          : 'This task is read-only while a subagent works on it, including annotations.')
      : '';
    notice.classList.toggle('hidden', !locked);
  }
}

function resetTaskLock() {
  setTaskLocked(false, null);
}

function hideAnnotationsSection() {
  selectedTaskAnnotations = [];
  $id('task-annotations-fieldset')?.classList.add('hidden');
  const input = $id('task-annotation-input');
  if (input) input.value = '';
}

function updateAcceptanceProgress() {
  const legend = $id('task-acceptance-progress');
  if (!legend) return;
  const total = selectedTaskAcceptanceCriteria.length;
  if (total === 0) {
    legend.hidden = true;
    legend.textContent = '';
    return;
  }
  const done = selectedTaskAcceptanceCriteria.filter((entry) => entry.done).length;
  legend.textContent = `${done} / ${total}`;
  legend.hidden = false;
}

function renderAcceptanceCriteriaList() {
  const listEl = $id('task-acceptance-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  selectedTaskAcceptanceCriteria.forEach((criterion) => {
    const checkbox = h('input', {
      type: 'checkbox',
      'aria-label': `Mark "${criterion.text}" done`
    });
    checkbox.checked = criterion.done === true;
    checkbox.addEventListener('change', () => {
      criterion.done = checkbox.checked;
      listEl.querySelector(`[data-criterion-id="${criterion.id}"]`)?.classList.toggle('acceptance-item--done', criterion.done);
      updateAcceptanceProgress();
    });

    const textInput = h('input', {
      type: 'text',
      class: 'acceptance-text-input',
      maxlength: '200',
      'aria-label': 'Acceptance criterion'
    });
    textInput.value = criterion.text;
    textInput.addEventListener('input', () => {
      criterion.text = textInput.value;
    });

    const removeBtn = h('button', {
      type: 'button',
      class: 'acceptance-remove-btn',
      title: 'Remove criterion',
      'aria-label': `Remove criterion "${criterion.text}"`,
      onClick: () => {
        selectedTaskAcceptanceCriteria = selectedTaskAcceptanceCriteria.filter((entry) => entry.id !== criterion.id);
        renderAcceptanceCriteriaList();
      }
    }, '×');

    listEl.appendChild(h('li', {
      class: cx('acceptance-item', criterion.done && 'acceptance-item--done'),
      'data-criterion-id': criterion.id
    }, checkbox, textInput, removeBtn));
  });

  updateAcceptanceProgress();
}

function renderCommentsList() {
  const listEl = $id('task-comments-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  selectedTaskComments.forEach((comment) => {
    const removeBtn = h('button', {
      type: 'button',
      class: 'comment-remove-btn',
      title: 'Remove comment',
      'aria-label': `Remove comment by ${comment.author}`,
      onClick: () => {
        selectedTaskComments = selectedTaskComments.filter((entry) => entry.id !== comment.id);
        renderCommentsList();
      }
    }, '×');

    listEl.appendChild(h('li', { class: 'comment-item' },
      h('div', { class: 'comment-body' },
        h('div', { class: 'comment-meta' },
          h('span', { class: 'comment-author' }, comment.author),
          h('span', { class: 'comment-at' }, formatCommentTimestamp(comment.at))
        ),
        h('div', { class: 'comment-text' }, comment.text)
      ),
      removeBtn
    ));
  });

  const countEl = $id('task-comments-count');
  if (countEl) {
    countEl.hidden = selectedTaskComments.length === 0;
    countEl.textContent = String(selectedTaskComments.length);
  }
}

function renderAttachmentsList() {
  const listEl = $id('task-attachments-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  selectedTaskAttachments.forEach((attachment) => {
    const link = h('a', {
      href: attachment.url,
      target: '_blank',
      rel: 'noopener noreferrer',
      class: 'attachment-link',
      title: attachment.url
    }, attachment.name);
    if (link.protocol !== 'https:' && link.protocol !== 'http:') {
      link.removeAttribute('href');
    }

    const removeBtn = h('button', {
      type: 'button',
      class: 'attachment-remove-btn',
      title: 'Remove attachment',
      'aria-label': `Remove attachment ${attachment.name}`,
      onClick: () => {
        selectedTaskAttachments = selectedTaskAttachments.filter((entry) => entry.id !== attachment.id);
        renderAttachmentsList();
      }
    }, '×');

    listEl.appendChild(h('li', { class: 'attachment-item' }, link, removeBtn));
  });
}

function renderCustomFieldsList() {
  const listEl = $id('task-custom-fields-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  Object.entries(selectedTaskCustomFields).forEach(([key, value]) => {
    const keyInput = h('input', {
      type: 'text',
      class: 'custom-field-key-input',
      maxlength: '60',
      'aria-label': 'Custom field name'
    });
    keyInput.value = key;

    const valueInput = h('input', {
      type: 'text',
      class: 'custom-field-value-input',
      maxlength: '200',
      'aria-label': `Value for ${key}`
    });
    valueInput.value = value === null || value === undefined ? '' : String(value);

    keyInput.addEventListener('change', () => {
      const nextKey = keyInput.value.trim();
      if (!nextKey || nextKey === key) {
        keyInput.value = key;
        return;
      }
      const next = {};
      for (const [entryKey, entryValue] of Object.entries(selectedTaskCustomFields)) {
        next[entryKey === key ? nextKey : entryKey] = entryKey === key ? valueInput.value : entryValue;
      }
      selectedTaskCustomFields = next;
      renderCustomFieldsList();
    });
    valueInput.addEventListener('input', () => {
      selectedTaskCustomFields[key] = valueInput.value;
    });

    const removeBtn = h('button', {
      type: 'button',
      class: 'custom-field-remove-btn',
      title: 'Remove field',
      'aria-label': `Remove field ${key}`,
      onClick: () => {
        delete selectedTaskCustomFields[key];
        renderCustomFieldsList();
      }
    }, '×');

    listEl.appendChild(h('li', { class: 'custom-field-item' }, keyInput, valueInput, removeBtn));
  });
}

function renderParentTaskOptions(preferredId = null) {
  const select = $id('task-parent');
  if (!select) return;

  const previous = typeof preferredId === 'string' ? preferredId : '';
  select.innerHTML = '';
  select.appendChild(h('option', { value: '' }, 'None'));

  loadTasks().forEach((task) => {
    if (task.id === editingTaskId) return;
    const title = task.title || '(untitled)';
    const label = task.key ? `${task.key} · ${title}` : title;
    select.appendChild(h('option', { value: task.id }, label));
  });

  select.value = previous;
  if (select.value !== previous) select.value = '';
}

function renderAgileFields(preferredParentId = null) {
  renderParentTaskOptions(preferredParentId);
  renderAcceptanceCriteriaList();
  renderCommentsList();
  renderAttachmentsList();
  renderCustomFieldsList();

  const commentAuthor = $id('task-comment-author');
  if (commentAuthor) commentAuthor.value = loadCommentAuthor();
}

function resetAgileState() {
  selectedTaskAcceptanceCriteria = [];
  selectedTaskComments = [];
  selectedTaskAttachments = [];
  selectedTaskCustomFields = {};
}

function clearAgileInputs() {
  [
    'task-acceptance-input',
    'task-comment-input',
    'task-annotation-input',
    'task-attachment-name',
    'task-attachment-url',
    'task-custom-field-key',
    'task-custom-field-value'
  ].forEach((id) => {
    const el = $id(id);
    if (el) el.value = '';
  });
}

export function showModal(columnName, swimlaneContext) {
  currentColumn = columnName || loadColumns()[0]?.id || 'todo';
  editingTaskId = null;
  selectedTaskLabels = [];
  selectedTaskRelationships = [];
  selectedTaskSubTasks = [];
  returnToTaskModalAfterLabelsManager = false;
  selectCreatedLabelInTaskEditor = false;

  resetTaskLock();
  $id('task-summary')?.classList.add('hidden');
  $id('task-modal-key')?.classList.add('hidden');
  $id('task-claim-chip')?.classList.add('hidden');
  hideAnnotationsSection();

  setTaskModalFullscreen(false);
  $id('task-fullpage-btn')?.classList.add('hidden');

  const modal = $id('task-modal');
  const columnSelect = $id('task-column');
  const taskTitle = $id('task-title');
  const taskDescription = $id('task-description');
  const taskPriority = $id('task-priority');
  const taskDueDate = $id('task-due-date');
  const modalTitle = $id('task-modal-title');
  const submitBtn = $id('task-submit-btn');

  clearFieldError(taskTitle);

  modalTitle.textContent = 'Add New Task';
  submitBtn.textContent = 'Add Task';
  columnSelect.value = currentColumn;
  taskTitle.value = '';
  taskDescription.value = '';
  updateDescriptionLinks('');
  if (taskPriority) {
    const settings = loadSettings();
    taskPriority.value = settings.defaultPriority || 'none';
  }
  if (taskDueDate) taskDueDate.value = '';

  resetAgileState();
  clearAgileInputs();
  const taskType = $id('task-type');
  if (taskType) taskType.value = 'task';
  const taskEstimate = $id('task-estimate');
  if (taskEstimate) taskEstimate.value = '';
  const taskAssignee = $id('task-assignee');
  if (taskAssignee) taskAssignee.value = '';

  if (swimlaneContext) {
    const { groupBy, laneKey } = swimlaneContext;
    if (laneKey && laneKey !== '__no-group__') {
      if (groupBy === 'priority' && taskPriority) {
        taskPriority.value = laneKey;
      } else if (groupBy === 'label' || groupBy === 'label-group') {
        const labels = loadLabels();
        const label = labels.find((l) => l.id === laneKey);
        if (label) {
          selectedTaskLabels = [label.id];
        }
      }
    }
  }

  const labelSearch = $id('task-label-search');
  if (labelSearch) labelSearch.value = '';

  const relSearch = $id('task-relationship-search');
  if (relSearch) relSearch.value = '';
  const relResults = $id('task-relationship-results');
  if (relResults) { relResults.hidden = true; relResults.innerHTML = ''; }

  updateTaskLabelsSelection();
  renderActiveTaskRelationships();
  renderSubTaskList();
  renderAgileFields(null);
  modal.classList.remove('hidden');
  taskTitle.focus();
}

export function showEditModal(taskId) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  editingTaskId = taskId;
  selectedTaskLabels = task.labels || [];
  selectedTaskRelationships = Array.isArray(task.relationships) ? [...task.relationships] : [];
  selectedTaskSubTasks = Array.isArray(task.subTasks) ? task.subTasks.map((s) => ({ ...s })) : [];
  selectedTaskAcceptanceCriteria = normalizeAcceptanceCriteria(task.acceptanceCriteria).map((entry) => ({ ...entry }));
  selectedTaskComments = normalizeComments(task.comments).map((entry) => ({ ...entry }));
  selectedTaskAttachments = normalizeAttachments(task.attachments).map((entry) => ({ ...entry }));
  selectedTaskCustomFields = normalizeCustomFields(task.customFields);
  selectedTaskAnnotations = Array.isArray(task.annotations) ? task.annotations.map((entry) => ({ ...entry })) : [];
  returnToTaskModalAfterLabelsManager = false;
  selectCreatedLabelInTaskEditor = false;

  setTaskModalFullscreen(false);
  $id('task-fullpage-btn')?.classList.remove('hidden');

  const modal = $id('task-modal');
  const columnSelect = $id('task-column');
  const taskTitle = $id('task-title');
  const taskDescription = $id('task-description');
  const taskPriority = $id('task-priority');
  const taskDueDate = $id('task-due-date');
  const modalTitle = $id('task-modal-title');
  const submitBtn = $id('task-submit-btn');

  clearFieldError(taskTitle);

  modalTitle.textContent = 'Edit Task';
  submitBtn.textContent = 'Save Changes';
  columnSelect.value = task.column;

  const legacyTitle = typeof task.text === 'string' ? task.text : '';
  taskTitle.value = (typeof task.title === 'string' && task.title.trim() !== '') ? task.title : legacyTitle;
  taskDescription.value = typeof task.description === 'string' ? task.description : '';
  updateDescriptionLinks(taskDescription.value);
  if (taskPriority) taskPriority.value = typeof task.priority === 'string' ? task.priority : 'none';

  const rawDue = typeof task.dueDate === 'string' ? task.dueDate : '';
  const dueForInput = rawDue.includes('T') ? rawDue.slice(0, 10) : rawDue;
  if (taskDueDate) taskDueDate.value = dueForInput;

  const taskType = $id('task-type');
  if (taskType) taskType.value = normalizeTaskType(task.type);
  const taskEstimate = $id('task-estimate');
  if (taskEstimate) {
    const estimate = normalizeEstimate(task.estimate);
    taskEstimate.value = estimate === null ? '' : String(estimate);
  }
  const taskAssignee = $id('task-assignee');
  if (taskAssignee) taskAssignee.value = typeof task.assignee === 'string' ? task.assignee : '';

  const labelSearch = $id('task-label-search');
  if (labelSearch) labelSearch.value = '';

  const relSearch = $id('task-relationship-search');
  if (relSearch) relSearch.value = '';
  const relResults = $id('task-relationship-results');
  if (relResults) { relResults.hidden = true; relResults.innerHTML = ''; }

  updateTaskLabelsSelection();
  renderActiveTaskRelationships();
  renderSubTaskList();
  clearAgileInputs();
  renderAgileFields(typeof task.parentId === 'string' ? task.parentId : null);

  updateTaskSummary(task);
  $id('task-annotations-fieldset')?.classList.remove('hidden');
  renderAnnotationsList();
  const locked = isTaskLocked(task);
  setTaskLocked(locked, task);

  modal.classList.remove('hidden');
  if (locked) {
    $id('task-annotation-input')?.focus();
  } else {
    taskTitle.focus();
  }
}

function hideModal() {
  $id('task-modal').classList.add('hidden');
  editingTaskId = null;
  selectedTaskRelationships = [];
  selectedTaskSubTasks = [];
  if (subtaskSortable) { subtaskSortable.destroy(); subtaskSortable = null; }
  returnToTaskModalAfterLabelsManager = false;

  resetTaskLock();
  hideAnnotationsSection();

  const relResults = $id('task-relationship-results');
  if (relResults) { relResults.hidden = true; relResults.innerHTML = ''; }

  setTaskModalFullscreen(false);
  $id('task-fullpage-btn')?.classList.add('hidden');
}

function scrollHighlightedLabelIntoView() {
  const container = $id('task-labels-selection');
  if (!container) return;
  const highlighted = container.querySelector('.label-highlight');
  if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
}


export function updateDescriptionLinks(text) {
  const container = $id('task-description-links');
  if (!container) return;
  container.innerHTML = '';
  const matches = [...(text || '').matchAll(URL_RE)].map(m => m[0]);
  if (matches.length === 0) { container.hidden = true; return; }
  const unique = [...new Set(matches)];
  unique.forEach(url => {
    const a = h('a', {
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
      class: 'description-link-chip'
    }, url);
    if (a.protocol !== 'https:' && a.protocol !== 'http:') return;
    container.appendChild(a);
  });
  container.hidden = container.childElementCount === 0;
}

export function initializeTaskModalHandlers(setupModalCloseHandlers) {
  $id('task-description')?.addEventListener('input', (e) => {
    updateDescriptionLinks(e.target.value);
  });

  const taskLabelSearch = $id('task-label-search');
  taskLabelSearch?.addEventListener('input', () => {
    labelSearchHighlightIndex = 0;
    updateTaskLabelsSelection();
  });
  taskLabelSearch?.addEventListener('keydown', (e) => {
    if (filteredLabelIds.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      labelSearchHighlightIndex = Math.min(labelSearchHighlightIndex + 1, filteredLabelIds.length - 1);
      updateTaskLabelsSelection();
      scrollHighlightedLabelIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      labelSearchHighlightIndex = Math.max(labelSearchHighlightIndex - 1, 0);
      updateTaskLabelsSelection();
      scrollHighlightedLabelIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const highlightedId = filteredLabelIds[labelSearchHighlightIndex];
      if (!highlightedId) return;
      if (highlightedId === CREATE_LABEL_SENTINEL) {
        // Trigger create label flow
        const query = taskLabelSearch.value.trim();
        if (query) {
          document.dispatchEvent(new CustomEvent('kanban:open-label-modal', {
            detail: { openedFromTaskEditor: true, initialName: query }
          }));
        }
      } else {
        // Toggle existing label selection
        if (selectedTaskLabels.includes(highlightedId)) {
          selectedTaskLabels = selectedTaskLabels.filter(id => id !== highlightedId);
        } else {
          selectedTaskLabels.push(highlightedId);
        }
        // Clear search and reset
        taskLabelSearch.value = '';
        labelSearchHighlightIndex = 0;
        updateTaskLabelsSelection();
      }
    }
  });

  const relTypeSelect = $id('task-relationship-type');
  const relTypeTooltip = $id('rel-type-tooltip');
  if (relTypeSelect && relTypeTooltip) {
    relTypeSelect.addEventListener('change', () => {
      relTypeTooltip.textContent = RELATIONSHIP_DESCRIPTIONS[relTypeSelect.value] || '';
    });
  }

  const relSearch = $id('task-relationship-search');
  relSearch?.addEventListener('input', (e) => updateRelationshipSearchResults(e.target.value));
  relSearch?.addEventListener('focus', (e) => { if (e.target.value.trim()) updateRelationshipSearchResults(e.target.value); });

  document.addEventListener('click', (e) => {
    const resultsEl = $id('task-relationship-results');
    if (!resultsEl || resultsEl.hidden) return;
    const fieldset = $id('task-relationships-fieldset');
    if (fieldset && !fieldset.contains(e.target)) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
    }
  });

  $id('task-add-label-btn')?.addEventListener('click', () => {
    returnToTaskModalAfterLabelsManager = false;
    document.dispatchEvent(new CustomEvent('kanban:open-label-modal', {
      detail: { openedFromTaskEditor: true }
    }));
  });

  $id('task-fullpage-btn')?.addEventListener('click', () => {
    const modal = $id('task-modal');
    if (!modal) return;
    setTaskModalFullscreen(!modal.classList.contains('fullscreen'));
  });

  const subtaskInput = $id('task-subtask-input');
  subtaskInput?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const val = subtaskInput.value.trim();
    if (!val) return;
    const nextOrder = selectedTaskSubTasks.length + 1;
    selectedTaskSubTasks.push({ id: generateUUID(), title: val, completed: false, order: nextOrder });
    subtaskInput.value = '';
    renderSubTaskList();
  });

  const acceptanceInput = $id('task-acceptance-input');
  acceptanceInput?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const text = acceptanceInput.value.trim();
    if (!text) return;
    selectedTaskAcceptanceCriteria.push({ id: generateUUID(), text, done: false });
    acceptanceInput.value = '';
    renderAcceptanceCriteriaList();
  });

  function addCommentFromInputs() {
    const authorInput = $id('task-comment-author');
    const textInput = $id('task-comment-input');
    const text = (textInput?.value || '').trim();
    if (!text) return;
    const author = (authorInput?.value || '').trim() || 'You';
    saveCommentAuthor(author);
    if (authorInput) authorInput.value = author;
    selectedTaskComments.push({ id: generateUUID(), author, text, at: new Date().toISOString() });
    if (textInput) textInput.value = '';
    renderCommentsList();
  }

  $id('task-comment-add-btn')?.addEventListener('click', addCommentFromInputs);
  $id('task-comment-input')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addCommentFromInputs();
  });

  function addAttachmentFromInputs() {
    const nameInput = $id('task-attachment-name');
    const urlInput = $id('task-attachment-url');
    const name = (nameInput?.value || '').trim();
    const url = (urlInput?.value || '').trim();
    if (!name || !url) return;

    let parsed = null;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
      urlInput?.classList.add('invalid');
      return;
    }

    urlInput?.classList.remove('invalid');
    selectedTaskAttachments.push({ id: generateUUID(), name, url });
    if (nameInput) nameInput.value = '';
    if (urlInput) urlInput.value = '';
    renderAttachmentsList();
  }

  $id('task-attachment-add-btn')?.addEventListener('click', addAttachmentFromInputs);
  $id('task-attachment-url')?.addEventListener('input', (e) => e.target.classList.remove('invalid'));
  $id('task-attachment-url')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addAttachmentFromInputs();
  });
  $id('task-attachment-name')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addAttachmentFromInputs();
  });

  function addCustomFieldFromInputs() {
    const keyInput = $id('task-custom-field-key');
    const valueInput = $id('task-custom-field-value');
    const key = (keyInput?.value || '').trim();
    if (!key) return;
    selectedTaskCustomFields[key] = valueInput?.value ?? '';
    if (keyInput) keyInput.value = '';
    if (valueInput) valueInput.value = '';
    renderCustomFieldsList();
  }

  $id('task-custom-field-add-btn')?.addEventListener('click', addCustomFieldFromInputs);
  $id('task-custom-field-value')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addCustomFieldFromInputs();
  });

  $id('task-annotation-add-btn')?.addEventListener('click', addAnnotationFromInput);
  $id('task-annotation-input')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addAnnotationFromInput();
  });

  ['task-type', 'task-estimate', 'task-priority', 'task-due-date', 'task-column'].forEach((id) => {
    const el = $id(id);
    el?.addEventListener('input', syncSummaryFromForm);
    el?.addEventListener('change', syncSummaryFromForm);
  });

  $id('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const titleInput = $id('task-title');

    if (!validateAndShowTaskTitleError(titleInput)) return;

    const title = titleInput.value.trim();
    const description = $id('task-description').value;
    const priority = $id('task-priority')?.value;
    const dueDate = $id('task-due-date')?.value;
    const column = $id('task-column').value;
    const extraFields = {
      type: $id('task-type')?.value,
      estimate: normalizeEstimate($id('task-estimate')?.value),
      assignee: ($id('task-assignee')?.value || '').trim(),
      parentId: $id('task-parent')?.value || null,
      acceptanceCriteria: selectedTaskAcceptanceCriteria,
      comments: selectedTaskComments,
      attachments: selectedTaskAttachments,
      customFields: selectedTaskCustomFields
    };

    if (editingTaskId) {
      const editingId = editingTaskId;
      const previousTask = loadTasks().find((task) => task.id === editingId);
      updateTask(editingId, title, description, priority, dueDate, column, selectedTaskLabels, selectedTaskRelationships, selectedTaskSubTasks, extraFields);

      const columns = loadColumns();
      const enteredBlocked = !isBlockedColumnId(previousTask?.column, columns) && isBlockedColumnId(column, columns);
      if (enteredBlocked) {
        const reason = await promptDialog({
          title: 'Task blocked',
          message: 'Why is this task blocked?',
          placeholder: 'e.g. Waiting on API keys',
          confirmText: 'Save reason',
          cancelText: 'Skip'
        });
        if (typeof reason === 'string' && reason.trim()) {
          setTaskBlockedReason(editingId, reason);
          const { renderBoard } = await import('./render.js');
          renderBoard();
        }
      }
    } else {
      addTask(title, description, priority, dueDate, column, selectedTaskLabels, selectedTaskRelationships, selectedTaskSubTasks, extraFields);
    }
    hideModal();
  });

  setupModalCloseHandlers('task-modal', hideModal);
}

export { hideModal };
