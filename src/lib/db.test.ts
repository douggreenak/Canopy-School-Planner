import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const connection = {
    beginTransaction: vi.fn(),
    execute: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  const pool = {
    getConnection: vi.fn(async () => connection),
    query: vi.fn(),
    execute: vi.fn(),
  };
  return {
    connection,
    pool,
    createPool: vi.fn(() => pool),
  };
});

vi.mock('mysql2/promise', () => ({
  default: { createPool: mocks.createPool },
}));

async function loadDeleteUserAndAllData() {
  vi.resetModules();
  process.env.DATABASE_URL = 'mysql://test:test@localhost/test';
  const db = await import('./db');
  return db.deleteUserAndAllData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connection.execute.mockResolvedValue([[], []]);
  mocks.connection.beginTransaction.mockResolvedValue(undefined);
  mocks.connection.commit.mockResolvedValue(undefined);
  mocks.connection.rollback.mockResolvedValue(undefined);
  mocks.connection.release.mockImplementation(() => {});
  mocks.pool.getConnection.mockResolvedValue(mocks.connection as never);
});

describe('deleteUserAndAllData', () => {
  it('deletes all user-owned records in one transaction', async () => {
    const deleteUserAndAllData = await loadDeleteUserAndAllData();

    await deleteUserAndAllData('user-123');

    expect(mocks.connection.beginTransaction).toHaveBeenCalledOnce();
    expect(mocks.connection.commit).toHaveBeenCalledOnce();
    expect(mocks.connection.rollback).not.toHaveBeenCalled();
    expect(mocks.connection.release).toHaveBeenCalledOnce();
    expect(mocks.connection.execute.mock.calls.map(([sql]) => sql)).toEqual([
      'DELETE FROM `settings` WHERE user_id = ?',
      'DELETE FROM `disruptions` WHERE user_id = ?',
      'DELETE FROM `homework` WHERE user_id = ?',
      'DELETE FROM `exams` WHERE user_id = ?',
      'DELETE FROM `tasks` WHERE user_id = ?',
      'DELETE FROM `classes` WHERE user_id = ?',
      'DELETE FROM `sessions` WHERE user_id = ?',
      'DELETE FROM `school_accounts` WHERE user_id = ?',
      'DELETE FROM `grade_history` WHERE user_id = ?',
      'DELETE FROM `sync_log` WHERE user_id = ?',
      'DELETE FROM `powerschool_sync_status` WHERE user_id = ?',
      'DELETE FROM `powerschool_sync_lock` WHERE user_id = ?',
      'DELETE FROM users WHERE id = ?',
    ]);
    expect(mocks.connection.execute.mock.calls.every(([, params]) => params[0] === 'user-123')).toBe(true);
  });

  it('rolls back and releases the connection when a delete fails', async () => {
    const deleteUserAndAllData = await loadDeleteUserAndAllData();
    mocks.connection.execute
      .mockResolvedValueOnce([[], []])
      .mockRejectedValueOnce(new Error('database unavailable'));

    await expect(deleteUserAndAllData('user-123')).rejects.toThrow('database unavailable');

    expect(mocks.connection.rollback).toHaveBeenCalledOnce();
    expect(mocks.connection.commit).not.toHaveBeenCalled();
    expect(mocks.connection.release).toHaveBeenCalledOnce();
  });
});
