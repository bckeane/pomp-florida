/** Builds the /records/top20/:eventId link, carrying gender + event name as
 * query params. Needed because api.ctkeane.com's Event_Id is NOT
 * gender-specific — Boys and Girls share the same id for the same event
 * name, but /swim/top20/:id only ever returns Boys' swimmers regardless of
 * which id is requested (verified live, no working id returns Girls data).
 * Top20Page uses the gender param to know NOT to fetch (and silently show
 * the wrong gender's swimmers) for a Girls event. */
export function top20Link(eventId, gender, eventName) {
  const params = new URLSearchParams({ gender: (gender || '').toLowerCase(), event: eventName || '' });
  return `/records/top20/${eventId}?${params.toString()}`;
}
