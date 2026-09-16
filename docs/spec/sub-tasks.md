# Sub-tasks (Retired)

> **Status: RETIRED — the current task model has no sub-tasks.**
> The `subTasks` field on a task, the modal fieldset, the card donut indicator, and the
> import/export handling were removed when the task model was slimmed. The checklist role is
> now covered by **acceptance criteria** (`acceptanceCriteria`), which are the definition of
> done — see [tasks.md](tasks.md). Older exports that still carry `subTasks` import cleanly
> with the field dropped.
>
> This document is kept only so existing links keep resolving; it does not describe current
> behaviour.

## What replaced it

- Acceptance criteria are an inline checklist with a `done` flag per item and a `done / total` progress shown on the card.
- Breaking a task into steps is expressed as acceptance criteria, not as sub-tasks.
