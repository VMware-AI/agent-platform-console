/**
 * Meter / cost formatting utilities shared between MeteringCenterView and
 * GatewaySpendPanel. Keeping the formatters in one file (per CLAUDE.md §2 / rules
 * coding-style immutability & DRY) prevents the two source views from drifting
 * apart in display — the spec explicitly forbids mixing "$0.65" and "US$0.65"
 * on the same page.
 *
 * All functions are pure; the locale string is passed in by callers (which
 * already read it from useLocaleStore). No Vue / GraphQL dependencies.
 */

/** Standard separator set: en-US for the English build, zh-CN for Chinese. */
function numberFormatterImpl(locale: string | undefined, fractionDigits?: number): Intl.NumberFormat {
  const loc = locale === 'zh' ? 'zh-CN' : 'en-US'
  if (fractionDigits !== undefined) {
    return new Intl.NumberFormat(loc, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })
  }
  return new Intl.NumberFormat(loc)
}

/**
 * Locale-aware integer / count format with thousands separators.
 * Examples (en-US): 7788297 → "7,788,297"; (zh-CN): → "7,788,297".
 */
export function fmtNumber(value: number, locale?: string): string {
  return numberFormatter(locale).format(value)
}

/**
 * Exposed so composables (useCurrencyDisplay) can format numbers with the
 * same locale-aware separator rules as `fmtNumber`/`fmtMoney` without going
 * through the string concatenation those helpers do. Returns an
 * `Intl.NumberFormat` instance so callers can `.format()` repeatedly if
 * needed.
 */
export function numberFormatter(locale: string | undefined, fractionDigits?: number): Intl.NumberFormat {
  return numberFormatterImpl(locale, fractionDigits)
}

/**
 * Currency code → display symbol. Defaults to `US$` to preserve the historical
 * prefix style (`US$1.23` not `$1.23`). Codes without an explicit mapping render
 * as `<CODE> ` so they're unambiguous on the page (e.g. `EUR 1.23`).
 *
 * Added 2026-08 to support real currency conversion: callers that need to show
 * a value in the user's `defaultDisplayCurrency` pass the code via
 * `fmtMoney(value, locale, code)` instead of relying on the `US$` default.
 */
const CURRENCY_SYMBOL: Record<string, string> = {
  USD: 'US$',
  CNY: '¥',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  HKD: 'HK$',
}

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOL[code] ?? `${code} `
}

/**
 * Currency in the project's fixed `US$` prefix style, with locale-aware
 * separators. Sub-cent values (0 < n < 0.01) show 6 digits so the cost of
 * cheap models is still readable; otherwise 2.
 *
 * `currencyCode` defaults to `'US$'` for back-compat — all callers that pass
 * only `(value, locale)` keep their existing display. New callers that want
 * real currency conversion pass the user's `defaultDisplayCurrency` here; the
 * actual multiplication is done by `useCurrencyDisplay().formatCost` upstream,
 * so this function only owns the symbol-and-format step.
 */
export function fmtMoney(value: number, locale?: string, currencyCode = 'US$'): string {
  const digits = value > 0 && value < 0.01 ? 6 : 2
  return `${currencySymbol(currencyCode)}${numberFormatter(locale, digits).format(value)}`
}

/**
 * Compact token / cost format for chart axes. Returns the full number under
 * 1,000, otherwise appends K / M / B with one decimal (dropping the `.0`).
 * Examples: 980 → "980"; 1,250 → "1.3K"; 7,788,297 → "7.8M".
 */
export function fmtCompact(value: number, locale?: string): string {
  const abs = Math.abs(value)
  let scaled = value
  let suffix = ''
  if (abs >= 1e9) {
    scaled = value / 1e9
    suffix = 'B'
  } else if (abs >= 1e6) {
    scaled = value / 1e6
    suffix = 'M'
  } else if (abs >= 1e3) {
    scaled = value / 1e3
    suffix = 'K'
  }
  if (!suffix) return numberFormatter(locale).format(value)
  // Intl rounds to maximumFractionDigits, so 1234 / 1000 → "1.2K", 1500 → "1.5K".
  const formatted = numberFormatter(locale, 1).format(scaled)
  return `${formatted}${suffix}`
}

/**
 * Percent with one decimal when fractional, integer otherwise.
 * null / undefined → "—" so the spec's single-format table column works.
 */
export function fmtPercent(value: number | null | undefined, locale?: string): string {
  if (value == null || Number.isNaN(value)) return '—'
  const digits = Math.abs(value) < 10 ? 1 : 0
  return `${numberFormatter(locale, digits).format(value)}%`
}

/**
 * Truncate a free-form string (department / model name) with a trailing
 * ellipsis. Counts code points, not UTF-16 units, so CJK names don't get cut
 * in the middle of a character.
 */
export function truncate(text: string | null | undefined, maxChars: number): string {
  if (text == null) return ''
  const arr = Array.from(text)
  if (arr.length <= maxChars) return text
  return `${arr.slice(0, Math.max(1, maxChars)).join('')}…`
}

/**
 * Mask a sensitive identifier (API key, virtual key). Keeps a recognizable
 * prefix and the last 4 characters; never reveals the middle. Safe to call on
 * arbitrary strings — anything shorter than 12 chars is preserved as-is so
 * short labels like "team-a" still render meaningfully.
 *
 * Output examples:
 *   "sk-12abcdefghij9f02" → "sk-12ab…9f02"
 *   "litellm-proxy-key-7a82f3cd" → "litellm-…3cd" (preserves first dash segment)
 *   "short-id"            → "short-id"
 */
/** Prefixes shared by common gateway key formats. Only strings matching one of
 *  these are treated as secrets and masked. User-chosen names (VirtualKey.Name)
 *  won't start with these, and the length guard (≤12) passes short labels through. */
const KEY_PREFIXES = ['sk-', 'litellm-', 'pk-', 'sg-', 'sk_']

export function apiKeyMask(key: string | null | undefined): string {
  if (!key) return '—'
  if (key.length <= 12) return key
  const isKey = KEY_PREFIXES.some((p) => key.toLowerCase().startsWith(p))
  if (!isKey) return key
  const firstDash = key.indexOf('-')
  const hasPrefix = firstDash > 0 && firstDash < 16
  const head = hasPrefix
    ? key.slice(0, firstDash + 1) + key.slice(firstDash + 1, firstDash + 5)
    : key.slice(0, 8)
  return `${head}…${key.slice(-4)}`
}

/**
 * Short date label for chart x-axis. Falls back to the raw input if unparseable
 * so the chart never blanks out on bad data.
 */
export function shortDate(iso: string | null | undefined, locale?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  if (locale === 'zh') return `${d.getMonth() + 1}月${d.getDate()}日`
  return `${d.getMonth() + 1}/${d.getDate()}`
}
