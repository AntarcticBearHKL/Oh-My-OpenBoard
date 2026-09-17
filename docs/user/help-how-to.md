# Help (In-App)

[![GitHub stars](https://img.shields.io/github/stars/mdiener21/kanvana.svg?style=social)](https://github.com/mdiener21/kanvana/stargazers)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Now-blue)](https://mdiener21.github.io/openagile/)

This file is the canonical user-facing text for the in-app **Help** modal.

## Quick start

- Add a task by hand with the **Add task** control in the **Human In The Loop** column.
- Drag and drop tasks between the five fixed columns to update status.
- The description belongs to the agent; the notes to the agent are your input, and appending one asks the agent to fold it into the description before starting work.

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
- **Manage Boards**: open, export, import, edit an iteration's dates and goal, or delete an iteration
- **Manage Labels**: create/edit/delete labels and groups
- **Settings**: locale, timestamps, and swim lane options
- **View Roadmap**: iteration overview
- **Theme** / **Help**: appearance and help

## Boards

- **Switch boards** using the board dropdown.
- The **last active board is restored** when you return.
- **Manage Boards** lets you:
  - Open an iteration
  - Edit an iteration's dates and goal
  - Delete an iteration (confirmation required)
  - The last remaining iteration cannot be deleted

## Tasks

- **Add**: use the **Add task** control in the **Human In The Loop** column to add a task by hand; the other columns are driven by agents. Import/export is in **Manage Boards**.
- **Edit**: click a task card to edit its title, description and notes to the agent.
- **Move**: drag and drop tasks between the five fixed columns.
- **Delete**: click the task **trash** button and confirm.

#### Notes to the Agent

- **Notes to the agent** are your input: add one at a time, and the agent folds it into the description before starting work.
- The **description** belongs to the agent and is where the agent answers.
- There is no priority, no due date, no label picker, and no sub-task list on a task; the title, the description and the notes list are the whole dialog.

### Columns

- The board has exactly five fixed columns: Backlog, Human In The Loop, In Progress, Blocked, Finished.
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

