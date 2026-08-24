/** Filters one event's /top20 rows down to the ones with a swimmer name
 * matching `query` (case-insensitive substring). Pure so it's directly
 * unit-testable — the actual per-event fetching lives in SwimmerSearchPage. */
export function searchTop20Rows(rows, event, query) {
  const lowerQuery = query.toLowerCase();
  const matches = [];

  rows.forEach((row, index) => {
    const swimmers = [row.Swimmer_Name, row.Swimmer_Name2, row.Swimmer_Name3, row.Swimmer_Name4]
      .filter((name) => name && name.trim() !== '')
      .map((name) => name.trim());

    const isMatch = swimmers.some((name) => name.toLowerCase().includes(lowerQuery));
    if (!isMatch) return;

    matches.push({
      eventId: event.id,
      eventName: row.Event_Name || event.name,
      gender: event.gender,
      place: row.Swim_Place ?? index + 1,
      year: row.Event_Year,
      time: row.Time_Formatted,
      swimmers,
    });
  });

  return matches;
}
