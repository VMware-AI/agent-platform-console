import { gql } from '@apollo/client/core'

export const CURRENCY_SETTINGS_QUERY = gql`
  query CurrencySettings {
    currencySettings {
      baseCurrency
      defaultDisplayCurrency
      amountPrecision
      preserveOriginalAmount
    }
  }
`

export const EXCHANGE_RATES_QUERY = gql`
  query ExchangeRates {
    exchangeRates {
      id
      fromCurrency
      toCurrency
      rate
      source
      status
      effectiveFrom
      effectiveTo
      note
      createdBy
      updatedAt
    }
  }
`

export const EXCHANGE_RATE_HISTORY_QUERY = gql`
  query ExchangeRateHistory($rateId: ID!) {
    exchangeRateHistory(rateId: $rateId) {
      id
      fromCurrency
      toCurrency
      rate
      source
      status
      effectiveFrom
      effectiveTo
      note
      createdBy
      updatedAt
    }
  }
`

export const CONVERSION_PREVIEW_QUERY = gql`
  query ConversionPreview($fromCurrency: String!, $toCurrency: String!, $amount: Float!) {
    conversionPreview(fromCurrency: $fromCurrency, toCurrency: $toCurrency, amount: $amount) {
      fromCurrency
      toCurrency
      fromAmount
      toAmount
      rate
      rateDescription
      effectiveFrom
    }
  }
`

export const COST_RULES_QUERY = gql`
  query CostRuleConfig {
    costRuleConfig {
      missingPriceAction
      chargeFailedRequests
      countCacheReadTokens
      countCacheWriteTokens
      roundingRule
      forecastMethod
      alertMissingPrice
      alertMissingRate
      alertMonthlyBudget
      alertUsageSpike
    }
  }
`

export const CREATE_EXCHANGE_RATE = gql`
  mutation CreateExchangeRate($input: CreateExchangeRateInput!) {
    createExchangeRate(input: $input) {
      id
      fromCurrency
      toCurrency
      rate
      source
      status
      effectiveFrom
      effectiveTo
      note
      createdBy
      updatedAt
    }
  }
`

export const UPDATE_EXCHANGE_RATE = gql`
  mutation UpdateExchangeRate($input: UpdateExchangeRateInput!) {
    updateExchangeRate(input: $input) {
      id
      fromCurrency
      toCurrency
      rate
      source
      status
      effectiveFrom
      effectiveTo
      note
      createdBy
      updatedAt
    }
  }
`

export const DEACTIVATE_EXCHANGE_RATE = gql`
  mutation DeactivateExchangeRate($id: ID!) {
    deactivateExchangeRate(id: $id) {
      id
      status
    }
  }
`

export const UPDATE_CURRENCY_SETTINGS = gql`
  mutation UpdateCurrencySettings($input: UpdateCurrencySettingsInput!) {
    updateCurrencySettings(input: $input) {
      baseCurrency
      defaultDisplayCurrency
      amountPrecision
      preserveOriginalAmount
    }
  }
`

export const UPDATE_COST_RULES = gql`
  mutation UpdateCostRules($input: UpdateCostRulesInput!) {
    updateCostRules(input: $input) {
      missingPriceAction
      chargeFailedRequests
      countCacheReadTokens
      countCacheWriteTokens
      roundingRule
      forecastMethod
      alertMissingPrice
      alertMissingRate
      alertMonthlyBudget
      alertUsageSpike
    }
  }
`
