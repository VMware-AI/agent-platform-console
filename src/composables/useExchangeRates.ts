import { useQuery, useLazyQuery, useMutation } from '@vue/apollo-composable'
import {
  EXCHANGE_RATES_QUERY,
  EXCHANGE_RATE_HISTORY_QUERY,
  CONVERSION_PREVIEW_QUERY,
  CREATE_EXCHANGE_RATE,
  UPDATE_EXCHANGE_RATE,
  DEACTIVATE_EXCHANGE_RATE,
} from '@/api/graphql/queries/metering-settings'
import type {
  ExchangeRate,
  ExchangeRateHistoryEntry,
  ConversionPreview,
  CreateExchangeRateInput,
  UpdateExchangeRateInput,
} from '@/types/metering-settings'

export function useExchangeRates() {
  const { result, loading, refetch } = useQuery<{ exchangeRates: ExchangeRate[] }>(
    EXCHANGE_RATES_QUERY,
  )

  const {
    mutate: createMut,
    loading: creating,
    onDone: onCreateDone,
  } = useMutation<{ createExchangeRate: ExchangeRate }, { input: CreateExchangeRateInput }>(
    CREATE_EXCHANGE_RATE,
  )

  const {
    mutate: updateMut,
    loading: updating,
    onDone: onUpdateDone,
  } = useMutation<{ updateExchangeRate: ExchangeRate }, { input: UpdateExchangeRateInput }>(
    UPDATE_EXCHANGE_RATE,
  )

  const { mutate: deactivateMut, onDone: onDeactivateDone } = useMutation(DEACTIVATE_EXCHANGE_RATE)

  onCreateDone(() => refetch())
  onUpdateDone(() => refetch())
  onDeactivateDone(() => refetch())

  const { load: loadHistory, result: historyResult } = useLazyQuery<
    { exchangeRateHistory: ExchangeRateHistoryEntry[] },
    { rateId: string }
  >(EXCHANGE_RATE_HISTORY_QUERY)

  const { load: loadPreview, result: previewResult } = useLazyQuery<
    { conversionPreview: ConversionPreview },
    { fromCurrency: string; toCurrency: string; amount: number }
  >(CONVERSION_PREVIEW_QUERY)

  async function createRate(input: CreateExchangeRateInput): Promise<void> {
    await createMut({ input })
  }

  async function updateRate(input: UpdateExchangeRateInput): Promise<void> {
    await updateMut({ input })
  }

  async function deactivateRate(id: string): Promise<void> {
    await deactivateMut({ id })
  }

  async function fetchHistory(rateId: string): Promise<ExchangeRateHistoryEntry[]> {
    const result = await loadHistory(undefined, { rateId })
    return result ? result.exchangeRateHistory : []
  }

  async function previewConversion(
    fromCurrency: string,
    toCurrency: string,
    amount: number,
  ): Promise<ConversionPreview | null> {
    const result = await loadPreview(undefined, { fromCurrency, toCurrency, amount })
    return result ? result.conversionPreview : null
  }

  return {
    result,
    loading,
    creating,
    updating,
    historyResult,
    previewResult,
    createRate,
    updateRate,
    deactivateRate,
    fetchHistory,
    previewConversion,
    refetch,
  }
}
