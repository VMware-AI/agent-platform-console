<script setup lang="ts">
import { useLocaleStore, type Locale } from '@/stores/locale'
import AppDropdown from './AppDropdown.vue'
import './icons'

const locale = useLocaleStore()

function pick(next: Locale) {
  locale.setLocale(next)
}
</script>

<template>
  <AppDropdown align="end">
    <template #trigger>
      <cds-button action="ghost" type="button">
        <cds-icon shape="world"></cds-icon>
        {{ locale.t('lang.' + locale.locale) }}
        <cds-icon shape="angle" direction="down" size="sm"></cds-icon>
      </cds-button>
    </template>

    <template #default="{ close }">
      <button
        type="button"
        class="opt"
        :class="{ active: locale.locale === 'zh' }"
        @click="pick('zh'); close()"
      >
        <cds-icon v-if="locale.locale === 'zh'" shape="check" size="sm"></cds-icon>
        <span v-else class="dot"></span>
        <span>{{ locale.t('lang.zh') }}</span>
      </button>
      <button
        type="button"
        class="opt"
        :class="{ active: locale.locale === 'en' }"
        @click="pick('en'); close()"
      >
        <cds-icon v-if="locale.locale === 'en'" shape="check" size="sm"></cds-icon>
        <span v-else class="dot"></span>
        <span>{{ locale.t('lang.en') }}</span>
      </button>
    </template>
  </AppDropdown>
</template>

<style scoped>
.opt {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: none;
  border: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  width: 100%;
}
.opt:hover { background: var(--cds-alias-object-app-background, #f4f4f4); }
.opt.active { font-weight: 600; }
.dot {
  display: inline-block;
  width: 16px;
}
</style>
