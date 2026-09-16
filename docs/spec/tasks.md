# Tasks

## Create and Edit

- Tasks are created by agents through the API (`create_task`), which always lands in Backlog; a human adds a task by hand only through the Human In The Loop column's add control
- Dialog creation always lands in Human In The Loop: the create dialog has no column picker
- Create and edit form fields, in one column: title (required, validated inline with red error styling), description, and the notes-to-the-agent list. The dialog shows nothing else
- The dialog is the whole task surface: the title, the description and the notes-to-the-agent list. The model has no priority, no due date, no task labels, no sub-tasks, no attachments and no custom fields
- The description belongs to the agent; the notes to the agent (field `keyPoints`) belong to the human and the agent may only read them
- Write access is keyed to the fixed column id, never the display name: only a task in Human In The Loop is fully editable. Outside Human In The Loop the agent's title and description render as read-only content, not form fields, and the notes list is the only editable part
- A task in In Progress is fully view-only — the whole form is locked while a subagent works it and the notes control is visibly unavailable, so a note cannot be added there
- Notes are appended one at a time in a single input: type a note, press Enter, the line joins the list and the input clears for the next note. A note can be removed before saving; a note is `{ id, text, at }` and has no done flag
- The notes list is the only human-to-agent channel in the dialog; the description is the agent's reply surface
- The edit modal shows the task key as read-only header context. It has no column chip and no claimant chip
- Edit mode opens with existing task values prefilled
- The edit modal includes a fullscreen action on larger screens and a dedicated close button

## Placement and Ordering

- New tasks are inserted at the top of Human In The Loop with `order = 1`
- Standard drag and drop can move tasks between columns
- In swim lane mode, a single drag can change both column and lane
- Storage keeps task ordering flattened per column even while swim lanes are enabled

## Claim Timing and the Stale-Claim Watchdog

- A claim (`claim_task`) starts a five-minute sync window; any update that bumps `changeDate` (a description edit, a digest, a re-claim) restarts it
- The harness sweeps every 30 seconds and moves a claimed In Progress task whose `changeDate` is older than five minutes to Blocked, exactly as an agent move does: it emits `task.moved` with the column ordering (recorded in `columnHistory`) and a `task.updated` that carries the blocked fields
- The server sets `blockedAt` (which stops the card's elapsed timer) and `blockedReason` to `Auto-blocked: no agent sync for over 5 minutes.`
- The sweep keys off the fixed In Progress and Blocked column ids, never column names, and only touches tasks that carry a claim marker (`claimedBy` or `claimedAt`); unclaimed, fresh, and already-blocked tasks are left alone
- An agent that moves the card to Finished or Blocked itself stops the clock before the watchdog ever sees the task
- The threshold is `CLAIM_STALE_MS` (five minutes) in `harness/src/store.mjs`; the interval is 30 seconds, started once at server boot

## Card Display

- A task card shows exactly what the task is: title, description preview, and the notes-to-the-agent list (field `keyPoints`), stacked vertically. The card conveys no other status than the column it sits in — the key/code, claimant, elapsed timer, notes indicator and blocked badge were removed
- Two markers stay because someone must act on them: `needsDigest` (the human changed the task and the agent has not folded the note into the description) and `isRework` (the task came back from Finished). They render only in Backlog, Blocked and Finished — keyed to the fixed column ids — as a coloured pill that also carries a lucide icon and its label text, so the meaning survives colour-blindness and holds up in both themes. They are not decoration
- Clicking anywhere on a task card opens the edit modal, except the delete button which triggers deletion
- Drag-and-drop is distinguished from clicks by pointer movement threshold
- Titles are clamped to one line and descriptions to a short preview
- URLs (`http://` or `https://`) in the description are rendered as clickable `<a>` links that open in a new tab (`target="_blank" rel="noopener noreferrer"`); clicking a link does not open the edit modal. Plain-text editing in the modal is unchanged — linkification is display-only on the card.
- In the task modal (add and edit), a live link preview strip appears below the description textarea whenever one or more `http://`/`https://` URLs are detected. Each unique URL renders as a clickable chip that opens in a new tab. The strip updates on every keystroke/paste and hides itself when no URLs are present. Existing URLs are shown immediately when the edit modal opens.

## Notes to the Agent and the Digest Workflow

- A note (field `keyPoints`) is `{ id, text, at }`; `text` is required and `at` is the timestamp the human added it. There is no done flag
- Notes are human-authored: the task tools and the agent surface expose them read-only. The agent must not add, edit or delete them
- Appending a note while the task is in Backlog, Human In The Loop or Blocked sets `needsDigest` on the task: the agent must fold the notes into the description before starting work
- While a task has undigested notes the agent must not start it: `claim_task` and a `move_task` into In Progress are refused with a message telling the agent to run `digest_key_points` first. Moving a task to any other column is unaffected
- Appending a note to a task in Finished moves the task back to Backlog, sets `isRework`, and emits the move exactly like a normal move (`task.moved` with the full column ordering plus a `task.updated` with the flag), so history and the projector stay consistent
- The agent digests notes through `digest_key_points` (MCP): each digested note gets `digestedAt` and the task's `needsDigest` is cleared. It is the only way to clear the flag — no other task tool can. Omitting note ids stamps every undigested note; an already-stamped note keeps its original stamp
- `needsDigest` and `isRework` are ordinary task fields: they ride `task.updated` events and survive reload, snapshot hydration and event replay
- Legacy `acceptanceCriteria` arrays are read as notes, keeping `text` and dropping the old `done` flags; older exports and stored tasks import without error

## Comments

- There is no comment thread in the dialog: the notes list is the only human-to-agent channel and the description is the agent's reply surface

## Relationships

- Task relationships are not part of the product: there is no relationship search in the dialog and no relationship indicator on the card

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
- task modal fields or notes-list UX
- the notes-to-the-agent digest workflow (`needsDigest`, `isRework`, `digestedAt`)
- deletion confirmation wording or event propagation
- claim timing rules or the stale-claim watchdog
