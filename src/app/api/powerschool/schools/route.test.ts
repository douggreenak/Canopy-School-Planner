import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  getSchoolAccounts: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSessionUserId: mocks.getSessionUserId,
}));

vi.mock('@/lib/db', () => ({
  getSchoolAccounts: mocks.getSchoolAccounts,
  addSchoolAccount: vi.fn(),
  updateSchoolAccount: vi.fn(),
  deleteSchoolAccount: vi.fn(),
  replaceSchoolAccountData: vi.fn(),
}));

vi.mock('@/lib/powerschool', () => ({
  scrapePowerSchool: vi.fn(),
}));

const { GET } = await import('./route');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUserId.mockResolvedValue('student-a');
  mocks.getSchoolAccounts.mockResolvedValue([{
    id: 'school-a',
    schoolName: 'North High',
    url: 'https://school.example',
    username: 'student-a',
    password: 'stored-password',
  }]);
});

describe('GET /api/powerschool/schools', () => {
  it('scopes school accounts to the session and excludes passwords from the response', async () => {
    const response = await GET(new NextRequest('https://app.example/api/powerschool/schools'));

    expect(response.status).toBe(200);
    expect(mocks.getSchoolAccounts).toHaveBeenCalledWith('student-a');
    const body = await response.json();
    expect(body).toEqual([{
      id: 'school-a',
      schoolName: 'North High',
      url: 'https://school.example',
      username: 'student-a',
    }]);
    expect(JSON.stringify(body)).not.toContain('stored-password');
  });

  it('does not read school accounts for an unauthenticated request', async () => {
    mocks.getSessionUserId.mockResolvedValue(null);

    const response = await GET(new NextRequest('https://app.example/api/powerschool/schools'));

    expect(response.status).toBe(401);
    expect(mocks.getSchoolAccounts).not.toHaveBeenCalled();
  });
});
