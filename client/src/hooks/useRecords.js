import { useEffect, useReducer } from 'react';
import { recordsReducer, initialRecordsState } from './recordsReducer.js';

/** Shared loading/success/error state for the 4 swim-records pages, wrapping
 * the client/src/api/records.js fetch wrapper. `fetcher` is `(signal) =>
 * Promise` — e.g. `(signal) => fetchAllRecords(signal)` — re-run whenever
 * anything in `deps` changes, with an AbortController cancelling a stale
 * in-flight request (carried over from the source app's useFetch.js). */
export function useRecords(fetcher, deps = []) {
  const [state, dispatch] = useReducer(recordsReducer, initialRecordsState);

  useEffect(() => {
    const controller = new AbortController();
    dispatch({ type: 'FETCH_START' });

    fetcher(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          dispatch({ type: 'FETCH_SUCCESS', data });
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError' && !controller.signal.aborted) {
          dispatch({ type: 'FETCH_ERROR', error });
        }
      });

    return () => controller.abort();
    // deps is caller-controlled (mirrors useEffect's own dependency-array
    // contract) — not exhaustive-deps-lintable, and this repo has no ESLint
    // config to enforce that rule anyway.
  }, deps);

  return state;
}
