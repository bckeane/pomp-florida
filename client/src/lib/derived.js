/** Grades 9-12 span 4 graduating classes anchored to the trip's own year. */
export function studentGradYears(tripYear) {
  const start = Number(tripYear);
  if (!Number.isInteger(start)) return [];
  return [start, start + 1, start + 2, start + 3].map(String);
}
