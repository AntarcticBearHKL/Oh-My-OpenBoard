import { test, expect } from 'vitest';
import {
  NO_GROUP_LANE_KEY,
  NO_GROUP_LANE_LABEL,
  SWIMLANE_GROUP_BY_LABEL,
  SWIMLANE_GROUP_BY_LABEL_GROUP,
  SWIMLANE_GROUP_BY_PRIORITY,
  SWIMLANE_HIDDEN_DONE_COLUMN_ID
} from '../../src/modules/swimlane-lane-model.js';
import {
  buildBoardGrid,
  getVisibleTasksForLane,
  getSwimLaneValue,
  groupTasksBySwimLane,
  moveTask
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
    { id: 't1', column: 'todo', order: 1, labels: ['label-a'] },
    { id: 't2', column: 'inprogress', order: 1, labels: ['label-b'] },
    { id: 't3', column: 'done', order: 1, labels: [] }
  ];

  const grouped = groupTasksBySwimLane(tasks, SWIMLANE_GROUP_BY_LABEL, labels);

  expect(grouped.map((lane) => lane.value)).toEqual(['Project A', 'Project B', NO_GROUP_LANE_LABEL]);
  expect(grouped.find((lane) => lane.value === 'Project A')?.tasks.map((task) => task.id)).toEqual(['t1']);
  expect(grouped.find((lane) => lane.value === NO_GROUP_LANE_LABEL)?.tasks.map((task) => task.id)).toEqual(['t3']);
});

test('groupTasksBySwimLane sorts priority lanes in workflow order', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, priority: 'low' },
    { id: 't2', column: 'todo', order: 2, priority: 'urgent' },
    { id: 't3', column: 'todo', order: 3, priority: 'medium' },
    { id: 't4', column: 'todo', order: 4, priority: 'none' }
  ];

  const grouped = groupTasksBySwimLane(tasks, SWIMLANE_GROUP_BY_PRIORITY, labels);
  expect(grouped.map((lane) => lane.value)).toEqual(['Urgent', 'Medium', 'Low', 'None']);
});

test('groupTasksBySwimLane includes one lane per label in the selected group', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, labels: ['label-a'] },
    { id: 't2', column: 'done', order: 1, labels: [] }
  ];

  const grouped = groupTasksBySwimLane(tasks, SWIMLANE_GROUP_BY_LABEL_GROUP, labels, 'Projects');
  expect(grouped.map((lane) => lane.value)).toEqual(['Project A', 'Project B', NO_GROUP_LANE_LABEL]);
  expect(grouped.find((lane) => lane.value === 'Project B')?.tasks).toEqual([]);
});

test('buildBoardGrid places tasks into the correct lane and column cells', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, labels: ['label-a'] },
    { id: 't2', column: 'inprogress', order: 2, labels: ['label-a'] },
    { id: 't3', column: 'done', order: 1, labels: [] }
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
  const todoTasks = [{ id: 't1', column: 'todo', order: 1, labels: ['label-a'] }];
  const doneTasks = [{ id: 't2', column: 'done', order: 1, labels: [] }];

  expect(getVisibleTasksForLane(todoTasks, 'todo').map((task) => task.id)).toEqual(['t1']);
  expect(getVisibleTasksForLane(doneTasks, SWIMLANE_HIDDEN_DONE_COLUMN_ID)).toEqual([]);
});



