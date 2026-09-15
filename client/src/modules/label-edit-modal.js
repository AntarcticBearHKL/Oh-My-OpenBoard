import { loadLabels } from './storage.js';
import { addLabel, updateLabel } from './labels.js';
import { alertDialog } from './dialog.js';
import { emit, DATA_CHANGED } from './events.js';
import { MAX_LABEL_NAME_LENGTH } from './constants.js';
import { $id, h } from './dom.js';

let editingLabelId = null;
let hasShownLabelMaxLengthAlert = false;

// These are coordinated with task-modal.js
let taskModalState = null;

export function setTaskModalState(state) {
  taskModalState = state;
}

export function getTaskModalState() {
  return taskModalState;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function isValidHexColor(value) {
  return HEX_COLOR_RE.test(value);
}

function updateLabelColorHex(color) {
  const hexInput = $id('label-color-hex');
  if (!hexInput) return;
  hexInput.value = color;
  hexInput.classList.remove('invalid');
}

function populateLabelGroupSuggestions() {
  const datalist = $id('label-group-suggestions');
  if (!datalist) return;
  datalist.innerHTML = '';
  const labels = loadLabels();
  const groups = [...new Set(
    labels.map(l => (l.group || '').trim()).filter(g => g.length > 0)
  )].sort((a, b) => a.localeCompare(b));
  groups.forEach(g => datalist.appendChild(h('option', { value: g })));
}

export function showLabelModal(labelId = null, { openedFromTaskEditor = false, initialName = '' } = {}) {
  editingLabelId = labelId;
  hasShownLabelMaxLengthAlert = false;

  if (taskModalState) {
    taskModalState.setSelectCreatedLabelFlag(!!openedFromTaskEditor);
  }

  const modal = $id('label-modal');
  const modalTitle = $id('label-modal-title');
  const nameInput = $id('label-name');
  const colorInput = $id('label-color');
  const groupInput = $id('label-group');
  const submitBtn = $id('label-submit-btn');

  if (labelId) {
    const labels = loadLabels();
    const label = labels.find(l => l.id === labelId);
    if (label) {
      modalTitle.textContent = 'Edit Label';
      submitBtn.textContent = 'Update Label';
      nameInput.value = label.name;
      colorInput.value = label.color;
      if (groupInput) groupInput.value = label.group || '';
    }
  } else {
    modalTitle.textContent = 'Add Label';
    submitBtn.textContent = 'Add Label';
    nameInput.value = initialName || '';
    colorInput.value = '#3b82f6';
    if (groupInput) groupInput.value = '';
  }

  populateLabelGroupSuggestions();
  updateLabelColorHex(colorInput.value);
  modal.classList.remove('hidden');
  nameInput.focus();
}

export function hideLabelModal() {
  $id('label-modal').classList.add('hidden');
  editingLabelId = null;
  if (taskModalState) {
    taskModalState.setSelectCreatedLabelFlag(false);
  }
}

export function initializeLabelEditModalHandlers(setupModalCloseHandlers, { refreshLabelsList, hideLabelsManager }) {
  const labelNameInput = $id('label-name');
  labelNameInput?.addEventListener('beforeinput', (e) => {
    if (!e || typeof e.data !== 'string' || e.data.length === 0) return;
    const input = e.target;
    if (!input || typeof input.value !== 'string') return;

    const start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
    const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : input.value.length;
    const nextValue = input.value.slice(0, start) + e.data + input.value.slice(end);
    if (nextValue.trim().length <= MAX_LABEL_NAME_LENGTH) return;

    e.preventDefault();
    if (hasShownLabelMaxLengthAlert) return;
    hasShownLabelMaxLengthAlert = true;
    void alertDialog({
      title: 'Label Name Too Long',
      message: `Label names are limited to ${MAX_LABEL_NAME_LENGTH} characters.`
    });
  });

  $id('label-color')?.addEventListener('input', (e) => {
    updateLabelColorHex(e.target.value);
  });

  $id('label-color-hex')?.addEventListener('input', (e) => {
    let val = e.target.value;
    if (val && !val.startsWith('#')) val = '#' + val;
    if (isValidHexColor(val)) {
      $id('label-color').value = val;
      e.target.classList.remove('invalid');
    } else {
      e.target.classList.toggle('invalid', val.length > 0);
    }
  });

  labelNameInput?.addEventListener('input', (e) => {
    const input = e.target;
    if (!input || typeof input.value !== 'string') return;
    const trimmed = input.value.trim();
    if (trimmed.length <= MAX_LABEL_NAME_LENGTH) return;

    input.value = trimmed.slice(0, MAX_LABEL_NAME_LENGTH);
    if (hasShownLabelMaxLengthAlert) return;
    hasShownLabelMaxLengthAlert = true;
    void alertDialog({
      title: 'Label Name Too Long',
      message: `Label names are limited to ${MAX_LABEL_NAME_LENGTH} characters.`
    });
  });

  $id('label-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $id('label-name').value;
    const hexInput = $id('label-color-hex');
    const hexVal = (hexInput?.value || '').trim();

    let color;
    if (hexVal && hexVal !== $id('label-color').value) {
      const normalized = hexVal.startsWith('#') ? hexVal : '#' + hexVal;
      if (!isValidHexColor(normalized)) {
        hexInput?.classList.add('invalid');
        await alertDialog({
          title: 'Invalid Hex Color',
          message: 'Please enter a valid hex color code (e.g. #3b82f6).'
        });
        hexInput?.focus();
        return;
      }
      $id('label-color').value = normalized;
      color = normalized;
    } else {
      color = $id('label-color').value;
    }

    const trimmedName = (name || '').trim();
    if (trimmedName.length > MAX_LABEL_NAME_LENGTH) {
      await alertDialog({
        title: 'Label Name Too Long',
        message: `Label names are limited to ${MAX_LABEL_NAME_LENGTH} characters.`
      });
      return;
    }

    const group = ($id('label-group')?.value || '').trim();
    const wasCreating = !editingLabelId;

    const result = editingLabelId
      ? updateLabel(editingLabelId, trimmedName, color, group)
      : addLabel(trimmedName, color, group);

    if (!result?.success) {
      let title = 'Unable to Save Label';
      let message = 'Could not save label.';

      if (result?.reason === 'DUPLICATE_NAME') {
        title = 'Label Already Exists';
        message = result?.message || 'A label with that name already exists (case-insensitive).';
      } else if (result?.reason === 'EMPTY_NAME') {
        title = 'Label Name Required';
        message = 'Please enter a label name.';
      }

      await alertDialog({ title, message });
      $id('label-name')?.focus();
      return;
    }

    // If the label was created from within the task editor, auto-select it.
    if (wasCreating && taskModalState?.getSelectCreatedLabelFlag() && result?.label?.id) {
      const selectedLabels = taskModalState.getSelectedTaskLabels();
      if (!selectedLabels.includes(result.label.id)) {
        selectedLabels.push(result.label.id);
        taskModalState.setSelectedTaskLabels(selectedLabels);
      }
      const labelSearch = $id('task-label-search');
      if (labelSearch) labelSearch.value = '';
      taskModalState.updateTaskLabelsSelection();
      labelSearch?.focus();
    }

    hideLabelModal();
    refreshLabelsList();
    emit(DATA_CHANGED);

    if (taskModalState?.getReturnToTaskModalFlag() && wasCreating) {
      hideLabelsManager();
    }
  });

  setupModalCloseHandlers('label-modal', hideLabelModal);
}
