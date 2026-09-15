import { loadSettings } from './storage.js';
import { showEditModal } from './modals.js';
import { renderIcons } from './icons.js';
import { $id, h } from './dom.js';
import { getNotificationTasks, formatDueStatus } from './notification-tasks.js';

const NOTIFICATION_BANNER_HIDDEN_KEY = 'kanbanNotificationBannerHidden';

function isNotificationBannerHidden() {
  return localStorage.getItem(NOTIFICATION_BANNER_HIDDEN_KEY) === 'true';
}

export function setNotificationBannerHidden(hidden) {
  localStorage.setItem(NOTIFICATION_BANNER_HIDDEN_KEY, hidden ? 'true' : 'false');
}

export function syncNotificationBannerVisibilityToggle() {
  const toggle = $id('notification-banner-visibility-toggle');
  if (!toggle) return;
  toggle.checked = !isNotificationBannerHidden();
}

/**
 * Render the notification banner.
 */
export function renderNotificationBanner(onShowMore) {
  const banner = $id('notification-banner');
  const list = $id('notification-banner-list');
  if (!banner || !list) return;

  const tasks = getNotificationTasks();
  const settings = loadSettings();

  if (tasks.length === 0) {
    banner.classList.add('hidden');
    return;
  }

  // Respect user preference to hide the banner.
  if (isNotificationBannerHidden()) {
    banner.classList.add('hidden');
    return;
  }

  list.innerHTML = '';

  const isDesktop = window.matchMedia('(min-width: 601px)').matches;
  const createBannerItem = (task) => {
    const legacyTitle = typeof task.text === 'string' ? task.text : '';
    const titleText = typeof task.title === 'string' && task.title.trim() ? task.title : legacyTitle;
    const dueStatus = formatDueStatus(task.daysUntilDue, task.dueDate, settings.locale);
    const openTask = () => showEditModal(task.id);

    const item = h('div', {
      class: 'notification-banner-item',
      role: 'button',
      tabindex: '0',
      'aria-label': `Open task: ${task.title}`,
      onClick: openTask,
    },
      h('span', { class: 'task-title' }, titleText),
      h('span', { class: `due-date ${dueStatus.className}` }, dueStatus.text)
    );
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(); }
    });
    return item;
  };

  if (isDesktop) {
    const availableWidth = list.clientWidth || list.getBoundingClientRect().width;
    let shown = 0;

    for (const task of tasks) {
      const item = createBannerItem(task);
      list.appendChild(item);
      shown += 1;

      // If we overflow and already have at least one item, back out the last addition.
      if (list.scrollWidth > availableWidth && shown > 1) {
        list.removeChild(item);
        shown -= 1;
        break;
      }
    }

    const remaining = tasks.length - shown;
    if (remaining > 0) {
      const more = h('div', {
        class: 'notification-banner-item notification-more',
        role: 'button',
        tabindex: '0',
        onClick: onShowMore,
      }, `+${remaining} `);
      more.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onShowMore(); }
      });

      list.appendChild(more);

      // If adding the indicator overflows, reclaim one more slot for it.
      if (list.scrollWidth > availableWidth && shown > 0) {
        list.removeChild(list.children[shown - 1]);
        shown -= 1;
        const updatedRemaining = tasks.length - shown;
        more.textContent = `+${updatedRemaining} `;
        list.appendChild(more);
      }
    }
  } else {
    const displayTasks = tasks.slice(0, 5);

    displayTasks.forEach((task) => {
      const item = createBannerItem(task);
      list.appendChild(item);
    });

    if (tasks.length > 5) {
      const more = h('div', {
        class: 'notification-banner-item notification-more',
        role: 'button',
        tabindex: '0',
        onClick: onShowMore,
      }, `+${tasks.length - 5} `);
      more.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onShowMore(); }
      });
      list.appendChild(more);
    }
  }

  banner.classList.remove('hidden');
  renderIcons();
}
