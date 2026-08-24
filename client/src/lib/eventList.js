/** Unique events (id/name/gender), derived from the /records response —
 * shared by SwimmerSearchPage and Top25ExportPage, which both need the
 * event list before fanning out one /top20/:id fetch per event. */
export function uniqueEvents(records) {
  const events = [];
  for (const record of records) {
    if (!record.Event_Name) continue;
    if (events.some((event) => event.id === record.Event_Id)) continue;
    events.push({ id: record.Event_Id, name: record.Event_Name, gender: record.TeamGender });
  }
  return events;
}
