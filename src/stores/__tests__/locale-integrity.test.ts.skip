import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import { STRINGS } from '@/stores/locale'
import { SRC_ROOT } from './source-scan'

// LOCALE INTEGRITY.
//
// Three classes of silent locale bugs:
//   1. Duplicate keys. STRINGS is an object literal, so a repeated `'key':`
//      silently collapses — the second wins and the first translation vanishes
//      with no error. Detected by reading the source text (the runtime map can't
//      reveal a collapse).
//   2. Empty zh. zh is the primary locale (project rule #2: zh-only namespaces).
//      Every entry must have a non-empty zh, except deliberately-blank UI labels.
//   3. NEW empty en. Many namespaces are intentionally zh-only today (en: '').
//      Those are allow-listed by namespace; any empty en OUTSIDE the allow-list
//      is a newly-introduced untranslated string and fails here.

const LOCALE_SOURCE = readFileSync(join(SRC_ROOT, 'stores', 'locale.ts'), 'utf8')

// Deliberately-blank UI labels: the selection checkbox column has no header
// text in either locale. This is the only intentionally empty-zh entry.
const ALLOWED_EMPTY_ZH = new Set<string>(['agents.col.select'])

// Namespaces that are intentionally zh-only today (en === ''). A new key under
// one of these is allowed to ship without an en translation; a new empty-en key
// anywhere else is a regression.
const ALLOWED_EMPTY_EN_PREFIXES = ['resources.', 'roles.', 'settings.', 'users.'] as const
const ALLOWED_EMPTY_EN_KEYS = new Set<string>([
  'agents.col.select',
  'agents.list.description',
  'common.cancel',
  'common.confirm',
  'gatewayModel.description',
  'supplier.description',
  'virtualKey.description',
])

function emptyEnAllowed(key: string): boolean {
  return (
    ALLOWED_EMPTY_EN_KEYS.has(key) ||
    ALLOWED_EMPTY_EN_PREFIXES.some((prefix) => key.startsWith(prefix))
  )
}

describe('locale integrity', () => {
  it('has no duplicate keys in the STRINGS source', () => {
    // Match the `'key':` that opens each entry (two-space indent in the object
    // literal). A duplicate would otherwise collapse silently at runtime.
    const counts = new Map<string, number>()
    for (const match of LOCALE_SOURCE.matchAll(/^ {2}'([^']+)':/gm)) {
      const key = match[1]
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const duplicates = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([key, count]) => `${key} (×${count})`)
    expect(duplicates, `Duplicate locale keys:\n${duplicates.join('\n')}`).toEqual([])
  })

  it('source key count matches the parsed runtime map (sanity)', () => {
    const sourceKeys = [...LOCALE_SOURCE.matchAll(/^ {2}'([^']+)':/gm)].map((m) => m[1])
    // No collapse: every source line corresponds to one runtime entry.
    expect(sourceKeys.length).toBe(Object.keys(STRINGS).length)
    // v1 dropped ~400 retired-page keys from the original ~1400; we still
    // expect a substantial map. Threshold guards against accidental mass
    // deletion, not the exact count.
    expect(sourceKeys.length).toBeGreaterThan(700)
  })

  it('every entry has a non-empty zh (except deliberately-blank labels)', () => {
    const emptyZh = Object.entries(STRINGS)
      .filter(([key, value]) => value.zh.trim() === '' && !ALLOWED_EMPTY_ZH.has(key))
      .map(([key]) => key)
    expect(emptyZh, `Entries with empty zh:\n${emptyZh.join('\n')}`).toEqual([])
  })

  it('introduces no NEW empty-en entry outside the zh-only allow-list', () => {
    const unexpectedEmptyEn = Object.entries(STRINGS)
      .filter(([key, value]) => value.en.trim() === '' && !emptyEnAllowed(key))
      .map(([key]) => key)
    expect(
      unexpectedEmptyEn,
      `New untranslated (empty-en) keys outside the zh-only allow-list:\n${unexpectedEmptyEn.join('\n')}`,
    ).toEqual([])
  })
})
