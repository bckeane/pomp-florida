import { describe, it, expect } from 'vitest';
import { uniqueEvents } from './eventList.js';

describe('uniqueEvents', () => {
  it('dedupes records down to one entry per Event_Id', () => {
    const records = [
      { Event_Id: 1, Event_Name: '200 Freestyle', TeamGender: 'Boys' },
      { Event_Id: 1, Event_Name: '200 Freestyle', TeamGender: 'Boys' },
      { Event_Id: 2, Event_Name: '200 Freestyle', TeamGender: 'Girls' },
    ];
    expect(uniqueEvents(records)).toEqual([
      { id: 1, name: '200 Freestyle', gender: 'Boys' },
      { id: 2, name: '200 Freestyle', gender: 'Girls' },
    ]);
  });

  it('skips records with no Event_Name', () => {
    const records = [{ Event_Id: 1, Event_Name: '', TeamGender: 'Boys' }];
    expect(uniqueEvents(records)).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(uniqueEvents([])).toEqual([]);
  });
});
