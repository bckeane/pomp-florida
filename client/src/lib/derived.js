/** Valid student grad years — the 4 classes of high school (9-12), starting
 * from the earliest class that hasn't graduated yet. Registration for a
 * given trip typically opens the fall before it (e.g. a Feb 2027 trip opens
 * for registration in fall 2026) — by then the class of that same calendar
 * year has already graduated (June), so once we're past June the window
 * shifts to start at next year instead of the current one. */
export function studentGradYears() {
  const now = new Date();
  const start = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return [start, start + 1, start + 2, start + 3].map(String);
}
