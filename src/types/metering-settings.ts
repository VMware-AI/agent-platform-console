export type ExchangeRateSource = 'MANUAL' | 'SYSTEM'

export type ExchangeRateStatus = 'ACTIVE' | 'INACTIVE'

export interface CurrencySettings {
  baseCurrency: string
  defaultDisplayCurrency: string
  amountPrecision: number
  preserveOriginalAmount: boolean
}

export interface ExchangeRate {
  id: string
  fromCurrency: string
  toCurrency: string
  rate: number
  source: ExchangeRateSource
  status: ExchangeRateStatus
  effectiveFrom: string
  effectiveTo: string | null
  note: string | null
  createdBy: string | null
  updatedAt: string
}

export interface ExchangeRateHistoryEntry {
  id: string
  fromCurrency: string
  toCurrency: string
  rate: number
  source: ExchangeRateSource
  status: ExchangeRateStatus
  effectiveFrom: string
  effectiveTo: string | null
  note: string | null
  createdBy: string | null
  updatedAt: string
}

export interface ConversionPreview {
  fromCurrency: string
  toCurrency: string
  fromAmount: number
  toAmount: number
  rate: number
  rateDescription: string
  effectiveFrom: string
}

export interface CostRuleConfig {
  missingPriceAction: string
  chargeFailedRequests: boolean
  countCacheReadTokens: boolean
  countCacheWriteTokens: boolean
  roundingRule: string
  forecastMethod: string
  alertMissingPrice: boolean
  alertMissingRate: boolean
  alertMonthlyBudget: boolean
  alertUsageSpike: boolean
}

export interface CreateExchangeRateInput {
  fromCurrency: string
  toCurrency: string
  rate: number
  source?: ExchangeRateSource | null
  effectiveFrom: string
  note?: string | null
}

export interface UpdateExchangeRateInput {
  id: string
  rate?: number | null
  status?: ExchangeRateStatus | null
  note?: string | null
}

export interface UpdateCurrencySettingsInput {
  baseCurrency: string
  defaultDisplayCurrency: string
  amountPrecision: number
  preserveOriginalAmount: boolean
}

export interface UpdateCostRulesInput {
  missingPriceAction?: string | null
  chargeFailedRequests?: boolean | null
  countCacheReadTokens?: boolean | null
  countCacheWriteTokens?: boolean | null
  roundingRule?: string | null
  forecastMethod?: string | null
  alertMissingPrice?: boolean | null
  alertMissingRate?: boolean | null
  alertMonthlyBudget?: boolean | null
  alertUsageSpike?: boolean | null
}

export const SUPPORTED_CURRENCIES: readonly { code: string; name: string }[] = [
  { code: 'USD', name: '美元 US Dollar' },
  { code: 'CNY', name: '人民币 Chinese Yuan' },
  { code: 'EUR', name: '欧元 Euro' },
  { code: 'JPY', name: '日元 Japanese Yen' },
  { code: 'GBP', name: '英镑 British Pound' },
  { code: 'KRW', name: '韩元 Korean Won' },
  { code: 'HKD', name: '港币 Hong Kong Dollar' },
  { code: 'SGD', name: '新加坡元 Singapore Dollar' },
  { code: 'AUD', name: '澳元 Australian Dollar' },
  { code: 'CAD', name: '加元 Canadian Dollar' },
  { code: 'CHF', name: '瑞士法郎 Swiss Franc' },
  { code: 'INR', name: '印度卢比 Indian Rupee' },
] as const
