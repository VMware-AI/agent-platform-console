<script setup lang="ts">
import { useLocaleStore } from '@/stores/locale'

/** Shared diff-confirmation modal — used before committing vCenter resource changes. */
defineProps<{
  open: boolean
  title: string
  diffs: Array<{ label: string; before: string; after: string }>
  loading: boolean
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
}>()

const locale = useLocaleStore()
</script>

<template>
  <cds-modal :hidden="!open" size="sm" @closeChange="$emit('close')">
    <cds-modal-header>
      <h2 cds-text="title" class="diff-title">{{ title }}</h2>
    </cds-modal-header>
    <cds-modal-content>
      <p class="diff-subtitle">{{ locale.t('configure.diff.subtitle') }}</p>
      <table class="diff-table" v-if="diffs.length">
        <thead><tr><th>{{ locale.t('configure.diff.col.field') }}</th><th>{{ locale.t('configure.diff.col.before') }}</th><th>{{ locale.t('configure.diff.col.after') }}</th></tr></thead>
        <tbody>
          <tr v-for="d in diffs" :key="d.label">
            <td class="diff-label">{{ d.label }}</td>
            <td class="diff-before">{{ d.before }}</td>
            <td class="diff-after">{{ d.after }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="diff-empty">{{ locale.t('configure.diff.empty') }}</p>
    </cds-modal-content>
    <cds-modal-actions>
      <cds-button action="outline" @click="$emit('close')">{{ locale.t('common.cancel') }}</cds-button>
      <cds-button :loading-state="loading ? 'loading' : 'default'" @click="$emit('confirm')">{{ locale.t('common.confirm') }}</cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.diff-title { margin: 0; font-size: 18px; font-weight: 600; }
.diff-subtitle { font-size: 13px; color: var(--cds-global-typography-color-300, #86909c); margin: 8px 0 16px; }
.diff-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.diff-table th, .diff-table td { padding: 8px 12px; border-bottom: 1px solid var(--cds-alias-object-border-color, #f0f0f0); }
.diff-table th { font-weight: 600; color: var(--cds-global-typography-color-400, #4e5969); font-size: 13px; }
.diff-before { color: var(--cds-alias-status-danger, #c92100); text-decoration: line-through; }
.diff-after { color: var(--cds-alias-status-success, #2e7d32); font-weight: 600; }
.diff-label { font-weight: 500; }
.diff-empty { color: var(--cds-global-typography-color-300, #86909c); text-align: center; padding: 16px; }
</style>
