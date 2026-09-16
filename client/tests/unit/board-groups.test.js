import { beforeEach, describe, expect, test } from 'vitest';
import { resetLocalStorage } from './setup.js';
import {
  BOARD_GROUP_KEY,
  GROUPS_KEY,
  assignBoardToGroup,
  createGroup,
  deleteGroup,
  ensureBoardsGrouped,
  getGroupIdForBoard,
  listGroups,
  pruneBoardGroups,
  readBoardGroupMap,
  setGroupCollapsed,
  setGroupPrefixCollapsed,
  toggleGroupCollapsed,
  toggleGroupPrefixCollapsed
} from '../../src/modules/board-groups.js';

beforeEach(() => {
  resetLocalStorage();
});

describe('group store', () => {
  test('starts with no groups', () => {
    expect(listGroups()).toEqual([]);
  });

  test('createGroup persists a derived name, order, collapsed and prefixCollapsed under openagile:groups', () => {
    const group = createGroup();

    expect(group.id).toBeTruthy();
    expect(group.name).toBe('Iterations 1');
    expect(group.order).toBe(1);
    expect(group.collapsed).toBe(false);
    expect(group.prefixCollapsed).toBe(false);
    expect(JSON.parse(localStorage.getItem(GROUPS_KEY))).toEqual([group]);
  });

  test('createGroup names each new group after its order', () => {
    createGroup();
    createGroup();

    const groups = listGroups();
    expect(groups.map((group) => group.name)).toEqual(['Iterations 1', 'Iterations 2']);
    expect(groups.map((group) => group.order)).toEqual([1, 2]);
  });

  test('listGroups derives names from the stored order, not a stored name', () => {
    localStorage.setItem(GROUPS_KEY, JSON.stringify([
      { id: 'a', name: 'Hand typed', order: 2, collapsed: false },
      { id: 'b', name: 'Also typed', order: 1, collapsed: true }
    ]));

    const groups = listGroups();
    expect(groups.map((group) => group.id)).toEqual(['b', 'a']);
    expect(groups.map((group) => group.name)).toEqual(['Iterations 1', 'Iterations 2']);
    expect(groups.map((group) => group.order)).toEqual([1, 2]);
  });

  test('toggleGroupCollapsed flips and persists the collapsed flag', () => {
    const group = createGroup();
    expect(toggleGroupCollapsed(group.id)).toBe(true);
    expect(listGroups()[0].collapsed).toBe(true);
    expect(toggleGroupCollapsed(group.id)).toBe(true);
    expect(listGroups()[0].collapsed).toBe(false);
  });

  test('setGroupCollapsed is a no-op for unknown groups', () => {
    expect(setGroupCollapsed('missing', true)).toBe(false);
    expect(listGroups()).toEqual([]);
  });

  test('toggleGroupPrefixCollapsed flips and persists the prefix flag', () => {
    const group = createGroup();
    expect(group.prefixCollapsed).toBe(false);
    expect(toggleGroupPrefixCollapsed(group.id)).toBe(true);
    expect(listGroups()[0].prefixCollapsed).toBe(true);
    expect(toggleGroupPrefixCollapsed(group.id)).toBe(true);
    expect(listGroups()[0].prefixCollapsed).toBe(false);
  });

  test('setGroupPrefixCollapsed is a no-op for unknown groups', () => {
    expect(setGroupPrefixCollapsed('missing', true)).toBe(false);
    expect(listGroups()).toEqual([]);
  });

  test('deleteGroup removes the group and unassigns its boards', () => {
    const group = createGroup();
    assignBoardToGroup('board-1', group.id);
    assignBoardToGroup('board-2', group.id);

    expect(deleteGroup(group.id)).toBe(true);
    expect(listGroups()).toEqual([]);
    expect(readBoardGroupMap()).toEqual({});
  });

  test('deleteGroup ignores unknown ids', () => {
    expect(deleteGroup('missing')).toBe(false);
  });

  test('deleteGroup re-derives the names and order of the groups that remain', () => {
    createGroup();
    const middle = createGroup();
    createGroup();

    expect(deleteGroup(middle.id)).toBe(true);

    const groups = listGroups();
    expect(groups.map((group) => group.name)).toEqual(['Iterations 1', 'Iterations 2']);
    expect(groups.map((group) => group.order)).toEqual([1, 2]);
  });

  test('ensureBoardsGrouped attaches ungrouped boards to the last group', () => {
    createGroup();
    const last = createGroup();

    expect(ensureBoardsGrouped(['board-1', 'board-2'])).toBe(last.id);
    expect(readBoardGroupMap()).toEqual({ 'board-1': last.id, 'board-2': last.id });
  });

  test('ensureBoardsGrouped creates a group when none exists', () => {
    const targetId = ensureBoardsGrouped(['board-1', 'board-2']);

    expect(listGroups()).toHaveLength(1);
    expect(listGroups()[0].name).toBe('Iterations 1');
    expect(readBoardGroupMap()).toEqual({ 'board-1': targetId, 'board-2': targetId });
  });

  test('ensureBoardsGrouped ignores boards that are already grouped', () => {
    const group = createGroup();
    assignBoardToGroup('board-1', group.id);

    expect(ensureBoardsGrouped(['board-1'])).toBeNull();
    expect(readBoardGroupMap()).toEqual({ 'board-1': group.id });
    expect(listGroups()).toHaveLength(1);
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
  test('assignBoardToGroup persists the mapping under openagile:boardGroup', () => {
    const group = createGroup();
    expect(assignBoardToGroup('board-1', group.id)).toBe(true);

    expect(JSON.parse(localStorage.getItem(BOARD_GROUP_KEY))).toEqual({ 'board-1': group.id });
    expect(getGroupIdForBoard('board-1')).toBe(group.id);
  });

  test('assignBoardToGroup with a null group removes the mapping (Ungrouped)', () => {
    const group = createGroup();
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
    const group = createGroup();
    assignBoardToGroup('board-1', group.id);
    assignBoardToGroup('board-2', group.id);

    expect(pruneBoardGroups(['board-1'])).toBe(true);
    expect(readBoardGroupMap()).toEqual({ 'board-1': group.id });
    expect(pruneBoardGroups(['board-1'])).toBe(false);
  });
});
