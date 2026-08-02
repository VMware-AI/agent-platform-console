<script setup lang="ts">
import { ref } from 'vue'
import { useMutation } from '@vue/apollo-composable'
import CurrencyGeneralSettings from '@/components/metering/CurrencyGeneralSettings.vue'
import ExchangeRateTable from '@/components/metering/ExchangeRateTable.vue'
import CurrencyConversionPreview from '@/components/metering/CurrencyConversionPreview.vue'
import { UPDATE_CURRENCY_SETTINGS } from '@/api/graphql/queries/metering-settings'
import type { UpdateCurrencySettingsInput, CurrencySettings } from '@/types/metering-settings'

// 货币与汇率设置页：保存逻辑在此组件内完成（用 useMutation 直接发请求），
// 子组件 CurrencyGeneralSettings 通过 `getValues()` 提供当前表单值。
// 这样 saving / saved 是 page 一级的本地 ref，defineExpose 出去后父级 modal
// 读取的是单层 getter，响应式链稳定，不再有跨组件 nested defineExpose
// 追踪不到的隐患（之前 CurrencySettingsPage 再 defineExpose CurrencyGeneralSettings
// 的 saving/saved 会让 modalSaving computed 在 Apollo loading 变化时偶发不重算）。
const inner = ref<InstanceType<typeof CurrencyGeneralSettings> | null>(null)

const { mutate: saveMutation, loading: saving } = useMutation<
  { updateCurrencySettings: CurrencySettings },
  { input: UpdateCurrencySettingsInput }
>(UPDATE_CURRENCY_SETTINGS)
const saved = ref(false)

async function handleSave(): Promise<void> {
  if (!inner.value) return
  // Skip mutation when the form hasn't changed — avoids no-op POSTs that
  // would otherwise race with the query refetch and might flash the
  // 「已保存」indicator for a request that didn't actually do anything.
  if (!inner.value.isDirty()) return
  const input = inner.value.getValues()
  // 不在成功后才设置 saved — mutation 报错会抛错到 modal 由上层 toast 兜底，
  // 此时 saved 仍是 false，modalSaved 也就不会误显示「已保存」。
  await saveMutation({ input })
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}

defineExpose({ handleSave, saving, saved })
</script>

<template>
  <div class="currency-page">
    <CurrencyGeneralSettings ref="inner" />
    <ExchangeRateTable />
    <CurrencyConversionPreview />
  </div>
</template>

<style scoped>
.currency-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
/* cds-card inside the modal is forced block + 100% via global.css
   (`cds-modal cds-card { ... }`). */
</style>
