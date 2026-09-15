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
