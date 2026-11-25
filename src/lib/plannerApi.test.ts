import { describe, it, expect } from 'vitest';
import { generateApiToken, hashApiToken, scopeAllows } from './apiAuth';
import { hit, peek, resetRateLimits } from './rateLimit';
import { serializeClass, serializeAssignment, serializeTask, applyStages } from './plannerApi';
import type { SchoolClass, Homework, Task } from '@/types';

describe('api tokens', () => {
  it('generates unique 256-bit tokens and hashes them deterministically', () => {
    const a = generateApiToken(); const b = generateApiToken();
    expect(a.token).toMatch(/^spk_[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashApiToken(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toContain(a.token.slice(4, 20));
  });
  it('read scope never satisfies a write requirement', () => {
    expect(scopeAllows('read', 'write')).toBe(false);
    expect(scopeAllows('read', 'read')).toBe(true);
    expect(scopeAllows('write', 'read')).toBe(true);
    expect(scopeAllows('write', 'write')).toBe(true);
  });
});

describe('rate limiter', () => {
  it('blocks after max hits in the window', () => {
    resetRateLimits();
    for (let i = 0; i < 3; i++) expect(hit('k', 3, 1000)).toBe(0);
    expect(hit('k', 3, 1000)).toBeGreaterThan(0);
    expect(peek('other', 3, 1000)).toBe(0);
  });
});

describe('serializers are allowlists', () => {
  it('drops fields that are not explicitly exposed', () => {
    const c = { id: '1', name: 'Math', teacher: 'T', room: '1', period: 1, startTime: '08:00', endTime: '09:00', days: [1], semester: 's', color: '#fff', sourceId: 'secret-frn', user_id: 'u', passwordHash: 'x' } as unknown as SchoolClass;
    const out = JSON.stringify(serializeClass(c));
    expect(out).not.toContain('secret-frn');
    expect(out).not.toContain('passwordHash');
    expect(out).not.toContain('user_id');
    const h = { id: 'h', classId: '1', title: 't', description: '', dueDate: '2026-01-01', completed: false, priority: 'low', source: 'manual', sourceId: 'internal' } as Homework;
    expect(JSON.stringify(serializeAssignment(h))).not.toContain('internal');
  });
});

describe('task stages over the API', () => {
  const stages = [{ id: 'a', label: 'Reported' }, { id: 'b', label: 'Fixed' }, { id: 'c', label: 'Closed' }];
  const base = (): Task => ({ id: 't', title: 'x', description: '', dueDate: '', completed: false, priority: 'medium', category: 'General' });

  it('exposes stages and stageId', () => {
    const out = serializeTask({ ...base(), stages, stageId: 'b' });
    expect(out.stages).toEqual(stages);
    expect(out.stageId).toBe('b');
    expect(serializeTask(base()).stages).toEqual([]);
  });
  it('completed follows the last stage', () => {
    const t = base();
    applyStages(t, { stages, stageId: 'b' });
    expect(t.completed).toBe(false);
    applyStages(t, { stageId: 'c' });
    expect(t.completed).toBe(true);
    applyStages(t, { stageId: undefined });
    expect(t.stageId).toBeUndefined();
    expect(t.completed).toBe(false);
  });
  it('rejects a stageId outside the pipeline and drops a stale one when stages change', () => {
    const t = base();
    applyStages(t, { stages });
    expect(() => applyStages(t, { stageId: 'zzz' })).toThrow();
    applyStages(t, { stageId: 'b' });
    applyStages(t, { stages: [{ id: 'x', label: 'Only' }] });
    expect(t.stageId).toBeUndefined();
  });
});
