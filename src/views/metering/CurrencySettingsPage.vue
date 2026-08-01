<script setup lang="ts">
import CurrencyGeneralSettings from '@/components/metering/CurrencyGeneralSettings.vue'
import ExchangeRateTable from '@/components/metering/ExchangeRateTable.vue'
import CurrencyConversionPreview from '@/components/metering/CurrencyConversionPreview.vue'
</script>

<template>
  <div class="currency-page">
    <CurrencyGeneralSettings />
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
</style>
