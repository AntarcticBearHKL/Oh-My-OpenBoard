# OpenAgile: The Personal + AI Agent Kanban Board

```js
openagile == "Kanban" + "Nirvana" # smooth flow
```

[![GitHub stars](https://img.shields.io/github/stars/mdiener21/kanvana.svg?style=social)](https://github.com/mdiener21/kanvana/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Now-blue)](https://kanvana.com)
[![Version](https://img.shields.io/badge/version-1.7.1-brightgreen)](CHANGELOG.md)

> **Transform your productivity with a sleek, local-first Kanban board.** No servers, no tracking—just pure efficiency in your browser.

A beautiful, modern-designed personal + AI-Agent Kanban board that runs entirely in your browser. No backend, no cloud, no data tracking. Everything stays local with browser IndexedDB persistence. Perfect for personal task management, work tracking, and staying organized.

**Building with AI agents?** Try the new **AI Agent Ops Starter** board template to track 2–5 agents in parallel, review handoffs, and improve prompts in one local-first workspace. If that sounds useful, give the repo a ⭐ and help more agent builders discover it.

## 🚀 Live Demo

Experience it firsthand: **[Try the Live Demo](https://kanvana.com)**


<div align="center">
   <a href="https://kanvana.com"><img width="1462" height="895" alt="image" src="https://github.com/user-attachments/assets/0d0ade47-e931-4caa-b1ec-4e0148733d5b"></a>
</div>


## ✨ Key Features

### ✅ Sub-tasks (New!)

Break complex tasks into smaller, trackable steps without leaving the board:

- **Inline creation** — type a sub-task title and press **Enter** to add it instantly
- **Checkbox completion** — check off each step; completed items are struck through and visually muted
- **Inline editing** — click any sub-task title to edit it in place; press **Enter** to save or **Escape** to cancel
- **Drag to reorder** — grab the handle and drag sub-tasks into the order that makes sense
- **Progress indicator** — the task card shows a donut circle with `completed/total Done` count that turns green when everything is done
- **Lightweight** — sub-tasks have no labels, priorities, or relationships; they stay scoped to their parent task

Sub-tasks are saved with the parent task and survive export/import round-trips. Existing tasks default to zero sub-tasks with no migration needed.


<img width="355" height="190" alt="image" src="https://github.com/user-attachments/assets/f6cf23be-8178-4edb-ac27-ddc53741e92f" /><br>

<img width="166" height="87" alt="image" src="https://github.com/user-attachments/assets/296070c9-0232-41c6-8f88-2f13fa7eb1b9" />


### 🔗 Task Relationships

Link tasks together to communicate dependencies and connections:

- **Prerequisite** — another task must be completed before this one can begin
- **Dependent** — this task is needed by another task before that task can start
- **Related** — a general connection between two tasks without implying order

Relationships are **bidirectional**: adding one automatically creates the inverse on the linked task, and removing it cleans up both sides. Search for tasks by short ID (e.g. `#ae2ry`) or title, view active relationships as color-coded badges in the task modal, and click any badge ID to jump straight to that task.

### 🏊 Swim Lanes

Organize your board into horizontal swim lanes for a powerful two-dimensional view of your workflow:

- **Flexible Grouping**: Group tasks by **label**, **label group**, or **priority** — each mode creates distinct swim lane rows
- **Drag & Drop Across Lanes**: Move tasks between columns, lanes, or both in a single gesture — lane assignments update automatically
- **Per-Cell Control**: Collapse/expand individual swim lane cells, entire rows, or workflow columns independently
- **Quick Task Creation**: Add tasks directly to any swim lane cell with automatic label/priority assignment
- **Smart Done Column**: Done tasks are hidden in swim lanes to keep rows compact, while the Done column remains a drag-and-drop target
- **Sticky Headers**: Lane headers stay pinned during horizontal scrolling; workflow headers stay visible during vertical scrolling
- **Mobile Optimized**: Responsive flex layout with sticky lane headers and snap-scrolling columns on mobile
- **Persistent State**: All swim lane settings, collapsed states, and lane assignments are saved per board

Configure swim lanes in **Settings** or use the quick-access toggle in the board controls menu. Lane order is customizable via drag-and-drop in Settings.

### 🔄 Real-Time Multi-Device Sync (New!)

Edit on your phone, see it on your laptop — within seconds. OpenAgile uses **event-sourced sync**: every change is a domain event ordered by a Hybrid Logical Clock (HLC), so independent edits across devices converge without overwriting each other. Tasks, columns, and labels in your browser are projections rebuilt from the event stream.

- **Opt-in, never required** — stays 100% local until you choose to sign in. No account, no cloud, no problem.
- **Live across devices** — an optional PocketBase backend streams remote changes over Server-Sent Events in real time; a catch-up pull on launch means a just-opened device is immediately up to date.
- **At-a-glance sync indicator** — the header shows `Live ●` (synced), `Syncing… (N)` (events draining), `⚠ N unsynced` (retrying), or `Offline` (no network / signed out).
- **Offline-first, always** — the fully-offline experience is never compromised; the cloud is just an optional fan-out, not a dependency.

### Core Features

- **🔗 Clickable URLs in Descriptions**: Paste any `http://` or `https://` link into a task description and it becomes a clickable link on the card — opens in a new tab, no page refresh. A live link preview strip also appears below the description field in the task modal as you type, so you can click URLs without saving first
- **⌨️ Keyboard Shortcuts**: Move quickly through board management and task editing with context-aware keybindings. `Ctrl+B` opens Manage Boards, `Escape` closes active modals and menus, arrow keys navigate board and label lists, and `Enter` activates focused choices. Shortcuts are form-safe, so typing in inputs does not accidentally trigger global actions. See the full [keyboard shortcuts table](docs/user/keybindings.md).
- **🚀 Blazing Fast & Simple**: Lightning-quick performance with a clean, intuitive interface
- **🔍 Powerful Search**: Find tasks instantly by label, title, description, or label groups
- **📊 Productivity Reports**: Visualize your progress with Cumulative Flow Diagrams, weekly lead time, completion stats, same-day completions tracking, and an activity heatmap covering the last 365 days
- **📅 Calendar View**: See tasks by due date on a monthly calendar with overdue highlighting
- **🔔 Smart Notifications**: Get reminded of due dates with customizable advance notices and color-coded countdown timers (urgent/warning thresholds)
- **💻 Local-First**: Works fully offline with no backend required — your data lives in your browser and never leaves your device unless you opt into **Real-Time Multi-Device Sync**
- **🎨 Drag & Drop**: Effortlessly move tasks and columns with optimized performance (handles 300+ tasks)
- **🏷️ Custom Labels & Colors**: Organize with personalized labels, groups, and column colors — label text automatically switches between black and white for readability
- **📋 Multiple Boards**: Create and manage multiple boards with board templates
- **💾 Easy Backup**: Export/import boards as JSON via **Manage Boards** — save backups to your favorite cloud storage (OneDrive, Google Drive, Dropbox)
- **📱 Fully Responsive**: Optimized for mobile and desktop — work from anywhere
- **🌗 Light & Dark Theme**: Toggle between themes with automatic persistence
- **⚡ Collapsible Columns**: Collapse columns to save space while still accepting drag-and-drop
- **⏱️ Due Date Countdown**: Color-coded countdown timers with configurable urgent and warning thresholds
- **🥇 Free & Open Source**: Always free, no hidden costs or subscriptions

## 📸 Screenshots

<div align="center">
   <a href="https://kanvana.com"><img width="1462" height="895" alt="image" src="https://github.com/user-attachments/assets/0d0ade47-e931-4caa-b1ec-4e0148733d5b"></a>
   <br><br>Label Manager
   <a href="https://kanvana.com"><img width="582" height="703" alt="image" src="https://github.com/user-attachments/assets/dec3484f-2156-4163-8b87-b30d2a837c4d"></a>
   <br><br>Control Menu
   <a href="https://kanvana.com"><img width="273" height="556" alt="image" src="https://github.com/user-attachments/assets/2fbc476d-226a-4c5f-a1bd-a2d6713e5c01"></a>
   <br><br>
   <a href="https://kanvana.com"><img width="1273" height="1168" alt="image" src="https://github.com/user-attachments/assets/871a95fb-f7f7-41f8-a1b3-dc74f38ff6a2"></a>

</div>


## 🛡️ Data Security & Persistence

Your data is stored securely in your browser's IndexedDB. It persists across sessions and page reloads. For extra safety, use the built-in export feature to save backups to your preferred cloud storage.

If you opt into **Real-Time Multi-Device Sync**, your event stream is also synced to a PocketBase backend so the same boards stay in step across your devices. Sync is entirely optional — without an account, nothing leaves your browser.

## 🚀 Quick Start

Get up and running in minutes!

### For Users: Try It Now
1. Visit the **[Live Demo](https://kanvana.com)**.
2. Start creating boards, tasks, and labels immediately.
3. Export your data anytime for backup.

### For Developers: Host Your Own
The repository includes a pre-built static site in `dist/`. Simply upload it to any web host.

1. Copy the `dist/` folder.
2. Upload to your web host (e.g., [Hetzner](https://www.hetzner.com/de/webhosting), Netlify, Vercel).
3. Done! Your OpenAgile achieved and the Kanban board is live.

## 🛠️ Development

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation
1. Clone the repo:
   ```bash
   git clone https://github.com/mdiener21/kanvana.git
   cd openagile
   ```

2. Install dependencies:
   ```bash
   cd client
   npm install
   ```

3. Start the dev server:
   ```bash
   cd client
   npm run dev
   ```
   The app will open at `http://localhost:3000`.

### Build for Production
```bash
cd client
npm run build
```
Built files are in `client/dist/`.

### Preview Production Build
```bash
cd client
npm run preview
```

### Releasing a New Version

Releases are cut manually — this project has no GitHub Actions / CI pipelines.

**Step 1 — Keep `CHANGELOG.md` up to date**

Add bullet points under `## [Unreleased]` in `CHANGELOG.md`:

```markdown
## [Unreleased]

### Added
- Some new feature

### Fixed
- Some bug fix
```

**Step 2 — Run the tests locally**

```bash
cd client
npm test
```

**Step 3 — Bump the version and promote the changelog**

```bash
cd client
npm run release:prepare
```

This bumps `package.json`, promotes `## [Unreleased]` to a dated release section, and updates the README version badge.

**Step 4 — Commit, tag and push**

```bash
git add -A
git commit -m "Release vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

### Run Tests

This project uses a three-layer test stack:

- `Vitest` for pure unit tests in `tests/unit/`
- `Vitest` + `jsdom` + `@testing-library/dom` for DOM integration tests in `tests/dom/`, with `MSW` mocking API behavior from `tests/mocks/`
- `node harness/test.mjs` for harness tests

For page-level behavior, use a browser as the manual check — the harness serves the build on port `8787`.

Run the full automated test stack:

```bash
npm test
```

Run only the unit tests:

```bash
npm run test:unit
```

Run only the DOM integration tests:

```bash
npm run test:dom
```

Run the harness tests (from the repository root):

```bash
node harness/test.mjs
```

The detailed strategy, folder layout, and naming convention live in [docs/testing-strategy.md](docs/testing-strategy.md).

## 📚 Documentation

Dive deeper with our comprehensive docs: **[View Documentation](https://github.com/mdiener21/kanvana/tree/main/docs)**

## 🤝 Contributing

We love contributions! Whether it's bug fixes, features, or docs—every star and fork helps grow the community.

- **Star this repo** ⭐ to show your support!
- **Fork and contribute** code or ideas.
- **Report issues** for bugs or suggestions.

## 📄 License

Licensed under the MIT License. See [LICENSE.md](LICENSE.md) for details.

---

**Made with ❤️ for productivity enthusiasts. Star us on GitHub to stay updated!**
