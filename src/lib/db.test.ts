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
      'DELETE FROM `api_tokens` WHERE user_id = ?',
      'DELETE FROM `school_accounts` WHERE user_id = ?',
      'DELETE FROM `grade_history` WHERE user_id = ?',
      'DELETE FROM `archived_classes` WHERE user_id = ?',
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

describe('credential + session encryption', () => {
  async function loadDb(env: Record<string, string | undefined>) {
    vi.resetModules();
    process.env.DATABASE_URL = 'mysql://test:test@localhost/test';
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    return import('./db');
  }

  it('round-trips credentials and never stores them readable', async () => {
    const db = await loadDb({ CREDENTIAL_KEY: 'k1' });
    const ct = db.encryptCredential('s175476');
    expect(ct).not.toContain('s175476');
    expect(db.decryptCredential(ct)).toBe('s175476');
  });

  it('still decrypts values made with the DATABASE_URL-derived key after CREDENTIAL_KEY is set', async () => {
    const legacy = await loadDb({ CREDENTIAL_KEY: undefined });
    const ct = legacy.encryptCredential('hunter2');
    const upgraded = await loadDb({ CREDENTIAL_KEY: 'brand-new-dedicated-key' });
    expect(upgraded.decryptCredential(ct)).toBe('hunter2');
  });

  it('stores only a hash of the session token', async () => {
    const db = await loadDb({ CREDENTIAL_KEY: 'k1' });
    mocks.pool.execute.mockResolvedValue([[], []]);
    await db.createDbSession('raw-token-abc', 'u1', new Date(Date.now() + 1000));
    const insert = mocks.pool.execute.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO sessions'));
    expect(insert).toBeTruthy();
    expect(insert![1][0]).not.toBe('raw-token-abc');
    expect(insert![1][0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('purges sync_log entries older than retention period', async () => {
    const db = await loadDb({});
    mocks.pool.query.mockResolvedValue([[], []]);
    await db.purgeSyncLog('user-abc', 90);
    const deleteCall = mocks.pool.query.mock.calls.find(([sql]) =>
      String(sql).includes('DELETE FROM sync_log WHERE user_id = ? AND occurred_at < DATE_SUB(NOW(), INTERVAL ? DAY)')
    );
    expect(deleteCall).toBeTruthy();
    expect(deleteCall![1]).toEqual(['user-abc', 90]);
  });

  it('clears stale error entries from sync_log on successful sync', async () => {
    const db = await loadDb({});
    mocks.pool.query.mockResolvedValue([[], []]);
    await db.clearStaleSyncErrors('user-abc');
    const deleteCall = mocks.pool.query.mock.calls.find(([sql]) =>
      String(sql).includes("DELETE FROM sync_log WHERE user_id = ? AND change_type = 'error'")
    );
    expect(deleteCall).toBeTruthy();
    expect(deleteCall![1]).toEqual(['user-abc']);
  });
});
