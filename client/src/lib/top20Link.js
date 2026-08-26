/** Builds the /records/top20/:eventId link, carrying gender + event name as
 * query params. Needed because api.ctkeane.com's Event_Id is NOT
 * gender-specific — Boys and Girls share the same id for the same event
 * name, so Top20Page needs the gender param to pick the right side of
 * /swim/top20/:gender/:id. */
export function top20Link(eventId, gender, eventName) {
  const params = new URLSearchParams({ gender: (gender || '').toLowerCase(), event: eventName || '' });
  return `/records/top20/${eventId}?${params.toString()}`;
}
