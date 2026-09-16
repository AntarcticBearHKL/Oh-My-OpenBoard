# Help (In-App)

[![GitHub stars](https://img.shields.io/github/stars/mdiener21/kanvana.svg?style=social)](https://github.com/mdiener21/kanvana/stargazers)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Now-blue)](https://mdiener21.github.io/openagile/)

This file is the canonical user-facing text for the in-app **Help** modal.

## Quick start

- Add a task by hand with the **Add task** row in the **Backlog** column.
- Drag and drop tasks between the four fixed columns to update status.
- Use **type** (story/bug/task/spike) and **estimate** (story points) for planning; **acceptance criteria** define when a task is finished.

## Support & Community

Loving OpenAgile the Kanban Board? Help us grow!

- **⭐ Star the Repo**: Show your support on [GitHub](https://github.com/mdiener21/kanvana) to help others discover it!
- **📚 Full Documentation**: Dive deeper with guides, templates, and specs at [docs/](https://github.com/mdiener21/kanvana/tree/main/docs).
- **🐛 Report Issues**: Found a bug? Suggest features on [GitHub Issues](https://github.com/mdiener21/kanvana/issues).

Your feedback keeps the app improving! 🚀

### About OpenAgile Web PWA App

This is a fully local personal + AI Agent Kanban board.

- **No server required**: everything runs in your browser.
- **Local-first storage**: data is stored in this browser’s IndexedDB.
- **Backups are your responsibility**: export regularly if you care about the data.

## Controls Menu

All controls are in the header menu (ellipsis **⋮**).

- **Board Select**: switch boards
- **Swim Lanes**: toggle the swim lane view
- **Manage Boards**: open/rename/delete boards
- **Manage Labels**: create/edit/delete labels and groups
- **Settings**: locale, timestamps, and swim lane options
- **View Reports** / **View Roadmap**: analytics and iteration overview
- **Theme** / **Help**: appearance and help

## Boards

- **Switch boards** using the board dropdown.
- The **last active board is restored** when you return.
- **Manage Boards** lets you:
  - Open a board
  - Rename a board
  - Delete a board (confirmation required)
  - The last remaining board cannot be deleted

## Tasks

- **Add**: use the **Add task** row in the **Backlog** column to add a task by hand; the other columns are driven by agents. Import/export is in **Manage Boards**.
- **Edit**: click a task card to edit its title, description, type, estimate, acceptance criteria and notes to the agent.
- **Move**: drag and drop tasks between the four fixed columns.
- **Delete**: click the task **trash** button and confirm.

#### Acceptance Criteria & Comments

- **Acceptance criteria** are the definition of done: add each criterion, tick it when it is met, and the task may only move to Finished when everything is checked.
- **Comments** are your notes to the agent: write what the agent should know or answer, and the agent replies in the same thread.
- There is no priority, no due date, no label picker, and no sub-task list on a task — type, estimate, acceptance criteria and comments are the task's planning surface.

### Columns

- The board has exactly four fixed columns: Backlog, In Progress, Blocked, Finished.
- Each column scrolls independently, so long task lists stay manageable.
- Columns cannot be added, edited, deleted, or reordered from the board.
- A task in In Progress is read-only while an agent works it.

### Labels

- Open **Manage Labels** to create, edit, or delete labels.
- Labels are board-level: they group work into swim lanes (group by label or label group).
- Deleting a label removes it from the label list and from swim lane grouping (confirmation required).

### Import / Export (Backups)

- **Export** downloads the active board only (columns + tasks + labels) as a JSON file. It does not back up all boards.

To back up everything:

- Switch boards
- Export each board individually

**Import** creates a **new board** from the JSON (columns + tasks + labels + settings when present) and switches to it.

Important notes:
- Clearing site data, using private browsing, or switching browsers/devices can make your data disappear.
- Export regularly if you want a durable backup.

### Keyboard & Modal Shortcuts

- See [Keyboard Shortcuts](keybindings.md) for the full current shortcut table.
- **Ctrl+B** opens Manage Boards unless you are typing in a form field.
- **Escape** closes most modals.
- Clicking the **backdrop** closes most modals.

### Tips

- Export on a schedule (end of day / end of week).
- Use multiple boards to separate contexts (work, personal, projects).
- Use labels to group swim lanes across columns (e.g., Feature, Finance, Email).

## Writing good task titles (optional)

Short, action-oriented titles are easiest to execute. Examples:

- Implement
- Fix
- Draft
- Review
- Schedule
- Follow up
- Investigate

---

