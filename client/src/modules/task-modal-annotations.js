// Annotation list for the task modal.

import { formatTimestamp } from './dateutils.js';
import { addAnnotation, removeAnnotation } from './tasks.js';
import { $id, h } from './dom.js';
import { state } from './task-modal-state.js';

export function renderAnnotationsList() {
  const listEl = $id('task-annotations-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (state.selectedTaskAnnotations.length === 0) {
    listEl.appendChild(h('li', { class: 'annotations-empty' }, 'No annotations yet.'));
  } else {
    state.selectedTaskAnnotations.forEach((annotation) => {
      const author = annotation.author || 'human';
      listEl.appendChild(h('li', {
        class: 'annotation-item',
        'data-annotation-id': annotation.id
      },
        h('div', { class: 'annotation-text' }, annotation.text),
        h('div', { class: 'annotation-meta' },
          h('span', { class: 'annotation-author' }, author),
          h('span', { class: 'annotation-sep', 'aria-hidden': 'true' }, '·'),
          h('span', { class: 'annotation-at' }, formatTimestamp(annotation.at, annotation.at || ''))
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
    countEl.hidden = state.selectedTaskAnnotations.length === 0;
    countEl.textContent = String(state.selectedTaskAnnotations.length);
  }
}
function removeAnnotationEntry(annotationId) {
  if (!state.editingTaskId) return;
  const removed = removeAnnotation(state.editingTaskId, annotationId);
  if (removed === false) return;
  state.selectedTaskAnnotations = state.selectedTaskAnnotations.filter((entry) => entry.id !== annotationId);
  renderAnnotationsList();
}
export function addAnnotationFromInput() {
  const input = $id('task-annotation-input');
  const text = (input?.value || '').trim();
  if (!text || !state.editingTaskId) return;
  const annotation = addAnnotation(state.editingTaskId, text, 'human');
  if (!annotation) return;
  state.selectedTaskAnnotations.push(annotation);
  input.value = '';
  renderAnnotationsList();
}
export function hideAnnotationsSection() {
  state.selectedTaskAnnotations = [];
  $id('task-annotations-fieldset')?.classList.add('hidden');
  const input = $id('task-annotation-input');
  if (input) input.value = '';
}
