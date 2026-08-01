<script setup lang="ts">
import { ref, watch } from 'vue'
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
  (v: { baseCurrency?: string; defaultDisplayCurrency?: string; amountPrecision?: number } | null | undefined) => {
    if (v) {
      baseCurrency.value = v.baseCurrency ?? baseCurrency.value
      displayCurrency.value = v.defaultDisplayCurrency ?? displayCurrency.value
      precision.value = v.amountPrecision ?? precision.value
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
        <select v-model="baseCurrency" class="styled-select" :aria-label="locale.t('meteringSetting.baseCurrency')">
          <option v-for="c in SUPPORTED_CURRENCIES" :key="c.code" :value="c.code">
            {{ c.code }} — {{ c.name }}
          </option>
        </select>
        <span class="field-hint">{{ locale.t('meteringSetting.baseCurrencyHint') }}</span>
      </div>

      <div class="field">
        <label class="field-label">{{ locale.t('meteringSetting.displayCurrency') }}</label>
        <select v-model="displayCurrency" class="styled-select" :aria-label="locale.t('meteringSetting.displayCurrency')">
          <option v-for="c in SUPPORTED_CURRENCIES" :key="c.code" :value="c.code">
            {{ c.code }} — {{ c.name }}
          </option>
        </select>
        <span class="field-hint">{{ locale.t('meteringSetting.displayCurrencyHint') }}</span>
      </div>

      <div class="field">
        <label class="field-label">{{ locale.t('meteringSetting.precision') }}</label>
        <select v-model.number="precision" class="styled-select" :aria-label="locale.t('meteringSetting.precision')">
          <option :value="2">2 {{ locale.t('meteringSetting.digits') }}</option>
          <option :value="4">4 {{ locale.t('meteringSetting.digits') }}</option>
          <option :value="6">6 {{ locale.t('meteringSetting.digits') }}</option>
        </select>
        <span class="field-hint">{{ locale.t('meteringSetting.precisionHint') }}</span>
      </div>

      <div class="field">
        <label class="field-label">{{ locale.t('meteringSetting.preserveOriginal') }}</label>
        <div class="readonly-toggle">
          <label class="toggle-switch"><input type="checkbox" checked disabled :aria-label="locale.t('meteringSetting.preserveOriginal')"/><span class="toggle-slider"/></label>
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
/* Plain <select>/checkbox styled to look like Clarity's cds-select/cds-toggle.
   We use plain HTML here to sidestep Clarity v6's web-component bugs
   (the cds-control decorator throws when its slotted input isn't found
   in time during firstUpdated — see useCurrencySettings.ts:10 in dev). */
.styled-select {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  background: #fff;
  border: 1px solid var(--cds-alias-object-border-color, #cfd6df);
  border-radius: 4px;
  cursor: pointer;
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, #667085 50%),
                    linear-gradient(135deg, #667085 50%, transparent 50%);
  background-position: calc(100% - 14px) 14px, calc(100% - 9px) 14px;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
  padding-right: 28px;
}
.styled-select:focus {
  outline: 2px solid var(--cds-alias-object-interaction-color, #006e9c);
  outline-offset: 1px;
}
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 32px;
  height: 18px;
  flex-shrink: 0;
}
.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.toggle-slider {
  position: absolute;
  inset: 0;
  background: #12b76a;
  border-radius: 18px;
  transition: 0.15s;
}
.toggle-slider::before {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  left: 2px;
  top: 2px;
  background: #fff;
  border-radius: 50%;
  transition: 0.15s;
}
.toggle-switch input:disabled + .toggle-slider {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
