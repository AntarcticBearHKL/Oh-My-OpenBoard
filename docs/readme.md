# OpenAgile Documentation

´´´OpenAgile == "Kanban" + "Nirvana" a Kanban Board´´´


[![GitHub stars](https://img.shields.io/github/stars/mdiener21/kanvana.svg?style=social)](https://github.com/mdiener21/kanvana/stargazers)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Now-blue)](https://mdiener21.github.io/openagile/)

> **Your data, your browser, your workflow.** A local-first Kanban board that runs entirely in your browser — no servers, no accounts, no tracking.

**[Use it Live Here](https://mdiener21.github.io/openagile/)**


**Building with AI agents?** Try the new **AI Agent Ops Starter** board template to track 2–5 agents in parallel, review handoffs, and improve prompts in one local-first workspace. If that sounds useful, give the repo a ⭐ and help more agent builders discover it.

---

## What is OpenAgile?

OpenAgile == "Kanban" + "Nirvana" is a Kanban Board, browser-based task manager built for speed, privacy, and simplicity. All your data stays in your browser's IndexedDB — nothing leaves your machine unless you choose to export it.

**Key highlights:**

- **No server required** — runs 100% in your browser
- **Offline ready** — works without internet after first load
- **Private by design** — no tracking, no cloud, no accounts
- **Export/Import** — back up and restore your boards as JSON files with preflight validation
- **Customizable** — themes, colors, labels, auto-contrast label text, and configurable settings per board

---

## Get productive in 2 minutes

1. **Pick a starting point**
	- **Import a template board** (recommended), or
	- **Create a new board** and add 3–6 columns.
2. **Task creation** — tasks are created by agents through the API, and the Backlog column also has an Add task row for capturing work by hand.
3. **Move work forward** by drag-and-drop between columns.
4. **Use the right tool for the job**
	- **Columns** = workflow state (Backlog → In Progress → Blocked → Finished)
	- **Type** = kind of work (story/bug/task/spike)
	- **Estimate** = story points
	- **Acceptance criteria** = the definition of done
	- **Comments** = notes to the agent

Tip: Everything is stored locally in your browser (IndexedDB). Export regularly if you care about keeping the data.

## Quick Start with Example Boards

Import a pre-built board to get started immediately:

| Board | Description |
|-------|-------------|
| [Personal Demo](example-boards/Personal_Demo_board.json) | Sample board showing the basics |
| [AI Agent Ops Starter](example-boards/AI-Agent-Ops-Starter-Template.json) | Beginner-friendly workflow for supervising 2-5 parallel agents |
| [Project Management](example-boards/Project-Management-Board-Template.json) | Backlog → To Do → In Progress → Review → Done |
| [Personal Life](example-boards/Personal-Life-Board-Template.json) | A simple home/personal workflow |
| [Sales Pipeline](example-boards/Sales_board_template.json) | Lead stages + activity labels |
| [Getting Things Done](example-boards/Getting-Things-Done-Template.json) | GTD productivity system |
| [Eisenhower Method](example-boards/Eisenhower-Method-Board.json) | Urgent/Important prioritization |

**How to import:** Click **Import** in the app menu and select a JSON file.

Import creates a **new board** from the JSON and switches to it (your existing boards are not overwritten).

Want more templates? See [boards.md](boards.md).

---

## Documentation

| Document | What you'll find |
|----------|-----------------|
| [User Guide (In-App Help)](help-how-to.md) | The canonical help text shown inside the app |
| [Keyboard Shortcuts](user/keybindings.md) | Current keyboard shortcuts and where each one works |
| [Board Templates](boards.md) | Templates you can import + best practices for columns and workflows |
| [Labels Guide](labels.md) | How to use labels and groups for filtering and categorization |
| [Specification Index](specification-kanban.md) | Canonical spec entrypoint, governance, and links to all feature/data spec files |
| [Kanban Ecosystem](kanban-ecosystem.md) | Comparison with other open-source kanban tools |

---

## 👤 For Users

New to Kanban? Here's where to start:

1. **[User Guide (In-App Help)](help-how-to.md)** — Learn the UI quickly: boards, tasks, columns, labels, import/export
2. **[Keyboard Shortcuts](user/keybindings.md)** — Move faster with board, modal, and task shortcuts
3. **[Board Templates](boards.md)** — Pick a workflow and import a ready-to-use board
4. **[Labels Guide](labels.md)** — Build a label system that helps you filter without turning labels into “status”

---

## 🛠️ For Developers

Want to build on or contribute to the project?

- **[Specification Index](specification-kanban.md)** — Canonical entrypoint to the split specification set under `docs/spec/`, including data models, storage, UI behavior, and testing references
- **[CLAUDE.md](../CLAUDE.md)** — Coding conventions and architecture guidelines
- **[Main README](../README.md)** — Setup, build commands, and deployment

The app is built with **Vite**, uses **vanilla JavaScript/CSS/HTML**, and follows local-first principles. Dependencies are limited to Lucide icons, SortableJS, and ECharts (reports only).

---

## Core Features at a Glance

### Acceptance Criteria

Every task carries a checklist that defines "done":

- Add a criterion with a title; tick it once it is met
- The card shows `done / total` progress and turns complete when every criterion is checked
- A task may only move to Finished when all of its criteria are met
- Criteria travel with the task in board exports

### Swim Lanes (New!)

Add a second dimension to your board by grouping tasks into horizontal swim lanes. Group by **label** or **label group** to see your work from different angles.

- Drag and drop tasks across columns, lanes, or both in a single gesture
- Collapse/expand individual cells, entire rows, or workflow columns independently
- Agents create tasks through the API; the Backlog column, in the board and swim lane view, also accepts tasks added by hand
- Finished tasks are hidden in lanes to keep rows compact while remaining a drop target
- Sticky lane headers during horizontal scrolling and sticky workflow headers during vertical scrolling
- Fully responsive on mobile with snap-scrolling columns and sticky lane headers
- All swim lane settings, collapsed states, and lane assignments persist per board
- Configure in **Settings** — choose grouping mode and start organizing

### Boards
Multiple boards with independent columns, tasks, labels, and settings. Switch between contexts instantly. New boards start blank.

### Tasks
Create tasks with a title and a description; type and estimate are the only planning fields. Drag and drop to move between columns. Click anywhere on a task card (except the delete button) to open the edit modal. Each task can carry acceptance criteria — its definition of done — and a comment thread where the human gives instructions and the agent answers. Cards show the type, estimate, claim state and elapsed time, and acceptance progress at a glance. Optimized drag-and-drop performance handles 300+ tasks.

### Task Relationships

Link tasks together to model dependencies and connections:

- **Prerequisite** — another task must be completed before this one can begin
- **Dependent** — this task is needed by another before that task can start
- **Related** — a general connection without implying order

Relationships are bidirectional: adding one automatically creates the inverse on the linked task, and removing it cleans up both sides. Search for tasks by short ID (e.g. `#ae2ry`) or title, view active relationships as color-coded badges in the task modal, and click any badge ID to jump to that task. Cards with relationships show a count indicator in the card's meta cluster.

### Columns
The board has four fixed columns — **Backlog** (everything not started), **In Progress** (what an agent is actively working; read-only), **Blocked** (work an agent could not finish and that needs a human decision, or work stuck on a resource conflict) and **Finished** (completed work). The ids, order and the done-column role are fixed, so display names can change without a migration. Columns are not user-editable from the board: each header offers a WIP-aware count and the agent column summary. The Finished column is permanent and optimized for large task counts with virtualization.

### Labels & Groups
Color-coded labels organized into groups. Labels are board-level and feed swim lane grouping — group by **label** or by **label group**. Manage them from **Manage Labels**; board search matches task titles and descriptions.

### Reports & Calendar
Dedicated pages for productivity analytics and date-based planning:

- **Activity Heatmap**: Daily updates calendar covering the last 365 days
- **Lead Time & Completion**: Weekly lead time chart with trend line, completion KPIs, and sparklines
- **Same-Day Completions**: Track ad-hoc tasks created and completed on the same day with KPIs and 12-week sparkline
- **Cumulative Flow Diagram**: Stacked area chart showing task distribution across columns over time
- **Calendar View**: Monthly due-date calendar with overdue highlighting and clickable task links (currently has no data source — the slimmed task model no longer carries due dates)

### Settings
Per-board configuration: locale, the updated-timestamp toggle, column summaries, and swim lane grouping mode, label-group source, lane order, and collapsed lane states.

---

**Loved the app? [Star the repo on GitHub](https://github.com/mdiener21/kanvana) to support the project!** Contributions welcome — fork, improve, and share your ideas.
