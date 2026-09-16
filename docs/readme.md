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
	- **Create a new board** — the five fixed columns come with it.
2. **Task creation** — tasks are created by agents through the API, and the Human In The Loop column has an Add task control for adding a task by hand.
3. **Move work forward** by drag-and-drop between columns.
4. **Use the right tool for the job**
	- **Columns** = workflow state (Backlog → Human In The Loop → In Progress → Blocked → Finished)
	- **Description** = the agent's full write-up and reply surface
	- **Notes to the agent** = the human's input; the only human-to-agent channel

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

### Notes to the Agent

Every task carries an append-only list of notes the human writes for the agent:

- The description belongs to the agent; the notes list belongs to the human
- Appending a note sets `needsDigest`, and the agent folds it into the description before starting work
- A note added to a finished task sends it back to Backlog as rework
- Notes travel with the task in board exports

### Swim Lanes (New!)

Add a second dimension to your board by grouping tasks into horizontal swim lanes. Group by **label** or **label group** to see your work from different angles.

- Drag and drop tasks across columns, lanes, or both in a single gesture
- Collapse/expand individual cells, entire rows, or workflow columns independently
- Agents create tasks through the API; the Human In The Loop column, in the board and swim lane view, also accepts tasks added by hand
- Finished tasks are hidden in lanes to keep rows compact while remaining a drop target
- Sticky lane headers during horizontal scrolling and sticky workflow headers during vertical scrolling
- Fully responsive on mobile with snap-scrolling columns and sticky lane headers
- All swim lane settings, collapsed states, and lane assignments persist per board
- Configure in **Settings** — choose grouping mode and start organizing

### Boards
Multiple boards with independent columns, tasks, labels, and settings. Switch between contexts instantly. New boards start blank.

### Tasks
Create tasks with a title and a description. Drag and drop to move between columns. Click anywhere on a task card (except the delete button) to open the edit modal, which holds the title, the description and the notes to the agent. Optimized drag-and-drop performance handles 300+ tasks.

### Columns
The board has five fixed columns — **Backlog** (work the agent proposed), **Human In The Loop** (the human's hand-entry point), **In Progress** (what an agent is actively working; read-only), **Blocked** (work an agent could not finish and that needs a human decision, or work stuck on a resource conflict) and **Finished** (completed work). The ids, order and the done-column role are fixed, so display names can change without a migration. Columns are not user-editable from the board. The Finished column is permanent and optimized for large task counts with virtualization.

### Labels & Groups
Color-coded labels organized into groups. Labels are board-level and feed swim lane grouping — group by **label** or by **label group**. Manage them from **Manage Labels**; board search matches task titles and descriptions.

### Reports
Dedicated pages for productivity analytics:

- **Activity Heatmap**: Daily updates calendar covering the last 365 days
- **Lead Time & Completion**: Weekly lead time chart with trend line, completion KPIs, and sparklines
- **Same-Day Completions**: Track ad-hoc tasks created and completed on the same day with KPIs and 12-week sparkline
- **Cumulative Flow Diagram**: Stacked area chart showing task distribution across columns over time

### Settings
Per-board configuration: locale, the updated-timestamp toggle, column summaries, and swim lane grouping mode, label-group source, lane order, and collapsed lane states.

---

**Loved the app? [Star the repo on GitHub](https://github.com/mdiener21/kanvana) to support the project!** Contributions welcome — fork, improve, and share your ideas.
