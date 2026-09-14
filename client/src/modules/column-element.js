// Column element DOM construction — extracted from render.js

import { loadTasks, loadColumnSummaries, saveColumnSummary } from './storage.js';
import { showModal } from './modals.js';
import { getWipState, wipCounterLabel, applyWipCounter } from './wip-limit.js';
import { h } from './dom.js';

let activeSummaryPopover = null;
let activeSummaryTrigger = null;
let summaryOutsideHandler = null;
let summaryKeyHandler = null;

function closeColumnSummary() {
  if (activeSummaryTrigger) {
    activeSummaryTrigger.setAttribute('aria-expanded', 'false');
  }
  if (activeSummaryPopover) {
    activeSummaryPopover.remove();
  }
  if (summaryOutsideHandler) {
    document.removeEventListener('mousedown', summaryOutsideHandler, true);
    document.removeEventListener('click', summaryOutsideHandler, true);
    summaryOutsideHandler = null;
  }
  if (summaryKeyHandler) {
    document.removeEventListener('keydown', summaryKeyHandler, true);
    summaryKeyHandler = null;
  }
  activeSummaryPopover = null;
  activeSummaryTrigger = null;
}

function formatSummaryTimestamp(at) {
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString();
}

function buildSummaryBody(column) {
  let summary = loadColumnSummaries()[column.id] || null;
  const body = h('div', { class: 'column-summary-body' });

  const renderBody = () => {
    body.innerHTML = '';

    if (summary && typeof summary.text === 'string' && summary.text.trim()) {
      body.appendChild(h('p', { class: 'column-summary-text' }, summary.text));
      body.appendChild(h('p', { class: 'column-summary-meta' },
        `Updated ${formatSummaryTimestamp(summary.at)} · ${summary.by || 'agent'}`
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

  closeColumnSummary();

  const popover = h('div', {
    class: 'column-summary-popover',
    role: 'dialog',
    'aria-label': `AI summary for ${column.name}`,
    'data-column-id': column.id
  },
    h('div', { class: 'column-summary-popover-header' },
      h('h3', { class: 'column-summary-popover-title' },
        'AI summary',
        h('span', { class: 'column-summary-popover-column' }, column.name)
      ),
      h('button', {
        type: 'button',
        class: 'column-summary-close',
        'aria-label': 'Close summary',
        title: 'Close',
        onClick: () => closeColumnSummary()
      }, '×')
    ),
    buildSummaryBody(column)
  );

  document.body.appendChild(popover);

  const rect = trigger.getBoundingClientRect();
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
  const left = Math.max(8, Math.min(rect.left, viewportWidth - 296));
  popover.style.top = `${Math.round(rect.bottom + 6)}px`;
  popover.style.left = `${Math.round(left)}px`;

  trigger.setAttribute('aria-expanded', 'true');
  activeSummaryPopover = popover;
  activeSummaryTrigger = trigger;

  summaryOutsideHandler = (event) => {
    if (popover.contains(event.target) || trigger.contains(event.target)) return;
    closeColumnSummary();
  };
  summaryKeyHandler = (event) => {
    if (event.key === 'Escape') closeColumnSummary();
  };

  document.addEventListener('mousedown', summaryOutsideHandler, true);
  document.addEventListener('click', summaryOutsideHandler, true);
  document.addEventListener('keydown', summaryKeyHandler, true);
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
    'aria-label': `AI summary for ${column.name}`,
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
    title: 'AI summary',
    onClick: (event) => {
      event.stopPropagation();
      toggleColumnSummary(column, summaryButton);
    }
  }, h('span', { 'data-lucide': 'sparkles', 'aria-hidden': 'true' }));

  const headerDiv = h('header', { class: 'column-header' }, columnTitle, taskCounter, summaryButton);

  const ul = h('ul', {
    class: 'tasks',
    role: 'list',
    'aria-label': `Tasks in ${column.name}`
  });

  const addRow = h('div', { class: 'column-add-row' },
    h('button', {
      class: 'add-task-row-btn',
      type: 'button',
      'aria-label': `Add task to ${column.name}`,
      title: 'Add task',
      onClick: () => showModal(column.id)
    },
      h('span', { 'data-lucide': 'plus', 'aria-hidden': 'true' }),
      h('span', { class: 'add-task-row-label' }, 'Add task')
    )
  );

  return h('article', {
    class: 'task-column',
    'data-column': column.id,
    'data-wip': getWipState(taskCount, column),
    draggable: 'false',
    'aria-labelledby': `column-title-${column.id}`,
    style: column?.color ? { '--column-accent': column.color } : {}
  }, headerDiv, ul, addRow);
}
