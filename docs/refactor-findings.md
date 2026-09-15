# OpenAgile (`kanvana`) — Consolidated Refactor Findings

Execution document distilled from four background audits (2026-09-15):

| Audit | Source | Scope |
|---|---|---|
| Modules | `tool_0a0a64f840014Pw3omlO5JV7xJ` (`bg_38c6c293`) | `client/src/**` JS, dependency graph, dead code, layering, state sync |
| Styles/HTML | `tool_0a0a7a5d8001e1hv0YHdah6tug` (`bg_f9a08d59`) | `client/src/styles/**` + 5 HTML pages |
| Harness | session `ses_f5f6574deffenulU1nJsGpkdKT` | `harness/**` + client↔harness integration |
| Tests | session `ses_f5f630995ffeotCGOU3OuC5tvZ` | `client/tests/**` coverage + flake root cause |

The "Cocoa glassmorphism restyle" transcript was intentionally excluded.

Conventions: paths are relative to the repo root (`kanvana/`). `path:line` or `path:line-range` cites the audit evidence. Nothing here is a new audit; the only file reads done for this document were filename/line-number confirmations (marked "verified at write time"). CSS line numbers were re-checked and match the styles audit's frozen 01:54:16 revision.

**Verification commands** (from `client/package.json:13-14`):

```
cd client; npm run test:unit    # 368 tests
cd client; npm run test:dom     # 182 tests
cd client; npm run build
```

---

## 1. Verified dead code

### 1.1 Whole dead modules

| Symbol / file:line | Original purpose | Zero-reference evidence | Safe removal action |
|---|---|---|---|
| `client/src/modules/schema.js:1` (141 LOC) | Canonical entity factories (`createTask`, `createColumn`, `createBoard`, `createSubTask`, `createRelationship`, `RELATIONSHIP_TYPES`) | Zero importers in `client/src` and `client/tests` (modules audit §4; tests audit coverage map marks `schema.js` **0** — "imported by nothing, grep `schema.js` across `src/` = 0 hits"). `normalize.js:72` has its own private `RELATIONSHIP_TYPES`. | Delete file. |
| `client/src/modules/event-sourcing/dispatcher.js:1` (8 LOC) | `reduceEventAndNotify` = `applyEvent` + notify helper | **Test-only caller**: `client/tests/dom/event-sourcing/render-triggers.test.js:4`. | Delete module; retarget the one test to `reducer.js` directly. |

### 1.2 Dead exports (client JS)

"Test-only" = referenced by tests but not by any production module. "None" = no callers at all.

| Symbol | Location | Original purpose | Callers | Removal action |
|---|---|---|---|---|
| `addColumn` | `client/src/modules/columns.js:7-9` | No-op stub (returns `false`) | Called at `column-modal.js:127` but does nothing; test asserts no-op `client/tests/unit/columns.test.js:16-18` | Remove stub + call site + test |
| `deleteColumn` | `client/src/modules/columns.js:59-61` | No-op stub | Test-only `client/tests/unit/columns.test.js:60-64` | Remove stub + test |
| `updateColumnPositions` | `client/src/modules/columns.js:64-92` | Column-reorder remnant; reads DOM (`:65-66`) and emits `column.reordered` (`:85-90`) | None; stale mock `client/tests/dom/dragdrop.test.js:34-36` | Remove with batch 2 |
| `applyColumnReordered` + `'column.reordered'` handler | `client/src/modules/reducer.js:235-244`, `client/src/modules/reducer.js:295` | Reducer projection for reorder | Reachable only via dead `updateColumnPositions`; test `client/tests/unit/event-sourcing/reducer.test.js:179` | Remove with batch 2 |
| `applyColumnDeleted` + `'column.deleted'` handler | `client/src/modules/reducer.js:228-233`, `client/src/modules/reducer.js:294` | Reducer projection for column delete | `column.deleted` is **never emitted** anywhere (harness audit §2 finding 1; client `columns.js:59-61` returns false; MCP `delete_column` throws `harness/src/mcp-tools.mjs:600-606`) | Remove handler or wire a real producer (see §9) |
| `getCurrentTaskOrder` | `client/src/modules/tasks.js:437-449` | DOM order read | None | Delete |
| `claimTask`, `releaseTask` | `client/src/modules/tasks.js:757-767` | Task claim/release mutations | None, no tests | Delete |
| `getAvailableSwimLaneLabelGroups` | `client/src/modules/swimlanes.js:184-187` | Label-group discovery | None | Delete |
| `moveTask` | `client/src/modules/swimlanes.js:472-486` | Swimlane task move | Test-only `client/tests/unit/swimlanes-utils.test.js:123` | Delete + test |
| `getSwimLaneValue` | `client/src/modules/swimlanes.js:245-247` | Lane value getter | Test-only | Delete + test |
| `formatWipCount` | `client/src/modules/wip-limit.js:25-28` | WIP count formatter | Test-only `client/tests/unit/wip-limit.test.js:77-85` | Delete + test |
| `isFixedColumn` | `client/src/modules/constants.js:20-22` | Fixed-column predicate | None | Delete |
| `BOARD_CHANGED` | `client/src/modules/events.js:34` | Legacy bus event name | Test-only `client/tests/unit/events.test.js:42` | Delete + test |
| `$$`, `addClass`, `removeClass`, `toggleClass` | `client/src/modules/dom.js:57-60` | DOM helpers | None; direct `classList` used everywhere | Delete |
| `getBoardEventsKey` | `client/src/modules/idb-store.js:138-140` | IDB key helper | None | Delete |
| `isRealtimeActive` | `client/src/modules/event-sourcing/realtime.js:164-166` | Realtime status getter | None | Delete |
| `emitLocal` (async variant) | `client/src/modules/event-sourcing/hlc.js:35-51` | Async HLC emit | Test-only `client/tests/unit/event-sourcing/hlc.test.js:17` | Delete + test |
| `hydrateFromSnapshot` | `client/src/modules/event-sourcing/snapshot.js:65-72` | Snapshot hydrate | Test-only; production uses `storage.hydrateFromSnapshotState` (`realtime.js:14,91`, `local-server.js:93`) | Delete + test |
| `saveLiveTasks` | `client/src/modules/storage.js:979-983` | Direct task persist | None, no tests | Delete |
| `saveGlobalSettings` | `client/src/modules/storage.js:1127-1131` | Global settings persist | Test-only `client/tests/unit/storage.test.js:20-21,271-286` | Delete + test (or keep if `globalSettings` is kept — §9) |
| `pullAllBoards` | `client/src/modules/sync.js:321-432` | Legacy LWW full pull | **No production caller** (grep-verified at write time: definition + `client/tests/unit/sync.test.js:309-455` only) | Delete with batch 7 |
| `enableAutoSync`, `disableAutoSync` | `client/src/modules/autosync.js:31-37` | Toggle legacy push | Test-only (`client/tests/unit/autosync.test.js`); no production caller sets `kanbanAutoSyncEnabled` | Delete with batch 7 |
| `isLocalServerActive` | `client/src/modules/local-server.js:151-153` | Bridge status getter | None | Delete |
| `showHelpModal` export | `client/src/modules/modals.js:115` | Help modal | No external importer (internal use `modals.js:88`) | Un-export |
| `syncMovedTaskDueDate` export | `client/src/modules/render.js:148` | Due-date sync helper | Internal only `render.js:265` | Un-export |
| `setBoardFilterQuery` | `client/src/modules/render.js:47-49` | Filter setter | Test-only `client/tests/dom/reconcile.test.js:159-170` | Delete + test (or keep if filter UI returns — §9) |
| `getNotificationTasks`, `renderNotificationBanner`, `updateNotificationBadge`, `showNotificationsModal`, `hideNotificationsModal`, `isNotificationsModalOpen` | `client/src/modules/notifications.js:29,101,266,301,311,319` | Due-date banner/badge/modal | Internal-only; no external importer, no test file | Un-export (keep functions) |
| `renderSyncIndicator` export | `client/src/modules/event-sourcing/sync-indicator.js:35` | Sync indicator render | Internal `sync-indicator.js:48` | Un-export |
| `updateTaskLabelsSelection`, `refreshBoardsModalList` re-exports | `client/src/modules/modals.js:117-118` | Modal facade re-exports | No direct importer; `updateTaskLabelsSelection` consumed via `setTaskModalState` wiring `modals.js:68-77` | Remove re-export lines |

**Dead-symbol count: 42** (2 whole modules + 40 exports).

### 1.3 Dead/stub MCP tools (harness)

| Tool | Location | Status | Action |
|---|---|---|---|
| `create_column` | `harness/src/mcp-tools.mjs:565`, throws `:576` | Hard stub | Implement or remove from tool list |
| `delete_column` | `harness/src/mcp-tools.mjs:600`, throws `:605` | Hard stub | Same |
| `reorder_columns` | `harness/src/mcp-tools.mjs:608`, throws `:616` | Hard stub | Same |
| `column.created` producer | none | Columns enter the server log only via seeding (`store.mjs:179-184`) or browser backfill (`backfill.js:45-54`) | See §9 (column contract) |

### 1.4 Dead CSS selectors

Frozen revision: styles audit 01:54:16; current line counts match the inventory (verified at write time).

| File | Lines | Dead selector(s) | Evidence |
|---|---|---|---|
| `client/src/styles/layout.css` | 35-80 | `.board-search` (7 rules) | Replaced by Spotlight (`spotlight.js` builds `.spotlight*`); no search input in `index.html` |
| `client/src/styles/responsive.css` | 76-88, 109-115, 364-366 | `.board-search` members | Same; `109-115` also targets live `.session-status` — edit rule, don't delete whole block |
| `client/src/styles/layout.css` | 82-87 | `.brand-icon` | `index.html:21` uses `.brand-favicon` |
| `client/src/styles/layout.css` | 89-94 | `.brand-logo` | No producer |
| `client/src/styles/layout.css` | 310-318 | `.board-toolbar` | No producer |
| `client/src/styles/layout.css` | 578-588 (selector 579) | `.container` | Only `.board-container`/`#board-container` used |
| `client/src/styles/layout.css` | 625-647 | `.footer`, `.footer p`, `.footer-version` | Footer removed; also `responsive.css:288-290,377-381`, `glass.css:19` |
| `client/src/styles/responsive.css` | 264, 294 | `.container` members of live lists | Same |
| `client/src/styles/components/column.css` | 170 | `.tasks.expanded` | No producer |
| `client/src/styles/components/auth.css` | 99-106 | `#sync-btn.spinning svg` + `@keyframes spin` | Dead ID `#sync-btn`; no producer |
| `client/src/styles/components/card.css` | 182, 202 | `.notification-banner-item .priority-badge` | Banner renders only `.task-title`/`.due-date` (`notifications.js:136-137`) |
| `client/src/styles/components/notifications.css` | 169-171 | `.notification-banner-item .priority-badge` | Same |
| `client/src/styles/components/dragdrop.css` | 98-106 | `[data-dragging="true"], #dragged-task, #dragged-column` | Column-reorder leftovers; no producer |
| `client/src/styles/components/dragdrop.css` | 109-122 | `.placeholder`, `.sortable-ghost` | Sortable sets explicit `ghostClass` (`dragdrop.js:234`, `swimlanes.js:584`); nothing applies `.placeholder` |
| `client/src/styles/components/dragdrop.css` | 124-136 | `.column-placeholder` | Column-reorder insertion line; no producer |

**Do NOT delete** (dynamic classes that look dead): `priority-*`, `task-type--*`, `relationship-badge--*`, `sync-indicator--*`, `countdown-*`, `task-age--stale`, `skill-item--active`, `is-cell-collapsed`, `swimlane-tasks-hidden-done`, `relationship-result-item--linked`, `due-soon`/`overdue` (evidence list in styles audit §2); `.task-ghost/.task-chosen/.task-drag/.task-fallback` (`dragdrop.css:6-27`, set `dragdrop.js:234-239`); swimlane order classes (`layout.css:254-274`, set `swimlanes.js:550,583-585`).

### 1.5 Dead design tokens

Defined in `client/src/styles/tokens.css` (both themes), zero references in CSS/JS/HTML:

| Token | Light | Dark | Replaced by |
|---|---|---|---|
| `--app-bg` | `:30` | `:193` | `--canvas-bg` |
| `--border-color` | `:39` | `:201` | — |
| `--footer-bg` | `:58` | `:217` | Footer removed |
| `--header-bg` | `:156` | `:281` | `--glass-bg` |
| `--radius-xl` | `:141` | — | `--radius-popover` |
| `--sidebar-bg` | `:157` | `:282` | `--glass-bg` |
| `--stale-bg` | `:104` | `:261` | Only `--stale-fg` used |

Orphan (referenced, never defined): `--column-width` at `column.css:25-27` with `300px` fallback — leftover of the removed configurable-column-width feature. Keep `--swimlane-column-count`/`--swimlane-grid-template` (defined at runtime `swimlane-renderer.js:166-167`). `--glass-bg-opaque` is live (`glass.css:22,26,30,35`, `responsive.css:44,171,190`, `dragdrop.css:57,92`) — do not remove.

### 1.6 Dead HTML classes (no CSS owner)

| File:line | Class | Action |
|---|---|---|
| `client/src/index.html:167` | `.task-modal-content` | Style or remove |
| `client/src/index.html:201` | `.task-annotations-header` | Style or remove |
| `client/src/index.html:286` | `.labels-selection` | CSS styles `#task-labels-selection`; remove class |
| `client/src/index.html:442,462` | `.labels-list` | CSS styles `#labels-list`; remove class |
| `client/src/index.html:536,620` | `.settings-section-board` | Style or remove |

### 1.7 Unreachable branches / leftovers

- Empty `if` blocks: `client/src/modules/tasks.js:110-113`, `client/src/modules/tasks.js:306-307`.
- Duplicate import statement: `client/src/modules/importexport.js:1-10` and `:12` import from `./storage.js` twice.
- Identical functions: `client/src/modules/storage.js:158-164` (`defaultColumns()` ≡ `legacyDefaultColumns()`); `storage.js:32-38` is a third copy of the fixed-column concept.
- Column-reorder leftovers outside CSS: `client/src/modules/column-element.js:224` (`draggable: 'false'`), `client/src/modules/dragdrop.js:229` (Done-sort comment), AGENTS.md rule "never reorder done column".
- Stale docs: AGENTS.md "dual log" rule + ADR-0001 reference `activityLog`, which does not exist in `src/` (only `columnHistory`, e.g. `tasks.js:180,264,582`).

### 1.8 Needs verification (dead code)

- **CSS staleness**: the styles audit froze at 01:54:16 and says to re-run the dead-selector script after the restyle stops. Current line counts match the audit (verified), but the upcoming UI/UX redesign will move lines — re-run the audit script before batch 3.
- `deleteBoardRemote` is **live** (`client/src/modules/boards-modal.js:85`) despite living in the legacy sync module — do not delete it with the LWW stack.
- `updateTaskLabelsSelection` re-export at `modals.js:117` is claimed unused directly, but the same function is wired via `setTaskModalState` (`modals.js:68-77`); verify before removing.

---

## 2. Duplication

Single-home column = where the one implementation should live.

### 2.1 Client JS helpers

| What is duplicated | Locations | Single home |
|---|---|---|
| `groupLabels(labels)` (byte-identical) | `client/src/modules/task-modal.js:239-250`, `client/src/modules/labels-modal.js:52-63` | `client/src/modules/labels.js` |
| `TYPE_LABELS = {story,bug,task,spike}` | `client/src/modules/task-card.js:13`, `client/src/modules/task-modal.js:484` | `client/src/modules/agile.js` |
| `URL_RE` | `client/src/modules/task-card.js:37`, `client/src/modules/task-modal.js:1113` | `client/src/modules/utils.js` (or `security.js`) |
| `MAX_LABEL_NAME_LENGTH = 40` | `client/src/modules/constants.js:45` vs private copy `client/src/modules/labels.js:5` | `constants.js` |
| Priority list/order | `client/src/modules/constants.js:37-40`, `client/src/modules/swimlanes.js:11` (`PRIORITY_LANE_ORDER`), inline array `client/src/modules/task-card.js:148` | `constants.js` (`PRIORITY_ORDER`) |
| `readJson`/`writeJson` localStorage wrappers | `client/src/modules/board-groups.js:20-37`, `client/src/modules/skills.js:8-21` | `client/src/modules/utils.js` |
| `nowIso()` | `client/src/modules/storage.js:78`, `client/src/modules/board-serializer.js:16`, `client/src/modules/schema.js:8` (dead) | `client/src/modules/utils.js` |
| `isHexColor` (3 variants; 2 are 6-digit-only) | `client/src/modules/normalize.js:17`, `client/src/modules/reports.js:515`, `client/src/modules/labels-modal.js:23`, `client/src/modules/column-modal.js:14` | `normalize.js` |
| UUID generation | `client/src/modules/utils.js:16` (`generateUUID`) vs `crypto.randomUUID()` at `client/src/modules/event-sourcing/hlc.js:25,59`, `client/src/modules/local-server.js:34` | `utils.generateUUID` (or standardize on `crypto.randomUUID`) |
| JSON-safe parse | `client/src/modules/storage.js:132-154` vs `board-groups.js:20`, `skills.js:8`, `local-server.js:63` | `utils.js` |
| Date formatting | `client/src/modules/task-card.js:23-30`, `notifications.js:70-96`, `reports.js:65-85,148-152`, `calendar.js:6-33` vs `dateutils.js` | `dateutils.js` |
| Settings normalization (3 copies) | `client/src/modules/storage.js:1022-1074`, `importexport.js:268-317`, `importexport.js:473-522` | `normalize.js` |
| Board `<select>` rebuild | `client/src/modules/boards.js:95-109`, `boards-modal.js:24-41`, `importexport.js:56-74` | one renderer (e.g. `boards.js`) |
| "Click twice to confirm delete" button | `client/src/modules/board-sidebar.js:51-85`, `skills-modal.js:23-34,163-183` | `utils.js` helper |
| Brand text set | `client/src/modules/boards.js:123-127`, `boards-modal.js:39-40`, `importexport.js:57-58` | `constants.js` |
| `uniq` | `client/src/modules/settings.js:7-16` vs `normalize.normalizeStringKeys` (`normalize.js:126`) | `normalize.js` |
| Virtualization/filter logic | `client/src/modules/render.js:105-130` vs `render.js:236-274` | one path in `render.js` |
| Legacy default columns | `client/src/modules/storage.js:32-38` vs `storage.js:158-164` | `constants.js` (FIXED_COLUMNS) |

### 2.2 Constants and strings

| What is duplicated | Locations | Single home |
|---|---|---|
| `'done'` literal | `client/src/modules/constants.js:3`, `swimlanes.js:9`, raw literals `reports.js:602,618,711` | `constants.js` |
| `'todo'`/`'inprogress'` literals | `client/src/modules/normalize.js:117-119`, `importexport.js:34-36`, `task-modal.js:25`, `storage.js:23` | `constants.js` |
| Storage keys in 14 files, no registry | `client/src/modules/storage.js:15-21`, `constants.js:26`, `idb-store.js:6-11`, `hlc.js:3`, `backfill.js:15`, `realtime.js:16`, `snapshot.js:8`, `local-server.js:18-19`, `board-groups.js:4-8`, `skills.js:4`, `theme.js:3`, `notifications.js:7`, `autosync.js:4`, `task-modal.js:41` | new `client/src/modules/keys.js` |
| Window/DOM event names hardcoded at both ends | `kanban:open-board-create` (`boards.js:174`, `board-sidebar.js:198`); `kanban:boards-changed` (`boards.js:248`, `boards-modal.js:169`, `importexport.js:658`); `kanban:open-label-modal` (`task-modal.js:307,1165,1208`, `labels-modal.js:214`); `kanban-local-change` (`storage.js:961`, `autosync.js:5`); `openagile:groups-changed` (`board-groups.js:217`, `local-server.js:115`); `openagile:skills-changed` (`skills.js:128`, `local-server.js:121`); `auth-changed` (`sync.js:28`, `realtime.js:148`, `sync-queue.js:51`, `sync-indicator.js:54`); `sync:status-changed` (`sync-queue.js:15` → `sync-indicator.js:11`) | `events.js` (or a new `event-names.js`) |

### 2.3 Harness ↔ client (can drift silently)

| What is duplicated | Locations | Single home |
|---|---|---|
| Fixed columns (byte-identical) | `harness/src/store.mjs:24-29` vs `client/src/modules/constants.js:11-16` | shared module importable by both (or codegen) |
| Stable labels (identical) | `harness/src/store.mjs:31-37` vs `client/src/modules/storage.js:299-307` | same |
| Default board id | `harness/src/store.mjs:22`, `client/src/modules/local-server.js:20`, `client/src/modules/storage.js:28` | same |
| Done-column test | `harness/src/mcp-tools.mjs:37` vs `client/src/modules/constants.js:7-9` | same |
| Priorities (zod enums) | `harness/src/mcp-tools.mjs:304,350,402` vs `client/src/modules/constants.js:37-40` | same |
| Settings schema (15-field whitelist vs `z.record` vs raw) | `client/src/modules/storage.js:1022-1074` vs `harness/src/mcp-tools.mjs:1028-1040` vs `harness/src/store.mjs:282-284` | shared schema |
| Task construction/normalization; `task.key` produced only by MCP | `harness/src/mcp-tools.mjs:360-393` + `:93-102` vs `client/src/modules/tasks.js:19-30,131-190` + `normalize.js` | shared normalizer; decide on `key` |
| Metrics | `harness/src/mcp-tools.mjs:120-173` vs `client/src/modules/reports.js:718,732,751` | shared pure functions |
| HLC implementation (Node mirror) | `harness/src/hlc.mjs` vs `client/src/modules/event-sourcing/hlc.js` | shared pure module |

### 2.4 CSS

| What is duplicated | Locations | Single home |
|---|---|---|
| Button variants | `column.css:757-773`, `column.css:801-836`, `skills.css:164-180`, `auth.css:108-120`, `impressum.css:85-103` | `.btn`/`.btn-primary`/`.btn-danger`/`.btn-text` (`buttons.css:6-103`) |
| Icon-button shape (5×) | `column.css:288-299,503-521,543-562,697-718`, `responsive.css:203-215` | `.icon-btn` (`icons.css:6-33`) |
| Glass/panel shell (30 `var(--glass-blur)` declarations, 15 surfaces) | `layout.css` 8 (`:15-20,154-160,336-340,628-631`), `responsive.css` 4 (`:44-46,100-102,171,190-193`), `column.css` 6 (`:28-30,271-273,646-649`), `labels.css` 4 (`:367-371,398-401`), `modals.css` 4 (`:30-35,50-53`), `reports.css` 2 (`:24-27`), `spotlight.css` 2 (`:20-23`) | one glass utility/primitive; `glass.css:8-21` fallback list must then track one place |
| Badge/pill shapes (14×) | `column.css:105-124,374-385`; `card.css:181-190,207-230,277-289,311-324,326-338`; `labels.css:13-21,269-278`; `notifications.css:182-195`; `modals.css:401-411,438-448,509-521`; `reports.css:112-126,424-437`; `accordion.css:42-51` | one `.badge` primitive (keep `card.css:181-190` base — `notifications.css` inherits it) |
| Empty states (10×) | `layout.css:596-616,468-475`; `column.css:172-179`; `skills.css:107-131`; `labels.css:176-181,454-460`; `modals.css:588-593`; `notifications.css:296-301`; `reports.css:509-512,621-624` | one empty-state primitive |
| Modal chrome (3× + 1 duplicate) | `modals.css:5-43`; `column.css:621-654` (z-index 1400); `spotlight.css:1-27` (z-index 3000); `responsive.css:323-335` duplicates `modals.css:96-108` | one modal-shell class |
| Hardcoded values bypassing tokens | colors: `column.css:10,57-59,277,422` (`#8a9bb5` 4×), `labels.css:113,129,322,339,481,485` (rgba), `card.css:252,261` (oklch fallbacks); radii: 13 px literals in `column.css`, 7 in `labels.css`, plus `999px` pills `buttons.css:129`, `column.css:379`, `impressum.css:88`; font-size rem literals `forms.css:115`, `labels.css:532,563,581`, `impressum.css:28,56,93,114,123,133`; fixed widths `layout.css:162,331`, `modals.css:37,112,118,143`, `skills.css:5,13,17`, `column.css:25-27,33,467`, `reports.css:148`, `responsive.css:304-305` | tokens (`--radius-pill`, radius/font/spacing scales) |

**Duplication-finding count: 38.**

---

## 3. Layering & structure violations

| Violation | Evidence | Fix direction |
|---|---|---|
| Data module reads/parses DOM | `client/src/modules/tasks.js:437-449` (`getCurrentTaskOrder`), `tasks.js:452-501` (`getColumnContainer`, `getLaneKey`, `buildOrderByColumnFromDom`), `tasks.js:510-682` (`updateTaskPositionsFromDrop` consumes Sortable DOM event) | Move DOM→order extraction to `dragdrop.js`; pass plain data into `tasks.js` |
| DOM builder writes storage | `client/src/modules/column-element.js:3` (imports storage), `:97` (`saveColumnSummary`), `:165-168` (`loadTasks()` once per column → N+1) | Pass callbacks in; batch task load in `render.js` |
| Render orchestrator owns filtering/business rules | `client/src/modules/render.js:51-89` (`taskMatchesFilter`, `selectVisibleTasks`), `:93-103` (Done virtualization), `:133-143` (`updateColumnSelect`), `:194-284` (reconcile re-implements renderStandardBoard) | Extract selectors; make reconcile call one path |
| UI modules write state directly | `client/src/modules/boards.js:86-91` (`applyBoardTemplate` → `saveColumns/saveTasks/saveLabels/saveSettings`), `importexport.js:646-653`, `settings.js:47`, `swimlanes.js:357,399,592,675,690,707,719` | Route through domain events (`emitter.js`) |
| Parallel persistence bypasses the event store | `client/src/modules/board-groups.js:18-53`, `skills.js:6-56` write `localStorage` + `fetch('/api/...')` directly | Event-source or explicitly document as out-of-band |
| Second notification channel | `client/src/modules/storage.js:959-962` dispatches `kanban-local-change` instead of the `events.js` bus | Delete with legacy sync (batch 7) or migrate to bus |
| DOM concerns inside data modules | `client/src/modules/task-card.js:4,272-281` (confirm dialog + delete), `dragdrop.js:41-54` (prompt + mutate), `notifications.js:7-16` (localStorage), `authsync.js:47-52` (inline style mutation) | Push DOM/confirm to callers |
| Settings keys hidden in leaf modules | `client/src/modules/theme.js:3`, `notifications.js:7`, `autosync.js:4`, `task-modal.js:41` | Central key registry (§2.2) |
| Workflow encoded in a name match | `client/src/modules/tasks.js:769-772` (`isTaskLocked` matches column name `"in progress"`) | Match on column id/role |
| Harness modules mix concerns | `harness/src/mcp-tools.mjs:175-1047` — one 873-line `registerTools` with 59 handlers; `store.mjs` mixes log/projection/persistence/seeding/125 lines of skill content (`:359-483`); `server.mjs` mixes static+MCP+SSE+REST | Split by domain; extract constants |
| Harness packaging | `harness/package.json:6-8` (no `start`/`test` script), `:12` (`"type": "commonjs"` while all runtime files are `.mjs`) | Add scripts; fix type or rename |
| Styles structural outlier | `client/src/styles/index.css:18-31` omits `components/impressum.css`; it is linked only by `client/src/impressum.html:23` | Decide: import it or keep page-scoped and document |
| Cross-page duplication | Five HTML pages re-declare head markup with drift (CSP differs on every page; see §7/§9); `reports.html`, `calendar.html`, `roadmap.html`, `impressum.html` duplicate the `.rpt-header` block inline | Shared head/partial or build-time include |
| Impressum header unstyled | `reports.css:17-107` scopes every `.rpt-header` rule to `body.reports-page`, but `impressum.html:27` body class is `impressum-page`; `glass.css:20` same scoping | Add `reports-page` class or scope rules |

---

## 4. State/render correctness hazards

### 4.1 Double writes (same state written twice)

| # | Hazard | Evidence |
|---|---|---|
| 1 | Settings: `saveSettings(next)` persists → `scheduleDomainEvent('settings.updated')` makes the projector call `writeBoard` (persists again) → explicit `emit(DATA_CHANGED)` re-renders. Triple effect for one checkbox. | `client/src/modules/settings.js:46-55`; `client/src/modules/event-sourcing/read-model-projector.js:73,79` |
| 2 | `ensureBoardsInitialized` / `createBoard`: write `state.*` + `schedule*Persist` directly, then emit scaffold events; projector re-writes the same slices and re-persists | `client/src/modules/storage.js:584-630`, `storage.js:656-689`; `read-model-projector.js:68-80` |
| 3 | `deleteBoard`: deletes `state.tasks/columns/labels/settings[id]`, schedules read-model deletes, then emits `board.deleted`; projector `writeBoard` rebuilds those slices as `[]` from the seed and schedules a persist, racing the delete (empty arrays instead of removed keys) | `client/src/modules/storage.js:738-776`; `read-model-projector.js:47-49,68-80` |
| 4 | **In-place mutation of cached tasks**: `updateTask` mutates objects returned by `loadTasks()` — the same references cached in `taskCacheByBoard`; any throw after the mutation leaves the cache corrupted (hazard documented in code) | `client/src/modules/tasks.js:242-258`; cache writes `storage.js:946,971`; warning `storage.js:862-865` |
| 5 | Direct writers that never emit domain events (invisible to sync): swimlane collapse/order, column summaries, import/template writes | `client/src/modules/swimlanes.js:357,399,592,675,690,707,719`; `storage.js:1081` (`saveColumnSummary`); `importexport.js:646-653`; `boards.js:86-91` |

### 4.2 Renders without a state change (double `DATA_CHANGED`)

Every row: the domain event already triggered a projected `DATA_CHANGED` render, then the module emits `DATA_CHANGED` again.

| Site | Evidence |
|---|---|
| Task delete | `client/src/modules/task-card.js:280` (after `task.deleted`) |
| Label delete/add/update | `client/src/modules/labels-modal.js:89,344` (after events at `labels.js:58,97,117-129`) |
| Task save | `client/src/modules/task-modal.js:1378` (after `updateTask`/`addTask`) |
| Column collapse toggle | `client/src/modules/swimlane-renderer.js:35` (after `column.updated`, `columns.js:20-25`) |
| Column update | `client/src/modules/column-modal.js:130` (after `columns.js:42-53`) |
| Board rename/fields | `client/src/modules/boards-modal.js:258` (after `storage.js:702-707,729-734`) |
| Swimlane drop | `client/src/modules/dragdrop.js:322` (after `task.moved`, `tasks.js:619-628`) |
| Unrelated state re-renders the board | `client/src/modules/skills-modal.js:139,157,173`, `board-groups.js:209,219` emit `DATA_CHANGED`; `render.js:35-38` unconditionally calls `renderBoard()` for every `DATA_CHANGED` |
| Notifications refresh on every render | `client/src/modules/notifications.js:376-378` invoked from `render.js:326` (full) and `render.js:280` (reconcile) |

### 4.3 State changes without a render / missing event

| Site | Evidence |
|---|---|
| Column summary save mutates settings but emits nothing; trigger button refreshes only on close | `client/src/modules/column-element.js:97`; `syncSummaryButton` only at `column-element.js:32` |
| `setActiveBoardId` persists without emitting; every caller must remember `emit(DATA_CHANGED)` | `client/src/modules/storage.js:575-582`; callers `boards.js:184,243`, `board-sidebar.js:48`, `boards-modal.js:60,210`, `importexport.js:657`, `kanban.js:39` |
| Swimlane save paths never emit `settings.updated`, so the event log cannot sync them | `client/src/modules/swimlanes.js:357,399,592,675,690,707,719` vs `settings.js:48` |

### 4.4 Harness correctness hazards (from harness audit)

P0:

| # | Hazard | Evidence |
|---|---|---|
| 1 | Client sequence-epoch divergence after server state loss: server restarts at `seq 0` with a new nodeId; client only moves `lastSeq` forward and hydrates only when `snapshot.seq > lastSeq`, so it tails `since=oldSeq` forever | `client/src/modules/local-server.js:38-43,89-95` vs `harness/src/store.mjs:214-222` |
| 2 | Cross-board `*.created` dedupe: `entityExists` is global, so `column.created`/`label.created` for every board after the first is silently dropped server-side | `harness/src/store.mjs:88-95,102`; `client/src/modules/storage.js:158-160` |
| 3 | Wrong-shape POSTs wipe state: `POST /api/groups` array/null → `setGroups(undefined)`; `POST /api/skills` non-array → `setSkills(undefined)` + `skillsSeeded = true` | `harness/src/server.mjs:237-244,251-257`; `store.mjs:501-511,524-528` |
| 4 | Skills clobber on first harness connect: server seeds six skills, `initSkillsSync` overwrites local skills | `harness/src/store.mjs:485-495`; `client/src/modules/skills.js:117-124` |
| 5 | No outbound retry/queue: transient POST failure permanently loses the event; events emitted while inactive are buffered in memory only | `client/src/modules/local-server.js:45-52,56-61` |
| 6 | Half-applied append / partial broadcast: `events.push` + `seenIds.add` happen before `project()` and `schedulePersist`; a mid-list throw commits earlier events without broadcasting | `harness/src/store.mjs:106-110`; `harness/src/server.mjs:269-271` |

P1 (contract/robustness): `column.reordered`/renames discarded by `getColumns` (`store.mjs:263-271`); `column.deleted` dead (§1.2); `globalSettings` unreachable (no `scope:'global'` emitter: `reducer.js:269-274`, `emitter.js:9`, `settings.js:48-53`, `store.mjs:124-130`); malformed JSON → 500 (`server.mjs:68,278-281`); `/api/events` unvalidated (`store.mjs:99-101`); unknown-board events create phantom state (`store.mjs:70-85,290-296`); deleted-board snapshot leaks data (`store.mjs:350-357` vs `306-319`); no `httpServer.on('error')` (`server.mjs:308`); forced-kill persistence loss (`stop-bg.ps1:5,9,13`, `watchdog.ps1:160`); unbounded MCP sessions (`server.mjs:125,146-157`); no server-side log compaction (`state.json` grows unbounded).

### 4.5 Needs verification (state/render)

- The `deleteBoard` projection race (§4.1 #3) is described by the modules audit as a race; confirm whether the projector actually wins on current hardware before changing ordering (the fix is small either way: make the projector delete instead of seed-rebuild).
- The `tasks.js:242-258` corruption window requires a throw between mutation and projection — no current test reproduces it; add a regression test in batch 6.

---

## 5. Two sync subsystems

### Live path (event-sourced)

`scheduleDomainEvent` (`client/src/modules/event-sourcing/emitter.js`) → `read-model-projector.js` (sole read-model writer) → `sync-queue.js` (outbound unsynced events). Bootstrapped at `client/src/kanban.js:19-22` (`initSyncQueue`, `initSnapshotSync`, `initRealtime`, `initSyncIndicator`). Producers now emit domain events instead of calling `save*`, e.g. `tasks.js:187`, `columns.js:20`, `labels.js:58`.

### Legacy LWW path (dormant)

| Evidence | Line |
|---|---|
| `autosync.js` listens for `kanban-local-change` | `client/src/modules/autosync.js:5,77-81` |
| That event is emitted only by `storage.saveColumns/saveTasks/saveLabels` | `client/src/modules/storage.js:836,964,1003` → emit `:841,973,1008` (verified at write time for `:973`) |
| Domain modules no longer call `save*`, so the trigger only fires for import/template writes | `tasks.js:187`, `columns.js:20`, `labels.js:58` vs `storage.js:841,973,1008` |
| `runSyncForBoard` early-returns unless `localStorage.kanbanAutoSyncEnabled === 'true'` | `client/src/modules/autosync.js:27-28,39-40` |
| No production code calls `enableAutoSync` (grep-verified at write time: definitions + `client/tests/unit/autosync.test.js` only) | `client/src/modules/autosync.js:31-37` |
| `initializeAutoSync()` **is** called at boot, but is inert without the flag | `client/src/kanban.js:18,63` |
| `pushBoardFull`'s only production caller is the dormant path | `client/src/modules/autosync.js:50`; definition `sync.js:130` |
| `pullAllBoards` has no production caller | `client/src/modules/sync.js:321-432`; tests `client/tests/unit/sync.test.js:309-455` |
| `deleteBoardRemote` is **live** — keep it | `client/src/modules/boards-modal.js:85`; definition `sync.js:275` |

### What deleting the legacy stack would involve

- Delete `client/src/modules/autosync.js` (88 LOC) and `client/src/kanban.js:18,63`.
- Delete `client/tests/unit/autosync.test.js` (16 tests).
- Delete `sync.js:130-317` (`pushBoardFull` + helpers) and `sync.js:321-432` (`pullAllBoards`); delete `client/tests/unit/sync.test.js:211-260,307-463,465-...` slices. **Keep** the PocketBase client/auth (`getPb`, `isAuthenticated`, `ensureAuthenticated`, `getUser`, `loginUser`, `registerUser`, `logoutUser`, `loginWithProvider`) and `deleteBoardRemote` — still used by `authsync.js`, `boards-modal.js`, `snapshot-sync.js`, `realtime.js`, `sync-queue.js`, `sync-indicator.js`.
- Remove the `kanban-local-change` dispatch from `storage.js:841,973,1008` once no listener remains.
- Risk: users who previously set `kanbanAutoSyncEnabled=true` would silently lose LWW pushes after import/template writes. Product decision — see §9.

---

## 6. Circular imports & dynamic-import workarounds

### The cycle family (the only static cycle family; all confirmed by static imports)

| Cycle | Evidence |
|---|---|
| `modals.js → task-modal.js → dialog.js → modals.js` | `modals.js:5`, `task-modal.js:10`, `dialog.js:1`, `modals.js:30` |
| `modals.js → column-modal.js → dialog.js → modals.js` | `modals.js:11`, `column-modal.js:7`, `dialog.js:1` |
| `modals.js → labels-modal.js → dialog.js → modals.js` | `modals.js:13`, `labels-modal.js:5`, `dialog.js:1` |
| `modals.js → boards-modal.js → dialog.js → modals.js` | `modals.js:15`, `boards-modal.js:13`, `dialog.js:1` |
| Transitive variants (each imports `modals.js`, so also closes a `→ dialog.js → modals.js` loop) | `boards.js:2`, `authsync.js:2`, `settings.js:2`, `notifications.js:2`, `spotlight.js:3`, `column-element.js:4` |

Root cause: `dialog.js:1` imports `setupModalCloseHandlers` from `modals.js`, while `modals.js` imports four modal modules that all import `dialog.js`.

### Dynamic `await import()` sites

| Site | Target | Why it exists | Still needed? |
|---|---|---|---|
| `client/src/modules/importexport.js:541,589,613,627,632,659,662` | `./dialog.js` | Cycle via `boards-modal.js:15` → `importexport.js` → `dialog.js:1` → `modals.js:15` → `boards-modal.js` | **No, once the cycle is broken** — 7 sites collapse to 1 static import |
| `client/src/modules/dragdrop.js:303,334` | `./render.js` | `render.js:4` statically imports `dragdrop.js` | Yes (cycle is real) unless replaced by the `DRAG_RECONCILE_*`/`DATA_CHANGED` bus |
| `client/src/modules/task-modal.js:1370` | `./render.js` | Cycle `render.js:6 → notifications.js:2 → modals.js:5 → task-modal.js` | Yes (cycle is real) unless replaced by the bus |
| `client/src/modules/swimlanes.js:649` | `./icons.js` | **No cycle exists** (`icons.js` only imports `lucide` at `:5`; `icons.js` is already eagerly imported at `kanban.js:2` and rendered at `icons.js:118`) | **Obsolete now** — delete the dynamic import |

Contradiction to fix in a comment: `client/src/modules/events.js:1` claims the bus "replaces `await import('./render.js')`", yet three modules still use it.

---

## 7. Test suite gaps

### 7.1 Zero Vitest coverage (13 modules + surfaces)

`calendar.js`, `column-modal.js`, `dialog.js`, `impressum.js`, `labels-modal.js`, `local-server.js`, `notifications.js`, `reports.js`, `roadmap.js`, `schema.js`, `spotlight.js`, `swimlane-renderer.js`, `theme.js` (tests audit §2). Also unprotected: `renderBoard()` (never called in Vitest), `client/src/index.html`, and all of `client/src/styles/**`. `swimlane-renderer.js` and `notifications.js` are only reachable via the untested `renderBoard()` path; `dialog.js`/`modals.js`/`icons.js` are mocked in nearly every test that touches them.

### 7.2 Weak / structural assertions (false confidence)

| Test | Weakness | Location |
|---|---|---|
| `msw-example.test.js` | Exercises zero production modules | `client/tests/dom/msw-example.test.js:1-4,37-53` |
| `accordion.test.js` | Classes/`aria-expanded`/icon dataset only | `client/tests/dom/accordion.test.js:20-30` |
| `task-row.test.js` "single compact row" / delete control | Absence checks + existence only | `client/tests/dom/task-row.test.js:39-49,91-94` |
| `column-summary.test.js` first/last | Sibling order + element presence | `client/tests/dom/column-summary.test.js:40-48,136-141` |
| `task-row-agile.test.js` | Class/text presence checks | `client/tests/dom/task-row-agile.test.js:36-133` |
| `authsync.test.js` | Class toggles + fixed sleeps; substring assertion | `client/tests/dom/authsync.test.js:94-109,135-166` |
| `skills-modal.test.js` armed delete | Asserts button text becomes `'!'` | `client/tests/dom/skills-modal.test.js:191-209` |
| `boards-quick-switch.test.js` navigation | Asserts `keyboard-focused` class, not focus/action | `client/tests/dom/boards-quick-switch.test.js:151-196` |
| `dragdrop.test.js` | Mock call args + `dataset.wasHidden` internals | `client/tests/dom/dragdrop.test.js:107-262` |
| `constants.test.js` | Mirrors constant values (tautological) | `client/tests/unit/constants.test.js:14-57` |
| `utils.test.js` UUID | Uniqueness with 2 samples | `client/tests/unit/utils.test.js:13-17` |
| `backend-event-schema.test.js` | String-matches a migration source file | `client/tests/unit/backend-event-schema.test.js:7-21` |

### 7.3 `client/tests/unit/event-sourcing/snapshot.test.js` flake — root cause

Two compounding timing mechanisms; ~6 failures in ~41 s under load, ~1 s (12/12) on a quiet rerun.

- **Mechanism A — fixed 20 ms sleep races an async IndexedDB chain.** `settle()` is `setTimeout(resolve, 20)` (`client/tests/unit/event-sourcing/snapshot.test.js:132-134`), used as the only synchronization at `:146,162,176,190`. The scheduler (`client/src/modules/event-sourcing/snapshot.js:94-105`) must await `shouldTakeSnapshot` (`:74-89`: `openStore` + `loadSnapshot` + `getAll(EVENTS_STORE)` over 500 rows), then `saveSnapshot` (`:33-40`) and `gcEvents` (`:55-63`, another full scan + readwrite). Under CPU contention this exceeds 20 ms, so `loadSnapshot('board-a')` returns `null` and `expect(snapshot).not.toBeNull()` fails.
- **Mechanism B — the scheduler cannot be cancelled once its timer fired.** `_resetSnapshotSchedulerForTesting()` only clears unfired timers (`snapshot.js:113-118`); the async callback deletes its pending entry at `:95` and has no abort flag. `beforeEach` (`snapshot.test.js:30-35`) resets + deletes the DB but does not await in-flight work, so a stale callback writes into the next test; every test shares key `board-a`, maximizing collisions. The ~500-iteration `await db.put()` loops (`:139-141,156-158,170-172`) can also hit Vitest's default 5 s timeout (no override in `client/vitest.config.js:3-9`), matching the ~41 s cluster.

Fix direction: expose an awaitable drain / abort generation in `snapshot.js`; replace `settle()` with `vi.waitFor(() => expect(loadSnapshot(...)).not.toBeNull())`.

### 7.4 E2E staleness (treat as out of service)

- Two specs read the old DB name `kanvana-db` (app is `openagile-db`, `client/src/modules/idb-store.js:6`): `client/tests/e2e/subtasks.spec.ts:142`, `client/tests/e2e/create-task.spec.ts:100`.
- Fixed four columns (`client/src/modules/constants.js:11-16`, enforced by `storage.js:786-802,815-834`) break ~10/12 specs that use `To Do`/`Done` or seed custom columns (`swimlanes.helpers.js:18-22`, `dragdrop.spec.js:49-50`, `dragdrop-done-crash.spec.js:22-26`, `wip-limit.spec.ts:33-84`, etc.).
- `wip-limit.spec.ts:9,34-35,46-47` clicks a removed `column menu`/`Edit` UI.
- `boards.spec.js` likely still passes.
- `client/package.json:16` `test:perf` references a missing `playwright.performance.config.js`; CI is gone (no workflows under `.github`).

### 7.5 Harness test gap

`harness/package.json:6-8` has no `start`/`test` script; `harness/smoke.mjs:11-29` is a manual client with no assertions.

### 7.6 Needs verification (tests)

- The DOM suite's fragility list is the practical churn surface: fixtures are hand-copied `index.html` fragments (`task-modal-annotations.test.js:66-212`, `settings-ui.test.js:8-35`, `skills-modal.test.js:22-54`, `authsync.test.js:31-60`), so real page changes are invisible until a class/ID rename breaks a fixture. Re-check affected fixtures before/after each UI-facing batch.

---

## 8. Proposed refactor batches

No behaviour change in any batch. Ordered; each is reviewable in one sitting. "Verify" = the exact command(s) that must stay green.

### Batch 1 — Delete zero-reference client code (modules + exports)

- **Goal**: remove `schema.js`, `dispatcher.js`, and the dead exports in §1.2 excluding the column-reorder cluster (batch 2: `updateColumnPositions`, `applyColumnReordered`, `applyColumnDeleted`) and the legacy sync stack (batch 7: `pullAllBoards`, `enableAutoSync`, `disableAutoSync`).
- **Files**: `client/src/modules/schema.js` (delete), `client/src/modules/event-sourcing/dispatcher.js` (delete), `columns.js:7-9,59-61`, `tasks.js:437-449,757-767`, `swimlanes.js:184-187,245-247,472-486`, `wip-limit.js:25-28`, `constants.js:20-22`, `events.js:34`, `dom.js:57-60`, `idb-store.js:138-140`, `realtime.js:164-166`, `hlc.js:35-51`, `snapshot.js:65-72`, `storage.js:979-983,1127-1131`, `local-server.js:151-153`, `notifications.js` exports, `modals.js:115,117-118`, `render.js:47-49,148`, `sync-indicator.js:35`; tests: `client/tests/unit/events.test.js:42`, `client/tests/unit/wip-limit.test.js:77-85`, `client/tests/unit/swimlanes-utils.test.js:123`, `client/tests/unit/event-sourcing/hlc.test.js:17`, `client/tests/unit/storage.test.js:20-21,271-286`, `client/tests/dom/reconcile.test.js:159-170`, `client/tests/dom/event-sourcing/render-triggers.test.js:4`.
- **Exclude**: `pullAllBoards`/autosync exports (batch 7), column-reorder cluster (batch 2).
- **Risk**: Low.
- **Verify**: `cd client; npm run test:unit; npm run test:dom`

### Batch 2 — Remove column-reorder remnants

- **Goal**: delete the removed feature end-to-end (JS, CSS, tests, docs).
- **Files**: `columns.js:64-92`, `reducer.js:228-244,294-295`, `column-element.js:224`, `dragdrop.js:229`, `styles/components/dragdrop.css:98-136`, AGENTS.md reorder rule; tests `client/tests/dom/dragdrop.test.js:34-36,195-203`, `client/tests/unit/columns.test.js`, `client/tests/dom/event-sourcing/feature-modules-emit-events.test.js:67`, `client/tests/unit/event-sourcing/reducer.test.js:179`. Do not rewrite `harness/data/state.json` (historical `column.reordered` events; server projection already discards them).
- **Risk**: Medium (tests assert the stubs).
- **Verify**: `cd client; npm run test:unit; npm run test:dom`; then grep `client/src` for `column.reordered|updateColumnPositions`.

### Batch 3 — Delete dead CSS, tokens, HTML classes

- **Goal**: remove §1.4–1.6. Re-run the dead-selector script first if CSS changed after the frozen revision.
- **Files**: `layout.css:35-94,310-318,578-588,625-647`; `responsive.css:76-88,109-115,264,288-290,294,364-366,377-381`; `glass.css:19`; `column.css:170`; `auth.css:99-106`; `card.css:182,202`; `notifications.css:169-171`; `tokens.css:30,39,58,104,141,156,157,193,201,217,261,281,282`; `index.html:167,201,286,442,462,536,620`.
- **Risk**: Low–Medium. CSS has zero test coverage → visual check required; keep the dynamic-class allowlist from §1.4.
- **Verify**: `cd client; npm run build; npm run test:dom`

### Batch 4 — Break the `dialog.js ↔ modals.js` cycle; remove dynamic-import workarounds

- **Goal**: relocate `setupModalCloseHandlers`/`isModalOpen` into `dialog.js` or a new `modal-utils.js`; convert `importexport.js`'s 7 dynamic dialog imports to one static import; delete the gratuitous `swimlanes.js:649` dynamic icons import.
- **Files**: `dialog.js:1`, `modals.js:5-16,30-43`, `importexport.js:541,589,613,627,632,659,662`, `swimlanes.js:649`; tests that mock `dialog.js`: `client/tests/unit/importexport.test.js:6`, `client/tests/dom/boards-quick-switch.test.js:24`, `client/tests/dom/task-card-delete.test.js:8`, `client/tests/dom/dragdrop.test.js:30`, `client/tests/dom/authsync.test.js:17`.
- **Risk**: Medium.
- **Verify**: `cd client; npm run test:unit; npm run test:dom`

### Batch 5 — Extract duplicated client helpers, constants, key/event registries

- **Goal**: implement §2.1–2.2 single homes; add `client/src/modules/keys.js` and an event-name registry.
- **Files**: per §2 tables (18 helper rows + 4 constants rows).
- **Risk**: Medium (mechanical; large diff).
- **Verify**: `cd client; npm run test:unit; npm run test:dom`

### Batch 6 — Fix state/render hazards

- **Goal**: eliminate §4.1 double writes (settings triple effect, `deleteBoard` race, cache mutation), remove redundant `DATA_CHANGED` emissions (§4.2), route direct writers through domain events (§4.1 #5), and give `setActiveBoardId` a proper event.
- **Files**: `settings.js:46-55`; `storage.js:575-582,584-630,656-689,738-776`; `read-model-projector.js:68-80`; `tasks.js:242-258`; `task-card.js:280`; `labels-modal.js:89,344`; `task-modal.js:1378`; `swimlane-renderer.js:35`; `column-modal.js:130`; `boards-modal.js:258`; `dragdrop.js:322`; `swimlanes.js:357,399,592,675,690,707,719`; `storage.js:1081`; `importexport.js:646-653`; `boards.js:86-91`; `column-element.js:97`.
- **Risk**: High (behavioural; touches render counts and sync visibility). Add a regression test for the cache-mutation window.
- **Verify**: `cd client; npm run test:unit; npm run test:dom` (watch `client/tests/dom/event-sourcing/*` and `client/tests/unit/storage*`)

### Batch 7 — Retire the legacy LWW sync stack

- **Goal**: delete §5 dormant path; keep PB client/auth + `deleteBoardRemote`.
- **Files**: `client/src/modules/autosync.js` (delete), `kanban.js:18,63`, `client/tests/unit/autosync.test.js` (delete), `sync.js:130-317,321-432`, `client/tests/unit/sync.test.js` corresponding slices, `storage.js:841,973,1008` (`kanban-local-change` dispatch).
- **Risk**: Medium; product decision on legacy `kanbanAutoSyncEnabled` users (§9).
- **Verify**: `cd client; npm run test:unit; npm run test:dom`; grep no `kanban-local-change`.

### Batch 8 — Harness/client contract + P0 correctness

- **Goal**: board-scoped `entityExists`, project-before-commit in `appendEvent`, shape validation on groups/skills POST, seq-epoch check, outbound retry queue, gate skills adoption.
- **Files**: `harness/src/store.mjs:88-95,102,106-110,214-222,485-495`; `harness/src/server.mjs:237-244,251-257,269-271`; `client/src/modules/local-server.js:38-43,89-95,45-52`; `client/src/modules/skills.js:117-124`.
- **Risk**: High (data correctness; harness has no automated tests).
- **Verify**: `node harness/smoke.mjs` (manual) + `cd client; npm run test:unit; npm run test:dom`; add a minimal harness test script as part of this batch.

### Batch 9 — De-flake `snapshot.test.js`

- **Goal**: awaitable drain/abort in `snapshot.js`; replace `settle()` with `vi.waitFor`.
- **Files**: `client/src/modules/event-sourcing/snapshot.js:91-118`; `client/tests/unit/event-sourcing/snapshot.test.js:132-134,146,162,176,190`.
- **Risk**: Low.
- **Verify**: `cd client; npm run test:unit` (run twice; ideally under parallel load)

### Batch 10 — Split files over 250 LOC (lowest risk first)

- **Goal**: extract cohesive modules; do after batches 5–6 so duplication/state fixes are in.
- **Order**: `reports.js` (1073), `calendar.js` (285), `boards.js` (251), `board-sidebar.js` (267), `task-card.js` (294), `reducer.js` (322); leave `task-modal.js` (1384), `storage.js` (1214), `tasks.js` (772), `swimlanes.js` (723), `importexport.js` (667) last.
- **Risk**: Medium–High (largest files have the deepest test coupling).
- **Verify**: `cd client; npm run test:unit; npm run test:dom` after each file.

### Batch 11 — Align the five HTML pages (UI-facing)

- **Goal**: favicon on all pages (`index.html:11` only today), fix CSP so analytics is not blocked (`reports.html:7` vs `:10`; `impressum.html:8,10-20` vs `:24`), remove duplicate impressum CSP, style/fix impressum header (`impressum.html:27-39` vs `reports.css:17-107`), replace inline styles (`index.html:71,78,85,100,577,591`), unify close-button idiom (`.btn-small` at `:177,890` vs `.icon-btn` at `:400,435,458,483,531`).
- **Risk**: Low (DOM tests mount fixtures, not pages).
- **Verify**: `cd client; npm run build` + manual open of all five pages.

---

## 9. Open questions for the human

1. **Legacy sync retirement**: delete the dormant LWW stack (§5) or keep it for users with `kanbanAutoSyncEnabled=true`? Deleting changes behaviour for those profiles; `deleteBoardRemote` stays either way.
2. **Column contract**: MCP forbids rename/reorder/delete (`harness/src/mcp-tools.mjs:565-617`) while the client renames (`columns.js:42-53`) and emitted reorders that the server read model discards (`store.mjs:263-271`). Should the client lose column rename/reorder, should the server keep name/order, or should the UI redesign reintroduce column management (which would need a real `column.deleted`/`column.reordered` contract)?
3. **Groups/skills**: keep as out-of-band non-event state (`store.mjs:330-357,497-542`) or event-source them? Affects the sync design and the wipe-risk POSTs (§4.4 #3).
4. **`globalSettings`**: keep (and add a `scope:'global'` emitter) or delete the inert path (`reducer.js:269-274`, `emitter.js:9`)?
5. **`GET /api/health`**: currently doubles as the PocketBase probe fallback when `VITE_PB_URL` is unset (`authsync.js:12-13,161`). Keep that contract or make the probe explicit?
6. **E2E**: repair or delete? ~10/12 specs are stale; `test:perf` is broken (`client/package.json:16`).
7. **Test hygiene**: delete `client/tests/dom/msw-example.test.js` (zero production coverage)?
8. **`isTaskLocked`**: is "column name contains `in progress`" intended workflow (`tasks.js:769-772`), or should it use the column id/role?
9. **UI redesign inputs**: impressum header styling and the dead/unstyled HTML class hooks (§1.6) — style or remove as part of the redesign?
10. **Harness log growth**: server has no `gcEvents` equivalent and `harness/data/state.json` grows unbounded — is compaction in scope for batch 8?

---

## Appendix — source audits

| Audit | Task | Session / output |
|---|---|---|
| Client modules | `bg_38c6c293` | `tool_0a0a64f840014Pw3omlO5JV7xJ` |
| Styles + HTML | `bg_f9a08d59` | `tool_0a0a7a5d8001e1hv0YHdah6tug` |
| Harness + integration | `bg_...` (explore) | session `ses_f5f6574deffenulU1nJsGpkdKT` |
| Test coverage | `bg_...` (explore) | session `ses_f5f630995ffeotCGOU3OuC5tvZ` |
| Cocoa glassmorphism restyle | `bg_c8ab5f41` | `tool_0a0a64f7c0012FlFQ0597lVKNW` — **ignored** |

---

## Progress log

Every entry below was verified with `npm run build` (exit 0), `npm run test:unit`
and `npm run test:dom`, plus `node harness/test.mjs` whenever the harness
changed. Current totals: unit 340, dom 180.

| Work | Commit | Notes |
|---|---|---|
| Batch 1 - zero-reference client code | `bf9db90` | Also emptied the first-run seed: a new install now creates the board scaffold with no demo tasks |
| Empty board + data reset | `bf9db90` | The previous harness data is in `harness/data/state.backup-*.json`; `harness/data` is gitignored, so it stays local |
| Watchdog hardening | `bf9db90` | Fixed a 52-minute hang caused by a parent/child PID cycle, switched exemption to ports only, 90s execution limit, runs on battery |
| Batch 2 - column-reorder remnants | `fb89353`, `66a0d17` | Columns are now fully fixed: no add, delete, reorder or rename. The column settings modal had no caller and is deleted |
| In Progress fully read-only | `fb89353` | Annotations included. The lock keys off the fixed column id, and the annotation fieldset is locked explicitly because it sits outside `#task-form` |
| Batch 9 - de-flake snapshot tests | `fb89353` | `checkAndScheduleSnapshot` returns a promise that settles when the scheduled work finishes; the test awaits it instead of sleeping |
| Batch 4 - dialog/modals cycle | `d8ad76a` | Shared modal helper moved to `modal-utils.js`; seven dynamic dialog imports became one static import. The two dynamic imports with real reasons were kept |
| Skill copy aligned | `c4e86c4` | Both seeded skills now state that In Progress is read-only including annotations |
| Batch 3 - dead CSS, tokens, HTML | `0c740f7` | Re-scanned the current tree: every remaining candidate is produced dynamically; no token is unreferenced |
| Batch 11 - five HTML pages | `4d58b60` | Brand titles, a favicon on every page, and one CSP per page (impressum carried a duplicate that would have blocked its own analytics) |
| Batch 8 (partial) - POST shape validation | `21eee8f` | Malformed groups/skills POSTs now answer 400 instead of replacing the stored collection with `undefined` |
| Batch 8 (partial) - board-scoped dedupe | `39ac617` | Added `harness/test.mjs` and `OPENAGILE_DATA_DIR`; a second board no longer loses its columns |
| Batch 8 (partial) - project before commit | `548a1f4` | A projection failure no longer leaves the event log ahead of the read model |

### Two audit claims that turned out to be wrong

- `.sortable-ghost` is **live**: it is SortableJS's default `ghostClass` on the
  subtask list.
- The dynamic `icons.js` import in `swimlanes.js` is **needed**: `icons.js` calls
  `createIcons()` at module load, which throws outside a browser. Converting it to
  a static import broke two unit suites.

### Still open

- Batch 8 remainder: seq-epoch agreement, skills adoption clobbering local skills,
  outbound retry for failed client POSTs
- Batch 5 (extract duplicated helpers, constants, key and event registries)
- Batch 6 (state/render hazards: double writes, double `DATA_CHANGED`, cached-task
  mutation, direct writers that bypass the event log)
- Batch 7 (retire the dormant legacy LWW sync stack)
- Batch 10 (split the files over 250 LOC)
- Batch 11 polish (six inline `style` attributes in `index.html`, the mixed
  `.btn-small` / `.icon-btn` close-button idiom)
- The UI/UX redesign pass

### Environment note

Subagent tasks stalled consistently in this environment (one run produced nine
stalled tasks with zero file writes), so the work above was done sequentially by
the main agent rather than in parallel. The plan in this document is still the
right unit of work to hand to a fresh session or to parallel agents.

### Progress log update

Completed after the table above was written:

| Work | Commit | Notes |
|---|---|---|
| Batch 8 (partial) - skills adoption merges | `a515be7` | Adopting server skills no longer deletes a local-only skill |
| Batch 11 polish | `17f0d6c` | The two icon close buttons use `.icon-btn`; the control-bar inline `text-decoration` moved into a rule |
| Batch 7 - retire the legacy LWW stack | `750776c` | `autosync.js`, `sync.js`'s push/pull pair, their tests and the `kanban-local-change` dispatch are gone; PB client, auth and `deleteBoardRemote` stay |
| Batch 8 (partial) - outbound retry | `f86d6fd` | A failed event forward is queued and retried, and the queue is drained when the harness becomes active again |

Totals after these: unit 306, dom 180, `node harness/test.mjs` 5/5.

Remaining: Batch 8's seq-epoch item, Batch 5, Batch 6, Batch 10, and the UI/UX
redesign pass.

### Progress log update 2

Completed after the previous update:

| Work | Commit | Notes |
|---|---|---|
| Batch 6 - redundant render after a settings change | `c20df54` | scheduleDomainEvent already triggers DATA_CHANGED |
| Batch 6 - three more redundant renders | `a0c8e75` | task-card, task-modal, swimlane-renderer; also corrected the task-card delete test, which asserted the component's own emit |
| Batch 6 - redundant render after a label delete | `e886aaa` | deleteLabel emits the label events |
| Batch 5 - MAX_LABEL_NAME_LENGTH | `4b95dfe` | labels.js imports the constant instead of copying it |
| Batch 5 - TASK_TYPE_LABELS and URL_RE | `ca40d47` | moved to agile.js (next to TASK_TYPES) and utils.js |
| Batch 5 - readLocalJson / writeLocalJson | `a50d58d` | board-groups and skills had identical copies |
| Batch 5 - nowIso | `7d9b574` | board-serializer and storage share the utils helper |

Deliberately kept when removing the emits: the swimlane lane and cell toggles (they
write through saveSettings and emit no domain event) and the drag-drop reconcile
fallback, whose comment explains it needs a full rebuild.

Still open:

- Batch 6 remainder: the cached-task mutation in tasks.js and the direct writers in
  swimlanes.js, boards.js and importexport.js
- Batch 5 remainder: the storage keys and the hardcoded event names
- Batch 10 (split files over 250 LOC) and the UI/UX redesign pass
- New: the harness exited once with `Failed running 'src/server.mjs'` immediately
  after an "HLC drift exceeded 60000ms" warning. It was restarted and the data was
  intact (seq 30, six skills, one board), but the crash itself is unexplained.

### Batch 6 audit items that were re-checked and need no change

These were re-verified against the current tree rather than taken on trust:

- **Cached-task mutation in `tasks.js`** - already guarded. `loadTasks` shallow
  copies every task and deep copies the mutable nested fields (`columnHistory`,
  `subTasks`, `labels`, `relationships`) before handing them out, with a comment
  explaining that a feature module's in-place edit must not leak into the read
  model and double-apply with events (ADR-0005). The only path that returns a
  cached reference is the empty-cache branch, where the cached value is an empty
  array, so nothing can leak.
- **Direct writes in `swimlanes.js`** - those calls are `saveSettings`, used for
  swim-lane and cell collapse state. Like `columnSummaries`, that is out-of-band
  UI state rather than event-sourced board data, so writing it directly is by
  design.
- **Direct writes in `boards.js` (apply template) and `importexport.js` (import
  board)** - these are deliberate bulk paths: emitting one event per imported task
  would create hundreds of `task.created` events for a single user action. Making
  them event-sourced is an architecture decision (see the open questions) rather
  than a cleanup, so it was left alone.

Net effect: the only Batch 6 changes needed were the redundant renders, which are
done (`c20df54`, `a0c8e75`, `e886aaa`).

### Bulk-edit trap: assert the postcondition, never log success unconditionally

While de-duplicating the priority list, a helper script reported `import added` for
both files while the import had in fact not been inserted. It removed the local
constant first, so the result was a `ReferenceError: PRIORITIES is not defined`
that the build did not catch (it is a runtime error, not a syntax error) and that
four test files did catch.

Two causes, both worth remembering for this repo:

1. The insertion regex used `^import ...` **without the `m` flag**, so `^` anchored
   to the start of the whole string instead of the start of a line and never
   matched an import sitting on line 2 or 3.
2. Files read with `readFileSync` keep **CRLF** line endings on this checkout, so a
   line-anchored pattern ending in `;\n` does not match a file whose lines end in
   `;\r\n`. Normalise with `split(/\r?\n/)` then `join('\n')`, or match `\r?\n`.

The scripting rule that follows: after a structural edit, assert the postcondition
(the import is present, no old identifier remains) and **exit non-zero** when it
fails - a helper that prints a fixed success string regardless of the outcome is
worse than no helper, because it hides the breakage until the test run.

### UUID generation: two generators, on purpose - plus one latent risk

The audit listed `utils.generateUUID` against the `crypto.randomUUID()` calls in
`hlc.js` and `local-server.js`. They were left as they are, because they are not
duplicates:

- `utils.generateUUID` (used by 11 modules for entity and event ids) is a pure-JS
  v4-shaped generator built on `Math.random()`. It works in any context, including
  a page served over plain HTTP, where the Web Crypto API is not exposed.
- `hlc.js` (node id) and `local-server.js` (client id) use `crypto.randomUUID()`.
  These identify a device on the sync network, so a stronger source is the right
  call, and both run in contexts that already require the modern API.

**Latent risk worth a decision, not a refactor:** `hlc.js` calls
`crypto.randomUUID()` unconditionally in two places (`ensureNodeId`, and the
fallback inside `emitLocalSync`). `crypto.randomUUID` is only defined in a secure
context, so opening the client over plain HTTP on a LAN address - which is exactly
how the harness is meant to be reached from another device - would throw
`TypeError: crypto.randomUUID is not a function` the first time a node id is
needed. Either guard it with a `utils.generateUUID` fallback, or document that the
client must be reached over https or localhost. This is a behaviour decision, so it
was not changed here.

### The harness exit: a startup ReferenceError, logged nowhere (resolved)

**Correction:** an earlier entry here proposed the watchdog as the likely killer. That
was wrong, and the harness logs settle it. The watchdog log records `sweep complete:
0 killed, 3 kept` on every two-minute run and only ever sees the infinite-canvas dev
server; the OpenAgile harness never appears in it at all, so it was not the watchdog.

What actually happened, from `harness/logs/harness.err.log`:

```
file:///...harness/src/store.mjs:238
  seedDefaultSkillsIfEmpty();
  ^
ReferenceError: seedDefaultSkillsIfEmpty is not defined
    at initStore (store.mjs:238)
    at file:///...harness/src/server.mjs:265
Node.js v24.19.0
```

A real `ReferenceError` in the startup path, thrown while the module was still
evaluating, so the process died before the HTTP server ever listened; `node --watch`
then reported `Failed running 'src/server.mjs'`. The function is defined at
`store.mjs:495` today and the file syntax-checks and boots clean, so this was a
transient intermediate state during the refactor rather than a live defect.

**Why no error appeared in the log stream where you would expect it:** `server.mjs`
registered `uncaughtException` and `unhandledRejection` at the very end of the file,
*after* the top-level `initStore()` call. A throw from `initStore()` therefore had no
handler installed yet, and the process died silently - note the absence of any
`[harness] uncaught` line right where the traceback is.

**The HLC warning is a red herring.** It fires on the first event after more than 60s
of idle, so it prints on any long-lived process; it is a `console.warn` on an
intentional path and was never the cause. Note also the trailing `^C` in
`harness.out.log`: the server was also stopped by hand at some point, which is why it
was found down and no longer started on its own.

**Fix applied:** the two process-level handlers were moved to the top of
`server.mjs` (lines 22-23), immediately after the imports and ahead of the
`initStore()` call, so a startup failure is now logged instead of vanishing. Verified:
handlers at 22-23, `initStore()` at 313, `node --check` clean, harness tests 5/5,
`/api/health` 200, and the store reloaded with events: 30, seq: 30 (no data loss).

**Operational note:** a stray harness was left listening because it had been started
with `Start-Process` directly instead of `harness/start-bg.ps1`. The wrapper is what
provides `--watch` and the `logs/harness.out.log` trail; starting the server any other
way loses both. Use the wrapper.

### Storage keys and event names: what was done, and what was deliberately not

The audit asked for the storage keys and the event names to be gathered into
registries. Re-checking the tree changed the answer for each.

**Storage keys - no change needed.** Every storage key is already a named constant
defined exactly once, in the module that owns it: `GROUPS_KEY`, `BOARD_GROUP_KEY`
and `GROUPS_MIGRATED_KEY` in board-groups.js, `NO_BOARDS_KEY` in constants.js (imported
by the three modules that need it), `SKILLS_KEY`, `SEQ_KEY` and `CLIENT_KEY`,
`HLC_NODE_KEY`, `BACKFILL_FLAG_KEY`, `GLOBAL_SETTINGS_KEY`, `BOARDS_KEY`,
`ACTIVE_BOARD_KEY`, the three `LEGACY_*` keys, `STORAGE_KEY` in theme.js, and so on.
A scan for `'openagile:...'` literals returns **only the definitions themselves** -
there is no duplicated raw key anywhere. Moving these into one shared registry would
relocate fifteen constants and couple fourteen modules for no functional gain, while
introducing exactly the failure the item was meant to prevent: one mistyped key
silently breaking persistence. Left as is.

**Event names - a guard rather than a registry.** The 21 event types are genuinely
written as raw literals at both ends (emit sites in tasks.js, storage.js, labels.js,
columns.js, settings.js and backfill.js; comparison sites in read-model-projector.js),
so a typo on either side produced an event that nothing projects, with no error.

A registry of the names was **not** the fix, because in plain JavaScript it does not
buy the safety that motivated it: `EVENTS.BOARD_CREATED` mistyped as
`EVENTS.BOARD_CREATD` evaluates to `undefined` and fails just as quietly. What actually
makes a typo loud is validation where the value is consumed.

`emitter.js buildDomainEvent` is the single place any domain event type is set, so the
canonical list (`DOMAIN_EVENT_TYPES`, 21 entries) and the guard live there, and the
emitter throws on an unknown type. Verified three ways: the full suite passes with the
guard in place (which is what shows the list is exhaustive rather than merely plausible),
an added unit test asserts an unknown type throws, and the message asserted is one that
only the guard produces, so the test cannot pass vacuously.

**Worth doing later, if the event model grows:** migrate the comparison site in
read-model-projector.js to the exported set so both ends read from one list. It was not
done here because one comparison against a two-name disjunction does not justify the
churn on its own.

### Batch 10 inventory, measured (not carried over from the audit)

Line counts taken from the tree at the time of writing. The audit listed three files;
there are in fact sixteen over the 250-line ceiling, so a plan based on the old list
would have stopped early.

| Lines | File |
|---:|---|
| 1363 | modules/task-modal.js |
| 1098 | modules/storage.js |
| 1070 | modules/reports.js |
| 743 | modules/tasks.js |
| 698 | modules/swimlanes.js |
| 664 | modules/importexport.js |
| 380 | modules/notifications.js |
| 343 | modules/dragdrop.js |
| 340 | modules/labels-modal.js |
| 329 | modules/render.js |
| 302 | modules/reducer.js |
| 293 | modules/task-card.js |
| 285 | modules/calendar.js |
| 267 | modules/board-sidebar.js |
| 265 | modules/boards-modal.js |
| 251 | modules/boards.js |

**Suggested order, cheapest first.** Splitting the three largest files is the risky part
and should be done one at a time, each behind the full suite. The smaller files at the
bottom of the table are close to the ceiling and can be brought under it by moving one
cohesive group out, which is far less likely to disturb the read-model invariants.

Candidate boundaries that look self-contained from a read of the code, to be confirmed
against CONTEXT.md before moving anything:

- **storage.js** - the legacy migration block (the `kanbanColumns`/`kanbanTasks`/
  `kanbanLabels` to per-board-key move, roughly lines 254-300) runs once at init and
  touches nothing else; the key helpers are already a small group.
- **task-modal.js** - the subtask editor, the annotation list and the comment list are
  three independent renderers sharing only helpers.
- **reports.js** - each chart section appears to own its own data shaping.

**Do not start this without a clean checkpoint and the full suite green.** These files
sit on the event-sourcing read model; a split that changes module evaluation order can
turn a static import into a cycle and break projection in ways the build will not catch.

### Batch 10 progress, and why the next files are not as cheap as they look

**Done: boards.js (251 to 176 lines).** Its built-in template group (the
`import.meta.glob` of `../templates/*.json`, the template lookup, the select
population and the apply path) was genuinely self-contained - nothing else in the file
referenced it - so it moved to `board-templates.js`. Note the extraction also shrank
`boards.js`'s imports: five storage functions and `normalizeBoardModelIds` were used
only by the moved code and are now imported by the new module instead.

**`board-sidebar.js` (267 lines) looked like the next cheap win on line count alone,
but is not.** Its first two functions total nine lines; everything else is a single
`initializeBoardSidebar()` spanning roughly 233 lines, and the work inside it is done
by nested functions that close over the outer scope. Pulling a piece out of a closure
like that is a refactor of the module's state sharing, not a file split, and it cannot
be checked by line count or by the build.

**Lesson for the rest of Batch 10:** line count predicts the cost of a split only when
the file is already organised as separate top-level functions. For every remaining file,
check the shape first - list the top-level definitions and look at the largest one. A
file that is one long function is a different, larger job than a file that is many small
ones, even at identical line counts.

### Batch 10: shape survey of the next candidates, and the recommended next file

Measured top-level definition counts and the size of the largest single block, because
line count alone does not predict the cost:

| File | Lines | Top-level defs | Largest block |
|---|---:|---:|---:|
| reducer.js | 302 | 26 | 39 |
| task-card.js | 293 | 5 | 43 |
| boards-modal.js | 265 | 9 | 66 |
| calendar.js | 285 | 15 | 138 |
| board-sidebar.js | 267 | 3 | ~233 |

**reducer.js is the recommended next split.** It is already organised as 22 handlers of
identical shape, `applyXxx(state, event)`, sitting between the state factory and the
handler map, so a domain group can be lifted out with almost no interpretation:

```
  3  createProjectionState (exported)
 16  cloneState
 36  applyTaskCreated
 44  applyTaskUpdated
 55  applyTaskMoved
 95  applyTaskDeleted
105  updateTaskById
113  applySubtaskAdded
122  applySubtaskRemoved
130  applySubtaskToggled
141  applySubtaskTextChanged
152  applyRelationshipAdded
162  applyRelationshipRemoved
172  applyLabelAddedToTask
181  applyLabelRemovedFromTask
189  applyLabelCreated / 197 Updated / 205 Deleted
212  applyColumnCreated / 220 Updated
228  applyBoardCreated / 236 Updated / 244 Deleted
251  applySettingsUpdated
258  handlers
282  applyEvent (exported) / 296 applyEvents (exported)
```

The task group (36-111) is the natural first lift. Two cautions: the handlers share
`cloneState` and `updateTaskById`, so those must move with them or stay importable, and
this is the **projection core** - the single place the read model is written (ADR-0005) -
so it needs the full suite green after each group, not after all of them.

Contrast with board-sidebar.js (three definitions, one of them 233 lines of closures),
where the same line count represents a much larger and riskier job.

### Batch 10: task-card.js split (293 to 100)

`task-card.js` is five small helpers plus one 188-line `createTaskElement`, so the
"largest block: 43" in the survey above understates it - the row builder, not the helpers,
was the bulk, and the helpers alone would not have brought the file under the ceiling.

The cohesive group was the **meta chip row**: the 126 lines that build the type badge,
priority, due date, estimate, assignee, labels, subtask donut, relationships, blocked
marker, age chip and stale dot. Nothing else in the file touched them, so they move to
`task-card-meta.js` as `buildTaskMeta(task, settings, labelsMap, today)`.

Two things needed care:

- The block used to run `if (staleTask) li.classList.add('task-stale')` in the middle,
  mutating the row rather than the meta div. `buildTaskMeta` therefore returns
  `{ meta, staleTask }` and the caller applies the class. A first cut that moved that line
  with the block leaked `li` into the new module; the postcondition check caught it, which
  is the argument for asserting on leaked identifiers, not just on line counts.
- `formatDisplayDate` had to leave the file (the meta row is its only caller there and
  importing it back would have closed a `task-card.js -> task-card-meta.js -> task-card.js`
  cycle), but it was homed in `dateutils.js` rather than in the new module, because
  `render.js` also uses it for the swimlane due date and a date formatter reached through a
  task-card module points the dependency the wrong way.

`task-card.js` drops from 293 to 100 lines and its imports from ten to five; only the meta
row used them. Verification: build 0, unit 307/307, dom 180/180.

### Batch 10: boards-modal.js split (265 to 197)

Two groups shared this file: the boards list/select rendering with the modal's open/close
primitives, and the board **rename** modal. The rename modal was the self-contained one -
`editingBoardId`, the two show/hide functions and the `#board-rename-form` submit handler -
and the list rendering never touched it.

The one coupling needed care. The submit handler refreshes the nav board select and then
the boards list, both of which live in `boards-modal.js`. Importing them from the new module
would have closed a `boards-modal.js -> board-rename-modal.js -> boards-modal.js` cycle, so
`initializeBoardRenameModalHandlers(setupModalCloseHandlers, refreshBoards)` takes a
callback and the caller supplies the two render calls. Call ordering is unchanged.

Moving `showBoardRenameModal`/`hideBoardRenameModal` out meant their two external importers
had to follow - `modals.js` (Escape handling) and `board-sidebar.js` (the sidebar rename
action) - and `board-sidebar.test.js`'s mock had to be re-pointed at the new module, since a
mock left on `boards-modal.js` would have gone inert and silently let the real module load.

`boards-modal.js` also carried a genuinely unused import (`getActiveBoardName`), dropped
while the import block was trimmed. Verification: build 0, unit 307/307, dom 180/180.

### Batch 10: calendar.js split (285 to 187)

`calendar.js` is a page entry - only `calendar.html` loads it and nothing imports from it -
with one large renderer, so the safe group was the thirteen pure helpers above it: the
ISO/month formatters, the month and weekday arithmetic, and the due-date/task predicates
(`extractTaskDueDateIso`, `isTaskOverdue`, `groupTasksByDueDateForMonth`). They move to
`calendar-utils.js`; `renderDueDateCalendar` and the page bootstrap stay.

Only the ten helpers the page actually calls are exported. `extractTaskDueDateIso` reads
like a public helper but has no caller left in the page - both of its users moved with it -
so it stayed internal rather than being exported for nothing, as did `isoDateOnly` and
`isTaskDone`.

The page also carried a duplicate `./storage.js` import (two statements, the second just
`isDoneColumnId`, `loadTasks`); they collapse into one while the import block is rewritten,
and `isDoneColumnId` travels with `isTaskDone`.

**`calendar.js` has no Vitest coverage**, so this one was checked in the browser as well as
by the suite: the harness serves the build on 8787, and `calendar.html` renders the correct
Monday-start September 2026 grid with today marked `is-today`, and clicking a day moves the
selected-list title. Verification: build 0, unit 307/307, dom 180/180.

### Batch 10: labels-modal.js split (340 to 133)

The file held two modals that talk to each other: the labels **manager** (list, search,
accordion groups, delete) and the individual label **create/edit modal**. The individual
modal became `label-edit-modal.js`, owning `editingLabelId`, the name-length guard flag, the
hex-colour helpers and the whole `#label-form` submit path.

The coupling runs both ways - the manager opens the edit modal (row edit button, Add Label,
and the `kanban:open-label-modal` listener), and the edit modal refreshes and closes the
manager after a successful save - so importing both ways would have closed a cycle. Instead
the edit modal takes the manager's two functions as parameters
(`initializeLabelEditModalHandlers(setupModalCloseHandlers, { refreshLabelsList, hideLabelsManager })`)
and the manager supplies them. `taskModalState` stays with the edit modal, which now also
exports `getTaskModalState()` for the manager's show/hide.

It is `label-edit-modal.js` and not `label-modal.js` because `label-modal.js` next to
`labels-modal.js` is a one-character difference and a standing trap.

`labels-modal.js` has no Vitest coverage (audit §7.1), so this was checked in the browser as
well - see the note on the boot bug below.

### Found while verifying: `initializeModalHandlers()` had been throwing since 66a0d17

Opening the board in the browser to check the labels split surfaced
`ReferenceError: initializeColumnModalHandlers is not defined` at startup. Commit 66a0d17
dropped the unreachable column modal and removed the `column-modal.js` import and the
Escape-chain entry, but missed the call to
`initializeColumnModalHandlers(setupModalCloseHandlers)` inside `initializeModalHandlers()`.
The call threw, so **every initializer after it never ran** - `initializeLabelsModalHandlers`,
`initializeBoardsModalHandlers`, the help modal and the whole Escape chain. Both manager
modals were dead in the shipped build.

The DOM suite missed it because it calls the individual initializers directly
(`boards-quick-switch.test.js`) and nothing covers `initializeModalHandlers()` itself;
`labels-modal.js` has no coverage at all.

Confirmed pre-existing rather than introduced by Batch 10: `git grep
initializeColumnModalHandlers HEAD -- client/dist` finds the symbol in the committed bundle,
and `git log -S` attributes the removal to 66a0d17.

Fix: delete the stale call. Re-verified in the browser afterwards - the console is clean, the
labels manager opens, creates and deletes a label and refreshes, the boards manager lists the
boards and opens the rename modal, and both close through the handlers that had been dead.

### Batch 10: render.js split (329 to 226)

Two groups left the orchestrator.

The board filter and the Done-column pagination - the `boardFilterQuery` state,
`taskMatchesFilter`, `selectVisibleTasks`, the batch-size constants and `buildShowMoreButton`
- moved to `board-filters.js`. `renderBoard` and `reconcileBoard` both read that one filter
and both grow that one batch, so the "Show more" button now takes the re-render as a
parameter (`buildShowMoreButton(remaining, onShowMore)`) instead of importing `renderBoard`,
which would have been a cycle.

`syncMovedTaskDueDate` moved to `task-card-meta.js`, next to the due-date chip it patches -
same classes, same thresholds, the update counterpart of the builder.

Two side effects worth knowing: render.js no longer imports `dateutils.js` at all (only
`syncMovedTaskDueDate` used it), and `setBoardFilterQuery` has left render.js's API - it is
the filter state's own setter now, so `reconcile.test.js` imports it from `board-filters.js`.

The dom suite covers `reconcileBoard` directly, filter and virtualization included, but
`renderBoard()` still has no Vitest coverage, so the board was loaded in the browser too: all
four fixed columns render with a clean console. Verification: build 0, unit 307/307, dom
180/180.

### Batch 10: dragdrop.js split (343 to 86)

This file was one long `initTaskSortables` wrapped around drag-session state it shared with
its helpers, so the split follows the gesture instead of the function list.

`drag-session.js` owns the session flags (`isDraggingTask`, `activeTaskList`), the pointer
tracking, the auto-scroll timer and the collapsed-column drop affordances, and exports the
three Sortable callbacks - `startDragSession`, `moveDragSession`, `cleanupTaskDragState`.
`task-drop.js` owns what a finished drop does: `handleTaskDrop` (the old `onEnd` body), the
blocked-reason prompt and the container lookup.

The useful finding is that this did **not** need a closure-breaking rewrite: none of the
three handlers referenced `initTaskSortables`'s scope, so their bodies lifted out verbatim and
only the config's `onStart`/`onMove` entries changed from inline functions to those names.
The moved bodies were de-indented from the config object's 8-space base to 2, and the script
asserts each body's minimum indentation is 2. Six stateful drag variables and
`isDoneColumnId` no longer appear in dragdrop.js at all, which is what reduces it to the
Sortable config plus `shouldForceFallbackForTasks`.

Verification: build 0, unit 307/307, dom 180/180 (the DOM suite drives the collapsed-drop
flow through the `wasHidden` dataset), and the board loads with a clean console.

### Batch 10: notifications.js split (380 to 179)

Three layers were stacked in one file. `notification-tasks.js` takes the due-task selection
and formatting (`getNotificationTasks`, `formatDueStatus`), which both the banner and the
modal consume. `notifications-banner.js` takes the banner: its localStorage-backed hidden
preference, the toggle sync and the whole `renderNotificationBanner`.

The banner is the only thing that opens the notifications modal, and the modal stays in
notifications.js, so instead of importing back the banner's render takes that one action as a
parameter - `renderNotificationBanner(onShowMore)` - and notifications.js passes
`showNotificationsModal` at both call sites (the refresh and the debounced resize).

`notifications.js` has no Vitest coverage (audit §7.1), so it was checked in the browser: the
bell opens the modal, the due-task empty state renders, and toggling "Show notification
banner" runs `setNotificationBannerHidden` + `refreshNotifications` with a clean console.

**Known gap:** the banner's *item* rendering path (the width-fitting loop and
`formatDueStatus` with a real task) is still unverified by anything. Exercising it needs a
task with a due date, which would write two events into the harness log, so it was not done
here. That path is the one now in `notifications-banner.js`.

### Batch 10: board-sidebar.js split (267 to 232) - and why it is not really split

The survey warned this one was not cheap, and it was right. `initializeBoardSidebar()` is a
single ~234-line closure of mutually-referencing nested functions (`render` ↔
`buildGroupElement` ↔ `buildBoardItem` ↔ `startGroupRename`), all closed over `listEl`. Inside
it there is exactly one piece that closes over nothing: `makeDeleteButton`, the "click twice
to confirm" control, which needs only `renderIcons`.

That moved to `armed-delete-button.js` as `createArmedDeleteButton`, and that is the whole of
this split - it is what brings the file under the ceiling. **The file is still one large
closure.** The remaining nested functions were left alone deliberately: lifting them means
threading `listEl` and `render` through every call and re-deriving the mutual recursion, which
is a state-sharing refactor, not a file split. If this file has to shrink again it should be
done by extracting the whole sidebar renderer behind one explicit context object.

`createArmedDeleteButton` is also the natural starting point for the §2.1 "click twice to
confirm delete" convergence (the other copy is in `skills-modal.js`), which is why it went to
its own module rather than into `utils.js`.

The DOM suite covers this file's group-rename paths but not the armed delete, so that control
was verified in the browser: the first click arms it (`!`, aria-label "Click again to confirm
delete") and the 3-second timer disarms it back. Verification: build 0, unit 307/307, dom
180/180.

### Batch 10: importexport.js split (664 to 210; import side 462 to 90 + 213 + 164)

This file is two features fused by one import: the export side (`exportTasks`, `exportBoard` and
their normalizers) and the import side (validation, inspection, the confirmation message, the
import normalizers and the `importTasks` orchestrator). The only thing the export side needs from
the import side is `inspectImportPayload`, which both export functions call as an integrity gate
before writing the blob; nothing travels the other way.

That one-way dependency is the seam; the import side is what left. It could not fit one file:
`importexport.js` had 664 lines and two files cap out at 498, so the import half needs two
modules. It lands as three files in a strictly one-way chain:

- `import-normalize.js` (164) - the pure shape normalizers `normalizeImportedTasks`,
  `normalizeImportedColumns`, `normalizeImportedLabels`, `normalizeImportedSettings`; they read
  only `normalize.js` and `DONE_COLUMN_ID`.
- `import-payload.js` (213) - inspection and validation: `IMPORT_LIMITS`,
  `legacyDefaultColumnsForImport`, `boardNameFromFile`, `getImportSections`, `pluralize`,
  `validateImportFileMetadata`, the 109-line `inspectImportPayload` (the largest single block in
  the original file) and `buildImportConfirmationMessage`. It imports the four normalizers from
  `import-normalize.js`.
- `import-board.js` (90) - the thin orchestrator: `importTasks` and its `refreshBoardsUI`, plus
  the `FileReader` / storage side effects. It imports `validateImportFileMetadata`,
  `inspectImportPayload` and `buildImportConfirmationMessage` from `import-payload.js`.

`importexport.js` keeps the export side (`EXPORT_SCHEMA_VERSION`, `getCurrentAppVersion`,
`buildExportMeta`, `normalizeSettingsForExport`, `normalizeTaskForExport`, `exportTasks`,
`exportBoard`) and now imports `inspectImportPayload` from `./import-payload.js`.

The dependency direction is strictly one-way and was checked by the script, not just by eye:
`importexport.js -> import-payload.js`, `import-board.js -> import-payload.js`, and
`import-payload.js -> import-normalize.js`. The hazard was the `inspectImportPayload` /
`normalizeImported*` pair: `inspectImportPayload` consumes all four normalizers, so the
normalizers sit one level below it and nothing imports back up. No module mentions
`importexport.js`, so there is no cycle in either direction.

The boundary differs from the proposal in one place only: the spec's first arrow
(`importexport.js -> import-board.js`) becomes `importexport.js -> import-payload.js`, because
`inspectImportPayload` - the export side's sole dependency - moves into `import-payload.js`
rather than staying in the orchestrator. `kanban.js` was not edited: `importTasks` is still
exported from `./import-board.js`.

Consumers: `boards-modal.js` still imports `exportBoard` from `importexport.js`, and
`boards-quick-switch.test.js`'s mock stays pointed there. The unit test's imports split three
ways: `exportBoard` from `importexport.js`, `importTasks` from `import-board.js`, and
`inspectImportPayload` / `buildImportConfirmationMessage` / `IMPORT_LIMITS` from
`import-payload.js`.

The move was scripted as line ranges over `/\r?\n/` with a first/last-line assertion on every
range, an assertion that moved and kept ranges are disjoint, a coverage assertion that no
non-empty line was dropped, and postcondition checks that no left-behind identifier leaked into
a module and that no module references `importexport.js`.

Final line counts: `importexport.js` 664 -> 210, `import-board.js` 462 -> 90, plus the new
`import-payload.js` 213 and `import-normalize.js` 164; every file is under the 250 ceiling.
Verification: build 0, unit 307/307, dom 180/180.

### Batch 10: tasks.js split (743 to 187; 743 = 187 + 117 + 219 + 239)

Unlike `importexport.js`, this file could not be split into two. `updateTask` alone is 204
lines, so a single "rest" module would have violated the ceiling it was meant to fix. It
lands as three new modules plus the reduced original:

| Lines before | Lines after | File |
|---:|---:|---|
| 743 | 187 | modules/tasks.js |
| - | 117 | modules/task-helpers.js |
| - | 219 | modules/task-update.js |
| - | 239 | modules/task-position.js |

**`task-update.js` (219)** owns exactly `updateTask` and nothing else - the 204-line writer
plus its imports. It is the only module allowed to know all ten event types that function
emits, and it was left as one unsplit block on purpose: the changed-field diff, the
relationship/label/subtask event fan-out and the column-history push all read and write the
same `tasks[taskIndex]`, so cutting it further would thread that mutable record through
several modules for no line-count gain.

**`task-position.js` (239)** is the DOM-to-order drop path: `getColumnContainer`,
`getLaneKey`, `buildOrderByColumnFromDom` and `updateTaskPositionsFromDrop`, plus the
existing doc comment. These are the only functions in the file that touch `document` and
the only ones that read order out of the DOM, so they travel together. This file is the
closest to the ceiling, and the reason `reorderColumnTasks` did **not** go here: the group
as originally proposed (the four above plus `reorderColumnTasks`) is 245 lines before its
imports and would have been over 250 after them - a new file over the ceiling relocates the
violation rather than fixing it.

**`task-helpers.js` (117)** is the internal shared layer: `RELATIONSHIP_INVERSE`,
`relationshipKey`, `syncRelationshipInverses`, `normalizeAgileFields`, `sameJson`,
`normalizeDueDate` and `reorderColumnTasks`. Every one of these is used by the create/update
writers or by both the update writer and the drop path, so they cannot live in either
consumer without one importing the other. `syncRelationshipInverses` was the clearest case:
`addTask` and `updateTask` both call it, and it is the only place the inverse map is read.

**What stayed in `tasks.js` and why.** The public surface is the remaining writers:
`addTask`, `deleteTask`, `setTaskBlockedReason`, `moveTaskToTopInColumn`, `addAnnotation`,
`removeAnnotation` and `isTaskLocked`, plus the private `emitTaskFields` that the two
annotation writers share. They are all thin wrappers over `loadTasks` +
`scheduleDomainEvent`, they call no DOM and no `updateTask`, and nothing in the file
references the drop path, so the group is genuinely self-contained and leaves the file at
187 lines with room to spare.

**Dead helpers - reported, not deleted.** `getColumnName`, `getLabelName` and `getTaskTitle`
have no caller anywhere in `client/src` or `client/tests`; the only hits are their own
definitions. They were kept (deletion is a separate decision) and moved to `task-helpers.js`
as unexported internals, which is also why that module imports `loadColumns`. They are the
one part of the new tree that is dead code.

**Dependency direction, verified rather than eyeballed.** The graph is strictly one-way and
acyclic:

```
tasks.js         -> task-helpers.js, storage.js, normalize.js, agile.js,
                    utils.js, constants.js, event-sourcing/emitter.js
task-update.js   -> task-helpers.js, storage.js, normalize.js, agile.js,
                    event-sourcing/emitter.js
task-position.js -> task-helpers.js, storage.js, normalize.js, agile.js,
                    swimlanes.js, event-sourcing/emitter.js
task-helpers.js  -> storage.js, agile.js
```

No new module imports `./tasks.js`, and `tasks.js` imports none of the modules that were
extracted out of it, so there is no back-edge in either direction. The move script asserts
this (`!content.includes("from './tasks.js'")` for each new module) instead of trusting the
author. On the swimlane question: `swimlanes.js` does **not** import `tasks.js` - it imports
only `sortablejs`, `storage.js` and `constants.js`, and its sole in-repo consumer is
`render.js`/`swimlane-renderer.js`. The only edge today is `tasks.js -> swimlanes.js`
(`applySwimLaneAssignment`), and after the split it is `task-position.js -> swimlanes.js`;
the direction is unchanged and no pre-existing cycle was worsened, because none existed.
`normalizeDueDate` deserves a note as a near-miss: `normalize.js` exports a different
`normalizeDueDate` that strips an ISO time portion, while the tasks-local one only trims.
The local version was moved verbatim into `task-helpers.js` (which imports nothing from
`normalize.js` for it) so the create/update semantics are byte-identical.

**Consumers and mocks.** `task-modal.js` now takes `updateTask` from `task-update.js` and
the rest from `tasks.js`; `task-drop.js` takes `updateTaskPositionsFromDrop` from
`task-position.js`. The two event-sourcing DOM tests and the unit `tasks.test.js` had their
imports split three ways. Two `vi.mock` targets had to move, or the mock would have gone
inert and let the real module load (the failure mode this document already records for
`boards-modal.js`): `dragdrop.test.js` now mocks `task-position.js` for
`updateTaskPositionsFromDrop`, and `task-modal-agile.test.js` /
`task-modal-annotations.test.js` mock `task-update.js` for `updateTask`. The `deleteTask`
mocks stay on `tasks.js`, where `deleteTask` still lives. Net consumer deltas:
`task-drop.js` 79 -> 80, `task-modal.js` 1363 -> 1364, `tasks.test.js` 497 -> 499,
`replay-fidelity.test.js` 157 -> 159, `feature-modules-emit-events.test.js` 126 -> 127,
`dragdrop.test.js` 261 -> 264, `task-modal-agile.test.js` 312 -> 315,
`task-modal-annotations.test.js` 393 -> 396.

**Script discipline.** The split ran as a Node script over `/\r?\n/` with a first/last-line
assertion on all 23 ranges, a disjointness assertion, a coverage assertion that every
non-empty original line from the end of the import preamble onward belongs to exactly one
range, a `< 250` line-count assertion on each output *before* writing, and postconditions
that no moved definition was left in `tasks.js`, that no required import is missing, that no
declared import is unused, and that no foreign identifier leaked into the wrong module. It
writes nothing unless every assertion holds.

**A follow-up this split forced.** The first full-suite run after the move was red: the first
test in `tests/dom/reconcile.test.js` timed out at 5000ms, reproducibly. The split added three
modules to the graph `render.js` pulls in, and that file's first test pays the whole graph
transform inside its own 5s budget. In isolation the file is fine (10/10, with only 1.2s of
test time against 4.3s of jsdom setup); under the 26-file parallel run it is not.

Hoisting that file's `await import(...)` to module scope is not the fix: it mocks
`notifications.js` with a factory closing over a top-level `const refreshNotifications`, so a
static import hits its temporal dead zone (`Cannot access 'refreshNotifications' before
initialization`) - which is why the file imports dynamically at all. The fix is a module-scope
warm `await import('../../src/modules/render.js')` placed after the mocks: the transform is
paid once at collection time, outside any per-test budget, and the cached module keeps the
per-test imports instant.

Six other DOM files use the same dynamic-import-in-test pattern (`dragdrop`, `skills-modal`,
`authsync`, `task-row`, `task-card-delete`, `task-row-agile`). They are green today, but every
further Batch 10 split grows the graph, so this is the first place to look when one of them
starts timing out.

Verification: build 0, unit 307/307, dom 180/180.

### Batch 10: swimlanes.js split (698 to 233)

`swimlanes.js` was one flat file of small top-level declarations, so it looked like a cheap
split, but the line count hid two hazards: every "pure" helper was private to the file, and the
bottom third was a second feature (the settings UI) that reads the same helpers as the board
renderer. Two files cap out at 498, so 698 lines need at least three; the shared vocabulary has
to be extracted *below* both features rather than moved sideways. It lands as four new modules
plus the reduced original.

| Lines before | Lines after | File |
|---:|---:|---|
| 698 | 233 | modules/swimlanes.js |
| - | 180 | modules/swimlane-lane-model.js |
| - | 68 | modules/swimlane-collapse.js |
| - | 122 | modules/swimlane-order.js |
| - | 142 | modules/swimlane-controls.js |

**`swimlane-lane-model.js` (180)** is the lane vocabulary: the six exported `SWIMLANE_*` /
`NO_GROUP_*` constants, `PRIORITY_LANE_LABELS`, the private `SWIMLANE_GROUP_BY_VALUES` set, and
the thirteen pure normalizers/selectors (`normalizeSelectedLabelGroup`, `normalizeGroupBy`,
`normalizeCollapsedLaneKeys`, `normalizePriorityLaneKey`, `getPriorityLaneDescriptor`,
`normalizeLabelCollection`, `getAvailableLabelGroupsFromCollection`, `getSelectedLabelGroup`,
`getLabelsForSelectedGroup`, `getSelectedGroupLaneLabel`, `getTaskLabelIds`,
`getExplicitLaneValue`, `getFallbackLaneDescriptor`). It reads only `constants.js` (`PRIORITIES`)
and touches no DOM, no settings and no Sortable, so it is the bottom of the tree and the one
place the label/priority vocabulary is defined.

Its role is forced by the cycle rule. The board renderer, the collapse state, the lane-order
editor and the settings controls all need `normalizeGroupBy` and its neighbours; leaving them in
`swimlanes.js` would make every new module import the file it came out of. Extracting them first
turns one flat file into a two-level tree whose leaves are shared, which is the only shape that
keeps every new module free of a back-edge.

**`swimlanes.js` (233)** keeps the board-level API: `getSwimLaneDescriptor`,
`groupTasksBySwimLane`, `buildBoardGrid`, `getVisibleTasksForLane`,
`getHiddenTaskCountForLane` and `applySwimLaneAssignment`. `applySwimLaneAssignment` stayed here
rather than getting its own module because it is the write counterpart of
`getSwimLaneDescriptor` - the same label/priority branch run backwards to produce the next task -
and `task-position.js`, its only caller, keeps importing it from `swimlanes.js` unchanged. That
is the one consumer this split did not have to touch.

**`swimlane-collapse.js` (68)** is the settings-backed collapse state: `isSwimLaneCollapsed`,
`toggleSwimLaneCollapsed`, `makeCellCollapseKey`, `isSwimLaneCellCollapsed`,
`toggleSwimLaneCellCollapsed`, plus the private `CELL_KEY_DELIMITER` and
`normalizeCellCollapsedKeys`. Lane collapse keys and cell (`lane::column`) keys are the same
read-modify-write over `swimLaneCollapsedKeys` / `swimLaneCellCollapsedKeys` in `storage.js`, and
nothing outside this group reads either key. `applySwimLaneAssignment` was deliberately *not*
folded in here despite being adjacent in the original: it never touches settings, and pulling it
in would put a pure function behind a module named for a UI state.

**`swimlane-order.js` (122)** is the lane-order editor: `getAvailableLanes`,
`mergeWithSavedOrder`, `renderLaneOrderList`, `initLaneOrderSortable`, plus the module-level
`laneOrderSortable` handle. This is the only group that owns a mutable Sortable instance and the
only one that reads `swimLaneOrder` out of `settings` and writes it back on drop, so the state
stays with its reader. The four functions were private in the original and become exports because
the controls module is now their only caller, in one direction.

**`swimlane-controls.js` (142)** is the settings UI wiring: `syncSwimLaneControls` and
`initializeSwimLaneControls`, including the four change listeners the latter registers. It is the
only module that imports `swimlane-order.js`; the arrow `controls -> order` is the seam that lets
the drag handler stay out of the settings module.

**What was deliberately left behind, and why.** Everything above is the whole split - no function
was rewritten and no moved body was reindented. In particular:

- `applySwimLaneAssignment` stays in `swimlanes.js` (see above): moving it would force
  `task-position.js` to import a module whose name ("collapse") does not describe it, for no
  line-count gain.
- `getVisibleTasksForLane` / `getHiddenTaskCountForLane` stay next to the grid builder - they are
  the done-column read side of `buildBoardGrid`, both call `isDoneColumnId`, and nothing else in
  the file does.
- The dead `loadTasks` import was dropped while the import preamble was rewritten. It had no
  caller in the file; removing an unused binding is not a behaviour change and matches the
  `getActiveBoardName` precedent from the `boards-modal.js` split.

**Consumers and mocks.** No `vi.mock(...swimlanes.js...)` exists anywhere in the suite, so no
mock went inert and none had to be re-pointed - checked with a grep for `vi.mock` on `swimlane`,
which returns nothing. Four import blocks changed: `kanban.js` and `render.js` now take
`initializeSwimLaneControls` / `syncSwimLaneControls` from `./swimlane-controls.js`;
`swimlane-renderer.js` keeps the four grid/visibility symbols on `./swimlanes.js` and takes the
four collapse symbols from `./swimlane-collapse.js`; and `tests/unit/swimlanes-utils.test.js`
takes the six constants from `../../src/modules/swimlane-lane-model.js` and keeps
`buildBoardGrid`, `getVisibleTasksForLane` and `groupTasksBySwimLane` on `swimlanes.js`. The
test's `getSwimLaneValue` and `moveTask` imports are *not* re-homed: neither symbol exists
anywhere in `client/src` - they were already inert named imports from the old file and stay inert
on the same target rather than being "moved" to a module that never exported them.
`task-position.js` was not edited at all.

**Dependency direction, verified rather than eyeballed.** The move script asserts that no new
module references `./swimlanes.js`, and an import-graph walk over the nine involved files
confirms the graph is acyclic:

```
kanban.js            -> render.js, swimlane-controls.js
render.js            -> swimlane-controls.js, swimlane-renderer.js
swimlane-renderer.js -> swimlane-collapse.js, swimlanes.js
task-position.js     -> swimlanes.js
swimlanes.js         -> swimlane-lane-model.js
swimlane-controls.js -> swimlane-lane-model.js, swimlane-order.js
swimlane-order.js    -> swimlane-lane-model.js
swimlane-collapse.js -> swimlane-lane-model.js
```

The only edges into `swimlanes.js` are the external consumers (`swimlane-renderer.js`,
`task-position.js`); no module extracted from it points back, and `swimlane-lane-model.js` is a
sink whose only outgoing repo edge is `constants.js`. `swimlanes.js` imports none of
`collapse`/`order`/`controls` either, so the two feature halves (board render vs settings UI) only
meet at the lane-model sink.

**Script discipline.** The split ran as a Node script over the original LF text with a first-line,
last-line and interior-anchor assertion on all ten ranges, a disjointness assertion, a coverage
assertion that every non-empty original line from the end of the import preamble onward belongs to
exactly one range, and a `< 250` line-count assertion on each of the five outputs *before*
writing. It also asserts that no moved definition was left in `swimlanes.js`, that no kept
definition leaked into a module, that every imported identifier is used, and that no new module
imports `swimlanes.js`. The first run wrote all five files and passed every one of its own
assertions, and the *build* still caught the one thing the script had missed:
`PRIORITY_LANE_LABELS` is a `const` in the moved block, so the "prefix the top-level functions
with `export`" transform never touched it, and `swimlane-order.js` imported a name
`swimlane-lane-model.js` did not export. rolldown's `MISSING_EXPORT` was the catch; the fix is
one `export` keyword, and the lesson is that a function-shaped export transform has to enumerate
the consts too.

**Verification.** Build 0, unit 307/307, dom 180/180, with no per-test timeout. Final line
counts: `swimlanes.js` 698 -> 233, plus the new `swimlane-lane-model.js` 180,
`swimlane-collapse.js` 68, `swimlane-order.js` 122 and `swimlane-controls.js` 142. Consumer
deltas: `swimlane-renderer.js` 204 -> 206 and `tests/unit/swimlanes-utils.test.js` 95 -> 97;
`render.js` (226), `kanban.js` (157) and `task-position.js` (239) are unchanged in length.

### Batch 10: reports.js split (1070 to 33)

`reports.js` is a page entry - only `reports.html` loads it (the `<script type="module" src="./modules/reports.js">` tag at line 220) and nothing imports from it - so there is no consumer churn to manage and no `vi.mock` to re-point. Two survey claims did not hold and are worth recording:

- **There is no module-level mutable state.** The file has no top-level `let`/`const`/`var` at all; `charts` is local to `main()`. The only module-level side effect is `echarts.use([...])`, which is order-sensitive and was handled explicitly (below).
- **The per-chart groups are self-contained, but `hexToRgba` is not.** It sits in the CFD block yet `buildBurndownOption` also calls it (see "What the split exposed").

Two files cannot hold 1070 lines under the ceiling (2 x 249 = 498), and `main()` alone is 225 lines, so the split lands as six new modules plus the reduced entry:

| Lines before | Lines after | File |
|---:|---:|---|
| 1070 | 33 | modules/reports.js |
| - | 239 | modules/reports-main.js |
| - | 205 | modules/reports-utils.js |
| - | 211 | modules/reports-completions.js |
| - | 185 | modules/reports-cfd.js |
| - | 134 | modules/reports-velocity.js |
| - | 79 | modules/reports-daily.js |

**`reports.js` (33) - the page bootstrap.** It keeps only the ECharts registration (the component/chart/renderer imports plus `echarts.use([...])`), the `initStorage().then(main).catch(...)` call and its error log, and imports `main` from `reports-main.js`. The registration **had to stay here**: it must run before any `echarts.init`, and as the entry's top-level statement it runs after all of its dependencies have been evaluated and before the async `initStorage()` resolves - the same position it held at lines 21-33. Moving it into `reports-main.js` would have pushed that file to ~251 lines.

**`reports-main.js` (239) - the wiring.** Exactly `main()` (original lines 841-1065, verbatim) plus its import block. It is the only module that knows every chart module, and the only one that calls `echarts.init` / `setOption` / `addEventListener` and reads the DOM ids. At 239 lines it is the closest to the ceiling and the reason the ECharts registration did not move here.

**`reports-utils.js` (205) - the shared chart vocabulary.** The theme readers (`cssVar`, `cssVarPx`, `getChartTheme`), the date helpers (`isoDateOnly` through `eachMonthInclusive`), the granularity bucketers (`bucketKeyForDate`, `generateTimeSlots`), the shared `buildBarChartOption`, and `hexToRgba`. Every feature module reads from this and it imports only `isHexColor` from `normalize.js`, so it is the acyclic sink of the tree. Only the eleven symbols the other modules (or `main`) actually call are exported; `cssVar`, `cssVarPx`, `formatShortDate`, `formatMonthLabel`, `startOfMonth`, `eachWeekStartInclusive` and `eachMonthInclusive` stay internal, with no caller outside the module - the established rule from the calendar split ("do not export a helper for nothing").

**`reports-daily.js` (79)** - the daily-updates heatmap: `computeDailyUpdateCounts` + `buildDailyUpdatesOption`. Cohesive because both exist only for the one calendar heatmap and nothing else in the file refers to the daily bucket.

**`reports-completions.js` (211)** - the completions / same-day / lead-time group: `computeCompletions`, `computeSameDayCompletions`, `computeWeeklyLeadTimeAndCompletions`, `buildLeadTimeOption`, plus the private `movingAverage`. The four are the granularity-aware "how many finished" calculations and share `generateTimeSlots` / `bucketKeyForDate`; `movingAverage` is the lead-time chart's trend line and has no other caller.

**`reports-cfd.js` (185)** - the Cumulative Flow Diagram: `computeCumulativeFlow` and `buildCfdOption`, with `sortColumnsForCfd` and `normalizeTaskColumnHistory` internal. They share the column ordering and the per-task history reconstruction, which only the CFD needs.

**`reports-velocity.js` (134)** - the per-board velocity / burndown / cycle-time group: `computeVelocityRows`, `computeBurndownSeries`, `computeCycleDistribution`, `buildBurndownOption`, with `resolveDoneColumnId` and `taskPoints` internal. These are the only functions that map tasks to points and read `estimate`; `resolveDoneColumnId` / `taskPoints` are their shared private core. It is the only chart module that reaches back into `storage.js` (`loadTasksForBoard` / `loadColumnsForBoard`, used only by `computeVelocityRows`).

**What the split exposed.**

- **`hexToRgba` is shared, not CFD-local.** The survey filed it under the CFD group, but `buildBurndownOption` (in the velocity group) also calls it. Leaving it in `reports-cfd.js` would have made `reports-velocity.js` import a colour helper from a sibling feature module - no cycle, but the wrong direction. It moved to `reports-utils.js`, which is why that module now imports `isHexColor`, and why the CFD source is sliced at two places (its comment header 512-514, then 529-704 with `hexToRgba` extracted from the middle).
- **No dead code and no unused imports.** Unlike the boards-modal and swimlanes splits, every import on original lines 13-19 has a caller, and every one of the 36 top-level functions is reached from `main()` or from another moved function. Nothing was dropped.
- **Same-named helpers elsewhere are independent copies, not consumers.** `isoDateOnly`, `formatIsoDate`, `formatMonthLabel`, `safeDate`, `startOfMonth` and `eachDayInclusive` also appear in `calendar-utils.js`, `calendar.js` and `roadmap.js`, but a grep for importers of `reports.js` returns only the `reports.html` script tag - none of those modules import from here. They are their own private definitions. Reported, not touched: a later convergence (as `formatDisplayDate` was homed in `dateutils.js`) is a separate decision.
- **The survey's module-level-state warning did not apply.** There is no chart instance or `let` at module scope to thread, so this was a pure line move: no function body was rewritten, no body was reindented, and no call ordering changed.

**Dependency direction, verified rather than eyeballed.** Strictly one-way and acyclic; the move script asserts no new module references `./reports.js`, and an import-graph read of the seven files confirms it:

```
reports.js             -> storage.js, reports-main.js
reports-main.js        -> reports-utils.js, reports-daily.js, reports-completions.js,
                          reports-cfd.js, reports-velocity.js, storage.js, icons.js, theme.js
reports-daily.js       -> reports-utils.js, security.js
reports-completions.js -> reports-utils.js, security.js
reports-cfd.js         -> reports-utils.js, constants.js, normalize.js, security.js
reports-velocity.js    -> reports-utils.js, storage.js, constants.js
reports-utils.js       -> normalize.js
```

No feature module imports another, no module imports back up to `reports.js` or `reports-main.js`, and `reports-utils.js` is a sink whose only repo edge is `normalize.js`. There is no cycle in either direction.

**Script discipline.** The split ran as a Node script (under the temp dir, not the repo) over `/\r?\n/` with a first-line, last-line and interior-anchor assertion on all eleven ranges, a disjointness assertion, a coverage assertion that every non-empty original line from 20 onward belongs to exactly one output, and a `< 250` line-count assertion on each of the seven outputs *before* writing. Postconditions: `reports.js` declares no top-level symbol; no moved definition is left behind; each module's top-level declaration set matches exactly its planned exported+internal list; no internal name was exported; no new module imports `./reports.js`; and every imported identifier is used. The export transform enumerates `function` / `const` / `let` / `var` / `class` (the `PRIORITY_LANE_LABELS` lesson from the swimlanes split); there were no top-level consts here, so it only touched functions, but it is written to cover them.

**Verification.** Build 0, unit 307/307, dom 180/180, with **no per-test timeout** - this split did not reproduce the 5s `reconcile.test.js` timeout, so no test file needed the module-scope warm `await import(...)` fix. `reports.js` has no Vitest coverage (audit §7.1) and the page was not opened in a browser here; that browser check remains to be done.

### Batch 11: storage.js split (1098 to 137; 1098 = 137 + 78 + 27 + 97 + 101 + 137 + 168 + 141 + 205 + 48 + 90)

`storage.js` is the most-imported module in the repo (63 importers across `client/src` and
`client/tests`) and the one the DOM suite mocks most often: twelve tests do
`vi.mock('../../src/modules/storage.js', factory)` with a factory that enumerates the exports under
test. Moving an export so it is no longer importable from `./storage.js` would force an edit to
every importer *and* leave those factories enumerating names the module no longer provides - the
exact failure recorded above for `boards-modal.js` and `tasks.js`, where a mock left on the old
target went inert and silently let the real module load. So this split is the one place where the
public surface is the constraint, not the code.

The surface was frozen. Every one of the original **40** export names is still importable from
`./storage.js`; the mechanism is a re-export block, so no consumer and **no test file** changed.
That is why the move script's central assertion is an export-set equality check rather than a list
of importers to chase.

The body had to be divided, not just trimmed. Under the cycle rule ("no new module may import
`storage.js`") and the sink rule ("shared mutable state lives in one module that imports none of
them"), `state` and `taskCacheByBoard` have to leave `storage.js` - any module that keeps them is
imported by all the others, so a module that keeps them *and* imports the accessors is a cycle.
Once `state` moved, `readModelProjector` could not stay either (see the reader-order note below).
It lands as ten new modules plus the reduced original:

| Lines before | Lines after | File |
|---:|---:|---|
| 1098 | 137 | modules/storage.js |
| - | 78 | modules/storage-state.js |
| - | 27 | modules/storage-projector.js |
| - | 97 | modules/storage-defaults.js |
| - | 101 | modules/storage-normalize.js |
| - | 137 | modules/storage-migration.js |
| - | 168 | modules/storage-boards.js |
| - | 141 | modules/storage-board-mutations.js |
| - | 205 | modules/storage-entities.js |
| - | 48 | modules/storage-settings.js |
| - | 90 | modules/storage-cross-board.js |

Every file is under the 250 ceiling. The new tree is 1229 lines against 1098 - the 131-line
increase is entirely the eleven import blocks plus the re-export block; no moved line was rewritten
and none was duplicated.

**`storage-state.js` (78) - the sink.** The only module the whole tree may import and that imports
none of it: the key/id constants (`BOARDS_KEY`, `ACTIVE_BOARD_KEY`, `GLOBAL_SETTINGS_KEY`, the three
`LEGACY_*` keys, `DEFAULT_BOARD_ID`, `STABLE_DEFAULT_BOARD_ID`), the two mutable singletons `state`
and `taskCacheByBoard`, the two parse helpers (`safeParseArray` / `safeParseObject`), the no-op
`emitLocalChange`, and the global-settings read path (`defaultGlobalSettings`,
`normalizeGlobalSettings`, `loadGlobalSettings`). It imports nothing at all, so there is no edge
into it that can be part of a cycle - "state first, functions after" in the literal sense. The
global-settings trio lives here, not with the board settings, because `readModelProjector` is its one
consumer and the projector must sit *below* `storage-boards.js`, which is precisely where the
settings accessors cannot go (they call `ensureBoardsInitialized`).

**`storage-projector.js` (27) - the sole read-model writer (ADR-0005).** The
`createReadModelProjector({...})` call moved here verbatim, wired to `state`/`taskCacheByBoard` from
the sink and to the IDB schedulers and `checkAndScheduleSnapshot` exactly as before. It is a module
rather than a line in `storage.js` for one reason: `ensureBoardsInitialized()` calls
`readModelProjector.register()`, and `ensureBoardsInitialized` is called by every entity accessor, so
once the accessors live outside `storage.js` the projector must too - otherwise every one of them
would import `storage.js` and the cycle rule fails on the first one. Putting it below the boards
module is the only placement that lets `ensureBoardsInitialized` register the writer without a
back-edge. No consumer imports it; `storage.js` and `storage-boards.js` do.

**`storage-defaults.js` (97) - the default scaffolds.** `defaultColumns`,
`legacyDefaultColumns`, `defaultLabels`, `defaultBoardData`, `stableDefaultBoardData`,
`defaultSettings`, plus the two dead name-lookups below. Pure factories: `utils.js` and
`FIXED_COLUMNS` are their only repo imports, so like the sink they can be a leaf.

**`storage-normalize.js` (101) - the shape normalizers.** `normalizeColumn` / `ensureFixedColumns`
(column repair), `normalizePriority`, `normalizeSettings` (including its private
`normalizeSwimLaneGroupBy` / `normalizeSwimLaneLabelGroup` and the `ALLOWED_SWIMLANE_GROUP_BY` set).
They read only `normalize.js`, `constants.js` and `defaultSettings`, touch no state, and are the one
place a stored shape is coerced back to the canonical one; `storage-entities.js` and
`storage-settings.js` are their only consumers.

**`storage-migration.js` (137) - boot migration.** `normalizeIdbState` (the UUID/read-model
normalization pass) and `migrateFromLocalStorage` (both the pre-multi-board and the multi-board
paths). They are the only functions that read the legacy `localStorage` layout and the only ones that
touch `board-serializer.js`; `initStorage` is their sole caller, which is why they could move whole
without threading anything back.

**`storage-boards.js` (168) - the board list and the init gate.** The `boardsEmptied` localStorage
flags, `listBoards`, `getBoardById`, `getActiveBoardName`, `saveBoards`, `mergeBoardsFromRemote`,
`getActiveBoardId`, `setActiveBoardId`, `ensureBoardsInitialized` and `emitBoardScaffoldEvents`. This
is the layer every entity accessor sits on: `ensureBoardsInitialized` is the "make sure a board
exists and the projector is subscribed" gate, and `getActiveBoardId` is the aggregate-root lookup
every loader and saver calls. `emitBoardScaffoldEvents` stays with them because both
`ensureBoardsInitialized` and `createBoard` use it, and moving it into the mutations module would
close a cycle (`createBoard` needs `ensureBoardsInitialized`).

**`storage-board-mutations.js` (141) - the board writers.** `createBoard`, `renameBoard`,
`updateBoardFields`, `deleteBoard` and the private `BOARD_ITERATION_FIELDS`. They are the only board
functions that emit `board.created` / `board.updated` / `board.deleted` and the only ones that touch
`taskCacheByBoard.delete` and the per-board settings/deletion keys. They depend on
`storage-boards.js` for `ensureBoardsInitialized` and `saveBoards`, never the other way round.

**`storage-entities.js` (205) - the columns/tasks/labels accessors.** The largest module:
`getDoneColumnId`, `isDoneColumnId`, `loadColumns`, `saveColumns`, `loadTasks`, `saveTasks`,
`loadLabels`, `saveLabels`, with the three original section headers. They are one module because
they are one layer - each calls `ensureBoardsInitialized` + `getActiveBoardId`, reads `state.<kind>`,
parses, and schedules a read-model write - and because `loadTasks` reads the done-column vocabulary
(`isDoneColumnId`) from the columns group. Splitting columns from tasks would have forced
`storage-tasks.js -> storage-columns.js` for one predicate and gained nothing; the group is 205 lines
with the whole task normalizer in it.

**`storage-settings.js` (48) - per-board settings.** `loadSettings`, `saveSettings`,
`loadColumnSummaries`, `saveColumnSummary`. The two summary helpers are a read-modify-write over
`settings.columnSummaries`, so they belong with the settings loader they call twice; the module is
small because it is thin on purpose.

**`storage-cross-board.js` (90) - the per-board and deleted/purge helpers.** `load*ForBoard`,
`loadDeleted*ForBoard`, `purgeDeleted`, `save*ForBoard`. These deliberately do **not** call
`ensureBoardsInitialized` (they are given an explicit `boardId` by the sync layer), which is why they
can sit beside the sink and depend on nothing but `state` and the IDB schedulers.

**What stayed in `storage.js` and why.** The four things that must run against the sink and the
projector and nothing else: `initStorage` (opens IDB, migrates, hydrates `state`, backfills the event
log, registers the projector), `hydrateFromSnapshotState`, `_flushPersistsForTesting`,
`_resetStorageForTesting` (which clears `state` and `taskCacheByBoard` in place and resets the
projector). It is 137 lines: 34 import lines, a six-statement re-export block, and those four
functions. It is not a wall of re-exports - roughly half the file is the boot path - but the surface
is carried by the re-exports, and that is the point of the split.

**Reader-order note (the ADR-0005 hazard).** `readModelProjector` is constructed at module load
today and was constructed at module load before; the construction now happens in
`storage-projector.js` rather than in `storage.js`. `createReadModelProjector` itself is pure (it
destructures its context, allocates a `Set` and returns closures), so the only thing that changed is
*where* the wiring runs, not *when* relative to `state`: the sink is evaluated before the projector
because the projector imports it, and `register()` is still called only from
`ensureBoardsInitialized()` and `initStorage()`, never at module scope. The suite is the proof:
`storage.test.js`, `storage-idb.test.js`, the UUID-migration cases and the whole
`tests/dom/event-sourcing/` set (`snapshot-catchup`, `replay-fidelity`, `realtime`) are green, so
projection was not broken by the move.

**Dependency direction, verified rather than eyeballed.** Strictly one-way and acyclic; the move
script asserts that no new module references `./storage.js`, walks the storage-* graph for a cycle,
and an import-graph read of the eleven files confirms:

```
storage.js                  -> storage-state.js, storage-projector.js,
                               storage-migration.js, storage-boards.js,
                               storage-board-mutations.js, storage-entities.js,
                               storage-settings.js, storage-cross-board.js
storage-board-mutations.js  -> storage-boards.js, storage-defaults.js, storage-state.js
storage-boards.js           -> storage-projector.js, storage-defaults.js, storage-state.js
storage-entities.js         -> storage-boards.js, storage-defaults.js, storage-normalize.js, storage-state.js
storage-settings.js         -> storage-boards.js, storage-defaults.js, storage-normalize.js, storage-state.js
storage-migration.js        -> storage-defaults.js, storage-state.js
storage-normalize.js        -> storage-defaults.js
storage-projector.js        -> storage-state.js
storage-cross-board.js      -> storage-state.js
storage-defaults.js         -> (none)
storage-state.js            -> (none)
```

No module extracted from `storage.js` imports it back, `storage-state.js` and
`storage-defaults.js` are sinks whose only edges are out, and the four entity/settings modules all
point down through `storage-boards.js`. The graph is a DAG in one direction.

**Script discipline.** The split ran as a Node script (under the temp dir, not the repo) over
`/\r?\n/` with a first-line, last-line and at least one interior-anchor assertion on all 31 ranges, a
disjointness assertion, and a coverage assertion that every non-empty original line from 13 onward
belongs to exactly one range (only the 1-11 import preamble is replaced). It asserts `< 250` true
lines per output *before* writing (counting rendered lines, not array entries - the first run's
assertion counted a multi-line import as one line and under-reported, so it was corrected and the
whole run repeated from the restored original). The export transform enumerates `function` / `const`
/ `let` / `var` / `class` (the `PRIORITY_LANE_LABELS` lesson). Postconditions: no moved definition
left in `storage.js`, no kept definition leaked into a module, no new module imports `./storage.js`,
every imported identifier is used, and every exported name used by a re-export is actually exported
by its target.

**The bug the script caught that the build would not.** The first corrected run failed on a
*missing* import: `storage-migration.js` referenced `LEGACY_COLUMNS_KEY` / `LEGACY_TASKS_KEY` /
`LEGACY_LABELS_KEY` but the import block listed only the non-legacy keys. The "every imported
identifier is used" check is one-directional and passed; the reverse check - every known in-repo
name that is referenced must be declared or imported - is what caught it. This is a free-variable
reference, so rolldown would not have failed the build and there is no compile error; it would have
been a runtime `ReferenceError` on the migration path only, i.e. exactly the kind of failure the
unit suite exists to catch, but only if a test exercises that path in that module. Both directions
are now asserted.

**What the split exposed.** Reported, not changed:

- **Dead code.** `columnIdByName` and `labelIdByName` have no caller anywhere in `client/src` or
  `client/tests` - the only hits are their own definitions. They were kept (deletion is a separate
  decision) and now sit unexported in `storage-defaults.js`.
- **A no-op with three callers.** `emitLocalChange(boardId, entity)` reads `window` and returns;
  it is the only thing `saveColumns` / `saveTasks` / `saveLabels` share. Kept verbatim in the sink.
- **Global settings are effectively unnormalized.** `defaultGlobalSettings` and
  `normalizeGlobalSettings` both return `{}` unconditionally; `loadGlobalSettings` can therefore only
  ever return `{}`. They live in the sink because the projector calls `loadGlobalSettings` on every
  global-scope event. This is dead-ish behaviour that predates the split, not something it created.
- **Three identical column builders.** `defaultColumns`, `legacyDefaultColumns` and
  `stableDefaultColumns` are all `FIXED_COLUMNS.map((column) => ({ ...column }))`; only the first two
  are exported, and only because their (differently named) call sites are kept verbatim.
- **A stale import-preamble comment dropped.** Original line 5,
  `// Re-export IDB helpers that tests import from this module for backward compatibility.`, sat
  above the `board-serializer.js` import and described a re-export that does not exist: `storage.js`
  imports `_flushIdbPersistsForTesting` / `_resetIdbForTesting` for its own use and does not
  re-export them, and every test imports them from `./idb-store.js` directly. It was removed with
  the rest of the import preamble that was rewritten - the same call as the unused `getActiveBoardName`
  import in the `boards-modal.js` split - and is recorded here rather than silently dropped.

**Verification.** Build 0, unit 307/307, dom 180/180. No Vitest timeout reproduced - the module
graph `render.js` pulls in grew by ten modules but `tests/dom/reconcile.test.js` already carries the
module-scope warm `await import('../../src/modules/render.js')` from the `tasks.js` split, so the
transform is paid at collection time and no test file needed the fix. No test file needed editing at
all. The export set was compared programmatically before and after: both are the same 40 names.

### Found while verifying: the task modal threw on open (`groupLabels`)

Opening the task modal in the browser during the `storage.js` verification surfaced
`Uncaught ReferenceError: groupLabels is not defined`. `task-modal.js:305` calls
`groupLabels(...)` when it renders the label picker, but nothing imports it. 1d3501d ("Share
one groupLabels helper between the two label pickers") moved the local copy into `labels.js`
and added the import to `labels-modal.js`, but not to `task-modal.js`.

Pre-existing, not a Batch 10 regression: `git show HEAD:client/src/modules/task-modal.js` has
the same call with no import. The build cannot see it (a runtime ReferenceError, not a syntax
error) and no test drives `updateTaskLabelsSelection`, so the suite never caught it. Opening
the modal threw part-way through, and the whole label section was missing.

Fixed by importing `groupLabels` from `./labels.js`. Verified in the browser: the modal opens
with the full label picker (Idea, Goal, ACTIVITY, Task, Meeting, Email) and a clean console.

This is the second bug of the same shape found in this batch; the first was the boot-time
`initializeColumnModalHandlers` call. Both are "identifier used, binding missing", both came
from an earlier refactor of this same codebase, and both were invisible to the build.
**Anything that removes or relocates a binding needs its call sites checked by grep, not by
the build.**

### Batch 10: task-modal.js split (1365 to 52; 1365 = 52 + 190 + 68 + 43 + 203 + 161 + 100 + 37 + 96 + 125 + 105 + 141 + 103 + 62)

`task-modal.js` is the largest and most interaction-heavy module in the app, and unlike the
`reports.js` and `calendar.js` entries it has real consumers: `modals.js` imports twelve symbols
from it (including the six state getters/setters that `modals.js` wires into `labels-modal.js`
through `setTaskModalState`), `tests/dom/task-card-linkify.test.js` imports `updateDescriptionLinks`
statically, and the two task-modal DOM tests import `initializeTaskModalHandlers`, `showModal` and
`showEditModal`. The public import surface was therefore frozen, not just the line count.

It lands as thirteen new modules plus the reduced entry:

| Lines before | Lines after | File |
|---:|---:|---|
| 1365 | 52 | modules/task-modal.js |
| - | 37 | modules/task-modal-state.js |
| - | 100 | modules/task-modal-relationships.js |
| - | 161 | modules/task-modal-labels.js |
| - | 125 | modules/task-modal-subtasks.js |
| - | 105 | modules/task-modal-summary.js |
| - | 68 | modules/task-modal-annotations.js |
| - | 96 | modules/task-modal-status.js |
| - | 190 | modules/task-modal-agile-fields.js |
| - | 43 | modules/task-modal-chrome.js |
| - | 203 | modules/task-modal-form.js |
| - | 103 | modules/task-modal-wiring-controls.js |
| - | 141 | modules/task-modal-wiring-agile.js |
| - | 62 | modules/task-modal-wiring-submit.js |

The tree grew from 1365 to 1486 lines; the 121-line increase is entirely the fourteen import
blocks and the module headers. No consumer file changed: `modals.js`, `labels-modal.js`,
`label-edit-modal.js` and all tests are byte-identical, which is the point of the frozen surface.

**`task-modal-state.js` (37) - the sink.** The one module the whole tree may import and that
imports nothing: the four constants (`CREATE_LABEL_SENTINEL`, `COMMENT_AUTHOR_KEY`,
`RELATIONSHIP_LABELS`, `RELATIONSHIP_DESCRIPTIONS`), the fifteen module-level mutable bindings,
and the six public state accessors. The bindings had to become properties of one exported
`state` object rather than fifteen exported `let`s, because ES module import bindings are
read-only: every function that writes `selectedTaskLabels = ...` would otherwise have needed a
setter. `state.x` is a purely mechanical substitution for a bare `x` and keeps the moved bodies
verbatim; the DOM suite exercises the read/write paths.

**`task-modal-relationships.js` (100)** - `shortId`, the active-relationship badges and the
relationship search results. **`task-modal-labels.js` (161)** - the label search query, the active
label chips, the checkbox picker, the highlight/keyboard selection and the
labels-manager return trip (`restoreTaskModalAfterLabelsManager`, `updateTaskLabelsSelection`).
**`task-modal-subtasks.js` (125)** - the sortable sub-task list and its inline editor.
**`task-modal-summary.js` (105)** - the type/estimate/priority/due/column summary chips and the
claim chip; it is the one new module with no state dependency.

**`task-modal-annotations.js` (68)** - the annotation list, add and remove, plus
`hideAnnotationsSection`. **`task-modal-status.js` (96)** - the read-only lock
(`setTaskLocked`/`resetTaskLock`) and the acceptance-criteria list.
**`task-modal-agile-fields.js` (190)** - comments, attachments, custom fields, the parent select
and `renderAgileFields`/`resetAgileState`/`clearAgileInputs`.

**`task-modal-chrome.js` (43)** - the fullscreen toggle and the description link-chip preview;
both are used by the open/close path and by a wiring section, so they live below both.
**`task-modal-form.js` (203)** - `showModal`, `showEditModal` and `hideModal`, the only module
that knows every render group.

**The wiring function, decomposed.** `initializeTaskModalHandlers` was one 248-line function
organised as contiguous sections that each declare their own `$id(...)` local immediately before
the listeners that use it. It is now fourteen section initializers - one per original section,
each re-resolving its `$id` locals - called by the aggregate that stays in `task-modal.js`, plus
the trailing `setupModalCloseHandlers('task-modal', hideModal)`:

| Original lines | Initializer | Wiring module |
|---|---|---|
| 1118-1120 | initializeDescriptionHandlers | controls |
| 1122-1164 | initializeLabelSearchHandlers | controls |
| 1166-1176 | initializeRelationshipHandlers | controls |
| 1178-1186 | initializeRelationshipOutsideClickHandlers | controls |
| 1188-1193 | initializeAddLabelHandlers | controls |
| 1195-1199 | initializeFullpageHandlers | controls |
| 1201-1211 | initializeSubtaskHandlers | agile |
| 1213-1222 | initializeAcceptanceHandlers | agile |
| 1224-1242 | initializeCommentHandlers | agile |
| 1244-1280 | initializeAttachmentHandlers | agile |
| 1282-1298 | initializeCustomFieldHandlers | agile |
| 1300-1305 | initializeAnnotationHandlers | agile |
| 1307-1311 | initializeSummarySyncHandlers | agile |
| 1313-1360 | initializeSubmitHandler | submit |

The three wiring modules are `task-modal-wiring-controls.js` (103),
`task-modal-wiring-agile.js` (141) and `task-modal-wiring-submit.js` (62).

**Registration order, proved rather than assumed.** The sections were lifted from contiguous
original ranges in source order, and the aggregate calls them in that order. The proof is
mechanical: mapping each initializer name back to the first line of its original range and
checking the call sequence yields 1118, 1122, 1166, 1178, 1188, 1195, 1201, 1213, 1224, 1244,
1282, 1300, 1307 - strictly ascending, so the listener registration order is byte-for-byte the
original one. The four section boundaries that matter were checked against the source before the
move: the outside-click listener (1178) sits between the relationship search (1166) and the
add-label button (1188), so the controls module holds relationship **and** outside-click before
add-label; and the nested helpers `addCommentFromInputs` / `addAttachmentFromInputs` /
`addCustomFieldFromInputs` moved with their own section, wrapped by the initializer, so no nested
scope was broken.

**The state problem, and the one line the transform missed.** Moving this file is not a pure line
move like `reports.js`: every renderer both reads and writes the shared collections. The scripted
substitution `x -> state.x` therefore ran over every moved range. Its lookbehind was
`(?<![\w.$])`, which (correctly) refuses to re-prefix an already-prefixed `state.x` but also
skips a spread - and `renderSubTaskList` contains `[...selectedTaskSubTasks]`. The postcondition
that was supposed to catch a missing binding used the identical lookbehind, so it shared the
blind spot and passed. **The DOM suite found it:** eleven tests failed with
`ReferenceError: selectedTaskSubTasks is not defined` at `task-modal-subtasks.js:61`. The fix was
one `state.` prefix and a corrected transform (`(?<!state\.)(?<![\w$])`), plus the same correction
in both postcondition checks. This is the third "identifier used, binding missing" of this batch
lineage and, once more, the build saw nothing.

**Export set frozen, and compared programmatically.** Both the before and after sets were
printed by the move script and are identical, thirteen names in each:

```
getReturnToTaskModalFlag, getSelectCreatedLabelFlag, getSelectedTaskLabels,
hideModal, initializeTaskModalHandlers, restoreTaskModalAfterLabelsManager,
setReturnToTaskModalFlag, setSelectCreatedLabelFlag, setSelectedTaskLabels,
showEditModal, showModal, updateDescriptionLinks, updateTaskLabelsSelection
```

The mechanism is `export { ... } from './task-modal-state.js' | './task-modal-labels.js' |
'./task-modal-chrome.js'` plus `export { showModal, showEditModal, hideModal }` for the three
form functions, and re-exports are live bindings, so `modals.js` and the DOM tests import exactly
what they did before. No test file and no mock target changed.

**Dependency direction, verified rather than eyeballed.** A DFS over the fourteen modules reports
no cycle, and the edge list is:

```
task-modal-state.js              -> (none)
task-modal-chrome.js             -> (none)
task-modal-summary.js            -> (none)
task-modal-labels.js             -> task-modal-state.js
task-modal-relationships.js      -> task-modal-state.js
task-modal-subtasks.js           -> task-modal-state.js
task-modal-status.js             -> task-modal-state.js
task-modal-annotations.js        -> task-modal-state.js
task-modal-agile-fields.js       -> task-modal-state.js, task-modal-status.js
task-modal-form.js               -> state, chrome, labels, relationships, subtasks,
                                    summary, status, annotations, agile-fields
task-modal-wiring-controls.js    -> chrome, form, labels, relationships, state
task-modal-wiring-agile.js       -> agile-fields, annotations, state, status,
                                    subtasks, summary
task-modal-wiring-submit.js      -> form, state
task-modal.js                    -> state, labels, chrome, form, the three wiring modules
```

`task-modal-state.js`, `task-modal-chrome.js` and `task-modal-summary.js` are sinks; every other
module points only downwards; no module imports `task-modal.js` (the script asserts
`!content.includes("from './task-modal.js'")` for each new module), and the aggregate imports
only section initializers, the form trio and the re-export targets. The topological order is
sinks first, so the graph is a DAG in one direction.

**What was deliberately left behind, and why.**

- **The aggregate and the re-exports stay in `task-modal.js`.** The function is no longer 248
  lines - it is fifteen call statements - but it is the one thing that must remain importable
  from `./task-modal.js` and it is the only place that knows the registration order.
- **`renderActiveTaskRelationships(onOpenTask)` / `updateRelationshipSearchResults(query,
  onOpenTask)` take the open-editor action as a parameter.** The badge click used to call
  `showEditModal(id)` directly. Form calls the renderer (in `showModal`/`showEditModal`) and the
  renderer would have had to import form - a form ↔ relationships cycle - so the action is
  threaded through instead, exactly as `buildShowMoreButton(remaining, onShowMore)` and
  `renderNotificationBanner(onShowMore)` were. Callers pass `showEditModal`; behaviour is
  identical.
- **The dead `temporarilyHideTaskModalForLabelsManager` was kept, not deleted.** It has no caller
  anywhere in `client/src` or `client/tests`; the only hit is its own definition. It now sits
  unexported in `task-modal-labels.js`. Reported, not removed, per the deletion-is-separate rule.
- **The unused `createAccordionSection` import was dropped** while the import preamble was
  rewritten. It had no caller in the original file (the only hit was its own import line), the
  same call as the `getActiveBoardName` and `loadTasks` import removals recorded earlier.

**Consumers and mocks.** No `vi.mock` target moved: the two task-modal DOM tests mock
`tasks.js`, `task-update.js`, `storage.js`, `icons.js`, `validation.js`, `dialog.js`,
`render.js` and `sortablejs`, and the new modules import from those same specifiers, so a mock
like `task-update.js` still intercepts `updateTask` wherever it is imported. `task-card-linkify.test.js`
keeps importing `updateDescriptionLinks` from `./task-modal.js` because it is re-exported. No
mock went inert and no test file was edited.

**A build warning that moved, expectedly.** The `INEFFECTIVE_DYNAMIC_IMPORT` warning (`render.js`
is dynamically imported by `task-drop.js` and also statically by `kanban.js`) used to name
`task-modal.js`; it now names `task-modal-wiring-submit.js`, because the dynamic
`await import('./render.js')` in the blocked-reason path travelled with the submit handler. The
specifier is unchanged, so the behaviour is unchanged.

**Script discipline.** The split ran as a Node script (under the temp dir, not the repo) over
`/\r?\n/` with an exact first-line, last-line and interior-anchor assertion on all 60 ranges, a
disjointness assertion across them, a coverage assertion that every non-empty original line from
25 to 1363 belongs to exactly one range or to the three replaced aggregate-scaffold lines
(1117, 1362, 1363), and a `< 250` line-count assertion on each of the fourteen outputs *before*
writing. Postconditions: no moved definition left in `task-modal.js`; no kept definition leaked
into a module; no new module imports `./task-modal.js`; every imported identifier is used; and a
free-variable check that every known original top-level name referenced in a module is either
declared or imported there. The state sink and the reduced entry were assembled by hand, because
the declarations become object properties rather than fifteen `let`s.

**What the work exposed.** Three things, all reported rather than fixed here:

- the dead `temporarilyHideTaskModalForLabelsManager` (above);
- the unused `createAccordionSection` import (above);
- the transform's lookbehind blind spot (above), which is the useful one: a postcondition that
  shares an implementation detail with the transform it is checking cannot catch that
  transform's blind spot. The independent check is a grep for the *un-prefixed* identifier with a
  lookbehind that does **not** exclude `.`, which is how the remaining occurrence was found.

**Verification.** Build exit 0, unit 307/307, dom 180/180, with no per-test timeout (the
module-scope warm `await import('../../src/modules/render.js')` already carried by
`tests/dom/reconcile.test.js` from the `tasks.js` split absorbed the larger graph). No test file
was edited. Final line counts: the table above; every file is under the 250 ceiling, the largest
being `task-modal-form.js` at 203.

## Batch 10 closed - every file is under the 250-line ceiling

Measured on the tree at the end of the batch, across all 109 `.js` files under `client/src`:

- **files at or over 250 lines: 0.** The largest file is `reports-main.js` at 239.
- all fourteen files from the inventory are down: task-card 293->100, boards-modal 265->197,
  calendar 285->187, labels-modal 340->133, render 329->226, dragdrop 343->86,
  notifications 380->179, board-sidebar 267->232, importexport 664->210, tasks 743->187,
  swimlanes 698->233, reports 1070->33, storage 1098->137, task-modal 1365->52.
- the acceptance stayed green after each of the fourteen commits: build 0, unit 307/307, dom
  180/180, plus `node harness/test.mjs` pass 5 / fail 0 and `/api/health` 200.

Two rules earned their place and are worth keeping:
1. **Freeze the public surface when a module has many consumers.** `storage.js` (63 importers,
   exports enumerated by mock factories) and `task-modal.js` (ten-plus names wired into
   `labels-modal.js`, mocked in DOM tests) were split by moving only their *implementation*,
   with the export set diffed against HEAD to prove it. Zero consumer churn, and no mock could
   go inert - the failure this document records twice.
2. **A new module over the ceiling is not a split.** The first `importexport.js` extraction
   produced a 462-line module, i.e. the same violation in a new place; 664 lines cannot fit two
   files under 250. Every split was checked against the ceiling per output file *before*
   writing.

Five things the batch found that were not caused by it - fixed two, recorded three:
- `initializeModalHandlers()` had thrown at boot since 66a0d17 (a dead call to a deleted
  function), silently killing both manager modals and the whole Escape chain. Fixed, 1df6f9f.
- `task-modal.js` called `groupLabels()` without importing it, so every task-modal open threw
  and the label picker never rendered. Fixed, da63a92.
- A reproducible 5s DOM timeout appeared once the module graph grew
  (`tests/dom/reconcile.test.js`). Fixed with a module-scope warm import rather than a longer
  timeout, 0cefffc; six other DOM files use the same pattern and are the first place to look.
- Dead `temporarilyHideTaskModalForLabelsManager`, and an unused `createAccordionSection`
  import in the original `task-modal.js`. Reported, not changed.
- **The harness runs under `node --watch` and restarts on any change under `client/src`**, so
  this batch restarted it dozens of times; it eventually lost the port race and died with
  `Failed running 'src/server.mjs'`. Restarted via `harness/start-bg.ps1`; health 200. Worth
  knowing before the next large refactor.

The browser verification of the interactive modules did append events to the harness log
(34 -> 50 events, in the untracked `harness/data/`); the three tasks it created were deleted
again through the UI. Batch 10 itself is done.

## P2 closed - the duplicated helpers converged

All six items from Batch 5's tail, each landed with the full suite green:

1. **Legacy default columns.** `storage-defaults.js` held three byte-identical factories
   (`defaultColumns`, `legacyDefaultColumns`, `stableDefaultColumns`, every one of them
   `FIXED_COLUMNS.map((c) => ({ ...c }))`). Two are gone and their three call sites use the one.
   None of the three was re-exported from `storage.js`, so nothing outside `storage-*` moved.
   `legacyDefaultColumnsForImport` in `import-payload.js` is a different function and stays.
2. **The armed delete button.** `skills-modal.js` carried its own "click twice to confirm" copy.
   The two are *not* interchangeable - skills-modal restores `textContent` 'Delete', does not
   `stopPropagation`, restores the button *before* acting, and its handler is guarded on a
   selection - so the shared part is the state machine, not the markup:
   `createArmedDeleteController({ button, armedContent, armedTitle, armedAria, onRestore,
   onConfirm })`, with `createArmedDeleteButton` now just the board-sidebar presentation on top of
   it. All five call sites of the old disarm helper followed.
3. **JSON-safe parsing.** One `parseJsonSafely(raw)` in `utils.js` - returning `undefined`, not
   `null`, because `JSON.parse('null')` is a legitimate value - now serves `readLocalJson`,
   `safeParseArray`, `safeParseObject`, the three SSE handlers in `local-server.js` and
   `loadSyncMap`. `JSON.parse` survives in exactly three places: that helper, plus
   `import-board.js` and `snapshot-sync.js`, whose `try` blocks wrap a whole flow and a gunzip
   respectively, not a parse.
4. **Board dropdown + brand text.** Three rebuilds of `#board-select` (`boards.js`,
   `boards-modal.js`, `import-board.js`) and two brand writes became `board-select.js`
   (`refreshBoardSelect`, `boardSelectMatchesState`, `refreshBrandText`). The option labels had
   already diverged between `boardDisplayName` and an inline `trim() || 'Untitled board'` - the
   two are equivalent, which is why this was a move and not a bug fix. Each consumer keeps a thin
   wrapper, so no call site moved.
5. **Done virtualization.** `renderStandardBoard` and `reconcileBoard` carried the same
   filter/virtualize/slice/show-more sequence twice. `board-filters.js` now owns
   `selectColumnRenderPlan(columnId, visibleTasks)` returning
   `{ columnTasks, tasksToRender, remaining }`, so the "show more" guard (`remaining > 0`) cannot
   drift from the slice it guards.

Two notes for whoever picks this up: the audit's line numbers for these items were stale, so each
was re-located in the split tree first; and two of the "duplicates" were not byte-identical (the
select labels, and the armed-delete presentations) - exactly the case where a mechanical merge
would have silently changed the UI, so each was diffed before it was merged.

## P3 - the concrete half is done; the rest needs a designer

**Impressum header: fixed.** Every `.rpt-header` rule in `reports.css` is scoped to
`body.reports-page`, and impressum.html was the only one of the five pages using that shared header
markup with a different body class (`impressum-page`) - so its header had no styling at all. The
other three pages use `reports-page` (calendar adds a second class). Impressum now does too, rather
than duplicating ~60 lines of header CSS into `impressum.css`. The class order is deliberate:
`impressum.css` is linked after `index.css` on that page and both sheets set the page shell, so
`body.impressum-page` keeps winning `height`/`overflow` - the page stays its own scroll container
instead of adopting the reports shell (`100dvh` + `overflow: hidden`, which would clip the legal
text with no inner scroll area). Verified in the browser both ways: `.rpt-header` now computes to
`display:flex`, `space-between`, with the glass background/border/radius from `reports.css`, and the
page still scrolls (`maxScrollY` 375).

**Dead/unstyled HTML class hooks: already gone.** The audit listed five in `index.html`
(`.task-modal-content`, `.task-annotations-header`, `.labels-selection`, `.labels-list`,
`.settings-section-board`). Three were removed by the earlier dead-CSS batch, and the remaining two
names only ever matched ids (`#task-labels-selection`, `#labels-list`) - there is no stray class
attribute left to remove.

**Structural outlier, decided rather than left open:** `styles/index.css` still does not
`@import components/impressum.css`. That is now deliberate - the page needs the shared sheet
(tokens, layout, header) plus its own component sheet, and importing the component sheet globally
would put its `body.impressum-page`-scoped rules on all five pages for no benefit.

**Still open, and not something an agent should guess at:** the rest of P3 is open-ended visual
iteration. Concretely, `reports.css` §2.4 of the audit lists button variants duplicated in five
stylesheets, the icon-button shape in five places, the glass shell repeated across ~15 surfaces,
badge/pill shapes 14 times, ten empty states, three modal shells, and hardcoded colors/radii/font
sizes that bypass tokens. Those are taste decisions with a five-page blast radius; they want the
user's direction, not an agent's.
