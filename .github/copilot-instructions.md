# Copilot instructions (openagile)

## Big picture
- This is a **local-first, no-backend** kanban app: all state lives in **browser IndexedDB** (`openagile-db`) and the UI is plain DOM.
- Build tooling is **Vite** with **`src/` as the Vite root** and output to `client/dist/`.
  - Edit source files in `src/` (do **not** hand-edit `client/dist/`).
- Specification entrypoint is `docs/specification-kanban.md`, and canonical feature/data specs live in `docs/spec/` (**always keep the relevant spec files updated** as features change).
- Changelog is in `CHANGELOG.md` (**always update** the **[Unreleased]** section following **Keep a Changelog** whenever behavior/UI/data changes).

## Dev workflows
- Dev server: `npm run dev` (Vite opens `http://localhost:3000`).
- Production build: `npm run build` (writes `client/dist/`).
- Preview build: `npm run preview`.
- When deploying under a sub-path, adjust `base` in `vite.config.js`.

## Architecture / data flow

### Entry Points
- `src/kanban.js` - Main entry, wires UI handlers and calls `renderBoard()`
- `src/index.html` - Main board UI
- `src/reports.html` - Separate reports page with ECharts visualizations

### Module Structure (src/modules/)
- **render.js** - Centralized rendering via `renderBoard()`. After any data change, call this to refresh UI. `reconcileBoard()` patches the board in place (and is forced for a drag drop), and `beginDragReconcile()` / `endDragReconcile()` open the drag-reconcile window.
- **idb-store.js** - IDB singleton, key helpers (`keyFor`), `schedulePersist`, `scheduleDelete`
- **board-serializer.js** - Board import ID-remapping: `normalizeBoardModelIds()`
- **storage.js** - In-memory state, all CRUD helpers (`loadTasks`, `saveTasks`, etc.), `initStorage()`, migration. Keys: `kanbanBoards`, `kanbanActiveBoardId`, `kanbanBoard:<boardId>:columns|tasks|labels|settings`
- **tasks.js** - Task CRUD, drag-drop position updates (`updateTaskPositionsFromDrop`, `moveTaskToTopInColumn`)
- **columns.js** - Column CRUD, collapse toggle, position updates
- **boards.js** - Multi-board management, board create/switch, template system
- **dragdrop.js** - SortableJS-based drag/drop for tasks and columns. Finished column has `sort: false` for performance.
- **modals.js** - Modal UX (close via Escape/backdrop). Uses DOM ids from index.html.
- **dialog.js** - `confirmDialog()` / `alertDialog()` instead of `window.confirm`
- **icons.js** - Lucide icons tree-shaking. To add an icon: import from `lucide`, add to `icons` object, call `renderIcons()` after dynamic DOM changes.
- **settings.js** - Per-board settings modal and persistence
- **labels.js** - Label management modal UI
- **dateutils.js** - Timestamp and elapsed-duration formatting
- **reports.js** - Reports page with ECharts (lead time, completions, cumulative flow)
- **accordion.js** - Reusable collapsible accordion. `createAccordionSection(title, items, expanded, renderItem)` builds a section with chevron toggle, count badge, and a body populated via the `renderItem` callback.
- **importexport.js** - Per-board JSON export/import. Must update if data shapes change.
- **theme.js** - Light/dark theme toggle and persistence
- **validation.js** - Form validation helpers
- **utils.js** - UUID generation and shared utilities

### Data Flow Pattern
Mutations generally follow: **load → modify → save → `renderBoard()`**.
- Many modules call `renderBoard()` via `await import('./render.js')` to avoid tight coupling/circular imports.
- Import/Export is **per-board scoped**:
  - Export saves the **active board** only.
  - Import creates a **new board** from the JSON and switches to it.
  - If you change any persisted shape (board/tasks/columns/labels), you MUST update `importexport.js` normalization/back-compat so exports still round-trip and imports still accept legacy fields.

## Persistence model (critical)
- Persistence is split across three modules:
  - `idb-store.js` — IDB plumbing (key helpers, `schedulePersist`, `scheduleDelete`). Import `normalizeBoardModelIds` from `board-serializer.js`, not from `storage.js`.
  - `board-serializer.js` — board import ID-remapping (`normalizeBoardModelIds`).
  - `storage.js` — in-memory state, all CRUD. Always go through `loadColumns()` / `loadTasks()` / `loadLabels()` rather than reading IDB directly.
  - Boards list key: `kanbanBoards`; active board key: `kanbanActiveBoardId`.
  - Per-board keys are `kanbanBoard:${boardId}:columns|tasks|labels|settings`.
  - Legacy migration exists for single-board keys (`kanbanColumns`, `kanbanTasks`, `kanbanLabels`). Keep backward-compat fields like `task.text` supported where relevant.

## Domain objects (what code expects)
- **Task**: `id`, `key`, `title` (legacy: `text`), `description`, `type` (`story|bug|task|spike`), `estimate` (story points or `null`), `assignee`, `claimedBy`, `claimedAt`, `acceptanceCriteria[]`, `comments[]`, `relationships[]`, `column`, `order`, `creationDate`, `changeDate`, `doneDate`, `blockedAt`, `blockedReason`, `columnHistory[]`, `swimlaneLabelId`, `swimlaneLabelGroup`. There is no `priority`, `dueDate`, task `labels`, `subTasks`, `attachments`, `customFields` or `annotations` in the model, and the create dialog has no column picker (tasks always start in Backlog).
- **Column**: `id`, `name`, `color` (hex), `order`, `collapsed`, `role` (`"done"` only on the fourth fixed column)
- **Fixed columns**: the four columns are Backlog (everything not started), In Progress (what an agent is actively working; read-only), Blocked (work an agent could not finish and that needs a human decision, or work stuck on a resource conflict) and Finished (completed work). Ids, order and `role` are fixed — key behaviour off those, never the display name; `name` is display-only and the fixed definitions are reimposed on every board at load, so a rename needs no migration.
- **Label**: `id`, `name` (max 40 chars), `color` (hex), `group`

## UI conventions
- Mobile first design: the board interactions must all be mobile friendly drag and drop moves and design is for small screens first.
- Modal UX is centralized in `src/modules/modals.js`:
  - Uses modal DOM ids from `src/index.html` and closes via **Escape** and backdrop clicks.
  - Use `confirmDialog()` / `alertDialog()` from `src/modules/dialog.js` for confirmations instead of `window.confirm`.
- Drag/drop is in `src/modules/dragdrop.js`:
  - Task reordering updates `task.order` via DOM order (`updateTaskPositions()` in `tasks.js`).
  - Column reordering updates `column.order` from DOM order (`updateColumnPositions()` in `columns.js`).

## Style system
- Styling is in `src/styles/` with multiple CSS files (base.css, index.css, layout.css, responsive.css, tokens.css, utilities.css, plus components/ subfolder)
- Light/dark theme via `document.documentElement.dataset.theme`
- Theme persistence key: `kanban-theme` (see `src/modules/theme.js`)

## Release Process

This project has no GitHub Actions / CI pipelines. Releases are cut manually:

1. **Run the tests locally** — `cd client && npm test`.
2. **Bump the version + promote the changelog** — `cd client && npm run release:prepare` (bumps `package.json`, promotes `CHANGELOG.md` `## [Unreleased]` into a dated section, updates the README version badge).
3. **Update the lockfile** — `npm install --package-lock-only` in `client/`.
4. **Commit + tag + push** — `git add -A && git commit -m "Release vX.Y.Z" && git tag vX.Y.Z && git push origin main --tags`.

### Release conventions

- **Version source of truth**: `package.json` → Vite injects as `__APP_VERSION__` → footer displays it
- **Changelog format**: Keep a Changelog. Sections: `### Added/Changed/Removed (version)`
- **Commit message**: `Bump version to vX.Y.Z and update changelog`
- **Tag**: Annotated `vX.Y.Z` with brief comma-separated summary
- **Release automation**: `.github/workflows/release.yml` + `.github/workflows/publish-release.yml` + `scripts/prepare-release.mjs` + `scripts/extract-release-notes.mjs`
- **Docs to update on feature changes**: `CHANGELOG.md`, relevant `docs/spec/*.md` files, `docs/specification-kanban.md` (when spec governance changes), `CLAUDE.md`, `.github/copilot-instructions.md` (if module structure changes)
