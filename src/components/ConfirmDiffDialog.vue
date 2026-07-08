<script setup lang="ts">
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
</script>

<template>
  <cds-modal :hidden="!open" size="sm" @closeChange="$emit('close')">
    <cds-modal-header>
      <h2 cds-text="title" class="diff-title">{{ title }}</h2>
    </cds-modal-header>
    <cds-modal-content>
      <p class="diff-subtitle">变更将在 vCenter 同步执行：</p>
      <table class="diff-table" v-if="diffs.length">
        <thead><tr><th>字段</th><th>变更前</th><th>变更后</th></tr></thead>
        <tbody>
          <tr v-for="d in diffs" :key="d.label">
            <td class="diff-label">{{ d.label }}</td>
            <td class="diff-before">{{ d.before }}</td>
            <td class="diff-after">{{ d.after }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="diff-empty">无变更项</p>
    </cds-modal-content>
    <cds-modal-actions>
      <cds-button action="outline" @click="$emit('close')">取消</cds-button>
      <cds-button :loading-state="loading ? 'loading' : 'default'" @click="$emit('confirm')">确认提交</cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.diff-title { margin: 0; font-size: 18px; font-weight: 600; }
.diff-subtitle { font-size: 13px; color: #86909c; margin: 8px 0 16px; }
.diff-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.diff-table th, .diff-table td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }
.diff-table th { font-weight: 600; color: #4e5969; font-size: 13px; }
.diff-before { color: #c92100; text-decoration: line-through; }
.diff-after { color: #2e7d32; font-weight: 600; }
.diff-label { font-weight: 500; }
.diff-empty { color: #86909c; text-align: center; padding: 16px; }
</style>
