import { createReadModelProjector } from './event-sourcing/read-model-projector.js';
import { checkAndScheduleSnapshot } from './event-sourcing/snapshot.js';
import { schedulePersist, scheduleReadModelPersist } from './idb-store.js';
import {
  state,
  taskCacheByBoard,
  safeParseArray,
  safeParseObject,
  loadGlobalSettings,
  BOARDS_KEY,
  GLOBAL_SETTINGS_KEY,
} from './storage-state.js';

// Sole writer of the read model (ADR-0005), extracted from this module (#119).
// Wired with the closure `state` + schedulers; the reducer stays pure.
export const readModelProjector = createReadModelProjector({
  state,
  taskCacheByBoard,
  loadGlobalSettings,
  safeParseArray,
  safeParseObject,
  schedulePersist,
  scheduleReadModelPersist,
  checkAndScheduleSnapshot,
  boardsKey: BOARDS_KEY,
  globalSettingsKey: GLOBAL_SETTINGS_KEY
});
