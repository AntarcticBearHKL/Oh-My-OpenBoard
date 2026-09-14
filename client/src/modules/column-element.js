// Column element DOM construction — extracted from render.js

import { loadTasks } from './storage.js';
import { showModal } from './modals.js';
import { getWipState, wipCounterLabel, applyWipCounter } from './wip-limit.js';
import { h } from './dom.js';

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

  const headerDiv = h('header', { class: 'column-header' }, columnTitle, taskCounter);

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
