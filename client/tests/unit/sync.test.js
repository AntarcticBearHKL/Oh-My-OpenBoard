import { vi, describe, it, expect, beforeEach } from 'vitest';

// Hoisted mock objects — run before vi.mock factories
const mockAuthStore = vi.hoisted(() => ({
  token: null,
  record: null,
  isValid: false,
  clear: vi.fn(),
  save: vi.fn(),
  onChange: vi.fn(),
}));

const mockCollection = vi.hoisted(() => ({
  authWithPassword: vi.fn(),
  authWithOAuth2: vi.fn(),
  authRefresh: vi.fn(),
  create: vi.fn(),
  getFullList: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('pocketbase', () => ({
  default: class MockPocketBase {
    constructor() {
      this.authStore = mockAuthStore;
      this.collection = vi.fn(() => mockCollection);
    }
  },
}));

vi.mock('../../src/modules/storage.js', () => ({
  loadColumnsForBoard: vi.fn(() => []),
  loadTasksForBoard: vi.fn(() => []),
  loadLabelsForBoard: vi.fn(() => []),
  loadSettingsForBoard: vi.fn(() => null),

  loadDeletedColumnsForBoard: vi.fn(() => []),
  loadDeletedTasksForBoard: vi.fn(() => []),
  loadDeletedLabelsForBoard: vi.fn(() => []),
  purgeDeleted: vi.fn(),
  saveColumnsForBoard: vi.fn(),
  saveTasksForBoard: vi.fn(),
  saveLabelsForBoard: vi.fn(),
  saveSettingsForBoard: vi.fn(),
  mergeBoardsFromRemote: vi.fn((boards) => boards),
  getBoardById: vi.fn(() => null),
  setActiveBoardId: vi.fn(),
  getActiveBoardId: vi.fn(() => null),
}));

import {
  isAuthenticated,
  ensureAuthenticated,
  loginUser,
  registerUser,
  logoutUser,
  deleteBoardRemote,
  getPb,
} from '../../src/modules/sync.js';

import {
  loadColumnsForBoard,
  loadTasksForBoard,
  loadLabelsForBoard,
  loadDeletedTasksForBoard,
  loadDeletedColumnsForBoard,
  loadDeletedLabelsForBoard,
  purgeDeleted,
  saveColumnsForBoard,
  saveTasksForBoard,
  saveLabelsForBoard,
  saveSettingsForBoard,
  mergeBoardsFromRemote,
  getBoardById,
  setActiveBoardId,
  getActiveBoardId,
} from '../../src/modules/storage.js';

beforeEach(() => {
  mockAuthStore.token = null;
  mockAuthStore.record = null;
  mockAuthStore.isValid = false;
  localStorage.clear();
  vi.clearAllMocks();
  // Restore storage mock defaults after clearAllMocks resets call history
  loadColumnsForBoard.mockReturnValue([]);
  loadTasksForBoard.mockReturnValue([]);
  loadDeletedTasksForBoard.mockReturnValue([]);
});

// ── Slice 1+2: isAuthenticated ────────────────────────────────────────────────

describe('isAuthenticated', () => {
  it('returns false when authStore has no token', () => {
    mockAuthStore.token = null;
    mockAuthStore.record = null;
    expect(isAuthenticated()).toBe(false);
  });

  it('returns false when token present but no record', () => {
    mockAuthStore.token = 'tok123';
    mockAuthStore.record = null;
    expect(isAuthenticated()).toBe(false);
  });

  it('returns true when both token and record present', () => {
    mockAuthStore.token = 'tok123';
    mockAuthStore.record = { id: 'user1' };
    expect(isAuthenticated()).toBe(true);
  });
});

// ── Slice 3: ensureAuthenticated ──────────────────────────────────────────────

describe('ensureAuthenticated', () => {
  it('returns false when no token or record', async () => {
    mockAuthStore.token = null;
    mockAuthStore.record = null;
    await expect(ensureAuthenticated()).resolves.toBe(false);
  });

  it('returns true when token and record are valid', async () => {
    mockAuthStore.token = 'tok123';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;
    await expect(ensureAuthenticated()).resolves.toBe(true);
  });

  it('returns false when token present but refresh fails', async () => {
    mockAuthStore.token = 'expired-tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = false;
    mockCollection.authRefresh.mockRejectedValueOnce(new Error('Token expired'));
    await expect(ensureAuthenticated()).resolves.toBe(false);
  });

  it('returns true after successful refresh', async () => {
    mockAuthStore.token = 'old-tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = false;
    mockCollection.authRefresh.mockResolvedValueOnce({ token: 'new-tok', record: { id: 'user1' } });
    // After refresh, simulate authStore updated
    mockCollection.authRefresh.mockImplementationOnce(async () => {
      mockAuthStore.token = 'new-tok';
      mockAuthStore.record = { id: 'user1' };
    });
    await expect(ensureAuthenticated()).resolves.toBe(true);
  });
});

// ── Slice 4: loginUser ────────────────────────────────────────────────────────

describe('loginUser', () => {
  it('calls authWithPassword with email and password', async () => {
    const authData = { token: 'tok', record: { id: 'u1' } };
    mockCollection.authWithPassword.mockResolvedValueOnce(authData);
    const result = await loginUser('user@example.com', 'pass123');
    expect(mockCollection.authWithPassword).toHaveBeenCalledWith('user@example.com', 'pass123');
    expect(result).toEqual(authData);
  });

  it('propagates errors from PocketBase', async () => {
    mockCollection.authWithPassword.mockRejectedValueOnce(new Error('Invalid credentials'));
    await expect(loginUser('bad@email.com', 'wrong')).rejects.toThrow('Invalid credentials');
  });
});

// ── Slice 5: registerUser ─────────────────────────────────────────────────────

describe('registerUser', () => {
  it('creates user with passwordConfirm field', async () => {
    const record = { id: 'u1', email: 'user@example.com' };
    mockCollection.create.mockResolvedValueOnce(record);
    const result = await registerUser('user@example.com', 'pass123', 'Alice');
    expect(mockCollection.create).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'pass123',
      passwordConfirm: 'pass123',
      name: 'Alice',
    });
    expect(result).toEqual(record);
  });

  it('does not call authStore.save — no auto-login', async () => {
    mockCollection.create.mockResolvedValueOnce({ id: 'u1' });
    await registerUser('user@example.com', 'pass123');
    expect(mockAuthStore.save).not.toHaveBeenCalled();
  });

  it('defaults name to empty string when not provided', async () => {
    mockCollection.create.mockResolvedValueOnce({ id: 'u1' });
    await registerUser('user@example.com', 'pass123');
    expect(mockCollection.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: '' })
    );
  });
});

// ── Slice 6: logoutUser ───────────────────────────────────────────────────────

describe('logoutUser', () => {
  it('clears the auth store', () => {
    logoutUser();
    expect(mockAuthStore.clear).toHaveBeenCalled();
  });
});



// ── Slice 7b: deleteBoardRemote ───────────────────────────────────────────────

describe('deleteBoardRemote', () => {
  it('deletes the PocketBase board and all board-scoped records', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;
    localStorage.setItem('kanbanSyncMap', JSON.stringify({
      boards: { 'board-1': 'pb-board-1' },
      columns: { 'col-1': 'pb-col-1' },
      labels: { 'label-1': 'pb-label-1' },
      tasks: { 'task-1': 'pb-task-1' },
      task_relationships: { 'task-1::task-2': 'pb-rel-1' },
      events: {},
    }));
    loadColumnsForBoard.mockReturnValue([{ id: 'col-1' }]);
    loadLabelsForBoard.mockReturnValue([{ id: 'label-1' }]);
    loadTasksForBoard.mockReturnValue([{
      id: 'task-1',
      relationships: [{ targetTaskId: 'task-2' }],
    }]);

    await deleteBoardRemote('board-1');

    expect(getPb().collection).toHaveBeenCalledWith('task_relationships');
    expect(getPb().collection).toHaveBeenCalledWith('tasks');
    expect(getPb().collection).toHaveBeenCalledWith('labels');
    expect(getPb().collection).toHaveBeenCalledWith('columns');
    expect(getPb().collection).toHaveBeenCalledWith('boards');
    expect(mockCollection.delete).toHaveBeenCalledWith('pb-rel-1');
    expect(mockCollection.delete).toHaveBeenCalledWith('pb-task-1');
    expect(mockCollection.delete).toHaveBeenCalledWith('pb-label-1');
    expect(mockCollection.delete).toHaveBeenCalledWith('pb-col-1');
    expect(mockCollection.delete).toHaveBeenCalledWith('pb-board-1');
    expect(JSON.parse(localStorage.getItem('kanbanSyncMap'))).toEqual({
      boards: {},
      columns: {},
      labels: {},
      tasks: {},
      task_relationships: {},
      events: {},
    });
  });
});




