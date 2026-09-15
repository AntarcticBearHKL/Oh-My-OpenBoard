// Sub-task list for the task modal (sortable, inline edit).

import Sortable from 'sortablejs';
import { $id } from './dom.js';
import { state } from './task-modal-state.js';

function updateSubTasksProgressLegend() {
  const legend = $id('task-subtasks-progress-legend');
  if (!legend) return;
  const total = state.selectedTaskSubTasks.length;
  if (total === 0) {
    legend.hidden = true;
    legend.textContent = '';
  } else {
    const completed = state.selectedTaskSubTasks.filter((s) => s.completed).length;
    legend.textContent = `${completed} / ${total}`;
    legend.hidden = false;
  }
}
function activateSubTaskInlineEdit(li, subtaskId) {
  const titleSpan = li.querySelector('.subtask-title');
  if (!titleSpan || li.querySelector('.subtask-inline-input')) return;

  const st = state.selectedTaskSubTasks.find((s) => s.id === subtaskId);
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
export function renderSubTaskList() {
  const listEl = $id('task-subtasks-list');
  if (!listEl) return;

  // Sort by order before rendering
  const sorted = [...state.selectedTaskSubTasks].sort((a, b) => a.order - b.order);

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
      state.selectedTaskSubTasks = state.selectedTaskSubTasks.filter((s) => s.id !== st.id);
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
  if (state.subtaskSortable) state.subtaskSortable.destroy();
  state.subtaskSortable = new Sortable(listEl, {
    animation: 150,
    handle: '.subtask-drag-handle',
    onEnd: () => {
      const items = listEl.querySelectorAll('[data-subtask-id]');
      items.forEach((el, i) => {
        const s = state.selectedTaskSubTasks.find((x) => x.id === el.dataset.subtaskId);
        if (s) s.order = i + 1;
      });
    }
  });

  updateSubTasksProgressLegend();
}
