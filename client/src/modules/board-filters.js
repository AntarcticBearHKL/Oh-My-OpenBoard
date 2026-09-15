let boardFilterQuery = '';

export function setBoardFilterQuery(query) {
  boardFilterQuery = typeof query === 'string' ? query : '';
}

// Done column virtualization state
export const DONE_INITIAL_BATCH_SIZE = 50;
const DONE_LOAD_MORE_SIZE = 50;
let doneVisibleCount = DONE_INITIAL_BATCH_SIZE;

export function getDoneVisibleCount() {
  return doneVisibleCount;
}

export function growDoneVisibleCount() {
  doneVisibleCount += DONE_LOAD_MORE_SIZE;
}

function taskMatchesFilter(task, queryLower, labelsById) {
  if (!queryLower) return true;

  const legacyTitle = typeof task?.text === 'string' ? task.text : '';
  const title = (typeof task?.title === 'string' && task.title.trim() !== '') ? task.title : legacyTitle;
  const description = typeof task?.description === 'string' ? task.description : '';
  const priority = typeof task?.priority === 'string' ? task.priority : '';

  if (title.toLowerCase().includes(queryLower)) return true;
  if (description.toLowerCase().includes(queryLower)) return true;
  if (priority.toLowerCase().includes(queryLower)) return true;

  const labelIds = Array.isArray(task?.labels) ? task.labels : [];
  for (const id of labelIds) {
    const label = labelsById.get(id);
    if (!label) continue;
    if (label.name.includes(queryLower)) return true;
    if (label.group.includes(queryLower)) return true;
  }

  return false;
}

// Apply the active board filter. Shared by the full rebuild and the reconcile
// adapter so both show and count exactly the same tasks under a filter.
export function selectVisibleTasks(tasks, labels) {
  const queryLower = (boardFilterQuery || '').toString().trim().toLowerCase();
  if (!queryLower) return tasks;
  const labelsById = new Map(
    labels.map((l) => [
      l.id,
      {
        name: (l.name || '').toString().trim().toLowerCase(),
        group: (l.group || '').toString().trim().toLowerCase(),
      },
    ])
  );
  return tasks.filter((t) => taskMatchesFilter(t, queryLower, labelsById));
}

// The Done-column "Show more" control. Shared by the full rebuild and the
// reconcile adapter so both grow the virtualized batch identically.
export function buildShowMoreButton(remaining, onShowMore) {
  const showMoreBtn = document.createElement('button');
  showMoreBtn.classList.add('show-more-btn');
  showMoreBtn.type = 'button';
  showMoreBtn.textContent = `Show more (${remaining} remaining)`;
  showMoreBtn.addEventListener('click', () => {
    growDoneVisibleCount();
    onShowMore();
  });
  return showMoreBtn;
}
