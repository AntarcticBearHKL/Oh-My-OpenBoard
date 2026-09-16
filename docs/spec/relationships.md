# Relationships

## Overview

Tasks can optionally be linked to one or more other tasks using typed relationships. Relationships communicate dependencies and connections between work items. They are optional — tasks without relationships behave exactly as before.

## Relationship Types

| Type | Meaning | Inverse |
|---|---|---|
| `prerequisite` | Another task must be completed before this one can begin | `dependent` |
| `dependent` | This task is needed by another task before that task can begin | `prerequisite` |
| `related` | A general connection between two tasks without implying order | `related` |

## Bidirectional Sync

- Relationships are always stored on **both** tasks in a pair.
- Adding a relationship on Task A automatically creates the inverse on Task B.
- Removing a relationship on Task A automatically removes the inverse on Task B.
- Inverse pairs: `prerequisite` ↔ `dependent`, `related` ↔ `related`.
- All 3 types are manually selectable. Adding `dependent → B` on Task A auto-creates `prerequisite → A` on Task B — equivalent to adding `prerequisite → B` on Task B directly.

## One Relationship Per Pair

- A task pair can have at most one relationship type at a time.
- If a relationship already exists between Task A and Task B, adding a new type replaces the existing one and updates both sides atomically.

## Data Model

Each task stores its relationships as an array on the task object:

```javascript
{
  // ...other task fields
  relationships: [
    { type: "prerequisite" | "dependent" | "related", targetTaskId: "uuid" }
  ]
}
```

- `type` — one of `prerequisite`, `dependent`, `related`
- `targetTaskId` — UUID of the linked task
- Default: `[]` (empty array) for all tasks, including existing tasks on load
- Deduplication: only one entry per `targetTaskId` is allowed

## Short ID Format

- Tasks are identified in relationship output using a short ID: `#` followed by the last 5 characters of the task UUID.
- Example: a task with ID `a1b2c3d4-e5f6-7890-abcd-ef1234ae2ry5` displays as `#ae2ry`.
- Short IDs are display-only; storage always uses the full UUID.

## Card Display

- Task cards do not show a relationship indicator.
- Relationships are not editable in the task dialog either; they are managed through the relationship task tools (`add_relationship`, `remove_relationship`).
- Editing a task in the dialog leaves its existing relationships untouched.

## Where Relationships Are Edited

- The task edit dialog has no Relationships fieldset. It shows the title, the description and the notes-to-the-agent list only.
- Relationships are created and removed through the task tools (`add_relationship` with a type and a target task, `remove_relationship`), which apply the same bidirectional sync described above.
- The form submit path does not carry a relationships payload, so saving title, description or notes never rewrites relationships.
- The short-ID display format above is used wherever relationships are surfaced externally.

## Normalization

- `normalizeRelationships(value)` in `normalize.js` ensures the field is always a valid array.
- Entries with missing or invalid `type`, or missing/empty `targetTaskId`, are dropped.
- Duplicate `targetTaskId` entries are deduplicated (first occurrence kept).
- Applied on load in `loadTasks()` to handle existing tasks and imported data.

## Import / Export

- `relationships` is included in board JSON export as part of each task object.
- On import, `normalizeRelationships()` is applied to each task's relationships field.
- Bidirectional sync is not re-applied on import — both sides are expected to already be present in the exported data.

## Update Requirements

Update this file when you change:

- relationship types or their inverses
- bidirectional sync rules
- short ID format or display
- card indicator behavior
- relationship tool behavior or validation
- data model shape or normalization rules
- import/export handling for relationships
