# Swim Lanes

## Overview

- Swim lanes are a per-board view grouped by label or label group
- A quick-access toggle in the board controls menu allows enabling/disabling swim lanes directly, without opening the Settings modal
- The full swim lane configuration (grouping mode and label group selection) remains in Settings
- The board becomes a grid of swim lane rows by workflow columns
- Swim lanes can be toggled on and off without a page reload

## Grouping Modes

- `label` - lane assignment uses `task.swimlaneLabelId`; tasks without one appear in `No Group`
- `label-group` - the user selects one label group, then each label value in that group becomes a lane; lane assignment uses `task.swimlaneLabelId` and records the selected group in `task.swimlaneLabelGroup`
- Tasks with no matching lane value are shown in `No Group`

## Lane Ordering

- Lane order is customizable via drag-and-drop in the Settings modal
- When swim lanes are enabled, a reorderable list shows all lanes for the current grouping mode
- Custom order is stored as `swimLaneOrder` in per-board settings (array of lane keys)
- An empty order array falls back to default sorting (alphabetical by lane label)
- Changing the grouping mode or label group resets the custom order
- Lanes not present in the saved order (e.g. newly created labels) appear at the end in default order

## Lane Assignment Rules

- The UI does not assign a task to a lane: cards are not draggable and there is no lane picker
- A task's lane assignment is stored as `swimlaneLabelId` (plus `swimlaneLabelGroup` in `label-group` mode); it survives import/export, and tasks without one appear in `No Group`
- Tasks do not carry a label list; the swim lane assignment is the only label reference on a task

## Layout Behavior

- Workflow column headers remain visible while scrolling vertically through the swim lane grid
- Each lane renders a full-width header above its row of cells
- Lane headers stay sticky on the left during horizontal scrolling
- Each lane row contains one cell per workflow column

## Finished-Column Behavior

- Expanded swim lane rows hide task cards already in the Finished column to keep lanes compact

## Collapse and Expand Controls

- Each swim lane row has a chevron-only collapse toggle; the button border and background appear only on hover
- Collapsed rows keep the lane header visible and show lane name plus active and done task counts
- Workflow columns remain collapsible while swim lanes are enabled
- Individual swim lane cells can be collapsed independently through a small chevron toggle
- Cell collapse state is persisted with composite keys in settings
- Row collapse and column collapse take precedence over cell collapse

## Task Creation

- Swim lane cells offer no manual add control except in the Backlog column, where a human can add a task by hand; the other columns are driven by agents

## Mobile Behavior

- Swim lane rows switch from CSS grid to flex layout on mobile
- Lane headers remain sticky on the left edge while columns use snap-scrolling
- Expanded lane headers show lane names vertically to preserve column width
- Collapsed rows revert to a horizontal full-width bar
