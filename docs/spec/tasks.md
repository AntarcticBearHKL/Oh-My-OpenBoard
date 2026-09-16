# Tasks

## Create and Edit

- Tasks are created by agents through the API (`create_task`); the Backlog column also offers an Add task row so a human can capture work by hand. Backlog is the only manual entry point — the other three columns have no add control
- Creation always lands in Backlog: the create dialog has no column picker
- Create and edit form fields: title (required, validated inline with red error styling), description, type (`story`, `bug`, `task`, `spike`), estimate (whole story points; empty means unestimated), acceptance criteria, and the comment thread
- Type and estimate are the only planning fields on a task. The model has no priority, no due date, no task labels, no sub-tasks, no attachments and no custom fields
- Acceptance criteria are the definition of done: a task may only move to Finished when every criterion is met
- Acceptance criteria are edited inline (add, edit, tick/untick, remove); the fieldset legend shows `done / total` and the card shows the same progress
- Comments ("Notes to the agent") are the thread the human writes and the agent answers; a comment can be removed from the list before saving
- The edit modal also shows read-only context (task key, current column, claimant and claim age), the annotation list, and the Relationships fieldset
- A task in In Progress is fully read-only — the whole form, including annotations, is locked while a subagent works it
- Edit mode opens with existing task values prefilled
- The edit modal includes a fullscreen action on larger screens and a dedicated close button

## Placement and Ordering

- New tasks are inserted at the top of Backlog with `order = 1`
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

- Task cards show the task key, title, a short description preview, the type badge, the estimate, the claimant with elapsed claim time, acceptance progress (`done / total`), a notes count when comments exist, a blocked badge when a blocked reason is recorded, and a relationships count
- Clicking anywhere on a task card opens the edit modal, except the delete button which triggers deletion
- Drag-and-drop is distinguished from clicks by pointer movement threshold
- Titles are clamped to one line and descriptions to a short preview
- URLs (`http://` or `https://`) in the description are rendered as clickable `<a>` links that open in a new tab (`target="_blank" rel="noopener noreferrer"`); clicking a link does not open the edit modal. Plain-text editing in the modal is unchanged — linkification is display-only on the card.
- In the task modal (add and edit), a live link preview strip appears below the description textarea whenever one or more `http://`/`https://` URLs are detected. Each unique URL renders as a clickable chip that opens in a new tab. The strip updates on every keystroke/paste and hides itself when no URLs are present. Existing URLs are shown immediately when the edit modal opens.

## Acceptance Criteria and Comments

- Each acceptance criterion is `{ id, text, done }`; `text` is required and `done` is a boolean
- Criteria can be replaced wholesale or toggled one at a time through the task tools (`set_acceptance_criteria`, `toggle_acceptance_criterion`)
- Comments are `{ id, author, text, at }`; the human writes them in the task modal and the agent answers through `add_comment`

## Relationships in Task Modal

- The task edit modal includes a Relationships fieldset in the right form column, below the acceptance-criteria and comments fieldsets
- Users select a relationship type (Prerequisite, Dependent, Related) and search for a task by short ID (e.g. `#ae2ry`) or title text
- Adding a relationship automatically creates the inverse on the target task; removing one removes the inverse
- Active relationships are shown as compact badges displaying type and short ID; clicking the short ID opens that task
- Already-linked tasks appear in search results with their current type shown; selecting replaces the type on both sides

## Relationships on Task Cards

- Cards with one or more relationships show a `git-branch` icon followed by the count in the card's meta cluster
- Cards with no relationships show no indicator

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

- A column's task list scrolls independently when it overflows
- The Finished column virtualizes large lists: the first 50 completed tasks render, then a "Show more (N remaining)" button grows the batch by 50

## Update Requirements

Update this file when you change:

- task fields or validation
- task card layout or meta rules
- task ordering or drag behavior
- task modal fields, acceptance-criteria UX, or the comment thread
- relationship UI behavior or card indicator
- deletion confirmation wording or event propagation
- claim timing rules or the stale-claim watchdog
