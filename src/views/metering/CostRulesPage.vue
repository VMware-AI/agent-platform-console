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
  // 当前所有字段都不可编辑（radio 用 :checked 静态绑定，checkbox 全 disabled），
  // 永远没有 dirty，直接短路避免 no-op POST。
  if (!isDirty()) return
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
  // 失败时直接抛给上层（modal 由 toast 兜底），saved 保持 false，
  // modalSaved 就不会误显示「已保存」。
  await saveRules({ input })
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}

// 当前页面所有字段不可编辑，所以永远 clean。保留这个钩子是为了和
// CurrencySettingsPage 对称（同样暴露 isDirty 给父级 modal），未来若加
// 可编辑字段，只把这里改为实际比较即可。
function isDirty(): boolean {
  return false
}

// 在 modal 化后，保存按钮被移到了 MeteringCenterView 的 cds-modal-actions 底部，
// 这里把 handleSave / saving / saved 暴露给父组件调用。
defineExpose({ handleSave, saving, saved, isDirty })
</script>

<template>
  <div class="cost-rules-page">
    <!-- Missing Price Handling -->
    <cds-card>
      <div class="card-header">
        <h2>{{ locale.t('meteringSetting.missingPriceTitle') }}</h2>
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
        <label class="toggle-switch"><input type="checkbox" :checked="result.costRuleConfig.chargeFailedRequests" disabled :aria-label="locale.t('meteringSetting.failedRequestDesc')"/><span class="toggle-slider"/></label>
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
          <label class="toggle-switch"><input type="checkbox" :checked="result.costRuleConfig.countCacheReadTokens" disabled :aria-label="locale.t('meteringSetting.cacheRead')"/><span class="toggle-slider"/></label>
        </label>
        <label class="toggle-row">
          <span>{{ locale.t('meteringSetting.cacheWrite') }}</span>
          <label class="toggle-switch"><input type="checkbox" :checked="result.costRuleConfig.countCacheWriteTokens" disabled :aria-label="locale.t('meteringSetting.cacheWrite')"/><span class="toggle-slider"/></label>
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
          <label class="toggle-switch"><input type="checkbox" :checked="result.costRuleConfig.alertMissingPrice" disabled :aria-label="locale.t('meteringSetting.alertMissingPrice')"/><span class="toggle-slider"/></label>
        </label>
        <label class="toggle-row">
          <span>{{ locale.t('meteringSetting.alertMissingRate') }}</span>
          <label class="toggle-switch"><input type="checkbox" :checked="result.costRuleConfig.alertMissingRate" disabled :aria-label="locale.t('meteringSetting.alertMissingRate')"/><span class="toggle-slider"/></label>
        </label>
        <label class="toggle-row">
          <span>{{ locale.t('meteringSetting.alertBudget') }}</span>
          <label class="toggle-switch"><input type="checkbox" :checked="result.costRuleConfig.alertMonthlyBudget" disabled :aria-label="locale.t('meteringSetting.alertBudget')"/><span class="toggle-slider"/></label>
        </label>
        <label class="toggle-row">
          <span>{{ locale.t('meteringSetting.alertSpike') }}</span>
          <label class="toggle-switch"><input type="checkbox" :checked="result.costRuleConfig.alertUsageSpike" disabled :aria-label="locale.t('meteringSetting.alertSpike')"/><span class="toggle-slider"/></label>
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
/* cds-card inside the modal is forced block + 100% via global.css
   (`cds-modal cds-card { ... }`) so cards here fill the modal width. */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  margin-bottom: 8px;
  /* 硬编码 812px：cds-card host 的 width 不响应 light DOM 选择器，
     实际尺寸靠 slot 内的内容反向撑开。手动验证 812px 时 cds-card 铺满
     modal-lg（约 691px dialog + padding）的内容区。 */
  width: 812px;
  max-width: 100%;
  box-sizing: border-box;
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
/* Plain checkbox styled as a slider — we avoid cds-toggle to sidestep
   Clarity v6's web-component firstUpdated bug. */
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
.empty-state {
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
  font-size: 13px;
}
</style>
