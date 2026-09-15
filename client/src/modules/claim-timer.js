import { BLOCKED_COLUMN_ID, DONE_COLUMN_ID, FIXED_COLUMNS, IN_PROGRESS_COLUMN_ID, LEGACY_COLUMN_ALIASES, isDoneColumn } from './constants.js';
import { formatElapsedDuration } from './dateutils.js';

const TICK_INTERVAL_MS = 30000;
const CHIP_SELECTOR = '.task-claim-timer';
const ELAPSED_SELECTOR = '.task-claim-elapsed';

function toTimestampMs(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function canonicalColumnId(columnId) {
  const id = typeof columnId === 'string' ? columnId.trim() : '';
  return LEGACY_COLUMN_ALIASES.get(id) || id;
}

function defaultIsDoneColumnId(columnId) {
  return columnId === DONE_COLUMN_ID || isDoneColumn(FIXED_COLUMNS.find((column) => column.id === columnId));
}

export function claimStartMs(task) {
  const claimedAt = toTimestampMs(task?.claimedAt);
  if (claimedAt !== null) return claimedAt;

  const history = Array.isArray(task?.columnHistory) ? task.columnHistory : [];
  const entry = history.find((step) => canonicalColumnId(step?.column) === IN_PROGRESS_COLUMN_ID);
  return toTimestampMs(entry?.at);
}

export function claimTiming(task, now = Date.now(), isDoneColumnId = defaultIsDoneColumnId) {
  const column = canonicalColumnId(task?.column);
  const live = column === IN_PROGRESS_COLUMN_ID;
  const blocked = column === BLOCKED_COLUMN_ID;
  const done = !live && !blocked && isDoneColumnId(column) === true;
  if (!live && !blocked && !done) return null;

  const startMs = claimStartMs(task);
  if (startMs === null) return null;

  const endMs = live
    ? (now instanceof Date ? now.getTime() : Number(now))
    : toTimestampMs(blocked ? task?.blockedAt : task?.doneDate);
  if (endMs === null || !Number.isFinite(endMs) || endMs < startMs) return null;

  return { startMs, endMs, live };
}

export function deriveElapsedMs(task, now = Date.now(), isDoneColumnId = defaultIsDoneColumnId) {
  const timing = claimTiming(task, now, isDoneColumnId);
  return timing ? timing.endMs - timing.startMs : null;
}

function refreshChip(chip, now) {
  const startMs = Number(chip.dataset.claimStart);
  if (!Number.isFinite(startMs)) return;

  const rawEnd = chip.dataset.claimEnd;
  const endMs = rawEnd === undefined || rawEnd === '' ? now : Number(rawEnd);
  const elapsedMs = endMs - startMs;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;

  const elapsedEl = chip.querySelector(ELAPSED_SELECTOR);
  if (elapsedEl) elapsedEl.textContent = formatElapsedDuration(elapsedMs);
}

export function refreshClaimTimers(now = Date.now()) {
  document.querySelectorAll(CHIP_SELECTOR).forEach((chip) => refreshChip(chip, now));
}

let tickId = null;
let visibilityHandler = null;

export function startClaimTicker() {
  if (tickId !== null) return;

  tickId = setInterval(() => {
    if (document.hidden) return;
    refreshClaimTimers();
  }, TICK_INTERVAL_MS);

  visibilityHandler = () => {
    if (!document.hidden) refreshClaimTimers();
  };
  document.addEventListener('visibilitychange', visibilityHandler);
}

export function stopClaimTicker() {
  if (tickId !== null) {
    clearInterval(tickId);
    tickId = null;
  }
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}
