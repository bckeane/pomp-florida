export const initialRecordsState = { status: 'loading', data: null, error: null };

/** Pure — kept separate from the useReducer/useEffect wiring in
 * useRecords.js so the state-machine transitions are unit-testable with
 * plain vitest, no RTL/DOM needed (matches this repo's existing
 * pure-function-only client test convention). */
export function recordsReducer(state, action) {
  switch (action.type) {
    case 'FETCH_START':
      return { status: 'loading', data: null, error: null };
    case 'FETCH_SUCCESS':
      return { status: 'success', data: action.data, error: null };
    case 'FETCH_ERROR':
      return { status: 'error', data: null, error: action.error };
    default:
      return state;
  }
}
