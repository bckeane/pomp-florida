/** Strips HTML tag syntax from free-text fields that must never contain
 * markup (names, FAQ text, etc). The frontend already escapes on render, so
 * this is defense-in-depth against a future non-escaping consumer of the
 * same stored data. Removes bare `<`/`>` too (not just matched `<...>`
 * pairs) so an unterminated tag can't slip through unstripped. */
export function stripHtmlTags(value) {
  return value.replace(/[<>]/g, '');
}
