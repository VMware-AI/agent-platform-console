/**
 * useCurrencyDisplay — composable that wires the user's currency settings
 * (base + display + precision from currencySettings) and the active exchange
 * rate (from exchangeRates) into a single `formatCost` helper for cost
 * displays. Used by DashboardView, MeteringCenterView, GatewaySpendPanel,
 * and MeteringDrillView.
 *
 * Behavior contract:
 *   - Reads USD-value (the BE returns costs in the base currency; per the
 *     schema, `meteringOverview.byAgent[].cost` is the base currency, which
 *     defaults to USD).
 *   - Multiplies by the most recent ACTIVE rate from
 *     `baseCurrency → defaultDisplayCurrency`. When `base === display`,
 *     `rate = 1` (no-op, just re-symbol).
 *   - Formats with the display currency's symbol via `currencySymbol()` and
 *     `numberFormatter()` (locale-aware separators).
 *   - When no active rate is found, falls back silently to the original
 *     base-currency value with a `console.debug` log — never breaks the UI.
 *
 * Pure composable: no Vue components, no DOM, no GraphQL mutation. Apollo
 * cache is shared across all consumers (settings + rates are app-wide, not
 * per-page), so multiple `useCurrencyDisplay()` calls in the same session
 * hit the cache after the first resolves.
 */

import { computed, type ComputedRef } from 'vue'
import { useCurrencySettings } from './useCurrencySettings'
import { useExchangeRates } from './useExchangeRates'
import { currencySymbol, numberFormatter } from '@/utils/meter-format'

export interface CurrencyDisplay {
  /** Base currency (the one BE returns costs in). Defaults to USD. */
  baseCurrency: ComputedRef<string>
  /** User-selected display currency. Defaults to CNY per settings page local fallback. */
  displayCurrency: ComputedRef<string>
  /** Decimal places the user picked (2 / 4 / 6). */
  precision: ComputedRef<number>
  /**
   * The exchange rate `baseCurrency → displayCurrency`. `1` when no
   * conversion is needed; `null` when no active rate row exists (caller
   * should fall back to original value).
   */
  rate: ComputedRef<number | null>
  /**
   * Format a USD-denominated value into the user's display currency.
   * Falls back to base-currency display (no conversion) if no rate found.
   */
  formatCost: (usdValue: number, locale?: string) => string
}

export function useCurrencyDisplay(): CurrencyDisplay {
  const { result: settingsResult } = useCurrencySettings()
  const { result: ratesResult } = useExchangeRates()

  const baseCurrency = computed<string>(
    () => settingsResult.value?.currencySettings?.baseCurrency ?? 'USD',
  )
  const displayCurrency = computed<string>(
    () => settingsResult.value?.currencySettings?.defaultDisplayCurrency ?? 'CNY',
  )
  // Precision is bounded to {2, 4, 6}; settings UI only offers those, but a
  // dirty DB row could carry anything — clamp here so the formatter never
  // crashes.
  const precision = computed<number>(() => {
    const raw = settingsResult.value?.currencySettings?.amountPrecision ?? 2
    return raw === 2 || raw === 4 || raw === 6 ? raw : 2
  })

  const rate = computed<number | null>(() => {
    const base = baseCurrency.value
    const disp = displayCurrency.value
    if (base === disp) return 1
    const rows = ratesResult.value?.exchangeRates ?? []
    const active = rows
      .filter(
        (r) =>
          r.fromCurrency === base &&
          r.toCurrency === disp &&
          r.status === 'ACTIVE',
      )
      // Newest effectiveFrom wins; ties fall back to insertion order.
      .sort((a, b) => (b.effectiveFrom > a.effectiveFrom ? 1 : -1))
    return active.length > 0 ? active[0].rate : null
  })

  function formatCost(usdValue: number, locale?: string): string {
    const r = rate.value
    const target = displayCurrency.value
    const converted = r == null ? usdValue : usdValue * r
    if (r == null) {
       
      console.debug(
        `[useCurrencyDisplay] no active rate for ${baseCurrency.value}→${target}; ` +
          `falling back to base-currency display (${currencySymbol(baseCurrency.value)}${usdValue})`,
      )
    }
    // Sub-cent values get extra precision so cheap models still render
    // meaningfully; otherwise honor the user's precision setting.
    const digits = converted > 0 && converted < 0.01 ? 6 : precision.value
    return `${currencySymbol(target)}${numberFormatter(locale, digits).format(converted)}`
  }

  return { baseCurrency, displayCurrency, precision, rate, formatCost }
}