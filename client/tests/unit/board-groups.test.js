import { beforeEach, describe, expect, test } from 'vitest';
import { resetLocalStorage } from './setup.js';
import {
  BOARD_GROUP_KEY,
  GROUPS_KEY,
  assignBoardToGroup,
  createGroup,
  deleteGroup,
  getGroupIdForBoard,
  listGroups,
  pruneBoardGroups,
  readBoardGroupMap,
  renameGroup,
  setGroupCollapsed,
  toggleGroupCollapsed
} from '../../src/modules/board-groups.js';

beforeEach(() => {
  resetLocalStorage();
});

describe('group store', () => {
  test('starts with no groups', () => {
    expect(listGroups()).toEqual([]);
  });

  test('createGroup persists id, name, order and collapsed under kanvana:groups', () => {
    const group = createGroup('Sprint 1');

    expect(group.id).toBeTruthy();
    expect(group.name).toBe('Sprint 1');
    expect(group.order).toBe(1);
    expect(group.collapsed).toBe(false);
    expect(JSON.parse(localStorage.getItem(GROUPS_KEY))).toEqual([group]);
  });

  test('createGroup appends in order', () => {
    createGroup('First');
    createGroup('Second');

    const groups = listGroups();
    expect(groups.map((group) => group.name)).toEqual(['First', 'Second']);
    expect(groups.map((group) => group.order)).toEqual([1, 2]);
  });

  test('createGroup falls back to a default name', () => {
    expect(createGroup('   ').name).toBe('New Group');
  });

  test('renameGroup trims and persists the new name', () => {
    const group = createGroup('Old');
    expect(renameGroup(group.id, '  Renamed  ')).toBe(true);
    expect(listGroups()[0].name).toBe('Renamed');
  });

  test('renameGroup rejects unknown groups and empty names', () => {
    const group = createGroup('Old');
    expect(renameGroup('missing', 'Nope')).toBe(false);
    expect(renameGroup(group.id, '   ')).toBe(false);
    expect(listGroups()[0].name).toBe('Old');
  });

  test('toggleGroupCollapsed flips and persists the collapsed flag', () => {
    const group = createGroup('Sprint');
    expect(toggleGroupCollapsed(group.id)).toBe(true);
    expect(listGroups()[0].collapsed).toBe(true);
    expect(toggleGroupCollapsed(group.id)).toBe(true);
    expect(listGroups()[0].collapsed).toBe(false);
  });

  test('setGroupCollapsed is a no-op for unknown groups', () => {
    expect(setGroupCollapsed('missing', true)).toBe(false);
    expect(listGroups()).toEqual([]);
  });

  test('deleteGroup removes the group and unassigns its boards', () => {
    const group = createGroup('Sprint');
    assignBoardToGroup('board-1', group.id);
    assignBoardToGroup('board-2', group.id);

    expect(deleteGroup(group.id)).toBe(true);
    expect(listGroups()).toEqual([]);
    expect(readBoardGroupMap()).toEqual({});
  });

  test('deleteGroup ignores unknown ids', () => {
    expect(deleteGroup('missing')).toBe(false);
  });

  test('listGroups ignores malformed records and sorts by order', () => {
    localStorage.setItem(GROUPS_KEY, JSON.stringify([
      { id: 'b', name: 'B', order: 5, collapsed: false },
      { name: 'no id' },
      null,
      { id: 'a', name: 'A', order: 2, collapsed: true }
    ]));

    const groups = listGroups();
    expect(groups.map((group) => group.id)).toEqual(['a', 'b']);
    expect(groups[0].collapsed).toBe(true);
  });

  test('listGroups survives invalid JSON', () => {
    localStorage.setItem(GROUPS_KEY, '{not json');
    expect(listGroups()).toEqual([]);
  });
});

describe('board → group mapping', () => {
  test('assignBoardToGroup persists the mapping under kanvana:boardGroup', () => {
    const group = createGroup('Sprint');
    expect(assignBoardToGroup('board-1', group.id)).toBe(true);

    expect(JSON.parse(localStorage.getItem(BOARD_GROUP_KEY))).toEqual({ 'board-1': group.id });
    expect(getGroupIdForBoard('board-1')).toBe(group.id);
  });

  test('assignBoardToGroup with a null group removes the mapping (Ungrouped)', () => {
    const group = createGroup('Sprint');
    assignBoardToGroup('board-1', group.id);
    assignBoardToGroup('board-1', null);

    expect(readBoardGroupMap()).toEqual({});
    expect(getGroupIdForBoard('board-1')).toBeNull();
  });

  test('assignBoardToGroup falls back to Ungrouped for unknown group ids', () => {
    assignBoardToGroup('board-1', 'does-not-exist');
    expect(readBoardGroupMap()).toEqual({});
  });

  test('getGroupIdForBoard returns null for unknown boards', () => {
    expect(getGroupIdForBoard('missing')).toBeNull();
    expect(getGroupIdForBoard('')).toBeNull();
  });

  test('pruneBoardGroups drops mappings for boards that no longer exist', () => {
    const group = createGroup('Sprint');
    assignBoardToGroup('board-1', group.id);
    assignBoardToGroup('board-2', group.id);

    expect(pruneBoardGroups(['board-1'])).toBe(true);
    expect(readBoardGroupMap()).toEqual({ 'board-1': group.id });
    expect(pruneBoardGroups(['board-1'])).toBe(false);
  });
});
