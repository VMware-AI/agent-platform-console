<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { useExchangeRates } from '@/composables/useExchangeRates'
import { SUPPORTED_CURRENCIES } from '@/types/metering-settings'
import { formatConversionResult } from '@/utils/currencyFormatter'
import type { ConversionPreview } from '@/types/metering-settings'

const locale = useLocaleStore()
const { previewConversion } = useExchangeRates()

const amount = ref(100)
const fromCurrency = ref('USD')
const toCurrency = ref('CNY')
const preview = ref<ConversionPreview | null>(null)
const previewLoading = ref(false)
const previewError = ref('')

const showResult = computed(() => preview.value !== null)
const showError = computed(() => previewError.value !== '')

async function doPreview(): Promise<void> {
  if (amount.value <= 0 || !fromCurrency.value || !toCurrency.value) {
    previewError.value = locale.t('meteringSetting.previewValidationError')
    return
  }
  previewLoading.value = true
  previewError.value = ''
  try {
    const result = await previewConversion(fromCurrency.value, toCurrency.value, amount.value)
    preview.value = result
  } catch {
    previewError.value = locale.t('meteringSetting.previewError')
  } finally {
    previewLoading.value = false
  }
}

// Auto-convert on input change (debounced)
let timer: ReturnType<typeof setTimeout>
watch([amount, fromCurrency, toCurrency], () => {
  clearTimeout(timer)
  timer = setTimeout(doPreview, 400)
})

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}
</script>

<template>
  <cds-card>
    <div class="card-header">
      <h2>{{ locale.t('meteringSetting.conversionPreview') }}</h2>
    </div>
    <p class="card-desc">{{ locale.t('meteringSetting.conversionPreviewHint') }}</p>

    <div class="preview-form">
      <div class="field">
        <label class="field-label">{{ locale.t('meteringSetting.amount') }}</label>
        <input v-model.number="amount" type="number" min="0" step="0.01" class="preview-input" />
      </div>
      <div class="field">
        <label class="field-label">{{ locale.t('meteringSetting.fromCurrency') }}</label>
        <select v-model="fromCurrency" class="preview-select" :aria-label="locale.t('meteringSetting.fromCurrency')">
          <option v-for="c in SUPPORTED_CURRENCIES" :key="c.code" :value="c.code">
            {{ c.code }}
          </option>
        </select>
      </div>
      <span class="arrow">→</span>
      <div class="field">
        <label class="field-label">{{ locale.t('meteringSetting.toCurrency') }}</label>
        <select v-model="toCurrency" class="preview-select" :aria-label="locale.t('meteringSetting.toCurrency')">
          <option v-for="c in SUPPORTED_CURRENCIES" :key="c.code" :value="c.code">
            {{ c.code }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="previewLoading" class="loading">{{ locale.t('meteringSetting.calculating') }}</div>
    <div v-else-if="showError" class="error">{{ previewError }}</div>
    <div v-else-if="showResult && preview" class="preview-result">
      <div class="result-main">
        {{ formatConversionResult(preview.fromAmount, preview.fromCurrency, preview.toCurrency, preview.rate) }}
      </div>
      <div class="result-meta">
        {{ locale.t('meteringSetting.useRate') }}: {{ preview.rateDescription }}
      </div>
      <div class="result-meta">
        {{ locale.t('meteringSetting.effectiveFrom') }}: {{ formatTime(preview.effectiveFrom) }}
      </div>
    </div>
  </cds-card>
</template>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  margin-bottom: 4px;
}
.card-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.card-desc {
  font-size: 12px;
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
  margin: 0 0 12px;
}
.preview-form {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 16px;
}
.preview-form .field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.field-label {
  font-size: 11px;
  font-weight: 600;
}
.preview-input {
  padding: 6px 8px;
  border: 1px solid var(--cds-alias-object-border-color, #d0d5dd);
  border-radius: 4px;
  font: 13px / 1.5 inherit;
}
.preview-input:focus {
  outline: none;
  border-color: var(--cds-alias-object-interaction-color, #006e9c);
}
/* Plain <select> — we avoid cds-select to sidestep Clarity v6's web-component
   firstUpdated bug (the cds-control decorator throws when it can't find the
   slotted input in time). */
.preview-select {
  padding: 6px 8px;
  border: 1px solid var(--cds-alias-object-border-color, #d0d5dd);
  border-radius: 4px;
  font: 13px / 1.5 inherit;
  background: #fff;
  cursor: pointer;
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, #667085 50%),
                    linear-gradient(135deg, #667085 50%, transparent 50%);
  background-position: calc(100% - 14px) 14px, calc(100% - 9px) 14px;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
  padding-right: 28px;
}
.preview-select:focus {
  outline: none;
  border-color: var(--cds-alias-object-interaction-color, #006e9c);
}
.arrow {
  font-size: 18px;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
  padding-bottom: 4px;
}
.preview-result {
  padding: 12px;
  background: var(--cds-alias-object-app-background, #f5f7fa);
  border-radius: 4px;
}
.result-main {
  font-size: 20px;
  font-weight: 600;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-variant-numeric: tabular-nums;
}
.result-meta {
  font-size: 12px;
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
  margin-top: 4px;
}
.loading, .error {
  font-size: 13px;
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
}
.error {
  color: var(--cds-alias-status-danger, #d32f2f);
}
@media (max-width: 768px) {
  .preview-form {
    flex-direction: column;
  }
  .arrow {
    align-self: center;
    transform: rotate(90deg);
  }
}
</style>
