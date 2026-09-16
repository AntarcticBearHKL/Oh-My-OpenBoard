import { test, expect } from 'vitest';
import {
  NO_GROUP_LANE_KEY,
  NO_GROUP_LANE_LABEL,
  SWIMLANE_GROUP_BY_LABEL,
  SWIMLANE_GROUP_BY_LABEL_GROUP,
  SWIMLANE_HIDDEN_DONE_COLUMN_ID
} from '../../src/modules/swimlane-lane-model.js';
import {
  buildBoardGrid,
  getVisibleTasksForLane,
  groupTasksBySwimLane
} from '../../src/modules/swimlanes.js';

const labels = [
  { id: 'label-a', name: 'Project A', color: '#2563eb', group: 'Projects' },
  { id: 'label-b', name: 'Project B', color: '#16a34a', group: 'Projects' },
  { id: 'label-c', name: 'Ops', color: '#f59e0b', group: 'Workstreams' }
];

const columns = [
  { id: 'todo', name: 'To Do', order: 1 },
  { id: 'inprogress', name: 'In Progress', order: 2 },
  { id: 'done', name: 'Done', order: 3 }
];

test('groupTasksBySwimLane groups tasks into distinct lanes plus No Group', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, swimlaneLabelId: 'label-a' },
    { id: 't2', column: 'inprogress', order: 1, swimlaneLabelId: 'label-b' },
    { id: 't3', column: 'done', order: 1 }
  ];

  const grouped = groupTasksBySwimLane(tasks, SWIMLANE_GROUP_BY_LABEL, labels);

  expect(grouped.map((lane) => lane.value)).toEqual(['Project A', 'Project B', NO_GROUP_LANE_LABEL]);
  expect(grouped.find((lane) => lane.value === 'Project A')?.tasks.map((task) => task.id)).toEqual(['t1']);
  expect(grouped.find((lane) => lane.value === NO_GROUP_LANE_LABEL)?.tasks.map((task) => task.id)).toEqual(['t3']);
});

test('groupTasksBySwimLane ignores tasks whose lane marker is unknown', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, swimlaneLabelId: 'missing-label' }
  ];

  const grouped = groupTasksBySwimLane(tasks, SWIMLANE_GROUP_BY_LABEL, labels);
  expect(grouped.map((lane) => lane.value)).toEqual([NO_GROUP_LANE_LABEL]);
});

test('groupTasksBySwimLane includes one lane per label in the selected group', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, swimlaneLabelId: 'label-a' },
    { id: 't2', column: 'done', order: 1 }
  ];

  const grouped = groupTasksBySwimLane(tasks, SWIMLANE_GROUP_BY_LABEL_GROUP, labels, 'Projects');
  expect(grouped.map((lane) => lane.value)).toEqual(['Project A', 'Project B', NO_GROUP_LANE_LABEL]);
  expect(grouped.find((lane) => lane.value === 'Project B')?.tasks).toEqual([]);
});

test('buildBoardGrid places tasks into the correct lane and column cells', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, swimlaneLabelId: 'label-a' },
    { id: 't2', column: 'inprogress', order: 2, swimlaneLabelId: 'label-a' },
    { id: 't3', column: 'done', order: 1 }
  ];
  const lanes = groupTasksBySwimLane(tasks, SWIMLANE_GROUP_BY_LABEL, labels);
  const grid = buildBoardGrid(columns, lanes, tasks, SWIMLANE_GROUP_BY_LABEL, labels);

  const projectALane = grid.find((lane) => lane.value === 'Project A');
  const noGroupLane = grid.find((lane) => lane.key === NO_GROUP_LANE_KEY);

  expect(projectALane?.cells.todo.map((task) => task.id)).toEqual(['t1']);
  expect(projectALane?.cells.inprogress.map((task) => task.id)).toEqual(['t2']);
  expect(projectALane?.cells.done).toEqual([]);
  expect(noGroupLane?.cells.done.map((task) => task.id)).toEqual(['t3']);
});

test('getVisibleTasksForLane hides done-column tasks but keeps active columns visible', () => {
  const todoTasks = [{ id: 't1', column: 'todo', order: 1, swimlaneLabelId: 'label-a' }];
  const doneTasks = [{ id: 't2', column: 'done', order: 1 }];

  expect(getVisibleTasksForLane(todoTasks, 'todo').map((task) => task.id)).toEqual(['t1']);
  expect(getVisibleTasksForLane(doneTasks, SWIMLANE_HIDDEN_DONE_COLUMN_ID)).toEqual([]);
});
