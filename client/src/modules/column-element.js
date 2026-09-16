// Column element DOM construction — extracted from render.js

import { loadTasks, loadColumnSummaries, saveColumnSummary } from './storage.js';
import { formatTimestamp } from './dateutils.js';
import { showModal } from './modals.js';
import { BACKLOG_COLUMN_ID } from './constants.js';
import { getWipState, wipCounterLabel, applyWipCounter } from './wip-limit.js';
import { h } from './dom.js';

let activeSummaryOverlay = null;
let activeSummaryTrigger = null;
let summaryKeyHandler = null;

function closeColumnSummary({ restoreFocus = true } = {}) {
  const trigger = activeSummaryTrigger;

  if (trigger) {
    trigger.setAttribute('aria-expanded', 'false');
  }
  if (activeSummaryOverlay) {
    activeSummaryOverlay.remove();
  }
  if (summaryKeyHandler) {
    document.removeEventListener('keydown', summaryKeyHandler, true);
    summaryKeyHandler = null;
  }
  document.body.classList.remove('column-summary-open');
  activeSummaryOverlay = null;
  activeSummaryTrigger = null;

  if (restoreFocus && trigger && typeof trigger.focus === 'function' && document.contains(trigger)) {
    trigger.focus();
  }
  syncSummaryButton(trigger);
}

function syncSummaryButton(button) {
  if (!button || !button.dataset) return;
  const columnId = button.dataset.columnId;
  const summary = columnId ? loadColumnSummaries()[columnId] : null;
  const hasSummary = Boolean(summary && typeof summary.text === 'string' && summary.text.trim());
  button.classList.toggle('has-summary', hasSummary);
  button.title = hasSummary ? 'Summary — has content' : 'Summary — empty';
}

function buildSummaryBody(column) {
  let summary = loadColumnSummaries()[column.id] || null;
  const body = h('div', { class: 'column-summary-body' });

  const renderBody = () => {
    body.innerHTML = '';

    if (summary && typeof summary.text === 'string' && summary.text.trim()) {
      body.appendChild(h('p', { class: 'column-summary-text' }, summary.text));
      body.appendChild(h('p', { class: 'column-summary-meta' },
        `Updated ${formatTimestamp(summary.at, '')} · ${summary.by || 'agent'}`
      ));
    } else {
      body.appendChild(h('p', { class: 'column-summary-empty' }, 'No summary yet'));
      body.appendChild(h('p', { class: 'column-summary-meta' }, 'Agents write these over MCP.'));
    }

    body.appendChild(h('div', { class: 'column-summary-actions' },
      h('button', {
        type: 'button',
        class: 'column-summary-edit',
        onClick: () => renderEditor()
      }, summary && summary.text ? 'Edit' : 'Add summary')
    ));
  };

  const renderEditor = () => {
    body.innerHTML = '';

    const textarea = h('textarea', {
      class: 'column-summary-edit-area',
      maxlength: '2000',
      'aria-label': `Edit summary for ${column.name}`
    });
    textarea.value = summary && typeof summary.text === 'string' ? summary.text : '';

    body.appendChild(textarea);
    body.appendChild(h('div', { class: 'column-summary-actions' },
      h('button', {
        type: 'button',
        class: 'column-summary-cancel',
        onClick: () => renderBody()
      }, 'Cancel'),
      h('button', {
        type: 'button',
        class: 'column-summary-save',
        onClick: () => {
          const text = textarea.value.trim();
          if (!saveColumnSummary(column.id, text)) return;
          summary = text ? { text, at: new Date().toISOString(), by: 'human' } : null;
          renderBody();
        }
      }, 'Save')
    ));

    textarea.focus();
  };

  renderBody();
  return body;
}

function toggleColumnSummary(column, trigger) {
  if (activeSummaryTrigger === trigger) {
    closeColumnSummary();
    return;
  }

  closeColumnSummary({ restoreFocus: false });

  const overlay = h('div', {
    class: 'column-summary-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': `Summary for ${column.name}`,
    'data-column-id': column.id
  });

  const closeButton = h('button', {
    type: 'button',
    class: 'column-summary-close',
    'aria-label': 'Close summary',
    title: 'Close',
    onClick: () => closeColumnSummary()
  }, '×');

  overlay.appendChild(h('div', { class: 'column-summary-panel' },
    h('header', { class: 'column-summary-header' },
      h('div', { class: 'column-summary-heading' },
        h('p', { class: 'column-summary-eyebrow' }, 'Summary'),
        h('h3', { class: 'column-summary-title' }, column.name)
      ),
      closeButton
    ),
    buildSummaryBody(column)
  ));

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeColumnSummary();
  });

  document.body.appendChild(overlay);
  document.body.classList.add('column-summary-open');

  trigger.setAttribute('aria-expanded', 'true');
  activeSummaryOverlay = overlay;
  activeSummaryTrigger = trigger;

  summaryKeyHandler = (event) => {
    if (event.key === 'Escape') closeColumnSummary();
  };
  document.addEventListener('keydown', summaryKeyHandler, true);

  closeButton.focus();
}

function getTaskCountInColumn(columnId) {
  const tasks = loadTasks();
  return tasks.filter(t => t.column === columnId).length;
}

export function createColumnElement(column) {
  const taskCount = getTaskCountInColumn(column.id);

  const columnTitle = h('h2', { id: `column-title-${column.id}` }, column.name);

  const taskCounter = h('span', {
    class: 'task-counter',
    'data-column-id': column.id,
    'aria-label': wipCounterLabel(taskCount, column)
  });
  applyWipCounter(taskCounter, taskCount, column);

  const summaryButton = h('button', {
    type: 'button',
    class: 'column-summary-btn',
    'data-column-id': column.id,
    'aria-label': `Summary for ${column.name}`,
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
    title: 'Summary',
    onClick: (event) => {
      event.stopPropagation();
      toggleColumnSummary(column, summaryButton);
    }
  }, h('span', { 'data-lucide': 'sparkles', 'aria-hidden': 'true' }),
     h('span', { class: 'column-summary-btn-label' }, 'Summary'));

  syncSummaryButton(summaryButton);

  const addTaskButton = column.id === BACKLOG_COLUMN_ID
    ? h('button', {
      class: 'add-task-btn-icon',
      type: 'button',
      'aria-label': `Add task to ${column.name}`,
      title: 'Add task',
      onClick: () => showModal(column.id)
    }, h('span', { 'data-lucide': 'plus', 'aria-hidden': 'true' }))
    : null;

  const headerDiv = h('header', { class: 'column-header' },
    columnTitle, taskCounter, summaryButton, addTaskButton);

  const ul = h('ul', {
    class: 'tasks',
    role: 'list',
    'aria-label': `Tasks in ${column.name}`
  });

  return h('article', {
    class: 'task-column',
    'data-column': column.id,
    'data-wip': getWipState(taskCount, column),
    'aria-labelledby': `column-title-${column.id}`,
    style: column?.color ? { '--column-accent': column.color } : {}
  }, headerDiv, ul);
}
