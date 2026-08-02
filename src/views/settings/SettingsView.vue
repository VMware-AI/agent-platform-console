<script setup lang="ts">
/**
 * Page shell for `/platform/settings`. Renders the page header, a `<TabStrip>`,
 * and the active tab (LicenseTab or BrandingTab).
 *
 * Mirrors [UserRoleView.vue](UserRoleView.vue) 1:1 — page-head + TabStrip +
 * v-if/v-else-if child components, local `activeTab` ref (no URL sync, same
 * as 用户与权限). Default tab is `license` so the page lands on the most
 * sensitive (root-permission) view first; users can switch to branding
 * without losing license state.
 */
import { computed, ref } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import TabStrip from '@/components/TabStrip.vue'

import LicenseTab from './LicenseTab.vue'
import BrandingTab from './BrandingTab.vue'

const locale = useLocaleStore()

const activeTab = ref<'license' | 'branding'>('license')

const tabsWithLabels = computed(() => [
  { key: 'license', label: locale.t('nav.system.license') },
  { key: 'branding', label: locale.t('nav.system.branding') },
])
</script>

<template>
  <section class="settings-view">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('settings.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('settings.description') }}</p>
    </header>

    <TabStrip v-model="activeTab" :tabs="tabsWithLabels" />

    <LicenseTab v-if="activeTab === 'license'" />
    <BrandingTab v-else-if="activeTab === 'branding'" />
  </section>
</template>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.page-head {
  flex-shrink: 0;
}

.heading {
  margin: 0;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font-size: 28px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.desc {
  margin: 12px 0 0;
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 14px;
  line-height: 1.5;
  max-width: 720px;
}
</style>
