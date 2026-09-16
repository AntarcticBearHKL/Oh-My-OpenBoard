# Settings

## Scope

- Settings are per active board
- Settings persist in `kanbanBoard:<boardId>:settings`

## Available Settings

- `showChangeDate` — persisted toggle for the updated timestamp; the slimmed task card no longer renders a change-date footer, so the toggle currently has no visible effect
- `locale` — locale used to format timestamps (comments, annotations, column summaries)
- `columnSummaries` — per-column agent summaries, keyed by column id

## Swim Lane Settings

- Enable or disable swim lanes
- Choose grouping mode: `label` or `label-group`
- When `label-group` is selected, choose the specific label group to expand into lanes
- Persist swim lane row collapse state, per-cell collapse state, and the custom lane order
- Explain in the UI that done-column cards stay hidden while Finished remains a valid drop target

## Defaults

- Locale defaults to the browser locale
