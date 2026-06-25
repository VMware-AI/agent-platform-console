import { describe, it, expect } from 'vitest'

import { STRINGS } from '@/stores/locale'
import { collectUsedLocaleKeys, collectSourceFiles } from './source-scan'

// i18n COMPLETENESS — the highest-value contract test.
//
// Background: a `locale.t('virtualKey.toast.saveFailed')` call with no matching
// STRINGS key silently renders the raw key string in the UI (see the store's
// `t`: `if (!entry) return key`). This test statically scans every `locale.t` /
// `fmt` / `format` call in `src/**` for string-literal keys and asserts each one
// exists in STRINGS, so a missing translation fails CI instead of shipping a
// raw key to users.
//
// Dynamic / template-literal keys (e.g. t(`agents.status.${s}`)) cannot be
// resolved statically and are intentionally skipped here — they are covered by
// the enum→locale-key coverage test.

describe('i18n completeness', () => {
  const files = collectSourceFiles()
  const usages = collectUsedLocaleKeys(files)

  it('finds a non-trivial number of statically-resolvable locale keys', () => {
    // Guards against the scanner silently matching nothing (e.g. a regex/path
    // regression that would make every other assertion vacuously pass).
    expect(files.length).toBeGreaterThan(50)
    expect(usages.length).toBeGreaterThan(500)
  })

  it('every statically-referenced locale key exists in STRINGS', () => {
    const missing = usages
      .filter(({ key }) => !(key in STRINGS))
      .map(({ key, file }) => `${key}  (in ${file.replace(/.*\/src\//, 'src/')})`)

    // De-duplicate for a readable failure message while still surfacing one
    // example source file per missing key.
    const unique = [...new Set(missing)].sort()
    expect(unique, `Missing locale keys referenced in source:\n${unique.join('\n')}`).toEqual([])
  })
})
