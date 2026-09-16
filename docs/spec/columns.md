# Columns

## Fixed Columns

The board always has exactly four fixed columns, in this order:

| Column | Semantics |
|---|---|
| Backlog | Everything not started |
| In Progress | What an agent is actively working; tasks are read-only there |
| Blocked | Work an agent could not finish and that needs a human decision, or work stuck on a resource conflict |
| Finished | Completed work; carries the done-column `role` and feeds velocity and cycle-time statistics |

- The fixed definitions (id, name, order, role) are reimposed on every board at load; `name` is display-only and behaviour keys off the fixed ids, never the display name
- The fourth column keeps `role: "done"` and the fixed id `00000000-0000-4000-8000-000000000033`
- A claimed task that sits in In Progress with no update for five minutes is moved to Blocked by the server watchdog, with the reason recorded on the card (see [tasks.md](tasks.md))

## Column UI

- Columns are fixed: the board has no add, edit, delete, or reorder controls for columns, and the column tools reject create/delete/reorder
- Each column header shows the column name, a WIP-aware task counter, and a Summary button
- The Summary button opens the agent-written column summary; a human can read it and edit or clear it
- The Backlog column additionally renders a full-width Add task row; the other columns have no add control
- A long task list scrolls within its column; the Finished column adds a "Show more (N remaining)" control when its list exceeds the virtualization batch

## WIP Limits

- Each column stores an advisory `wipLimit`; `0` means unlimited (the default)
- WIP limits are never enforced: nothing blocks adding, dragging, importing, or syncing a task into a column at or over its limit
- The header counter reflects the breach state (at limit / over limit); Finished is exempt because it is terminal and unbounded

## Color Behavior

- Each column has a hex color; the stored color is reapplied at load and the column accent is reused by task cards in that column
- Colors are set through the column tools; the board UI does not expose column color editing

## Finished Column Rules

- The column with `role: "done"` is permanent and cannot be deleted
- Finished-column sorting via drag reordering is disabled for performance
- Dropping into Finished always inserts tasks at the top
