/**
 * CSV cell encoding shared by all client-side exports.
 *
 * Two concerns, both of which a naive `String(v)` interpolation gets wrong:
 *
 *  1. Structural safety — a value containing `"`, `,`, `\n` or `\r` must be
 *     quoted (and interior quotes doubled) or it corrupts the column layout.
 *
 *  2. Formula-injection (a.k.a. CSV injection) — a spreadsheet treats a cell
 *     whose text starts with `=`, `+`, `-`, `@`, TAB or CR as a formula. A
 *     hostile value like `=HYPERLINK(...)` or `=cmd|...` then executes on open.
 *     We neutralize it by prefixing a single quote `'`, the standard guard,
 *     which forces the cell to be interpreted as literal text.
 */

// Leading characters that make Excel / Sheets / LibreOffice evaluate the cell
// as a formula. TAB (\t) and CR (\r) are included because some importers strip
// them and re-expose the following formula character.
const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r'])

/**
 * Encode an arbitrary value as one safe CSV cell (unquoted-safe: the returned
 * string is already fully quoted and escaped, so callers join with ',').
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value)
  // Formula-injection guard: prefix a literal-text marker before quoting so the
  // apostrophe lands inside the quoted field.
  if (s.length > 0 && FORMULA_TRIGGERS.has(s[0])) {
    s = `'${s}`
  }
  // Structural escape: double interior quotes, wrap the whole field in quotes.
  return `"${s.replace(/"/g, '""')}"`
}
