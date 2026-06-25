// Test-only helpers that statically scan the source tree from disk. Kept out of
// the app bundle (only imported by *.test.ts). These let the i18n contract tests
// reason about how `locale.t(...)` is actually called across `src/**` without
// importing/rendering any volatile view markup.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// src/stores/__tests__ -> repo root
export const SRC_ROOT = resolve(here, '..', '..')

const SCANNED_EXTENSIONS = ['.vue', '.ts'] as const

/** Recursively collect every `.vue`/`.ts` file under `dir`, skipping tests. */
export function collectSourceFiles(dir: string = SRC_ROOT): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      // Don't scan the test sources themselves (they contain string keys used
      // as fixtures/expectations, which would pollute the "used keys" set).
      if (entry === '__tests__' || entry === 'node_modules' || entry === 'dist') {
        continue
      }
      out.push(...collectSourceFiles(full))
      continue
    }
    if (SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      out.push(full)
    }
  }
  return out
}

/** A single statically-resolvable locale key usage and where it came from. */
export interface KeyUsage {
  key: string
  file: string
}

// Locale-accessor call openings we recognize. The store method is `locale.t(`;
// `fmt(` and `format(` are the per-view interpolation wrappers whose first arg
// (and any ternary branches) are always locale keys (verified across src/**).
//
// The leading `(?<![\w.])` guards against matching the tail of a longer
// identifier — e.g. `formatNumber(`, `toggleSort(`, `it(` in a spec — so only a
// *whole-word* `t`/`fmt`/`format` call (or the `locale.t` method) is captured.
const ACCESSOR_OPENING = /(?<![\w.])(?:locale\.t|t|fmt|format)\(/g

// A quoted string literal that looks like a dotted locale key (letters, digits,
// dots, dashes, underscores). Template literals (backticks) are intentionally
// NOT matched — dynamic keys are covered by the enum→key coverage test.
const KEY_LITERAL = /'([a-zA-Z][\w.-]*)'|"([a-zA-Z][\w.-]*)"/g

/**
 * Extract every statically-resolvable locale key referenced via a recognized
 * accessor call across the source tree.
 *
 * For each accessor opening we read forward to the matching `)` of that call's
 * argument list (locale keys never contain `)`), then pull out every quoted
 * key-shaped literal in that span. This naturally captures both branches of a
 * ternary such as `t(cond ? 'a.b' : 'c.d')`.
 */
export function collectUsedLocaleKeys(files: string[] = collectSourceFiles()): KeyUsage[] {
  const usages: KeyUsage[] = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const open of text.matchAll(ACCESSOR_OPENING)) {
      const argStart = open.index! + open[0].length
      const closeRel = text.indexOf(')', argStart)
      if (closeRel === -1) continue
      const argSpan = text.slice(argStart, closeRel)
      for (const lit of argSpan.matchAll(KEY_LITERAL)) {
        const key = lit[1] ?? lit[2]
        // A real, statically-complete locale key always contains a dot and never
        // ends in one. Two literal shapes are filtered out:
        //   - bare words like 'CREATED_AT' / 'active' / 'cds-button' — not keys,
        //     so genuine non-locale string args don't create false misses;
        //   - dynamic *prefixes* such as t('artifacts.kind.' + k) where the
        //     literal ends in '.' and is concatenated with a variable. The full
        //     key is dynamic and is covered by the enum→key coverage test.
        if (key.includes('.') && !key.endsWith('.')) {
          usages.push({ key, file })
        }
      }
    }
  }
  return usages
}
