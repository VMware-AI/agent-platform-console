<script setup lang="ts">
import { ref, computed } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { useExchangeRates } from '@/composables/useExchangeRates'
import { formatConversionPair, formatCurrencyPair, formatRateValue } from '@/utils/currencyFormatter'
import type { ExchangeRate } from '@/types/metering-settings'
import ExchangeRateDrawer from './ExchangeRateDrawer.vue'
import ExchangeRateHistoryDrawer from './ExchangeRateHistoryDrawer.vue'

const locale = useLocaleStore()
const { result, loading, deactivateRate } = useExchangeRates()

const rates = computed<ExchangeRate[]>(() => result.value?.exchangeRates ?? [])

const drawerOpen = ref(false)
const editingRate = ref<ExchangeRate | null>(null)
const historyOpen = ref(false)
const historyRateId = ref<string | null>(null)

function openAdd(): void {
  editingRate.value = null
  drawerOpen.value = true
}

function openEdit(rate: ExchangeRate): void {
  editingRate.value = rate
  drawerOpen.value = true
}

function openHistory(rate: ExchangeRate): void {
  historyRateId.value = rate.id
  historyOpen.value = true
}

async function handleDeactivate(rate: ExchangeRate): Promise<void> {
  if (!confirm(locale.t('meteringSetting.confirmDeactivate'))) return
  await deactivateRate(rate.id)
}

function handleDrawerClose(): void {
  drawerOpen.value = false
  editingRate.value = null
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

function statusLabel(status: string): string {
  return status === 'ACTIVE' ? locale.t('meteringSetting.active') : locale.t('meteringSetting.inactive')
}

function statusBadge(status: string): 'success' | 'neutral' {
  return status === 'ACTIVE' ? 'success' : 'neutral'
}
</script>

<template>
  <cds-card>
    <div class="card-header">
      <h2>{{ locale.t('meteringSetting.exchangeRate') }}</h2>
      <cds-button status="primary" size="sm" @click="openAdd">
        + {{ locale.t('meteringSetting.addRate') }}
      </cds-button>
    </div>

    <div v-if="loading" class="loading">{{ locale.t('meteringSetting.loading') }}</div>
    <div v-else-if="!rates.length" class="empty">{{ locale.t('meteringSetting.noRates') }}</div>
    <div v-else class="table-wrap">
      <table class="rate-table">
        <thead>
          <tr>
            <th>{{ locale.t('meteringSetting.currencyPair') }}</th>
            <th>{{ locale.t('meteringSetting.conversionRelation') }}</th>
            <th class="num">{{ locale.t('meteringSetting.rateValue') }}</th>
            <th>{{ locale.t('meteringSetting.source') }}</th>
            <th>{{ locale.t('meteringSetting.status') }}</th>
            <th>{{ locale.t('meteringSetting.effectiveFrom') }}</th>
            <th>{{ locale.t('meteringSetting.updatedAt') }}</th>
            <th>{{ locale.t('meteringSetting.updatedBy') }}</th>
            <th>{{ locale.t('meteringSetting.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rate in rates" :key="rate.id">
            <td class="pair">{{ formatCurrencyPair(rate.fromCurrency, rate.toCurrency) }}</td>
            <td class="conversion">{{ formatConversionPair(rate.fromCurrency, rate.toCurrency, rate.rate) }}</td>
            <td class="num rate-val">{{ formatRateValue(rate.rate) }}</td>
            <td>
              <cds-badge :status="rate.source === 'MANUAL' ? 'neutral' : 'info'">
                {{ rate.source === 'MANUAL' ? locale.t('meteringSetting.manual') : locale.t('meteringSetting.system') }}
              </cds-badge>
            </td>
            <td>
              <cds-badge :status="statusBadge(rate.status)">
                {{ statusLabel(rate.status) }}
              </cds-badge>
            </td>
            <td class="time">{{ formatTime(rate.effectiveFrom) }}</td>
            <td class="time">{{ formatTime(rate.updatedAt) }}</td>
            <td>{{ rate.createdBy || '—' }}</td>
            <td>
              <div class="actions-cell">
                <cds-button size="sm" action="flat" @click="openEdit(rate)">{{ locale.t('meteringSetting.edit') }}</cds-button>
                <cds-button v-if="rate.status === 'ACTIVE'" size="sm" action="flat" @click="handleDeactivate(rate)">
                  {{ locale.t('meteringSetting.deactivate') }}
                </cds-button>
                <cds-button size="sm" action="flat" @click="openHistory(rate)">{{ locale.t('meteringSetting.history') }}</cds-button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </cds-card>

  <ExchangeRateDrawer
    :open="drawerOpen"
    :editing="editingRate"
    @close="handleDrawerClose"
  />

  <ExchangeRateHistoryDrawer
    :open="historyOpen"
    :rate-id="historyRateId"
    @close="historyOpen = false"
  />
</template>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  margin-bottom: 12px;
}
.card-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.table-wrap {
  overflow-x: auto;
}
.rate-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.rate-table th,
.rate-table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e0e0e0);
  white-space: nowrap;
}
.rate-table th {
  font-weight: 600;
  font-size: 11px;
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
  text-transform: uppercase;
}
.rate-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.rate-table .rate-val {
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
}
.rate-table .pair {
  font-weight: 600;
}
.rate-table .time {
  font-size: 11px;
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
}
.rate-table .conversion {
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
  font-size: 12px;
}
.actions-cell {
  display: flex;
  gap: 4px;
}
.loading, .empty {
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
  font-size: 13px;
}
</style>
