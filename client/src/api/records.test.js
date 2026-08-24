import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchAllRecords, fetchTop20, clearRecordsCache } from './records.js';

function mockJsonResponse(data, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(data) };
}

beforeEach(() => {
  clearRecordsCache();
  vi.restoreAllMocks();
});

describe('fetchAllRecords / fetchTop20', () => {
  it('hits the real api.ctkeane.com base path, no credentials, no custom headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ id: 1 }]));
    global.fetch = fetchMock;

    await fetchAllRecords();

    expect(fetchMock).toHaveBeenCalledWith('https://api.ctkeane.com/swim/records', { signal: undefined });
    // Explicitly NOT credentials: 'include' — this hits a third-party domain,
    // unlike the other client/src/api/*.js files' request() helper.
    const [, options] = fetchMock.mock.calls[0];
    expect(options).not.toHaveProperty('credentials');
    expect(options).not.toHaveProperty('headers');
  });

  it('builds the top20 URL from the event id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([]));
    global.fetch = fetchMock;

    await fetchTop20(42);

    expect(fetchMock).toHaveBeenCalledWith('https://api.ctkeane.com/swim/top20/42', { signal: undefined });
  });

  it('caches a successful response — a second call for the same path does not re-fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ id: 1 }]));
    global.fetch = fetchMock;

    const first = await fetchAllRecords();
    const second = await fetchAllRecords();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('throws (does not cache) on a non-2xx response — matches the CORS-500 failure mode', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(null, false, 500));

    await expect(fetchAllRecords()).rejects.toMatchObject({ status: 500 });
  });

  it('a failed fetch is not cached, so a retry issues a fresh request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(null, false, 500))
      .mockResolvedValueOnce(mockJsonResponse([{ id: 1 }]));
    global.fetch = fetchMock;

    await expect(fetchAllRecords()).rejects.toThrow();
    await fetchAllRecords();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches /records and /top20/:id independently', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([]));
    global.fetch = fetchMock;

    await fetchAllRecords();
    await fetchTop20(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
