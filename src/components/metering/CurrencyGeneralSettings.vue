<script setup lang="ts">
import { ref } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { useCurrencySettings } from '@/composables/useCurrencySettings'
import { SUPPORTED_CURRENCIES } from '@/types/metering-settings'

const locale = useLocaleStore()
const { result, loading, saving, saveSettings } = useCurrencySettings()

const baseCurrency = ref('USD')
const displayCurrency = ref('CNY')
const precision = ref(2)
const saved = ref(false)


// Sync from query result
watch(
  () => result.value?.currencySettings,
  (v) => {
    if (v) {
      baseCurrency.value = v.baseCurrency
      displayCurrency.value = v.defaultDisplayCurrency
      precision.value = v.amountPrecision
    }
  },
  { immediate: true },
)

async function handleSave(): Promise<void> {
  await saveSettings({
    baseCurrency: baseCurrency.value,
    defaultDisplayCurrency: displayCurrency.value,
    amountPrecision: precision.value,
    preserveOriginalAmount: true,
  })
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}
</script>

<template>
  <cds-card>
    <div class="card-header">
      <h2>{{ locale.t('meteringSetting.currency') }}</h2>
      <cds-button status="primary" size="sm" @click="handleSave" :loading="saving">
        {{ saved ? locale.t('branding.saved') : locale.t('branding.save') }}
      </cds-button>
    </div>

    <div v-if="loading" class="loading">...</div>
    <div v-else class="settings-grid">
      <div class="field">
        <label class="field-label">{{ locale.t('meteringSetting.baseCurrency') }}</label>
        <cds-select control-width="shrink">
          <select v-model="baseCurrency">
            <option v-for="c in SUPPORTED_CURRENCIES" :key="c.code" :value="c.code">
              {{ c.code }} — {{ c.name }}
            </option>
          </select>
        </cds-select>
        <span class="field-hint">{{ locale.t('meteringSetting.baseCurrencyHint') }}</span>
      </div>

      <div class="field">
        <label class="field-label">{{ locale.t('meteringSetting.displayCurrency') }}</label>
        <cds-select control-width="shrink">
          <select v-model="displayCurrency">
            <option v-for="c in SUPPORTED_CURRENCIES" :key="c.code" :value="c.code">
              {{ c.code }} — {{ c.name }}
            </option>
          </select>
        </cds-select>
        <span class="field-hint">{{ locale.t('meteringSetting.displayCurrencyHint') }}</span>
      </div>

      <div class="field">
        <label class="field-label">{{ locale.t('meteringSetting.precision') }}</label>
        <cds-select control-width="shrink">
          <select v-model.number="precision">
            <option :value="2">2 {{ locale.t('meteringSetting.digits') }}</option>
            <option :value="4">4 {{ locale.t('meteringSetting.digits') }}</option>
            <option :value="6">6 {{ locale.t('meteringSetting.digits') }}</option>
          </select>
        </cds-select>
        <span class="field-hint">{{ locale.t('meteringSetting.precisionHint') }}</span>
      </div>

      <div class="field">
        <label class="field-label">{{ locale.t('meteringSetting.preserveOriginal') }}</label>
        <div class="readonly-toggle">
          <cds-toggle :checked="true" :disabled="true" />
          <span class="field-hint">{{ locale.t('meteringSetting.preserveOriginalHint') }}</span>
        </div>
      </div>
    </div>
  </cds-card>
</template>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.card-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.settings-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
@media (max-width: 1024px) {
  .settings-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 640px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.field-hint {
  font-size: 11px;
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
}
.readonly-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}
.loading {
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
  font-size: 13px;
}
</style>
