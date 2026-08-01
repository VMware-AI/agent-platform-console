<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { useExchangeRates } from '@/composables/useExchangeRates'
import { SUPPORTED_CURRENCIES } from '@/types/metering-settings'
import { validateRate, validateCurrencyPair, validateEffectiveTime } from '@/utils/exchangeRateValidation'
import { formatConversionPair, formatConversionResult } from '@/utils/currencyFormatter'
import type { ExchangeRate, ExchangeRateSource } from '@/types/metering-settings'

const props = defineProps<{
  open: boolean
  editing: ExchangeRate | null
}>()

const emit = defineEmits<{ close: [] }>()

const locale = useLocaleStore()
const { createRate, updateRate } = useExchangeRates()

const fromCurrency = ref('USD')
const toCurrency = ref('CNY')
const rateValue = ref('')
const effectiveFrom = ref('')
const source = ref<ExchangeRateSource>('MANUAL')
const note = ref('')
const saving = ref(false)
const rateError = ref('')
const pairError = ref('')
const timeError = ref('')

const isEdit = computed(() => props.editing !== null)

function initForm(): void {
  if (props.editing) {
    fromCurrency.value = props.editing.fromCurrency
    toCurrency.value = props.editing.toCurrency
    rateValue.value = String(props.editing.rate)
    effectiveFrom.value = props.editing.effectiveFrom ? toLocalInput(new Date(props.editing.effectiveFrom)) : ''
    source.value = props.editing.source
    note.value = props.editing.note ?? ''
  } else {
    fromCurrency.value = 'USD'
    toCurrency.value = 'CNY'
    rateValue.value = ''
    effectiveFrom.value = toLocalInput(new Date())
    source.value = 'MANUAL'
    note.value = ''
  }
  rateError.value = ''
  pairError.value = ''
  timeError.value = ''
}

watch(() => props.open, (v) => { if (v) initForm() })

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const rateNum = computed(() => {
  const n = Number(rateValue.value)
  return Number.isNaN(n) ? 0 : n
})

const conversionDescription = computed(() => {
  if (rateNum.value <= 0 || !fromCurrency.value || !toCurrency.value) return ''
  return formatConversionPair(fromCurrency.value, toCurrency.value, rateNum.value)
})

const conversionExample = computed(() => {
  if (rateNum.value <= 0 || !fromCurrency.value || !toCurrency.value) return ''
  return formatConversionResult(100, fromCurrency.value, toCurrency.value, rateNum.value)
})

function validate(): boolean {
  const r = validateRate(rateValue.value)
  const p = validateCurrencyPair(fromCurrency.value, toCurrency.value)
  const t = validateEffectiveTime(effectiveFrom.value)
  rateError.value = r.valid ? '' : (r.error ?? '')
  pairError.value = p.valid ? '' : (p.error ?? '')
  timeError.value = t.valid ? '' : (t.error ?? '')
  return r.valid && p.valid && t.valid
}

async function handleSave(): Promise<void> {
  if (!validate()) return
  saving.value = true
  try {
    if (isEdit.value && props.editing) {
      await updateRate({
        id: props.editing.id,
        rate: rateNum.value,
        note: note.value || null,
      })
    } else {
      await createRate({
        fromCurrency: fromCurrency.value,
        toCurrency: toCurrency.value,
        rate: rateNum.value,
        source: source.value,
        effectiveFrom: new Date(effectiveFrom.value).toISOString(),
        note: note.value || null,
      })
    }
    emit('close')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="open" class="drawer-overlay" @click.self="emit('close')">
    <div class="drawer-panel">
      <div class="drawer-header">
        <h3>{{ isEdit ? locale.t('meteringSetting.editRate') : locale.t('meteringSetting.addRate') }}</h3>
        <cds-button size="sm" action="flat" @click="emit('close')">✕</cds-button>
      </div>

      <div class="drawer-body">
        <div class="form-group">
          <label class="form-label">{{ locale.t('meteringSetting.baseCurrency') }}</label>
          <cds-select control-width="stretch">
            <select v-model="fromCurrency" :disabled="isEdit">
              <option v-for="c in SUPPORTED_CURRENCIES" :key="c.code" :value="c.code">
                {{ c.code }} — {{ c.name }}
              </option>
            </select>
          </cds-select>
        </div>

        <div class="form-group">
          <label class="form-label">{{ locale.t('meteringSetting.targetCurrency') }}</label>
          <cds-select control-width="stretch">
            <select v-model="toCurrency" :disabled="isEdit">
              <option v-for="c in SUPPORTED_CURRENCIES" :key="c.code" :value="c.code">
                {{ c.code }} — {{ c.name }}
              </option>
            </select>
          </cds-select>
          <span v-if="pairError" class="form-error">{{ pairError }}</span>
        </div>

        <div class="form-group">
          <label class="form-label">{{ locale.t('meteringSetting.rateValue') }}</label>
          <input
            v-model="rateValue"
            type="number"
            step="0.00000001"
            min="0"
            class="rate-input"
            placeholder="7.2500"
          />
          <span v-if="rateError" class="form-error">{{ rateError }}</span>
          <span v-if="conversionDescription" class="form-preview">{{ conversionDescription }}</span>
          <span v-if="conversionExample" class="form-example">{{ conversionExample }}</span>
        </div>

        <div class="form-group">
          <label class="form-label">{{ locale.t('meteringSetting.effectiveFrom') }}</label>
          <input v-model="effectiveFrom" type="datetime-local" class="rate-input" />
          <span v-if="timeError" class="form-error">{{ timeError }}</span>
        </div>

        <div class="form-group">
          <label class="form-label">{{ locale.t('meteringSetting.source') }}</label>
          <cds-select control-width="stretch">
            <select v-model="source">
              <option value="MANUAL">{{ locale.t('meteringSetting.manual') }}</option>
              <option value="SYSTEM">{{ locale.t('meteringSetting.system') }}</option>
            </select>
          </cds-select>
        </div>

        <div class="form-group">
          <label class="form-label">{{ locale.t('meteringSetting.note') }}</label>
          <textarea v-model="note" class="note-input" rows="3" :placeholder="locale.t('meteringSetting.notePlaceholder')" />
        </div>
      </div>

      <div class="drawer-footer">
        <cds-button action="outline" @click="emit('close')">{{ locale.t('meteringSetting.cancel') }}</cds-button>
        <cds-button status="primary" @click="handleSave" :loading="saving">{{ locale.t('branding.save') }}</cds-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}
.drawer-panel {
  width: 480px;
  max-width: 100vw;
  height: 100%;
  background: var(--cds-alias-object-container-background, #fff);
  display: flex;
  flex-direction: column;
  box-shadow: -2px 0 12px rgba(0, 0, 0, 0.15);
}
.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e0e0e0);
}
.drawer-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--cds-alias-object-border-color, #e0e0e0);
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-label {
  font-size: 12px;
  font-weight: 600;
}
.rate-input, .note-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--cds-alias-object-border-color, #d0d5dd);
  border-radius: 4px;
  font: 13px / 1.5 inherit;
  box-sizing: border-box;
}
.rate-input:focus, .note-input:focus {
  outline: none;
  border-color: var(--cds-alias-object-interaction-color, #006e9c);
}
.form-error {
  font-size: 11px;
  color: var(--cds-alias-status-danger, #d32f2f);
}
.form-preview {
  font-size: 13px;
  font-weight: 600;
  font-family: 'SF Mono', 'Consolas', monospace;
  margin-top: 4px;
  color: var(--cds-alias-object-interaction-color, #006e9c);
}
.form-example {
  font-size: 12px;
  font-family: 'SF Mono', 'Consolas', monospace;
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
}
</style>
