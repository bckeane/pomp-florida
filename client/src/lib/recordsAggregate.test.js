import { describe, it, expect } from 'vitest';
import { aggregateSettled } from './recordsAggregate.js';

function fulfilled(value) {
  return { status: 'fulfilled', value };
}
function rejected(reason) {
  return { status: 'rejected', reason };
}

describe('aggregateSettled', () => {
  it('all fulfilled — no failure, no notice', () => {
    const result = aggregateSettled([fulfilled('a'), fulfilled('b')]);
    expect(result).toEqual({
      fulfilled: ['a', 'b'],
      failedCount: 0,
      total: 2,
      allFailed: false,
      somePartialFailure: false,
    });
  });

  it('exactly one of three failing is a partial failure', () => {
    const result = aggregateSettled([fulfilled('a'), rejected('boom'), fulfilled('c')]);
    expect(result).toEqual({
      fulfilled: ['a', 'c'],
      failedCount: 1,
      total: 3,
      allFailed: false,
      somePartialFailure: true,
    });
  });

  it('100% failure escalates to allFailed, not somePartialFailure', () => {
    const result = aggregateSettled([rejected('a'), rejected('b')]);
    expect(result).toEqual({
      fulfilled: [],
      failedCount: 2,
      total: 2,
      allFailed: true,
      somePartialFailure: false,
    });
  });

  it('an empty input is neither all-failed nor partially failed', () => {
    const result = aggregateSettled([]);
    expect(result.allFailed).toBe(false);
    expect(result.somePartialFailure).toBe(false);
  });
});
