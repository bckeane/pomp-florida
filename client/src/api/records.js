const SWIM_API_BASE = 'https://api.ctkeane.com/swim';

const cache = new Map();

/** Bare fetch — deliberately NOT the credentialed `request()` pattern the
 * other files in this directory use for pompFlorida's own same-origin API.
 * This hits a third-party domain; sending credentials would leak
 * pompFlorida's session cookie to it for no reason. No custom headers
 * either, to avoid a CORS preflight round-trip that isn't needed for a
 * plain GET (see docs/designs/swim-records-integration.md). */
async function fetchRecords(path, signal) {
  if (cache.has(path)) {
    return cache.get(path);
  }

  const res = await fetch(`${SWIM_API_BASE}${path}`, { signal });
  if (!res.ok) {
    const error = new Error('Request failed');
    error.status = res.status;
    throw error;
  }
  const data = await res.json();
  cache.set(path, data);
  return data;
}

export function fetchAllRecords(signal) {
  return fetchRecords('/records', signal);
}

export function fetchTop20(eventId, signal) {
  return fetchRecords(`/top20/${eventId}`, signal);
}

/** Test-only escape hatch — the cache is intentionally module-scoped and
 * has no TTL/invalidation (swim records change ~once a season), so tests
 * that assert on fetch call counts need a way to reset between cases. */
export function clearRecordsCache() {
  cache.clear();
}
