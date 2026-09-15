# Test Overview

Generated from test source. Do not edit by hand; run `npm run test:overview` from `client/`.

## Fast Scan

- Test files: 54
- Test cases: 482
- Unit files: 29
- DOM integration files: 25
- E2E files: 0

## How To Use This

- For a requested feature change, search this file for the feature, module, UI label, and spec name.
- If matching tests exist, update the closest unit/DOM/E2E case first.
- If no matching tests exist, add coverage in the layer recommended by `docs/system/spec/testing-strategy.md`.
- Treat the gap lists below as heuristics, not proof that behavior is untested.

## Coverage Gaps By Name

These lists compare source/spec filenames against test file names and test titles.

### Source Modules Without Obvious Named Coverage

- `src/modules/armed-delete-button.js`
- `src/modules/board-rename-modal.js`
- `src/modules/board-serializer.js`
- `src/modules/board-templates.js`
- `src/modules/calendar-utils.js`
- `src/modules/calendar.js`
- `src/modules/column-element.js`
- `src/modules/drag-session.js`
- `src/modules/icons.js`
- `src/modules/idb-store.js`
- `src/modules/import-board.js`
- `src/modules/import-normalize.js`
- `src/modules/impressum.js`
- `src/modules/label-edit-modal.js`
- `src/modules/labels-modal.js`
- `src/modules/local-server.js`
- `src/modules/modal-utils.js`
- `src/modules/notification-tasks.js`
- `src/modules/notifications-banner.js`
- `src/modules/projection-task-handlers.js`
- `src/modules/reports-cfd.js`
- `src/modules/reports-completions.js`
- `src/modules/reports-daily.js`
- `src/modules/reports-main.js`
- `src/modules/reports-utils.js`
- `src/modules/reports-velocity.js`
- `src/modules/reports.js`
- `src/modules/roadmap.js`
- `src/modules/spotlight.js`
- `src/modules/storage-board-mutations.js`
- `src/modules/storage-boards.js`
- `src/modules/storage-cross-board.js`
- `src/modules/storage-defaults.js`
- `src/modules/storage-entities.js`
- `src/modules/storage-migration.js`
- `src/modules/storage-normalize.js`
- `src/modules/storage-projector.js`
- `src/modules/storage-settings.js`
- `src/modules/storage-state.js`
- `src/modules/swimlane-collapse.js`
- `src/modules/swimlane-controls.js`
- `src/modules/swimlane-lane-model.js`
- `src/modules/swimlane-order.js`
- `src/modules/swimlane-renderer.js`
- `src/modules/task-card-meta.js`
- `src/modules/task-helpers.js`
- `src/modules/task-modal-agile-fields.js`
- `src/modules/task-modal-chrome.js`
- `src/modules/task-modal-form.js`
- `src/modules/task-modal-labels.js`
- `src/modules/task-modal-relationships.js`
- `src/modules/task-modal-state.js`
- `src/modules/task-modal-status.js`
- `src/modules/task-modal-subtasks.js`
- `src/modules/task-modal-summary.js`
- `src/modules/task-modal-wiring-agile.js`
- `src/modules/task-modal-wiring-controls.js`
- `src/modules/task-modal-wiring-submit.js`

### Specs Without Obvious Named Coverage

- None detected

## Test Files

## Unit Tests

### Agile

- Path: `tests/unit/agile.test.js`
- Type: Unit
- Test count: 25

- `tests/unit/agile.test.js:20` normalizeTaskType accepts the four agile types
- `tests/unit/agile.test.js:27` normalizeTaskType is case-insensitive and trims
- `tests/unit/agile.test.js:32` normalizeTaskType falls back to task for invalid values
- `tests/unit/agile.test.js:41` normalizeEstimate keeps finite numbers including zero
- `tests/unit/agile.test.js:48` normalizeEstimate returns null for empty or invalid values
- `tests/unit/agile.test.js:58` normalizeAcceptanceCriteria keeps entries and coerces done
- `tests/unit/agile.test.js:69` normalizeAcceptanceCriteria generates missing ids and drops empty text
- `tests/unit/agile.test.js:82` normalizeAcceptanceCriteria returns [] for non-arrays
- `tests/unit/agile.test.js:89` normalizeComments defaults the author to You and preserves timestamps
- `tests/unit/agile.test.js:98` normalizeComments stamps a missing timestamp and drops empty text
- `tests/unit/agile.test.js:107` normalizeAttachments keeps name, url and optional metadata
- `tests/unit/agile.test.js:121` normalizeAttachments omits missing size/type and filters incomplete entries
- `tests/unit/agile.test.js:135` normalizeCustomFields trims keys and preserves values
- `tests/unit/agile.test.js:141` normalizeCustomFields drops empty keys and non-objects
- `tests/unit/agile.test.js:149` boardKeyPrefix uses initials for multi-word names
- `tests/unit/agile.test.js:155` boardKeyPrefix uses the first three chars for single-word names
- `tests/unit/agile.test.js:161` boardKeyPrefix strips non-alphanumerics and falls back to BRD
- `tests/unit/agile.test.js:169` nextTaskKey starts at 1 for a fresh board
- `tests/unit/agile.test.js:173` nextTaskKey increments past the highest matching suffix
- `tests/unit/agile.test.js:178` nextTaskKey ignores malformed or foreign keys
- `tests/unit/agile.test.js:185` isBlockedColumnId matches the Blocked column by name
- `tests/unit/agile.test.js:202` taskAgeDays counts whole days since creationDate
- `tests/unit/agile.test.js:207` taskAgeDays returns null without a valid creationDate
- `tests/unit/agile.test.js:212` isTaskStale flags tasks unchanged for more than 14 days
- `tests/unit/agile.test.js:218` isTaskStale falls back to creationDate and ignores missing dates

### Backend Event Schema

- Path: `tests/unit/backend-event-schema.test.js`
- Type: Unit
- Test count: 1

- `tests/unit/backend-event-schema.test.js:7` latest backend migrations defensively keep events.board as text

### Board Groups

- Path: `tests/unit/board-groups.test.js`
- Type: Unit
- Test count: 17

- `tests/unit/board-groups.test.js:23` group store > starts with no groups
- `tests/unit/board-groups.test.js:27` group store > createGroup persists id, name, order and collapsed under openagile:groups
- `tests/unit/board-groups.test.js:37` group store > createGroup appends in order
- `tests/unit/board-groups.test.js:46` group store > createGroup falls back to a default name
- `tests/unit/board-groups.test.js:50` group store > renameGroup trims and persists the new name
- `tests/unit/board-groups.test.js:56` group store > renameGroup rejects unknown groups and empty names
- `tests/unit/board-groups.test.js:63` group store > toggleGroupCollapsed flips and persists the collapsed flag
- `tests/unit/board-groups.test.js:71` group store > setGroupCollapsed is a no-op for unknown groups
- `tests/unit/board-groups.test.js:76` group store > deleteGroup removes the group and unassigns its boards
- `tests/unit/board-groups.test.js:86` group store > deleteGroup ignores unknown ids
- `tests/unit/board-groups.test.js:90` group store > listGroups ignores malformed records and sorts by order
- `tests/unit/board-groups.test.js:103` group store > listGroups survives invalid JSON
- `tests/unit/board-groups.test.js:110` board → group mapping > assignBoardToGroup persists the mapping under openagile:boardGroup
- `tests/unit/board-groups.test.js:118` board → group mapping > assignBoardToGroup with a null group removes the mapping (Ungrouped)
- `tests/unit/board-groups.test.js:127` board → group mapping > assignBoardToGroup falls back to Ungrouped for unknown group ids
- `tests/unit/board-groups.test.js:132` board → group mapping > getGroupIdForBoard returns null for unknown boards
- `tests/unit/board-groups.test.js:137` board → group mapping > pruneBoardGroups drops mappings for boards that no longer exist

### Columns

- Path: `tests/unit/columns.test.js`
- Type: Unit
- Test count: 5

- `tests/unit/columns.test.js:11` columns are locked to the four fixed columns
- `tests/unit/columns.test.js:17` toggleColumnCollapsed toggles from false to true
- `tests/unit/columns.test.js:24` toggleColumnCollapsed toggles from true to false
- `tests/unit/columns.test.js:31` toggleColumnCollapsed returns false for non-existent column
- `tests/unit/columns.test.js:35` toggleColumnCollapsed returns false for empty ID

### Constants

- Path: `tests/unit/constants.test.js`
- Type: Unit
- Test count: 8

- `tests/unit/constants.test.js:14` PRIORITIES contains 5 values in correct order
- `tests/unit/constants.test.js:18` PRIORITY_SET contains all expected priorities and rejects unknown values
- `tests/unit/constants.test.js:28` PRIORITY_ORDER maps priorities to ascending numeric rank
- `tests/unit/constants.test.js:36` DEFAULT_PRIORITY is none
- `tests/unit/constants.test.js:40` DONE_COLUMN_ID is done
- `tests/unit/constants.test.js:44` DEFAULT_COLUMN_COLOR is a valid hex color
- `tests/unit/constants.test.js:48` MAX_LABEL_NAME_LENGTH is a positive integer
- `tests/unit/constants.test.js:53` open boards modal shortcut defaults to Ctrl+B

### Dateutils

- Path: `tests/unit/dateutils.test.js`
- Type: Unit
- Test count: 19

- `tests/unit/dateutils.test.js:13` calculateDaysUntilDue returns 0 when due today
- `tests/unit/dateutils.test.js:17` calculateDaysUntilDue returns 1 when due tomorrow
- `tests/unit/dateutils.test.js:21` calculateDaysUntilDue returns negative when overdue
- `tests/unit/dateutils.test.js:25` calculateDaysUntilDue returns positive for future date
- `tests/unit/dateutils.test.js:29` calculateDaysUntilDue returns null for empty string
- `tests/unit/dateutils.test.js:33` calculateDaysUntilDue returns null for invalid date
- `tests/unit/dateutils.test.js:40` formatCountdown returns empty string for null
- `tests/unit/dateutils.test.js:44` formatCountdown returns today for 0 days
- `tests/unit/dateutils.test.js:48` formatCountdown returns tomorrow for 1 day
- `tests/unit/dateutils.test.js:52` formatCountdown returns day count for 2-29 days
- `tests/unit/dateutils.test.js:57` formatCountdown returns months and days for 30+ days
- `tests/unit/dateutils.test.js:64` formatCountdown returns overdue with singular day
- `tests/unit/dateutils.test.js:68` formatCountdown returns overdue with plural days
- `tests/unit/dateutils.test.js:72` formatCountdown returns overdue with months
- `tests/unit/dateutils.test.js:79` getCountdownClassName returns countdown-none for null
- `tests/unit/dateutils.test.js:83` getCountdownClassName returns countdown-urgent within threshold
- `tests/unit/dateutils.test.js:89` getCountdownClassName returns countdown-warning within threshold
- `tests/unit/dateutils.test.js:94` getCountdownClassName returns countdown-normal beyond thresholds
- `tests/unit/dateutils.test.js:99` getCountdownClassName respects custom thresholds

### Backfill

- Path: `tests/unit/event-sourcing/backfill.test.js`
- Type: Unit
- Test count: 5

- `tests/unit/event-sourcing/backfill.test.js:51` event log backfill > emits a created event for every pre-existing entity
- `tests/unit/event-sourcing/backfill.test.js:65` event log backfill > a replaying device reconstructs each board and its tasks
- `tests/unit/event-sourcing/backfill.test.js:90` event log backfill > runs once and is a no-op on the next startup
- `tests/unit/event-sourcing/backfill.test.js:102` event log backfill > skips entities that already have a created event
- `tests/unit/event-sourcing/backfill.test.js:116` event log backfill > records the flag so a later run is skipped

### Board Delete Replay

- Path: `tests/unit/event-sourcing/board-delete-replay.test.js`
- Type: Unit
- Test count: 2

- `tests/unit/event-sourcing/board-delete-replay.test.js:43` a board deleted elsewhere does not come back when its events replay
- `tests/unit/event-sourcing/board-delete-replay.test.js:58` the tombstone survives a reload rather than resurrecting from IDB

### Board Scaffold Convergence

- Path: `tests/unit/event-sourcing/board-scaffold-convergence.test.js`
- Type: Unit
- Test count: 5

- `tests/unit/event-sourcing/board-scaffold-convergence.test.js:39` createBoard emits a column.created per default column and a label.created per default label
- `tests/unit/event-sourcing/board-scaffold-convergence.test.js:65` a fresh device reconstructs createBoard columns and labels from the event log alone
- `tests/unit/event-sourcing/board-scaffold-convergence.test.js:86` the default board uses a stable id across independent device initialisations
- `tests/unit/event-sourcing/board-scaffold-convergence.test.js:102` two devices seeding the default board converge to one board with no duplicate columns or labels
- `tests/unit/event-sourcing/board-scaffold-convergence.test.js:127` createBoard does not double-apply its own scaffold events onto the local read-model

### Convergence

- Path: `tests/unit/event-sourcing/convergence.test.js`
- Type: Unit
- Test count: 1

- `tests/unit/event-sourcing/convergence.test.js:18` same event set converges regardless of input order

### Delete Vs Edit

- Path: `tests/unit/event-sourcing/delete-vs-edit.test.js`
- Type: Unit
- Test count: 1

- `tests/unit/event-sourcing/delete-vs-edit.test.js:18` later task edit is dropped after task delete tombstone

### Emitter

- Path: `tests/unit/event-sourcing/emitter.test.js`
- Type: Unit
- Test count: 2

- `tests/unit/event-sourcing/emitter.test.js:15` scheduleDomainEvent persists an unsynced immutable event row
- `tests/unit/event-sourcing/emitter.test.js:38` scheduleDomainEvent rejects a type that is not a known domain event

### Hlc

- Path: `tests/unit/event-sourcing/hlc.test.js`
- Type: Unit
- Test count: 3

- `tests/unit/event-sourcing/hlc.test.js:19` compareHlc orders equal wallTime and counter by nodeId
- `tests/unit/event-sourcing/hlc.test.js:27` compareHlc remains transitive across wallTime counter and nodeId
- `tests/unit/event-sourcing/hlc.test.js:42` observeRemote advances counter from the remote HLC when remote wallTime wins

### Read Model Projector

- Path: `tests/unit/event-sourcing/read-model-projector.test.js`
- Type: Unit
- Test count: 4

- `tests/unit/event-sourcing/read-model-projector.test.js:57` createReadModelProjector > register() subscribes so an emitted board event projects into state and schedules read-model persist
- `tests/unit/event-sourcing/read-model-projector.test.js:70` createReadModelProjector > project() is idempotent by event id (dedup)
- `tests/unit/event-sourcing/read-model-projector.test.js:78` createReadModelProjector > register() is idempotent — a single emit projects once
- `tests/unit/event-sourcing/read-model-projector.test.js:87` createReadModelProjector > reset() unsubscribes the handler and clears dedup state

### Reducer

- Path: `tests/unit/event-sourcing/reducer.test.js`
- Type: Unit
- Test count: 10

- `tests/unit/event-sourcing/reducer.test.js:18` applyEvent is idempotent by event id
- `tests/unit/event-sourcing/reducer.test.js:35` task.deleted tombstones prevent later task updates from resurrecting the task
- `tests/unit/event-sourcing/reducer.test.js:51` task.updated merges different field events on the same task
- `tests/unit/event-sourcing/reducer.test.js:74` task.moved updates column order and columnHistory
- `tests/unit/event-sourcing/reducer.test.js:106` unknown event types warn and leave projection unchanged
- `tests/unit/event-sourcing/reducer.test.js:118` label events create update and tombstone labels
- `tests/unit/event-sourcing/reducer.test.js:142` label task membership events update task label refs
- `tests/unit/event-sourcing/reducer.test.js:164` column events create update delete and reorder columns
- `tests/unit/event-sourcing/reducer.test.js:180` settings.updated folds board settings
- `tests/unit/event-sourcing/reducer.test.js:190` subtask and relationship events update embedded task collections

### Snapshot

- Path: `tests/unit/event-sourcing/snapshot.test.js`
- Type: Unit
- Test count: 9

- `tests/unit/event-sourcing/snapshot.test.js:38` loadSnapshot returns null when no snapshot exists
- `tests/unit/event-sourcing/snapshot.test.js:42` saveSnapshot and loadSnapshot round-trip preserves projection state
- `tests/unit/event-sourcing/snapshot.test.js:66` gcEvents removes events at or before snapshotHlc and leaves later ones
- `tests/unit/event-sourcing/snapshot.test.js:81` gcEvents for a board snapshot does not delete unrelated boards\' events
- `tests/unit/event-sourcing/snapshot.test.js:103` checkAndScheduleSnapshot schedules snapshot after 500 events with jitter delay
- `tests/unit/event-sourcing/snapshot.test.js:119` checkAndScheduleSnapshot does not schedule when event count is below threshold
- `tests/unit/event-sourcing/snapshot.test.js:132` checkAndScheduleSnapshot ignores other boards when counting events
- `tests/unit/event-sourcing/snapshot.test.js:145` checkAndScheduleSnapshot schedules when snapshot age exceeds 14 days
- `tests/unit/event-sourcing/snapshot.test.js:162` global snapshot stored under __global__ key does not interfere with board snapshot

### Events

- Path: `tests/unit/events.test.js`
- Type: Unit
- Test count: 5

- `tests/unit/events.test.js:4` on + emit delivers event with detail
- `tests/unit/events.test.js:13` off removes the handler
- `tests/unit/events.test.js:24` multiple handlers all receive the event
- `tests/unit/events.test.js:38` emit with no subscribers does not throw
- `tests/unit/events.test.js:43` DATA_CHANGED constant has expected value

### Importexport

- Path: `tests/unit/importexport.test.js`
- Type: Unit
- Test count: 8

- `tests/unit/importexport.test.js:46` inspectImportPayload accepts valid board export objects
- `tests/unit/importexport.test.js:71` inspectImportPayload remaps legacy model ids to UUIDs while preserving references
- `tests/unit/importexport.test.js:105` inspectImportPayload rejects files above the size limit
- `tests/unit/importexport.test.js:111` inspectImportPayload warns for legacy task-only imports
- `tests/unit/importexport.test.js:125` inspectImportPayload preserves and remaps task relationships
- `tests/unit/importexport.test.js:147` inspectImportPayload remaps swimlane settings that reference labels and columns
- `tests/unit/importexport.test.js:174` inspectImportPayload removes unknown label references and warns
- `tests/unit/importexport.test.js:194` buildImportConfirmationMessage includes summary details

### Labels

- Path: `tests/unit/labels.test.js`
- Type: Unit
- Test count: 14

- `tests/unit/labels.test.js:14` addLabel creates label successfully
- `tests/unit/labels.test.js:26` addLabel returns EMPTY_NAME for empty name
- `tests/unit/labels.test.js:32` addLabel returns EMPTY_NAME for whitespace-only name
- `tests/unit/labels.test.js:38` addLabel returns DUPLICATE_NAME for case-insensitive duplicate
- `tests/unit/labels.test.js:45` addLabel truncates name to 40 characters
- `tests/unit/labels.test.js:52` addLabel trims group
- `tests/unit/labels.test.js:59` updateLabel updates label successfully
- `tests/unit/labels.test.js:68` updateLabel returns NOT_FOUND for non-existent label
- `tests/unit/labels.test.js:74` updateLabel returns DUPLICATE_NAME when conflicting with another label
- `tests/unit/labels.test.js:82` updateLabel allows keeping the same name on the same label
- `tests/unit/labels.test.js:88` updateLabel returns EMPTY_NAME for empty name
- `tests/unit/labels.test.js:97` deleteLabel removes label from labels list
- `tests/unit/labels.test.js:104` deleteLabel removes label ID from all tasks
- `tests/unit/labels.test.js:117` deleteLabel soft-deletes: label hidden from loadLabels but present in loadDeletedLabelsForBoard

### Normalize

- Path: `tests/unit/normalize.test.js`
- Type: Unit
- Test count: 30

- `tests/unit/normalize.test.js:16` normalizePriority returns valid priorities unchanged
- `tests/unit/normalize.test.js:24` normalizePriority is case-insensitive
- `tests/unit/normalize.test.js:30` normalizePriority returns none for invalid input
- `tests/unit/normalize.test.js:38` normalizePriority trims whitespace
- `tests/unit/normalize.test.js:44` isHexColor accepts valid 6-digit hex colors
- `tests/unit/normalize.test.js:50` isHexColor accepts valid 3-digit hex colors
- `tests/unit/normalize.test.js:55` isHexColor rejects invalid values
- `tests/unit/normalize.test.js:67` normalizeHexColor returns valid color unchanged
- `tests/unit/normalize.test.js:71` normalizeHexColor trims whitespace from valid color
- `tests/unit/normalize.test.js:75` normalizeHexColor returns default fallback for invalid color
- `tests/unit/normalize.test.js:80` normalizeHexColor uses custom fallback
- `tests/unit/normalize.test.js:86` boardDisplayName returns trimmed name
- `tests/unit/normalize.test.js:90` boardDisplayName returns Untitled board for missing/empty name
- `tests/unit/normalize.test.js:100` normalizeDueDate returns plain date unchanged
- `tests/unit/normalize.test.js:104` normalizeDueDate strips ISO time portion
- `tests/unit/normalize.test.js:109` normalizeDueDate returns empty string for empty/null input
- `tests/unit/normalize.test.js:117` normalizeActivityLog drops malformed entries and preserves valid entries
- `tests/unit/normalize.test.js:138` normalizeActivityLog drops entries with empty type, non-parseable timestamp, or invalid actor
- `tests/unit/normalize.test.js:157` normalizeActivityLog accepts ISO timestamps with UTC offset and microsecond precision
- `tests/unit/normalize.test.js:174` normalizeStringKeys deduplicates and trims
- `tests/unit/normalize.test.js:178` normalizeStringKeys filters empty strings and non-strings
- `tests/unit/normalize.test.js:182` normalizeStringKeys returns empty array for non-array input
- `tests/unit/normalize.test.js:190` normalizeSubTasks returns empty array for non-array input
- `tests/unit/normalize.test.js:197` normalizeSubTasks returns empty array for empty array input
- `tests/unit/normalize.test.js:201` normalizeSubTasks filters entries with missing id or title
- `tests/unit/normalize.test.js:213` normalizeSubTasks coerces completed to boolean
- `tests/unit/normalize.test.js:226` normalizeSubTasks preserves order when valid
- `tests/unit/normalize.test.js:235` normalizeSubTasks assigns index-based order when order is missing or non-finite
- `tests/unit/normalize.test.js:246` normalizeSubTasks trims id and title
- `tests/unit/normalize.test.js:254` normalizeSubTasks ignores non-object entries

### Security

- Path: `tests/unit/security.test.js`
- Type: Unit
- Test count: 2

- `tests/unit/security.test.js:4` escapeHtml encodes HTML-sensitive characters
- `tests/unit/security.test.js:8` formatBytes formats small and larger sizes

### Storage Idb

- Path: `tests/unit/storage-idb.test.js`
- Type: Unit
- Test count: 26

- `tests/unit/storage-idb.test.js:55` initStorage on empty IDB leaves boards list empty
- `tests/unit/storage-idb.test.js:60` initStorage creates a stable HLC node id on boot
- `tests/unit/storage-idb.test.js:66` initStorage is safe to call twice in the same session
- `tests/unit/storage-idb.test.js:77` saveTasks persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:94` emitted task.updated events project into task read model
- `tests/unit/storage-idb.test.js:114` saveColumns persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:132` saveLabels persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:148` saveSettings persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:164` createBoard persists board list and per-board defaults across sessions
- `tests/unit/storage-idb.test.js:179` active board id persists across sessions
- `tests/unit/storage-idb.test.js:194` deleteBoard removes per-board data from IDB
- `tests/unit/storage-idb.test.js:216` v2 migration rehomes board read models and removes legacy kv keys
- `tests/unit/storage-idb.test.js:238` v2 migration deletes legacy board event logs
- `tests/unit/storage-idb.test.js:249` v2 schema creates event sourcing stores and event indexes
- `tests/unit/storage-idb.test.js:261` migrates multi-board localStorage data on first initStorage
- `tests/unit/storage-idb.test.js:288` migrates legacy done id to a UUID done role and rewrites task references
- `tests/unit/storage-idb.test.js:325` migration cleans up localStorage after completing
- `tests/unit/storage-idb.test.js:345` migrates legacy single-board localStorage keys (pre-multi-board format)
- `tests/unit/storage-idb.test.js:367` migrates legacy single-board tasks without columns using UUID default column mappings
- `tests/unit/storage-idb.test.js:389` migration does not run again on a subsequent initStorage call (same IDB)
- `tests/unit/storage-idb.test.js:409` initStorage with corrupt kanbanBoards in IDB yields empty boards list
- `tests/unit/storage-idb.test.js:423` loadTasksForBoard reads tasks for a non-active board without changing active board
- `tests/unit/storage-idb.test.js:440` loadColumnsForBoard reads columns for a non-active board
- `tests/unit/storage-idb.test.js:459` loadLabelsForBoard reads labels for a non-active board
- `tests/unit/storage-idb.test.js:475` loadSettingsForBoard reads settings for a non-active board
- `tests/unit/storage-idb.test.js:491` loadTasksForBoard returns empty array for unknown board id

### Storage

- Path: `tests/unit/storage.test.js`
- Type: Unit
- Test count: 26

- `tests/unit/storage.test.js:30` ensureBoardsInitialized creates default board on empty storage
- `tests/unit/storage.test.js:39` ensureBoardsInitialized is idempotent
- `tests/unit/storage.test.js:48` listBoards returns empty array before any board is initialised
- `tests/unit/storage.test.js:54` createBoard creates board with correct keys
- `tests/unit/storage.test.js:65` createBoard uses Untitled board for empty name
- `tests/unit/storage.test.js:71` renameBoard updates board name
- `tests/unit/storage.test.js:82` renameBoard returns false for non-existent board
- `tests/unit/storage.test.js:87` renameBoard returns false for empty name
- `tests/unit/storage.test.js:93` updateBoardFields stores iteration fields on the board
- `tests/unit/storage.test.js:110` renameBoard preserves iteration fields
- `tests/unit/storage.test.js:122` updateBoardFields returns false without fields or board
- `tests/unit/storage.test.js:130` deleteBoard removes board and its data
- `tests/unit/storage.test.js:140` deleteBoard removes the last board and does not re-seed a default one
- `tests/unit/storage.test.js:149` deleteBoard switches active board if deleted board was active
- `tests/unit/storage.test.js:160` getActiveBoardName returns board name
- `tests/unit/storage.test.js:168` loadColumns returns default columns on fresh board
- `tests/unit/storage.test.js:177` loadColumns ensures Done column exists
- `tests/unit/storage.test.js:185` saveColumns + loadColumns roundtrip locks to the four fixed columns
- `tests/unit/storage.test.js:195` loadTasks normalizes priority on load
- `tests/unit/storage.test.js:205` loadTasks adds doneDate to tasks in Done column that lack it
- `tests/unit/storage.test.js:215` loadTasks removes doneDate from tasks not in Done column
- `tests/unit/storage.test.js:225` saveTasks + loadTasks roundtrip
- `tests/unit/storage.test.js:236` loadLabels adds empty group to labels missing it
- `tests/unit/storage.test.js:246` loadSettings returns defaults on fresh board
- `tests/unit/storage.test.js:255` loadSettings normalizes invalid swimLaneGroupBy
- `tests/unit/storage.test.js:262` loadSettings clamps countdownWarningThreshold to be >= urgentThreshold

### Swimlanes Utils

- Path: `tests/unit/swimlanes-utils.test.js`
- Type: Unit
- Test count: 5

- `tests/unit/swimlanes-utils.test.js:33` groupTasksBySwimLane groups tasks into distinct lanes plus No Group
- `tests/unit/swimlanes-utils.test.js:47` groupTasksBySwimLane sorts priority lanes in workflow order
- `tests/unit/swimlanes-utils.test.js:59` groupTasksBySwimLane includes one lane per label in the selected group
- `tests/unit/swimlanes-utils.test.js:70` buildBoardGrid places tasks into the correct lane and column cells
- `tests/unit/swimlanes-utils.test.js:88` getVisibleTasksForLane hides done-column tasks but keeps active columns visible

### Sync

- Path: `tests/unit/sync.test.js`
- Type: Unit
- Test count: 14

- `tests/unit/sync.test.js:95` isAuthenticated > returns false when authStore has no token
- `tests/unit/sync.test.js:101` isAuthenticated > returns false when token present but no record
- `tests/unit/sync.test.js:107` isAuthenticated > returns true when both token and record present
- `tests/unit/sync.test.js:117` ensureAuthenticated > returns false when no token or record
- `tests/unit/sync.test.js:123` ensureAuthenticated > returns true when token and record are valid
- `tests/unit/sync.test.js:130` ensureAuthenticated > returns false when token present but refresh fails
- `tests/unit/sync.test.js:138` ensureAuthenticated > returns true after successful refresh
- `tests/unit/sync.test.js:155` loginUser > calls authWithPassword with email and password
- `tests/unit/sync.test.js:163` loginUser > propagates errors from PocketBase
- `tests/unit/sync.test.js:172` registerUser > creates user with passwordConfirm field
- `tests/unit/sync.test.js:185` registerUser > does not call authStore.save — no auto-login
- `tests/unit/sync.test.js:191` registerUser > defaults name to empty string when not provided
- `tests/unit/sync.test.js:203` logoutUser > clears the auth store
- `tests/unit/sync.test.js:214` deleteBoardRemote > deletes the PocketBase board and all board-scoped records

### Tasks

- Path: `tests/unit/tasks.test.js`
- Type: Unit
- Test count: 36

- `tests/unit/tasks.test.js:18` addTask creates task with order 1 (top of column)
- `tests/unit/tasks.test.js:28` addTask bumps existing task orders in same column
- `tests/unit/tasks.test.js:38` addTask does nothing for empty title
- `tests/unit/tasks.test.js:43` addTask sets creationDate, changeDate, and columnHistory
- `tests/unit/tasks.test.js:53` addTask sets doneDate when added to Done column
- `tests/unit/tasks.test.js:59` addTask does not set doneDate for non-Done column
- `tests/unit/tasks.test.js:65` addTask preserves labels
- `tests/unit/tasks.test.js:73` updateTask updates title, description, priority
- `tests/unit/tasks.test.js:86` updateTask does nothing for empty title
- `tests/unit/tasks.test.js:94` updateTask appends to columnHistory on column change
- `tests/unit/tasks.test.js:105` updateTask sets doneDate when moving to Done column
- `tests/unit/tasks.test.js:114` updateTask removes doneDate when moving from Done column
- `tests/unit/tasks.test.js:124` updateTask seeds columnHistory if missing
- `tests/unit/tasks.test.js:137` deleteTask removes task by ID
- `tests/unit/tasks.test.js:149` deleteTask permanently removes task from live and deleted task lists by default
- `tests/unit/tasks.test.js:159` updateTaskPositionsFromDrop preserves existing task tombstones
- `tests/unit/tasks.test.js:188` purgeDeleted hard-removes task tombstones from storage
- `tests/unit/tasks.test.js:201` purgeDeleted with { tasks: false } keeps task tombstones
- `tests/unit/tasks.test.js:216` moveTaskToTopInColumn moves specified task to order 1
- `tests/unit/tasks.test.js:231` moveTaskToTopInColumn returns null for missing args
- `tests/unit/tasks.test.js:238` addTask stores subTasks when provided
- `tests/unit/tasks.test.js:253` addTask stores empty subTasks array when none provided
- `tests/unit/tasks.test.js:260` updateTask persists updated subTasks
- `tests/unit/tasks.test.js:278` updateTask clears subTasks when empty array passed
- `tests/unit/tasks.test.js:290` updateTask normalizes invalid subTask entries
- `tests/unit/tasks.test.js:305` subTasks persist through storage round-trip
- `tests/unit/tasks.test.js:320` addTask generates a board-prefixed key
- `tests/unit/tasks.test.js:329` addTask defaults the agile fields
- `tests/unit/tasks.test.js:345` addTask persists provided agile fields
- `tests/unit/tasks.test.js:368` updateTask persists agile fields and rejects a self-parent
- `tests/unit/tasks.test.js:390` updateTask without extraFields leaves agile fields untouched
- `tests/unit/tasks.test.js:428` updateTaskPositionsFromDrop flags and records a move into Blocked
- `tests/unit/tasks.test.js:446` updateTaskPositionsFromDrop leaves the reason empty when none is provided
- `tests/unit/tasks.test.js:457` updateTaskPositionsFromDrop clears blocked fields when leaving Blocked
- `tests/unit/tasks.test.js:482` setTaskBlockedReason stores a trimmed reason and clears on empty
- `tests/unit/tasks.test.js:497` setTaskBlockedReason returns false for a missing task

### Utils

- Path: `tests/unit/utils.test.js`
- Type: Unit
- Test count: 4

- `tests/unit/utils.test.js:4` generateUUID returns a string
- `tests/unit/utils.test.js:8` generateUUID matches UUID v4 format
- `tests/unit/utils.test.js:13` generateUUID produces unique values
- `tests/unit/utils.test.js:19` generateUUID has version digit 4 at correct position

### Validation

- Path: `tests/unit/validation.test.js`
- Type: Unit
- Test count: 5

- `tests/unit/validation.test.js:6` validateTaskTitle returns true for non-empty string
- `tests/unit/validation.test.js:10` validateTaskTitle returns true for whitespace-padded non-empty string
- `tests/unit/validation.test.js:14` validateTaskTitle returns false for empty string
- `tests/unit/validation.test.js:18` validateTaskTitle returns false for whitespace-only string
- `tests/unit/validation.test.js:22` validateTaskTitle returns false for null and undefined

### Wip Limit

- Path: `tests/unit/wip-limit.test.js`
- Type: Unit
- Test count: 12

- `tests/unit/wip-limit.test.js:17` normalizeWipLimit > coerces anything that is not a positive integer to unlimited
- `tests/unit/wip-limit.test.js:28` normalizeWipLimit > accepts numeric strings and floors fractions
- `tests/unit/wip-limit.test.js:34` normalizeWipLimit > caps at MAX_WIP_LIMIT
- `tests/unit/wip-limit.test.js:40` getWipLimit > reads the column limit
- `tests/unit/wip-limit.test.js:45` getWipLimit > Done is exempt in both role and legacy-id form
- `tests/unit/wip-limit.test.js:50` getWipLimit > tolerates a missing column
- `tests/unit/wip-limit.test.js:57` getWipState > under below the limit
- `tests/unit/wip-limit.test.js:62` getWipState > at exactly the limit
- `tests/unit/wip-limit.test.js:66` getWipState > over above the limit
- `tests/unit/wip-limit.test.js:71` getWipState > an unlimited or Done column is never at or over
- `tests/unit/wip-limit.test.js:79` wipCounterLabel > carries the state without relying on colour
- `tests/unit/wip-limit.test.js:88` import boundary > normalizeBoardModelIds coerces an untrusted wipLimit

## DOM Integration Tests

### Accordion

- Path: `tests/dom/accordion.test.js`
- Type: DOM Integration
- Test count: 1

- `tests/dom/accordion.test.js:6` createAccordionSection toggles collapsed state and updates the chevron

### Authsync

- Path: `tests/dom/authsync.test.js`
- Type: DOM Integration
- Test count: 8

- `tests/dom/authsync.test.js:81` initializeAuthSyncUI > returns without error when required DOM elements are missing
- `tests/dom/authsync.test.js:86` initializeAuthSyncUI > sets up handlers when all required elements present
- `tests/dom/authsync.test.js:94` health probe > disables login-btn when PocketBase is unreachable
- `tests/dom/authsync.test.js:103` health probe > leaves login-btn enabled when PocketBase responds ok
- `tests/dom/authsync.test.js:115` auth UI state > shows login-btn and hides user-info when not authenticated
- `tests/dom/authsync.test.js:122` auth UI state > hides login-btn and shows user-info when authenticated
- `tests/dom/authsync.test.js:135` register flow > shows confirm-email message after successful registration
- `tests/dom/authsync.test.js:154` register flow > does not call loginUser after registerUser

### Board Sidebar

- Path: `tests/dom/board-sidebar.test.js`
- Type: DOM Integration
- Test count: 9

- `tests/dom/board-sidebar.test.js:74` sidebar group tree > renders stored groups
- `tests/dom/board-sidebar.test.js:86` sidebar group tree > nests each board under its group and renders unmapped boards at the root
- `tests/dom/board-sidebar.test.js:102` sidebar group tree > marks the active iteration
- `tests/dom/board-sidebar.test.js:111` sidebar group tree > clicking an iteration switches the active board and emits DATA_CHANGED
- `tests/dom/board-sidebar.test.js:122` sidebar group tree > the chevron collapses a group and persists the state
- `tests/dom/board-sidebar.test.js:137` sidebar group tree > #add-group-btn creates a group and starts inline rename
- `tests/dom/board-sidebar.test.js:151` sidebar group tree > double-clicking a group name opens inline rename
- `tests/dom/board-sidebar.test.js:160` sidebar group tree > deleting a group needs two clicks and leaves its boards at the root
- `tests/dom/board-sidebar.test.js:178` sidebar group tree > deleting an iteration needs two clicks

### Boards Quick Switch

- Path: `tests/dom/boards-quick-switch.test.js`
- Type: DOM Integration
- Test count: 11

- `tests/dom/boards-quick-switch.test.js:94` click brand-text > does not open the boards modal
- `tests/dom/boards-quick-switch.test.js:105` delete board > deletes the PocketBase board before removing the local board
- `tests/dom/boards-quick-switch.test.js:120` Ctrl+B shortcut > opens the boards modal
- `tests/dom/boards-quick-switch.test.js:128` Ctrl+B shortcut > does not open the boards modal with the old Shift+B shortcut
- `tests/dom/boards-quick-switch.test.js:138` Ctrl+B shortcut > does not open the modal when an input is focused
- `tests/dom/boards-quick-switch.test.js:151` keyboard navigation in open boards modal > ArrowDown adds keyboard-focused to the first item on first press
- `tests/dom/boards-quick-switch.test.js:164` keyboard navigation in open boards modal > ArrowDown then ArrowDown moves focus to second item
- `tests/dom/boards-quick-switch.test.js:175` keyboard navigation in open boards modal > ArrowUp does not go below index 0
- `tests/dom/boards-quick-switch.test.js:186` keyboard navigation in open boards modal > does not navigate when modal is closed
- `tests/dom/boards-quick-switch.test.js:201` keyboard navigation in open boards modal > Enter on highlighted board activates it and closes the modal
- `tests/dom/boards-quick-switch.test.js:213` keyboard navigation in open boards modal > Enter does nothing when no item is highlighted

### Boards Select Refresh

- Path: `tests/dom/boards-select-refresh.test.js`
- Type: DOM Integration
- Test count: 2

- `tests/dom/boards-select-refresh.test.js:50` #board-select refresh on DATA_CHANGED > rebuilds the dropdown when a remote board.created adds a board
- `tests/dom/boards-select-refresh.test.js:65` #board-select refresh on DATA_CHANGED > updates an option label when a board is renamed remotely

### Column Summary

- Path: `tests/dom/column-summary.test.js`
- Type: DOM Integration
- Test count: 8

- `tests/dom/column-summary.test.js:40` column header renders the summary button next to the task counter
- `tests/dom/column-summary.test.js:50` summary button opens a full-screen dialog with the stored summary and metadata
- `tests/dom/column-summary.test.js:77` summary dialog shows the empty state when the column has no summary
- `tests/dom/column-summary.test.js:86` summary dialog closes on Escape and the close control, and restores the trigger state
- `tests/dom/column-summary.test.js:101` summary dialog closes on a backdrop click but stays open on a panel click
- `tests/dom/column-summary.test.js:112` clicking the summary button again closes the dialog
- `tests/dom/column-summary.test.js:123` the edit affordance saves a human override through saveColumnSummary
- `tests/dom/column-summary.test.js:136` the column still renders its add-task row and task list

### Dragdrop

- Path: `tests/dom/dragdrop.test.js`
- Type: DOM Integration
- Test count: 8

- `tests/dom/dragdrop.test.js:109` task drop mutates state inside the reconcile window
- `tests/dom/dragdrop.test.js:129` task drop wraps its state mutation in a reconcile window
- `tests/dom/dragdrop.test.js:153` collapsed non-done drops still pin the moved task through state
- `tests/dom/dragdrop.test.js:177` reinitializing during an active task drag clears transient drag state
- `tests/dom/dragdrop.test.js:197` initDragDrop does not make columns reorderable
- `tests/dom/dragdrop.test.js:207` dropping a task into Blocked prompts for a reason and stores it
- `tests/dom/dragdrop.test.js:228` skipping the blocked-reason prompt leaves the reason empty
- `tests/dom/dragdrop.test.js:248` a normal column drop does not prompt for a blocked reason

### Feature Modules Emit Events

- Path: `tests/dom/event-sourcing/feature-modules-emit-events.test.js`
- Type: DOM Integration
- Test count: 4

- `tests/dom/event-sourcing/feature-modules-emit-events.test.js:34` updateTask emits one task.updated event with HLC entity id and minimal fields
- `tests/dom/event-sourcing/feature-modules-emit-events.test.js:69` label mutations emit label entity and task membership events
- `tests/dom/event-sourcing/feature-modules-emit-events.test.js:88` updateTask emits collection-op and move events for non-scalar changes
- `tests/dom/event-sourcing/feature-modules-emit-events.test.js:118` deleteTask emits task.deleted

### Realtime

- Path: `tests/dom/event-sourcing/realtime.test.js`
- Type: DOM Integration
- Test count: 7

- `tests/dom/event-sourcing/realtime.test.js:85` realtime subscription > AC-001: opens exactly one owner-filtered subscription; second call is a no-op
- `tests/dom/event-sourcing/realtime.test.js:95` realtime subscription > AC-002: stopRealtime closes the subscription
- `tests/dom/event-sourcing/realtime.test.js:103` realtime subscription > does not subscribe when unauthenticated
- `tests/dom/event-sourcing/realtime.test.js:111` applyRemoteEvent > AC-003/AC-007: projects, emits EVENT_EMITTED, advances HLC, stores as synced
- `tests/dom/event-sourcing/realtime.test.js:130` applyRemoteEvent > AC-004: an echo of an already-applied event is a no-op in the projection
- `tests/dom/event-sourcing/realtime.test.js:146` catch-up pull > AC-005: pulls events > lastSeenHlc, applies in order, advances lastSeenHlc atomically
- `tests/dom/event-sourcing/realtime.test.js:166` catch-up pull > AC-005/AC-006: re-running catch-up applies nothing new (idempotent overlap)

### Replay Fidelity

- Path: `tests/dom/event-sourcing/replay-fidelity.test.js`
- Type: DOM Integration
- Test count: 4

- `tests/dom/event-sourcing/replay-fidelity.test.js:70` updateTask relationship change replays the inverse on the target task
- `tests/dom/event-sourcing/replay-fidelity.test.js:86` addTask replays the sibling reorder in the column
- `tests/dom/event-sourcing/replay-fidelity.test.js:107` moving a task into and out of the done column replays its doneDate
- `tests/dom/event-sourcing/replay-fidelity.test.js:131` swimlane drag across priority lanes replays the priority reassignment

### Snapshot Catchup

- Path: `tests/dom/event-sourcing/snapshot-catchup.test.js`
- Type: DOM Integration
- Test count: 4

- `tests/dom/event-sourcing/snapshot-catchup.test.js:100` catch-up with a server snapshot > reconstructs a board whose events were GC-ed, from the snapshot alone
- `tests/dom/event-sourcing/snapshot-catchup.test.js:118` catch-up with a server snapshot > replays events newer than the snapshot on top of it
- `tests/dom/event-sourcing/snapshot-catchup.test.js:138` catch-up with a server snapshot > ignores events the snapshot already covers
- `tests/dom/event-sourcing/snapshot-catchup.test.js:158` catch-up with a server snapshot > still replays events normally when the server has no snapshot

### Snapshot Download

- Path: `tests/dom/event-sourcing/snapshot-download.test.js`
- Type: DOM Integration
- Test count: 6

- `tests/dom/event-sourcing/snapshot-download.test.js:69` snapshot download > returns null when the server holds no snapshot for the board
- `tests/dom/event-sourcing/snapshot-download.test.js:76` snapshot download > returns null when unauthenticated
- `tests/dom/event-sourcing/snapshot-download.test.js:80` snapshot download > queries the board it was asked for, and empty board_id for global scope
- `tests/dom/event-sourcing/snapshot-download.test.js:95` snapshot download > inflates the payload into projected state
- `tests/dom/event-sourcing/snapshot-download.test.js:112` snapshot download > rehydrates appliedEventIds and taskTombstones as Sets so replay dedups
- `tests/dom/event-sourcing/snapshot-download.test.js:128` snapshot download > picks the highest HLC when the server holds several snapshots

### Snapshot Sync

- Path: `tests/dom/event-sourcing/snapshot-sync.test.js`
- Type: DOM Integration
- Test count: 7

- `tests/dom/event-sourcing/snapshot-sync.test.js:40` snapshot upload > skips when unauthenticated
- `tests/dom/event-sourcing/snapshot-sync.test.js:45` snapshot upload > AC-009: skips upload when server snapshot HLC >= local
- `tests/dom/event-sourcing/snapshot-sync.test.js:59` snapshot upload > creates a snapshot record when the server is behind
- `tests/dom/event-sourcing/snapshot-sync.test.js:73` snapshot upload > buildSnapshotForm carries owner, board_id, hlc, and a gz payload file
- `tests/dom/event-sourcing/snapshot-sync.test.js:84` snapshot upload > AC-009 arbitration: deletes losing server snapshots after upload
- `tests/dom/event-sourcing/snapshot-sync.test.js:100` snapshot upload > AC-010: deletes PB events with hlc <= snapshot.hlc, keeps newer
- `tests/dom/event-sourcing/snapshot-sync.test.js:117` snapshot upload > global snapshot filters events by scope=global and uses empty board_id

### Sync Indicator

- Path: `tests/dom/event-sourcing/sync-indicator.test.js`
- Type: DOM Integration
- Test count: 10

- `tests/dom/event-sourcing/sync-indicator.test.js:50` sync state indicator > AC-001: logged in, online, empty queue -> Live (green)
- `tests/dom/event-sourcing/sync-indicator.test.js:58` sync state indicator > AC-002: N events draining -> Syncing… (N) (yellow)
- `tests/dom/event-sourcing/sync-indicator.test.js:68` sync state indicator > AC-003: events stuck retrying -> ⚠ N unsynced (orange)
- `tests/dom/event-sourcing/sync-indicator.test.js:78` sync state indicator > AC-003b: paused (auth failure) tier also shows unsynced
- `tests/dom/event-sourcing/sync-indicator.test.js:86` sync state indicator > AC-004: offline -> Offline (gray)
- `tests/dom/event-sourcing/sync-indicator.test.js:95` sync state indicator > AC-004b: not logged in -> Offline (gray)
- `tests/dom/event-sourcing/sync-indicator.test.js:104` sync state indicator > AC-005: updates live on DATA_CHANGED (queue drains) without reload
- `tests/dom/event-sourcing/sync-indicator.test.js:117` sync state indicator > AC-005b: updates live on offline window event
- `tests/dom/event-sourcing/sync-indicator.test.js:128` sync state indicator > AC-005c: updates live on auth-changed window event
- `tests/dom/event-sourcing/sync-indicator.test.js:140` sync state indicator > updates live when the sync queue status changes

### Sync Queue

- Path: `tests/dom/event-sourcing/sync-queue.test.js`
- Type: DOM Integration
- Test count: 11

- `tests/dom/event-sourcing/sync-queue.test.js:69` sync-queue startup > drains events left over from a previous session, with no new activity
- `tests/dom/event-sourcing/sync-queue.test.js:85` sync-queue startup > does not push on startup when signed out
- `tests/dom/event-sourcing/sync-queue.test.js:100` sync-queue push > AC-004: pushes a queued event and flips synced after debounce
- `tests/dom/event-sourcing/sync-queue.test.js:120` sync-queue push > AC-005: caps concurrent pushes at 5 and drains the whole queue
- `tests/dom/event-sourcing/sync-queue.test.js:145` sync-queue push > AC-005: drains in HLC order (sequential)
- `tests/dom/event-sourcing/sync-queue.test.js:163` sync-queue push > AC-008: a rejected event is left queued, never rolled back
- `tests/dom/event-sourcing/sync-queue.test.js:184` sync-queue push > AC-006: resumes on the online event without waiting for backoff
- `tests/dom/event-sourcing/sync-queue.test.js:210` sync-queue push > drains pre-existing unsynced events when auth changes after login
- `tests/dom/event-sourcing/sync-queue.test.js:233` sync-queue push > AC-007: pauses on auth failure and resumes on auth-changed
- `tests/dom/event-sourcing/sync-queue.test.js:265` sync-queue push > AC-011: network failures advance the backoff tiers, capped at 5min
- `tests/dom/event-sourcing/sync-queue.test.js:289` sync-queue push > AC-011: a permanent 4xx schedules a ~1h retry

### Reconcile

- Path: `tests/dom/reconcile.test.js`
- Type: DOM Integration
- Test count: 10

- `tests/dom/reconcile.test.js:73` reconcileBoard moves a dragged task card into its new column, preserving the node
- `tests/dom/reconcile.test.js:93` reconcileBoard updates each column task counter to match state
- `tests/dom/reconcile.test.js:104` reconcileBoard leaves a legacy collapsed column title untouched and updates its counter
- `tests/dom/reconcile.test.js:129` a data change inside a drag-reconcile window patches in place instead of rebuilding
- `tests/dom/reconcile.test.js:146` reconcileBoard refreshes notifications, matching a full render
- `tests/dom/reconcile.test.js:156` reconcileBoard respects the active board filter, like a full render
- `tests/dom/reconcile.test.js:179` reconcileBoard defers to a full rebuild when swimlane mode is on
- `tests/dom/reconcile.test.js:192` reconcileBoard defers to a full rebuild when the column set changed
- `tests/dom/reconcile.test.js:205` reconcileBoard virtualizes an overfull Done column instead of rendering every card
- `tests/dom/reconcile.test.js:222` reconcileBoard patches a card due-date in place when it lands in Done

### Settings Ui

- Path: `tests/dom/settings-ui.test.js`
- Type: DOM Integration
- Test count: 2

- `tests/dom/settings-ui.test.js:44` settings modal opens with board settings controls
- `tests/dom/settings-ui.test.js:57` settings changes persist through board settings

### Skills Modal

- Path: `tests/dom/skills-modal.test.js`
- Type: DOM Integration
- Test count: 11

- `tests/dom/skills-modal.test.js:98` skills modal > opens from the header button and closes via the close button
- `tests/dom/skills-modal.test.js:110` skills modal > closes via the backdrop
- `tests/dom/skills-modal.test.js:119` skills modal > renders stored skills, selects the first, and shows its content
- `tests/dom/skills-modal.test.js:137` skills modal > clicking another skill moves the selection and loads its fields
- `tests/dom/skills-modal.test.js:150` skills modal > shows the empty state instead of the editor when no skills exist
- `tests/dom/skills-modal.test.js:158` skills modal > add creates a skill, selects it, and focuses the name field
- `tests/dom/skills-modal.test.js:172` skills modal > save persists all fields and emits DATA_CHANGED
- `tests/dom/skills-modal.test.js:191` skills modal > delete arms on the first click and deletes on the second
- `tests/dom/skills-modal.test.js:211` skills modal > blur cancels an armed delete
- `tests/dom/skills-modal.test.js:226` skills modal > Escape closes the modal
- `tests/dom/skills-modal.test.js:235` skills modal > re-renders when DATA_CHANGED is emitted

### Task Card Delete

- Path: `tests/dom/task-card-delete.test.js`
- Type: DOM Integration
- Test count: 3

- `tests/dom/task-card-delete.test.js:53` delete button shows permanent-delete confirmation message by default
- `tests/dom/task-card-delete.test.js:65` cancelling delete leaves the task untouched
- `tests/dom/task-card-delete.test.js:76` confirming permanent delete calls deleteTask for the task

### Task Card Linkify

- Path: `tests/dom/task-card-linkify.test.js`
- Type: DOM Integration
- Test count: 14

- `tests/dom/task-card-linkify.test.js:12` linkifyText > plain text with no URL is rendered as a text node
- `tests/dom/task-card-linkify.test.js:18` linkifyText > https URL becomes a clickable link
- `tests/dom/task-card-linkify.test.js:26` linkifyText > http URL becomes a clickable link
- `tests/dom/task-card-linkify.test.js:33` linkifyText > link opens in a new tab with noopener noreferrer
- `tests/dom/task-card-linkify.test.js:40` linkifyText > surrounding text is preserved around the link
- `tests/dom/task-card-linkify.test.js:47` linkifyText > multiple URLs in one description each become a link
- `tests/dom/task-card-linkify.test.js:55` linkifyText > empty string returns an empty fragment
- `tests/dom/task-card-linkify.test.js:61` linkifyText > non-http scheme is not linkified
- `tests/dom/task-card-linkify.test.js:78` updateDescriptionLinks (modal preview strip) > hidden when text has no URLs
- `tests/dom/task-card-linkify.test.js:84` updateDescriptionLinks (modal preview strip) > shows a chip for a single URL
- `tests/dom/task-card-linkify.test.js:94` updateDescriptionLinks (modal preview strip) > deduplicates the same URL appearing twice
- `tests/dom/task-card-linkify.test.js:100` updateDescriptionLinks (modal preview strip) > shows one chip per distinct URL
- `tests/dom/task-card-linkify.test.js:106` updateDescriptionLinks (modal preview strip) > hides and clears when called with empty string
- `tests/dom/task-card-linkify.test.js:114` updateDescriptionLinks (modal preview strip) > non-http scheme does not produce a chip

### Task Modal Agile

- Path: `tests/dom/task-modal-agile.test.js`
- Type: DOM Integration
- Test count: 4

- `tests/dom/task-modal-agile.test.js:203` add form saves agile fields through addTask
- `tests/dom/task-modal-agile.test.js:245` acceptance criteria can be toggled and removed before saving
- `tests/dom/task-modal-agile.test.js:269` editing a task into Blocked prompts for and stores a reason
- `tests/dom/task-modal-agile.test.js:295` a normal edit does not prompt for a blocked reason

### Task Modal Annotations

- Path: `tests/dom/task-modal-annotations.test.js`
- Type: DOM Integration
- Test count: 7

- `tests/dom/task-modal-annotations.test.js:258` edit modal renders the stored annotations with text, author and time
- `tests/dom/task-modal-annotations.test.js:271` adding an annotation calls addAnnotation and appends it to the list
- `tests/dom/task-modal-annotations.test.js:293` pressing Enter in the annotation input adds the annotation
- `tests/dom/task-modal-annotations.test.js:312` removing an annotation calls removeAnnotation and drops the entry
- `tests/dom/task-modal-annotations.test.js:324` edit modal leads with key, type, estimate, priority, due date and column
- `tests/dom/task-modal-annotations.test.js:343` an In Progress task is fully read-only, including annotations
- `tests/dom/task-modal-annotations.test.js:387` add mode hides the summary, claim chip and annotations sections

### Task Row Agile

- Path: `tests/dom/task-row-agile.test.js`
- Type: DOM Integration
- Test count: 14

- `tests/dom/task-row-agile.test.js:36` renders the human-readable key when present
- `tests/dom/task-row-agile.test.js:41` omits the key when the task has none
- `tests/dom/task-row-agile.test.js:46` renders a colour-coded type marker for known types
- `tests/dom/task-row-agile.test.js:56` omits the type marker for unknown types
- `tests/dom/task-row-agile.test.js:61` renders an estimate badge when set
- `tests/dom/task-row-agile.test.js:66` omits the estimate badge when null
- `tests/dom/task-row-agile.test.js:71` renders assignee initials with the full name as title
- `tests/dom/task-row-agile.test.js:79` renders a blocked indicator when blockedReason is set
- `tests/dom/task-row-agile.test.js:87` omits the blocked indicator without a reason
- `tests/dom/task-row-agile.test.js:92` shows task age in days since creation
- `tests/dom/task-row-agile.test.js:97` flags a stale task with a warning dot outside the done column
- `tests/dom/task-row-agile.test.js:109` does not flag a recently updated task as stale
- `tests/dom/task-row-agile.test.js:120` does not flag tasks in the done column as stale
- `tests/dom/task-row-agile.test.js:131` hides the age when the showAge setting is off

### Task Row

- Path: `tests/dom/task-row.test.js`
- Type: DOM Integration
- Test count: 6

- `tests/dom/task-row.test.js:39` renders a single compact row without card chrome
- `tests/dom/task-row.test.js:51` orders the meta cluster priority, due date, labels, sub-task progress
- `tests/dom/task-row.test.js:69` shows an overdue countdown for a past due date
- `tests/dom/task-row.test.js:77` respects the showPriority and showDueDate settings
- `tests/dom/task-row.test.js:84` clicking the title opens the task editor
- `tests/dom/task-row.test.js:91` keeps the delete control inside the row actions

### Wip Limit

- Path: `tests/dom/wip-limit.test.js`
- Type: DOM Integration
- Test count: 7

- `tests/dom/wip-limit.test.js:20` applyWipCounter > renders a bare count for an unlimited column
- `tests/dom/wip-limit.test.js:28` applyWipCounter > renders count with the limit in its own span
- `tests/dom/wip-limit.test.js:36` applyWipCounter > re-applying replaces rather than appends
- `tests/dom/wip-limit.test.js:46` syncColumnWip > drives data-wip through under, at and over
- `tests/dom/wip-limit.test.js:59` syncColumnWip > pulses only on the transition into over-limit
- `tests/dom/wip-limit.test.js:72` syncColumnWip > staying over-limit does not re-pulse
- `tests/dom/wip-limit.test.js:84` syncColumnWip > an unlimited column stays under at any count
