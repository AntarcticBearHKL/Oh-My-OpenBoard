# Board UI

## Main Layout

- The board uses a horizontal column layout with mobile-friendly horizontal scrolling
- Each column contains a header and a task list; the Finished column adds a "Show more (N remaining)" control when its list is virtualized
- Task counters appear in column headers and update after adds, deletes, and moves
- The brand area shows the OpenAgile SVG logo and brand text shows the active board name rather than a fixed app title

## Fixed Columns

- The board always has exactly four fixed columns, in this order: Backlog, In Progress, Blocked, Finished
- Backlog holds everything not started
- In Progress is what an agent is actively working; tasks in it are read-only — the whole form, including annotations, is locked while a subagent works the task
- Blocked is work an agent could not finish and that needs a human decision, or work stuck on a resource conflict
- Finished is completed work; it carries the done-column `role` and is the statistics source for velocity and cycle time
- The column's id, order, and role are fixed, so keying behaviour off them survives display-name changes

## Controls Bar

- Includes board-level task search beside the brand area
- Search filters the rendered board in memory only
- Search matches task title and description
- A menu button opens controls for boards, labels, settings, swim lanes, reports, roadmap, help, and legal/impressum (no add-column or calendar entry)
- On mobile, the top bar stays on a single row: the brand remains left, while the menu stays right; task search plus auth and sync controls move into the mobile menu overlay instead of consuming their own header rows
- On mobile, opening the controls menu expands into a full-screen overlay with a dedicated close button, keeping search, session status, and the control list within easy thumb reach

## Boards UI

- Board selection persists and restores on page load
- Manage Boards supports create, open, export, import, rename, and delete actions
- Clicking the brand text or pressing `Ctrl+B` opens the Manage Boards modal; the shortcut is ignored while focus is in an input, textarea, or select
- New boards start blank
- The last remaining board cannot be deleted
- On mobile, the board selector has a larger touch target and the controls menu stays open while the selector is used
- Clicking a sidebar group's name or its chevron collapses or expands that group; double-clicking the name renames the group inline

## Modals and Dialogs

- Modal close behavior is centralized in `src/modules/modals.js`
- Modals close via Escape or backdrop click
- Confirmations use `confirmDialog()` or `alertDialog()` instead of browser-native dialogs
- Long modals scroll internally while their action row stays sticky at the bottom
- Modals become full-screen on mobile

## Rendering Behavior

- `renderBoard()` is the single board re-render entry point after data changes
- Dynamic DOM updates should re-run `renderIcons()`
- Finished-column virtualization renders completed tasks in batches when the column is large

## Drag and Drop Behavior

- Tasks are draggable within and across columns
- Columns are fixed: they are not draggable, reorderable, or editable from the board
- Dragging near the top or bottom of a long task list auto-scrolls the list
- In swim lane mode, collapsed cells and collapsed columns accept drops and place the task at the top
- Finished column internal reordering is disabled and dropped tasks are inserted at the top
- Task drops use incremental updates so counters and claim/acceptance meta refresh without a full board rebuild

## Scrolling and Responsiveness

- Desktop columns fill the available board height and their task lists scroll internally
- Mobile columns use internal vertical scrolling and snap-scrolling horizontally across the board
- Styled scrollbars use an 8px thumb on supported browsers

## Warnings

- `beforeunload` warns that data lives in the browser and should be exported if needed
- Deleting tasks and labels requires confirmation
