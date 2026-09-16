# Data Models

## Board Model

```javascript
{
  id: "uuid",
  name: "Board Name",
  createdAt: "YYYY-MM-DDTHH:MM:SSZ"
}
```

## Task Model

```javascript
{
  id: "uuid",
  key: "BRD-1",
  title: "task title",
  description: "optional longer description",
  type: "story" | "bug" | "task" | "spike",
  estimate: number | null,
  assignee: "agent or human name",
  parentId: "uuid" | null,
  acceptanceCriteria: [
    { id: "uuid", text: "criterion text", done: boolean }
  ],
  comments: [
    { id: "uuid", author: "You", text: "note text", at: "YYYY-MM-DDTHH:MM:SSZ" }
  ],
  annotations: [
    { id: "uuid", text: "note text", author: "human", at: "YYYY-MM-DDTHH:MM:SSZ" }
  ],
  claimedBy: "agent-id",
  claimedAt: "YYYY-MM-DDTHH:MM:SSZ",
  column: "column-uuid",
  order: number,
  swimlaneLabelId: "label-uuid" | "",
  swimlaneLabelGroup: "Group Name" | "",
  creationDate: "YYYY-MM-DDTHH:MM:SSZ",
  changeDate: "YYYY-MM-DDTHH:MM:SSZ",
  doneDate: "YYYY-MM-DDTHH:MM:SSZ",
  blockedAt: "YYYY-MM-DDTHH:MM:SSZ" | null,
  blockedReason: "",
  columnHistory: [
    { column: "column-uuid", at: "YYYY-MM-DDTHH:MM:SSZ" }
  ],
  relationships: [
    { type: "prerequisite" | "dependent" | "related", targetTaskId: "uuid" }
  ],
  deleted: boolean
}
```

### Task Field Notes

- `title` is the only required field; a task needs only a title and a description to be created
- `type` is one of `story`, `bug`, `task`, `spike` and defaults to `task`; `estimate` is a whole number of story points or `null` when unestimated — these two are the only planning fields
- `acceptanceCriteria` is the definition of done: each entry is `{ id, text, done }`, and the task is only Finished when every criterion is done
- `comments` is the thread the human writes and the agent answers; each entry is `{ id, author, text, at }`
- `annotations` holds the human's quick notes to the subagent; each entry is `{ id, text, author, at }`
- `assignee` is who the task is assigned to; `claim_task` sets it when empty, and `claimedBy`/`claimedAt` record the claim (releasing keeps `claimedAt` so the claim duration stays derivable)
- `creationDate` is kept in storage for lead time and velocity, but is never shown in the UI
- `changeDate` updates on task save and on column changes; it drives the five-minute claim sync window
- `doneDate` exists only while the task is in the Finished column
- `blockedAt`/`blockedReason` record why a task is blocked; leaving Blocked clears both
- `columnHistory` is appended when a task changes columns and powers cumulative-flow reporting
- `swimlaneLabelId`/`swimlaneLabelGroup` preserve explicit swim lane assignment metadata
- `key` is the per-board `PREFIX-N` identifier shown on the card and used by relationship search
- `relationships` defaults to `[]`; each entry stores a `type` (`prerequisite`, `dependent`, or `related`) and the UUID `targetTaskId` of the linked task; both sides of a relationship are always stored (bidirectional)
- `deleted` marks internal tombstones/deleted records; normal read functions filter `deleted: true`
- The task carries no `priority`, `dueDate`, task `labels`, `subTasks`, `attachments`, or `customFields`; older exported files that still carry them are read with those fields dropped on import
- The task no longer carries an inline `activityLog` — the audit-trail feature was removed (issue #110); mutation history now lives in the event stream (see [ADR-0004](../adr/0004-event-sourced-sync.md))

## Column Model

```javascript
{
  id: "uuid",
  name: "Column Name",
  color: "#hexcolor",
  role: "done" | "",
  collapsed: boolean,
  wipLimit: number,
  order: number,
  deleted: boolean
}
```

### Column Notes

- `collapsed` defaults to `false`; `wipLimit` defaults to `0` (unlimited) and is advisory only
- All column IDs are UUIDs
- The column with `role: "done"` is permanent and cannot be deleted
- Legacy imported or migrated column id `done` is remapped to a UUID-backed column with `role: "done"`
- `deleted` marks internal tombstones/deleted records

### Fixed Columns

The board always has exactly four columns — `Backlog`, `In Progress`, `Blocked`, `Finished` — with
fixed ids and order:

- Backlog holds everything not started
- In Progress is what an agent is actively working; tasks there are read-only
- Blocked is work an agent could not finish and that needs a human decision, or work stuck on a resource conflict
- Finished is completed work; it carries `role: "done"` and is the source for completion and cycle-time statistics

`name` is display-only: the fixed definitions are reimposed on every board at load time, so renaming
a fixed column's display label needs no data migration.

## Label Model

```javascript
{
  id: "uuid",
  name: "Label Name",
  color: "#hexcolor",
  group: "Group Name",
  deleted: boolean
}
```

### Label Notes

- `name` has a maximum length of 40 characters
- All label IDs are UUIDs
- `group` is optional and defaults to an empty string
- Label groups are strings, not separate persisted entities
- Labels are board-level entities; tasks do not carry a label list. Labels are consumed by swim lane grouping (`swimlaneLabelId`/`swimlaneLabelGroup` on the task)
- `deleted` marks internal tombstones/deleted records

## Relationship Model

Relationships are stored inline in the `relationships` array on each task. Both sides of every relationship are always stored (bidirectional).

```javascript
{
  type: "prerequisite" | "dependent" | "related",
  targetTaskId: "uuid"
}
```

## Domain Event Model

> The standalone `ActivityLogEntry` model (inline task `activityLog` + board events) was **removed**
> with the audit-trail feature (issue #110). Mutations are now recorded as **domain events** in the
> event-sourced stream and persisted to the PocketBase `events` collection (below). See
> [ADR-0004](../adr/0004-event-sourced-sync.md) and `backend-storage-pb.md` for the event schema,
> HLC ordering, and reducer.

## Settings Model

Board settings are stored per board and include timestamp visibility, locale, and swim lane state.

Key persisted fields include:

- `showChangeDate`
- `locale`
- `columnSummaries`
- `swimLanesEnabled`
- `swimLaneGroupBy`
- `swimLaneLabelGroup`
- `swimLaneCollapsedKeys`
- `swimLaneCellCollapsedKeys`
- `swimLaneOrder`

## PocketBase Collections

Access rules on all operations: `owner = @request.auth.id`. Most collections share `owner` (relation → users) and `local_id` (text) fields.

> **Active sync collections are `events` and `snapshots`** (event sourcing — see
> [ADR-0004](../adr/0004-event-sourced-sync.md) and `backend-storage-pb.md`). The per-entity
> collections below — **`tasks`, `columns`, `labels`, `task_relationships`** — are the legacy
> whole-record LWW mirrors; they are **write-locked and deprecated** (removal tracked in issue #116).
> `boards` and `users` remain active. The legacy `tasks` mirror predates the slimmed task model, so
> its obsolete columns are omitted here — no code reads or writes it.

**boards**
| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| local_id | text | local UUID |
| name | text | required |
| settings | json | per-board settings blob |
| created_at | text | ISO timestamp |

**columns**
| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| board | relation → boards | required; cascade delete |
| local_id | text | local UUID |
| name | text | required |
| color | text | hex color |
| order | number | |
| collapsed | bool | |
| role | text | `"done"` for the Finished column; empty otherwise |
| deleted | bool | tombstone/deleted-record flag |

**labels**
| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| board | relation → boards | required; cascade delete |
| local_id | text | local UUID |
| name | text | required |
| color | text | hex color |
| group | text | optional label group |
| deleted | bool | tombstone/deleted-record flag |

**task_relationships**

Stores directed relationship edges. Both directions are stored as separate records (mirrors the bidirectional JS model). `local_id` is a composite key `"${taskLocalId}::${targetTaskLocalId}"` used for sync deduplication.

| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| board | relation → boards | required; cascade delete |
| task | relation → tasks | required; cascade delete |
| target_task | relation → tasks | no cascade; cleaned up on next sync push |
| relationship_type | text | prerequisite/dependent/related; required |
| local_id | text | composite dedup key |

**events**

The event-sourced domain-event log — the source of truth for sync (migration `1746100010`, see
[ADR-0004](../adr/0004-event-sourced-sync.md)). Records are immutable (no update rule). `board` is
**text** (a client-side local UUID, not a relation) so board-scoped events validate; `entity_id`
generalises the old `task` relation; `hlc` gives total ordering; `details` was renamed to `payload`.

| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| hlc | json | Hybrid Logical Clock stamp; reducer sorts by this on replay |
| scope | text | `board` or `global` |
| entity_id | text | id of the entity the event applies to (replaces the `task` relation) |
| board | text | local board UUID (text, **not** a relation) |
| event_type | text | required |
| at | text | ISO timestamp; required |
| actor_type | text | human/agent/user; required |
| actor_id | text | null for human; non-empty for agent/user |
| payload | json | event-specific data (formerly `details`) |
| local_id | text | event UUID for dedup; entries without one are not synced |

**snapshots**

Client-computed board/global projection snapshots used to bound replay and GC old events (W1, immutable inserts).

| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| board_id | text | local board UUID; null for global-scope snapshots |
| hlc | json | HLC up to which the snapshot folds events |
| payload | file | gzipped projected state |
| local_id | text | snapshot UUID for dedup |
