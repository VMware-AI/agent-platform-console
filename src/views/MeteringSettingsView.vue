<script setup lang="ts">
import { useLocaleStore } from '@/stores/locale'
import { useRoute } from 'vue-router'

const locale = useLocaleStore()
const route = useRoute()

const tabs = [
  { key: 'currency', label: locale.t('meteringSetting.tabCurrency'), to: '/observability/metering/settings/currency' },
  { key: 'cost-rules', label: locale.t('meteringSetting.tabCostRules'), to: '/observability/metering/settings/cost-rules' },
]

function isActive(key: string): boolean {
  return route.path.includes(`/settings/${key}`)
}
</script>

<template>
  <section class="ms-layout">
    <h1 class="ms-title">{{ locale.t('meteringSetting.title') }}</h1>
    <p class="ms-subtitle">{{ locale.t('meteringSetting.desc') }}</p>

    <nav class="ms-tabs" role="tablist">
      <router-link
        v-for="tab in tabs"
        :key="tab.key"
        :to="tab.to"
        class="ms-tab"
        :class="{ active: isActive(tab.key) }"
        role="tab"
        :aria-selected="isActive(tab.key)"
      >
        {{ tab.label }}
      </router-link>
    </nav>

    <router-view />
  </section>
</template>

<style scoped>
.ms-layout {
  padding: 24px;
  max-width: 100%;
}
.ms-title {
  font-size: 22px;
  margin: 0 0 4px;
  font-weight: 600;
}
.ms-subtitle {
  font-size: 13px;
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
  margin: 0 0 20px;
}
.ms-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #d0d5dd);
  margin-bottom: 20px;
}
.ms-tab {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--cds-alias-object-app-foreground-subtle, #667085);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.ms-tab:hover {
  color: var(--cds-alias-object-interaction-color, #006e9c);
}
.ms-tab.active {
  color: var(--cds-alias-object-interaction-color, #006e9c);
  border-bottom-color: var(--cds-alias-object-interaction-color, #006e9c);
}
</style>
