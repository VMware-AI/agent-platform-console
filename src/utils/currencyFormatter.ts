/**
 * Currency formatting utilities for the metering settings pages.
 * Pure functions — no Vue or GraphQL dependencies.
 */

export function formatConversionPair(from: string, to: string, rate: number): string {
  return `1 ${from} = ${rate.toFixed(4)} ${to}`
}

export function formatConversionResult(
  amount: number,
  from: string,
  to: string,
  rate: number,
  precision?: number,
): string {
  const result = amount * rate
  const digits = precision ?? 2
  return `${amount.toFixed(2)} ${from} = ${result.toFixed(digits)} ${to}`
}

export function formatRateValue(rate: number): string {
  return parseFloat(rate.toFixed(8)).toString()
}

export function formatCurrencyPair(from: string, to: string): string {
  return `${from}/${to}`
}
