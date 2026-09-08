import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getUsersApiEndpoint, get } = vi.hoisted(() => ({
  getUsersApiEndpoint: vi.fn(async (p: string) => `https://api.test/users${p}`),
  get: vi.fn(),
}));

vi.mock('../config', () => ({ configService: { getUsersApiEndpoint } }));
vi.mock('axios', () => ({ default: { get: (...a: unknown[]) => get(...a) } }));

import { fetchEntitlements } from '../entitlements.service';

beforeEach(() => { get.mockReset(); getUsersApiEndpoint.mockClear(); });

describe('fetchEntitlements', () => {
  it('calls GET /users/entitlements with a bearer token and normalizes the body', async () => {
    get.mockResolvedValueOnce({
      data: { tier: 'free', classSyncLimit: 5, classSyncUsed: 2, syncedCourseIds: [101, 202] },
    });
    const result = await fetchEntitlements('tok');
    expect(getUsersApiEndpoint).toHaveBeenCalledWith('/entitlements');
    expect(get).toHaveBeenCalledWith(
      'https://api.test/users/entitlements',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
    );
    expect(result).toEqual({
      tier: 'free', classSyncLimit: 5, classSyncUsed: 2, syncedCourseIds: ['101', '202'],
    });
  });

  it('falls back to safe defaults when fields are missing', async () => {
    get.mockResolvedValueOnce({ data: {} });
    const result = await fetchEntitlements('tok');
    expect(result).toEqual({
      tier: 'free', classSyncLimit: null, classSyncUsed: 0, syncedCourseIds: [],
    });
  });
});
