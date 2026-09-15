# Tasks

## Create and Edit

- Tasks are created by agents through the API; the board UI has no manual add control
- Task form fields: title, description, priority, due date, column, labels
- Title is required and validates inline with red error styling
- Edit mode opens with existing task values prefilled
- The edit modal includes a fullscreen action on larger screens and a dedicated close button

## Placement and Ordering

- New tasks are inserted at the top of the selected column with `order = 1`
- Standard drag and drop can move tasks between columns
- In swim lane mode, a single drag can change both column and lane
- Storage keeps task ordering flattened per column even while swim lanes are enabled

## Claim Timing and the Stale-Claim Watchdog

- A claim (`claim_task`) starts a five-minute sync window; any update that bumps `changeDate` (a comment, a description edit, a re-claim) restarts it
- The harness sweeps every 30 seconds and moves a claimed In Progress task whose `changeDate` is older than five minutes to Blocked, exactly as an agent move does: it emits `task.moved` with the column ordering (recorded in `columnHistory`) and a `task.updated` that carries the blocked fields
- The server sets `blockedAt` (which stops the card's elapsed timer) and `blockedReason` to `Auto-blocked: no agent sync for over 5 minutes.`
- The sweep keys off the fixed In Progress and Blocked column ids, never column names, and only touches tasks that carry a claim marker (`claimedBy` or `claimedAt`); unclaimed, fresh, and already-blocked tasks are left alone
- An agent that moves the card to Finished or Blocked itself stops the clock before the watchdog ever sees the task
- The threshold is `CLAIM_STALE_MS` (five minutes) in `harness/src/store.mjs`; the interval is 30 seconds, started once at server boot

## Card Display

- Task cards show title, optional description, labels, priority badge, delete button, and optional footer metadata
- Clicking anywhere on a task card opens the edit modal, except the delete button which triggers deletion
- Drag-and-drop is distinguished from clicks by pointer movement threshold
- Titles are clamped to one line and descriptions to a short preview
- Footer content is controlled by settings and can include change date, due date, countdown, and task age
- URLs (`http://` or `https://`) in the description are rendered as clickable `<a>` links that open in a new tab (`target="_blank" rel="noopener noreferrer"`); clicking a link does not open the edit modal. Plain-text editing in the modal is unchanged — linkification is display-only on the card.
- In the task modal (add and edit), a live link preview strip appears below the description textarea whenever one or more `http://`/`https://` URLs are detected. Each unique URL renders as a clickable chip that opens in a new tab. The strip updates on every keystroke/paste and hides itself when no URLs are present. Existing URLs are shown immediately when the edit modal opens.

## Due Dates and Age

- `changeDate` is formatted with the selected locale using `toLocaleString(locale)`
- Due dates are displayed as `Due MM/DD/YYYY (countdown)` when countdowns are enabled
- Countdown text shows days for short ranges and months plus days for longer ranges
- Overdue tasks display `overdue by ...`
- Urgency coloring uses configurable red and amber thresholds from settings
- Tasks in the Finished column show due dates without countdown text or urgency coloring
- Task age is derived from `creationDate` and displayed as years, months, and days as applicable

## Labels in Task Modal

- Selected labels are shown as colored pills with remove buttons
- Available labels can be filtered through a search field
- The first matching label is automatically highlighted; Arrow Up/Down moves the highlight through filtered results
- Pressing Enter toggles the highlighted label (adds or removes) and clears the search field
- When no label matches the search, a "Create label" button appears auto-highlighted and keyboard-navigable
- Pressing Enter on the create-label button opens the Add Label modal with the search text pre-filled
- After creating a label from the task modal, the new label is auto-selected and the search field is cleared
- The label search field can open the Add Label modal without losing in-progress task edits

## Relationships in Task Modal

- The task edit modal includes a Relationships fieldset below the Labels fieldset
- Users select a relationship type (Prerequisite, Dependent, Related) and search for a task by short ID (e.g. `#ae2ry`) or title text
- Adding a relationship automatically creates the inverse on the target task; removing one removes the inverse
- Active relationships are shown as compact badges displaying type and short ID; clicking the short ID opens that task
- Already-linked tasks appear in search results with their current type shown; selecting replaces the type on both sides

## Relationships on Task Cards

- Cards with one or more relationships show a `git-branch` icon followed by `relationships (N)`
- The indicator is right-aligned and placed below the labels section, above the footer
- Cards with no relationships show no indicator

## Sub-tasks on Task Cards

- Cards with one or more sub-tasks show a donut circle and `completed/total Done` label inline in the footer row
- The donut stroke is blue by default and turns green when all sub-tasks are completed
- Cards with no sub-tasks show no indicator
- See [sub-tasks.md](sub-tasks.md) for full sub-task specification

## Task Deletion

### Confirmation

Clicking the delete button on a task card always shows a confirmation dialog before any action is
taken.

- Dialog title: "Delete task?"
- Dialog message: "This will permanently delete the task. There is no undo."
- Confirm button: "Delete"

### Permanent delete

- The task is immediately and irreversibly removed from local storage (IndexedDB).
- A `task.deleted` domain event is emitted before the task is removed.
- The event-sourced reducer records a tombstone so later stale events cannot resurrect the task.

### PocketBase sync behavior

- Deletions propagate through persisted `task.deleted` domain events and reducer tombstones.
- Legacy soft-delete mode, the Settings purge action, and pending hard-delete queue were removed
  in issue #111.

## Task List Size Controls

- Columns with more than 12 tasks show a scrollbar and optional "Show all tasks (N)" control
- Expanded task lists use up to `80vh`

## Update Requirements

Update this file when you change:

- task fields or validation
- task card layout or footer rules
- task ordering or drag behavior
- task modal fields or inline label UX
- relationship UI behavior or card indicator
- sub-task card indicator layout (full sub-task spec lives in [sub-tasks.md](sub-tasks.md))
- deletion confirmation wording or event propagation
- claim timing rules or the stale-claim watchdog
