import { useQuery, useMutation } from '@vue/apollo-composable'
import {
  CURRENCY_SETTINGS_QUERY,
  UPDATE_CURRENCY_SETTINGS,
} from '@/api/graphql/queries/metering-settings'
import type { UpdateCurrencySettingsInput, CurrencySettings } from '@/types/metering-settings'
import { ref } from 'vue'

export function useCurrencySettings() {
  const { result, loading, refetch } = useQuery<{ currencySettings: CurrencySettings }>(
    CURRENCY_SETTINGS_QUERY,
  )
  const {
    mutate: saveMutation,
    loading: saving,
    onDone,
  } = useMutation<
    { updateCurrencySettings: CurrencySettings },
    { input: UpdateCurrencySettingsInput }
  >(UPDATE_CURRENCY_SETTINGS)

  const saveError = ref<string | null>(null)

  onDone(() => {
    saveError.value = null
    refetch()
  })

  async function saveSettings(input: UpdateCurrencySettingsInput): Promise<void> {
    saveError.value = null
    await saveMutation({ input })
  }

  return { result, loading, saving, saveError, saveSettings, refetch }
}
