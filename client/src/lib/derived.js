/** Valid student grad years: this year through 4 years in the future. */
export function studentGradYears() {
  const start = new Date().getFullYear();
  return [start, start + 1, start + 2, start + 3, start + 4].map(String);
}
