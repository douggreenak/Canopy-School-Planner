import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  getClasses: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSessionUserId: mocks.getSessionUserId,
}));

vi.mock('@/lib/db', () => ({
  getClasses: mocks.getClasses,
  addClass: vi.fn(),
  updateClass: vi.fn(),
  deleteClass: vi.fn(),
  setClassOrder: vi.fn(),
}));

const { GET } = await import('./route');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUserId.mockResolvedValue('student-a');
  mocks.getClasses.mockResolvedValue([{ id: 'class-a', name: 'Chemistry' }]);
});

describe('GET /api/classes', () => {
  it('only reads classes for the authenticated account', async () => {
    const response = await GET(new NextRequest('https://app.example/api/classes'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 'class-a', name: 'Chemistry' }]);
    expect(mocks.getClasses).toHaveBeenCalledOnce();
    expect(mocks.getClasses).toHaveBeenCalledWith('student-a');
  });

  it('does not read class data for an unauthenticated request', async () => {
    mocks.getSessionUserId.mockResolvedValue(null);

    const response = await GET(new NextRequest('https://app.example/api/classes'));

    expect(response.status).toBe(401);
    expect(mocks.getClasses).not.toHaveBeenCalled();
  });
});
