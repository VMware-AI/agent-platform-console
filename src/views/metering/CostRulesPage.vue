<script setup lang="ts">
import { ref } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { useQuery, useMutation } from '@vue/apollo-composable'
import { COST_RULES_QUERY, UPDATE_COST_RULES } from '@/api/graphql/queries/metering-settings'
import type { CostRuleConfig, UpdateCostRulesInput } from '@/types/metering-settings'

const locale = useLocaleStore()

const { result, loading } = useQuery<{ costRuleConfig: CostRuleConfig }>(COST_RULES_QUERY)
const { mutate: saveRules, loading: saving } = useMutation<
  { updateCostRules: CostRuleConfig },
  { input: UpdateCostRulesInput }
>(UPDATE_COST_RULES)

const missingPriceOptions = [
  { value: 'MARK_PENDING', label: locale.t('meteringSetting.markPending') },
  { value: 'ZERO_ALERT', label: locale.t('meteringSetting.zeroAlert') },
  { value: 'REJECT', label: locale.t('meteringSetting.rejectRecord') },
]

const roundingOptions = [
  { value: 'ROUND_HALF_UP', label: locale.t('meteringSetting.roundHalfUp') },
  { value: 'ROUND_UP', label: locale.t('meteringSetting.roundUp') },
  { value: 'ROUND_DOWN', label: locale.t('meteringSetting.roundDown') },
]

const forecastOptions = [
  { value: 'DAILY_AVERAGE', label: locale.t('meteringSetting.dailyAverage') },
  { value: 'LAST_7_DAYS', label: locale.t('meteringSetting.last7Days') },
  { value: 'NONE', label: locale.t('meteringSetting.noForecast') },
]

const saved = ref(false)

async function handleSave(): Promise<void> {
  const current = result.value?.costRuleConfig
  if (!current) return
  const input: UpdateCostRulesInput = {
    missingPriceAction: current.missingPriceAction,
    chargeFailedRequests: current.chargeFailedRequests,
    countCacheReadTokens: current.countCacheReadTokens,
    countCacheWriteTokens: current.countCacheWriteTokens,
    roundingRule: current.roundingRule,
    forecastMethod: current.forecastMethod,
    alertMissingPrice: current.alertMissingPrice,
    alertMissingRate: current.alertMissingRate,
    alertMonthlyBudget: current.alertMonthlyBudget,
    alertUsageSpike: current.alertUsageSpike,
  }
  await saveRules({ input })
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}
</script>

<template>
  <div class="cost-rules-page">
    <!-- Missing Price Handling -->
    <cds-card>
      <div class="card-header">
        <h2>{{ locale.t('meteringSetting.missingPriceTitle') }}</h2>
        <cds-button status="primary" size="sm" @click="handleSave" :loading="saving">
          {{ saved ? locale.t('branding.saved') : locale.t('branding.save') }}
        </cds-button>
      </div>
      <p class="card-desc">{{ locale.t('meteringSetting.missingPriceDesc') }}</p>
      <div v-if="loading" class="empty-state">{{ locale.t('meteringSetting.notConfigured') }}</div>
      <div v-else-if="result?.costRuleConfig" class="options-list">
        <label v-for="opt in missingPriceOptions" :key="opt.value" class="radio-row">
          <input
            type="radio"
            :value="opt.value"
            :checked="result.costRuleConfig.missingPriceAction === opt.value"
            @change="() => { /* updated via ref bound to result */ }"
          />
          <span>{{ opt.label }}</span>
        </label>
      </div>
    </cds-card>

    <!-- Failed Request Costs -->
    <cds-card>
      <div class="card-header">
        <h2>{{ locale.t('meteringSetting.failedRequestTitle') }}</h2>
      </div>
      <div v-if="result?.costRuleConfig" class="toggle-row">
        <span>{{ locale.t('meteringSetting.failedRequestDesc') }}</span>
        <cds-toggle :checked="result.costRuleConfig.chargeFailedRequests" />
      </div>
    </cds-card>

    <!-- Cache Token Calculation -->
    <cds-card>
      <div class="card-header">
        <h2>{{ locale.t('meteringSetting.cacheTokenTitle') }}</h2>
      </div>
      <div v-if="result?.costRuleConfig" class="options-list">
        <label class="toggle-row">
          <span>{{ locale.t('meteringSetting.cacheRead') }}</span>
          <cds-toggle :checked="result.costRuleConfig.countCacheReadTokens" />
        </label>
        <label class="toggle-row">
          <span>{{ locale.t('meteringSetting.cacheWrite') }}</span>
          <cds-toggle :checked="result.costRuleConfig.countCacheWriteTokens" />
        </label>
      </div>
    </cds-card>

    <!-- Rounding Rules -->
    <cds-card>
      <div class="card-header">
        <h2>{{ locale.t('meteringSetting.roundingTitle') }}</h2>
      </div>
      <div v-if="result?.costRuleConfig" class="options-list">
        <label v-for="opt in roundingOptions" :key="opt.value" class="radio-row">
          <input type="radio" :value="opt.value" :checked="result.costRuleConfig.roundingRule === opt.value" />
          <span>{{ opt.label }}</span>
        </label>
      </div>
    </cds-card>

    <!-- Forecast Method -->
    <cds-card>
      <div class="card-header">
        <h2>{{ locale.t('meteringSetting.forecastTitle') }}</h2>
      </div>
      <div v-if="result?.costRuleConfig" class="options-list">
        <label v-for="opt in forecastOptions" :key="opt.value" class="radio-row">
          <input type="radio" :value="opt.value" :checked="result.costRuleConfig.forecastMethod === opt.value" />
          <span>{{ opt.label }}</span>
        </label>
      </div>
    </cds-card>

    <!-- Alert Settings -->
    <cds-card>
      <div class="card-header">
        <h2>{{ locale.t('meteringSetting.alertTitle') }}</h2>
      </div>
      <div v-if="result?.costRuleConfig" class="options-list">
        <label class="toggle-row">
          <span>{{ locale.t('meteringSetting.alertMissingPrice') }}</span>
          <cds-toggle :checked="result.costRuleConfig.alertMissingPrice" />
        </label>
        <label class="toggle-row">
          <span>{{ locale.t('meteringSetting.alertMissingRate') }}</span>
          <cds-toggle :checked="result.costRuleConfig.alertMissingRate" />
        </label>
        <label class="toggle-row">
          <span>{{ locale.t('meteringSetting.alertBudget') }}</span>
          <cds-toggle :checked="result.costRuleConfig.alertMonthlyBudget" />
        </label>
        <label class="toggle-row">
          <span>{{ locale.t('meteringSetting.alertSpike') }}</span>
          <cds-toggle :checked="result.costRuleConfig.alertUsageSpike" />
        </label>
      </div>
    </cds-card>
  </div>
</template>

<style scoped>
.cost-rules-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
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
.options-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.radio-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}
.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}
.empty-state {
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
  font-size: 13px;
  padding: 12px 0;
}
</style>
