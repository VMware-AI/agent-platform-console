<script setup lang="ts">
import { watch, ref } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { useExchangeRates } from '@/composables/useExchangeRates'
import { formatRateValue } from '@/utils/currencyFormatter'
import type { ExchangeRateHistoryEntry } from '@/types/metering-settings'

const props = defineProps<{
  open: boolean
  rateId: string | null
}>()

const emit = defineEmits<{ close: [] }>()

const locale = useLocaleStore()
const { fetchHistory } = useExchangeRates()

const entries = ref<ExchangeRateHistoryEntry[]>([])
const loading = ref(false)

watch(() => props.open, async (v) => {
  if (v && props.rateId) {
    loading.value = true
    entries.value = await fetchHistory(props.rateId)
    loading.value = false
  }
})

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}
</script>

<template>
  <div v-if="open" class="drawer-overlay" @click.self="emit('close')">
    <div class="drawer-panel">
      <div class="drawer-header">
        <h3>{{ locale.t('meteringSetting.historyTitle') }}</h3>
        <cds-button size="sm" action="flat" @click="emit('close')">✕</cds-button>
      </div>

      <div class="drawer-body">
        <div v-if="loading">{{ locale.t('meteringSetting.loading') }}</div>
        <div v-else-if="!entries.length" class="empty">{{ locale.t('meteringSetting.noHistory') }}</div>
        <table v-else class="history-table">
          <thead>
            <tr>
              <th>{{ locale.t('meteringSetting.effectiveFrom') }}</th>
              <th>{{ locale.t('meteringSetting.effectiveTo') }}</th>
              <th>{{ locale.t('meteringSetting.rateValue') }}</th>
              <th>{{ locale.t('meteringSetting.source') }}</th>
              <th>{{ locale.t('meteringSetting.updatedBy') }}</th>
              <th>{{ locale.t('meteringSetting.updatedAt') }}</th>
              <th>{{ locale.t('meteringSetting.note') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in entries" :key="entry.id">
              <td>{{ formatTime(entry.effectiveFrom) }}</td>
              <td>{{ entry.effectiveTo ? formatTime(entry.effectiveTo) : '—' }}</td>
              <td class="num">{{ formatRateValue(entry.rate) }}</td>
              <td>
                <cds-badge :status="entry.source === 'MANUAL' ? 'neutral' : 'info'">
                  {{ entry.source === 'MANUAL' ? locale.t('meteringSetting.manual') : locale.t('meteringSetting.system') }}
                </cds-badge>
              </td>
              <td>{{ entry.createdBy || '—' }}</td>
              <td>{{ formatTime(entry.updatedAt) }}</td>
              <td>{{ entry.note || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1001;
  display: flex;
  justify-content: flex-end;
}
.drawer-panel {
  width: 640px;
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
}
.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.history-table th,
.history-table td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e0e0e0);
  white-space: nowrap;
}
.history-table th {
  font-weight: 600;
  font-size: 11px;
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
}
.history-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-family: 'SF Mono', 'Consolas', monospace;
}
.empty {
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
  font-size: 13px;
}
</style>
