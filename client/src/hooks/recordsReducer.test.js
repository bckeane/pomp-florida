import { describe, it, expect } from 'vitest';
import { recordsReducer, initialRecordsState } from './recordsReducer.js';

describe('recordsReducer', () => {
  it('starts in loading state', () => {
    expect(initialRecordsState).toEqual({ status: 'loading', data: null, error: null });
  });

  it('FETCH_START resets to loading, clearing any prior data/error', () => {
    const prior = { status: 'error', data: null, error: new Error('boom') };
    expect(recordsReducer(prior, { type: 'FETCH_START' })).toEqual({
      status: 'loading',
      data: null,
      error: null,
    });
  });

  it('FETCH_SUCCESS stores the data and clears error', () => {
    const result = recordsReducer(initialRecordsState, { type: 'FETCH_SUCCESS', data: [{ id: 1 }] });
    expect(result).toEqual({ status: 'success', data: [{ id: 1 }], error: null });
  });

  it('FETCH_ERROR stores the error and clears data', () => {
    const error = new Error('network down');
    const result = recordsReducer(initialRecordsState, { type: 'FETCH_ERROR', error });
    expect(result).toEqual({ status: 'error', data: null, error });
  });

  it('ignores unknown action types', () => {
    const state = { status: 'success', data: [1], error: null };
    expect(recordsReducer(state, { type: 'NOOP' })).toBe(state);
  });
});
