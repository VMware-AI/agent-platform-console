<script setup lang="ts">
/**
 * Page shell for `/platform/users`. Renders the page header, a `<TabStrip>`,
 * and the active tab (UsersTab or RolesTab).
 *
 * The route already exists at `platform.users` and previously pointed to
 * `ComingSoon.vue`; `router/index.ts` was updated to point here instead.
 */
import { computed, ref } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import TabStrip from '@/components/TabStrip.vue'

import UsersTab from './user-role/UsersTab.vue'
import RolesTab from './user-role/RolesTab.vue'

const locale = useLocaleStore()

const activeTab = ref<'users' | 'roles'>('users')

const tabsWithLabels = computed(() => [
  { key: 'users', label: locale.t('users.tabs.users') },
  { key: 'roles', label: locale.t('users.tabs.roles') },
])
</script>

<template>
  <section class="user-role-view">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('users.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('users.description') }}</p>
    </header>

    <TabStrip v-model="activeTab" :tabs="tabsWithLabels" />

    <UsersTab v-if="activeTab === 'users'" />
    <RolesTab v-else-if="activeTab === 'roles'" />
  </section>
</template>

<style scoped>
.user-role-view {
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