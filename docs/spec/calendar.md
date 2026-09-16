# Calendar

> **Data-source note:** whether this page survives is an open decision. It renders tasks by
> `task.dueDate`, and the slimmed task model no longer carries a due date, so the page currently
> has no live data source.

## Calendar Page

- Entry point: `src/calendar.html`
- Operates on the active board
- Shows a one-month calendar based on `task.dueDate`

## Day Cells

- Each day cell shows the number of tasks due on that date
- If any listed task is overdue and not in Finished, the count badge is shown in red

## Task List Behavior

- Clicking a day shows the list of tasks due on that date
- Overdue tasks in the list are styled in red
- Task links open the task edit modal on the board and return the user to `index.html`

## Navigation

- The page is accessible from the main board menu as `View Calendar`
