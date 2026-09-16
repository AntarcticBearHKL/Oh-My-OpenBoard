# Labels

## Label Model and Grouping

- Labels have `id`, `name`, `color`, and optional `group`
- Labels are board-level entities; tasks do not carry a list of labels
- Groups are simple strings and are not stored as a separate entity
- Label text color is automatically set to black or white based on perceived luminance of the background color (`(R×299 + G×587 + B×114) / 1000`; threshold 150 of 255 favors white text on mid-tones)
- Labels are consumed by swim lane grouping: in `label` mode each label becomes a lane, in `label-group` mode the labels of the selected group become lanes

## Manage Labels Modal

- Dedicated management modal lists labels with color swatch, name, and edit/delete actions
- Search filters labels by name or group using case-insensitive substring matching
- Labels are grouped in accordion sections by label group, with `Ungrouped` for labels without a group
- The first accordion section is expanded by default and sections toggle independently

## Create and Edit

- Label create/edit form includes name, group, color picker, and editable hex field
- Group input offers datalist autocomplete from existing groups
- Color picker and hex field stay synchronized bidirectionally
- Invalid hex values show inline validation and block save

## Swim Lane Use

- A task's lane assignment is stored as `swimlaneLabelId` (plus `swimlaneLabelGroup` in `label-group` mode); it is a single value, not a label list
- Assigning a lane happens by dragging the task into that swim lane row
- Deleting a label tombstones it: it disappears from the Manage Labels list and from swim lane grouping, and tasks that referenced it fall back to `No Group`

## Delete Behavior

- Deleting a label requires confirmation
- Deleting a label does not rewrite task records; the lane falls back to `No Group`
