import { describe, it, expect } from 'vitest';
import { searchTop20Rows } from './swimmerSearch.js';

const event = { id: 5, name: '200 Freestyle', gender: 'Boys' };

describe('searchTop20Rows', () => {
  it('matches a swimmer name case-insensitively', () => {
    const rows = [{ Swimmer_Name: 'Aidan Smith', Swim_Place: 1, Event_Year: 2023, Time_Formatted: '1:42.17' }];
    const results = searchTop20Rows(rows, event, 'smith');
    expect(results).toEqual([
      {
        eventId: 5,
        eventName: '200 Freestyle',
        gender: 'Boys',
        place: 1,
        year: 2023,
        time: '1:42.17',
        swimmers: ['Aidan Smith'],
      },
    ]);
  });

  it('excludes rows with no matching swimmer', () => {
    const rows = [{ Swimmer_Name: 'Jake Maloney', Swim_Place: 1, Event_Year: 2021, Time_Formatted: '51.36' }];
    expect(searchTop20Rows(rows, event, 'smith')).toEqual([]);
  });

  it('matches a relay if ANY of the 4 swimmer slots matches', () => {
    const rows = [
      {
        Swimmer_Name: 'A One',
        Swimmer_Name2: 'B Two',
        Swimmer_Name3: 'C Smith',
        Swimmer_Name4: 'D Four',
        Swim_Place: 1,
        Event_Year: 2022,
        Time_Formatted: '1:31.24',
      },
    ];
    const results = searchTop20Rows(rows, event, 'smith');
    expect(results).toHaveLength(1);
    expect(results[0].swimmers).toEqual(['A One', 'B Two', 'C Smith', 'D Four']);
  });

  it('drops empty swimmer slots instead of including blank strings', () => {
    const rows = [
      {
        Swimmer_Name: 'Aidan Smith',
        Swimmer_Name2: '',
        Swimmer_Name3: null,
        Swim_Place: 1,
        Event_Year: 2023,
        Time_Formatted: '1:42.17',
      },
    ];
    expect(searchTop20Rows(rows, event, 'smith')[0].swimmers).toEqual(['Aidan Smith']);
  });

  it('falls back to (index + 1) for place when Swim_Place is missing', () => {
    const rows = [{ Swimmer_Name: 'Smith', Event_Year: 2023, Time_Formatted: '1:00' }];
    expect(searchTop20Rows(rows, event, 'smith')[0].place).toBe(1);
  });
});
