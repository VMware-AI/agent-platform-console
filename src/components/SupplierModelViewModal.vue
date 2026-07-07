<script setup lang="ts">
import { useLocaleStore } from '@/stores/locale'
import type { ProviderModelNode, ModelSpec } from '@/api/graphql/queries/supplier-models'

const props = defineProps<{
  open: boolean
  model: ProviderModelNode | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const locale = useLocaleStore()

// Close handler — the modal is closable from the X button or backdrop.
// Keeping the route between Clarity's @closeChange event and our parent's
// open flag lets the parent stay in control of unmounting.
function close() {
  emit('close')
}

// Compose the four cost-per-token fields into a compact two-line cell.
// Each line is "{label} {value}/token"; absent fields collapse so the
// row stays short even when only one cost is set.
function formatCost(s: ModelSpec): string {
  const lp = s.litellmParams
  const lines: string[] = []
  if (lp.inputCostPerToken != null) lines.push(`输入 ${lp.inputCostPerToken}/token`)
  if (lp.outputCostPerToken != null) lines.push(`输出 ${lp.outputCostPerToken}/token`)
  if (lp.cacheReadInputTokenCost != null)
    lines.push(`缓存读 ${lp.cacheReadInputTokenCost}/token`)
  if (lp.cacheCreationInputTokenCost != null)
    lines.push(`缓存写 ${lp.cacheCreationInputTokenCost}/token`)
  return lines.length ? lines.join('\n') : '—'
}

// Compose the four limit fields (TPM / RPM / maxBudget / budgetDuration)
// the same way the review page does in the form modal, so users see one
// consistent summary across create-time recap and this read-only viewer.
function formatLimits(s: ModelSpec): string {
  const lp = s.litellmParams
  const parts: string[] = []
  if (lp.tpm) parts.push(`tpm ${lp.tpm}`)
  if (lp.rpm) parts.push(`rpm ${lp.rpm}`)
  if (lp.maxBudget) parts.push(`maxBudget ${lp.maxBudget}`)
  if (lp.budgetDuration) parts.push(`budgetDuration ${lp.budgetDuration}`)
  return parts.length ? parts.join('\n') : '—'
}

// 「是/否」 labels keep boolean cells compact in the horizontal-scroll
// layout — turning every flag into a Yes/No chip would add visual noise
// and force the table wider.
function yesNo(v: boolean): string {
  return v ? locale.t('supplier.viewModal.yes') : locale.t('supplier.viewModal.no')
}
</script>

<template>
  <cds-modal :hidden="!open" :closable="true" size="xl" @closeChange="close">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ props.model
          ? locale.t('supplier.viewModal.title').replace('{name}', props.model.name)
          : ''
        }}
      </h2>
    </cds-modal-header>

    <cds-modal-content>
      <div v-if="props.model" class="specs-table-wrap">
        <table class="specs-table">
          <thead>
            <tr>
              <th>{{ locale.t('supplier.viewModal.col.model') }}</th>
              <th>{{ locale.t('supplier.viewModal.col.provider') }}</th>
              <th>{{ locale.t('supplier.viewModal.col.apiBase') }}</th>
              <th>{{ locale.t('supplier.viewModal.col.blocked') }}</th>
              <th>{{ locale.t('supplier.viewModal.col.mode') }}</th>
              <th>{{ locale.t('supplier.viewModal.col.tags') }}</th>
              <th>{{ locale.t('supplier.viewModal.col.cost') }}</th>
              <th>{{ locale.t('supplier.viewModal.col.limits') }}</th>
              <th>{{ locale.t('supplier.viewModal.col.passThrough') }}</th>
              <th>{{ locale.t('supplier.viewModal.col.chatApi') }}</th>
              <th>{{ locale.t('supplier.viewModal.col.mergeReasoning') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, i) in props.model.modelSpecs" :key="s.modelInfo.id ?? i">
              <td class="cell-strong">{{ s.litellmParams.model }}</td>
              <td>{{ s.litellmParams.customLlmProvider || '—' }}</td>
              <td class="cell-mono">{{ s.litellmParams.apiBase || '—' }}</td>
              <td>{{ yesNo(s.modelInfo.blocked) }}</td>
              <td>{{ s.modelInfo.mode || '—' }}</td>
              <td>
                <span v-if="s.litellmParams.tags.length === 0">—</span>
                <span v-else>{{ s.litellmParams.tags.join(', ') }}</span>
              </td>
              <td class="cell-pre">{{ formatCost(s) }}</td>
              <td class="cell-pre">{{ formatLimits(s) }}</td>
              <td>{{ yesNo(s.litellmParams.useInPassThrough) }}</td>
              <td>{{ yesNo(s.litellmParams.useChatCompletionsApi) }}</td>
              <td>{{ yesNo(s.litellmParams.mergeReasoningContentInChoices) }}</td>
            </tr>
            <tr v-if="props.model.modelSpecs.length === 0">
              <td colspan="11" class="empty-row">{{ locale.t('supplier.specs.empty') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button action="outline" @click="close">
        {{ locale.t('supplier.viewModal.close') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.modal-title {
  /* Title truncation: model names can be long, so wrap the long name onto
     the next line rather than horizontally scroll the header. */
  word-break: break-all;
}
/* Wrap the table in a horizontally-scrollable container so very wide
   cells (apiBase / mode lists / costs) keep their content readable
   without breaking the modal layout. The cds-modal-content is already
   vertically scrollable per Clarity defaults; this wrapper adds the
   horizontal axis. */
.specs-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 4px;
}
.specs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 1100px;
}
.specs-table th,
.specs-table td {
  padding: 8px 12px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  white-space: nowrap;
}
.specs-table th {
  background: var(--cds-alias-object-app-background, #f4f4f4);
  font-weight: 600;
  color: var(--cds-alias-typography-color-300, #565656);
  position: sticky;
  top: 0;
}
.specs-table tbody tr:last-child td {
  border-bottom: 0;
}
.cell-strong {
  font-weight: 600;
}
.cell-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.cell-pre {
  white-space: pre-line;
  font-variant-numeric: tabular-nums;
}
.empty-row {
  text-align: center;
  color: var(--cds-alias-typography-color-300, #565656);
  padding: 24px 12px;
}
</style>