import { loadSettings } from './storage.js';
import { showEditModal } from './modals.js';
import { setupModalCloseHandlers } from './modal-utils.js';
import { renderIcons } from './icons.js';
import { $id, h } from './dom.js';
import { getNotificationTasks, formatDueStatus } from './notification-tasks.js';
import { setNotificationBannerHidden, syncNotificationBannerVisibilityToggle, renderNotificationBanner } from './notifications-banner.js';

let bannerResizeTimeout;

/**
 * Render the notifications modal content.
 */
function renderNotificationsModalContent() {
  const list = $id('notifications-list');
  if (!list) return;

  const tasks = getNotificationTasks();
  const settings = loadSettings();
  const thresholdDays = Number.isFinite(settings.notificationDays) ? settings.notificationDays : 3;

  list.innerHTML = '';

  if (tasks.length === 0) {
    list.appendChild(h('div', { class: 'notifications-empty' }, thresholdDays === 0
      ? 'No tasks due today.'
      : `No tasks due within the next ${thresholdDays} day${thresholdDays === 1 ? '' : 's'}.`));
    return;
  }

  tasks.forEach((task) => {
    const legacyTitle = typeof task.text === 'string' ? task.text : '';
    const titleText = typeof task.title === 'string' && task.title.trim() ? task.title : legacyTitle;
    const dueStatus = formatDueStatus(task.daysUntilDue, task.dueDate, settings.locale);
    const priority = typeof task.priority === 'string' ? task.priority : 'none';
    const openTask = () => { hideNotificationsModal(); showEditModal(task.id); };

    const item = h('div', {
      class: 'notification-item',
      role: 'button',
      tabindex: '0',
      'aria-label': `Open task: ${task.title}`,
      onClick: openTask,
    },
      h('div', { class: 'notification-item-content' },
        h('div', { class: 'notification-item-title' }, titleText),
        h('div', { class: 'notification-item-meta' },
          h('span', { class: dueStatus.className }, dueStatus.text),
          h('span', { class: `notification-item-priority priority-${priority}` }, priority)
        )
      ),
      h('span', { class: 'notification-item-arrow', 'data-lucide': 'chevron-right' })
    );
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(); }
    });
    list.appendChild(item);
  });

  renderIcons();
}

/**
 * Update the notification badge count on the bell button.
 */
function updateNotificationBadge() {
  const badges = ['notification-badge', 'notification-quick-badge'].map($id).filter(Boolean);
  const buttons = ['notifications-btn', 'notifications-quick-btn'].map($id).filter(Boolean);

  if (badges.length === 0) return;

  const tasks = getNotificationTasks();
  const count = tasks.length;
  const label = count === 1 ? '1 notification' : `${count} notifications`;
  const badgeText = count > 99 ? '99+' : String(count);

  if (count === 0) {
    badges.forEach((badge) => {
      badge.classList.add('hidden');
      badge.textContent = '';
    });
    buttons.forEach((button) => {
      button.setAttribute('aria-label', 'Notifications');
      button.removeAttribute('title');
    });
  } else {
    badges.forEach((badge) => {
      badge.classList.remove('hidden');
      badge.textContent = badgeText;
    });
    buttons.forEach((button) => {
      button.setAttribute('aria-label', `Notifications (${label})`);
      button.setAttribute('title', `Notifications (${label})`);
    });
  }
}

/**
 * Show the notifications modal.
 */
function showNotificationsModal() {
  syncNotificationBannerVisibilityToggle();
  renderNotificationsModalContent();
  const modal = $id('notifications-modal');
  modal?.classList.remove('hidden');
}

/**
 * Hide the notifications modal.
 */
function hideNotificationsModal() {
  const modal = $id('notifications-modal');
  modal?.classList.add('hidden');
}

/**
 * Check if the notifications modal is open.
 */
function isNotificationsModalOpen() {
  const modal = $id('notifications-modal');
  return modal && !modal.classList.contains('hidden');
}

/**
 * Initialize notification handlers.
 */
export function initializeNotifications() {
  const bannerCloseBtn = $id('notification-banner-close-btn');
  bannerCloseBtn?.addEventListener('click', () => {
    setNotificationBannerHidden(true);
    refreshNotifications();
  });

  const bannerToggle = $id('notification-banner-visibility-toggle');
  bannerToggle?.addEventListener('change', () => {
    setNotificationBannerHidden(!bannerToggle.checked);
    refreshNotifications();
  });

  // Bell button click handlers (menu + quick access)
  const notificationButtons = ['notifications-btn', 'notifications-quick-btn'].map($id).filter(Boolean);
  notificationButtons.forEach((button) => {
    button.addEventListener('click', showNotificationsModal);
  });

  // Close button handler
  const closeBtn = $id('notifications-close-btn');
  closeBtn?.addEventListener('click', hideNotificationsModal);

  setupModalCloseHandlers('notifications-modal', hideNotificationsModal);

  // Escape key handler
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isNotificationsModalOpen()) {
      hideNotificationsModal();
    }
  });

  // Reflow banner items on viewport resize (debounced)
  window.addEventListener('resize', () => {
    clearTimeout(bannerResizeTimeout);
    bannerResizeTimeout = setTimeout(() => renderNotificationBanner(showNotificationsModal), 120);
  });

  // Initial render
  refreshNotifications();

  // Keep toggle in sync on load.
  syncNotificationBannerVisibilityToggle();
}

/**
 * Refresh all notification UI elements.
 * Call this after renderBoard() or any task update.
 */
export function refreshNotifications() {
  renderNotificationBanner(showNotificationsModal);
  updateNotificationBadge();
}
