<script setup lang="ts">
import { computed } from 'vue'
import type { Agent } from '@/types/agents'
import { STATUS_FROM_GQL, TYPE_FROM_GQL } from '@/types/agents'
import { useLocaleStore } from '@/stores/locale'

const props = defineProps<{ agent: Agent | null }>()
const locale = useLocaleStore()

const statusLabel = computed(() =>
  props.agent ? locale.t(`agents.status.${STATUS_FROM_GQL[props.agent.status]}`) : '')
const typeLabel = computed(() =>
  props.agent ? locale.t(`agents.type.${TYPE_FROM_GQL[props.agent.type]}`) : '')

function statusIcon(s: string) { return s === 'running' ? 'success' : s === 'exception' ? 'error' : 'pause' }
function fmt(iso: string) {
  try { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) } catch { return iso }
}
</script>

<template>
  <div class="basic-rows">
    <div class="cfg-row"><label>{{ locale.t('agentDetail.name') }}</label><span class="cfg-value">{{ props.agent?.name || '—' }}</span><span class="cfg-lock">🔒</span></div>
    <div class="cfg-row"><label>{{ locale.t('agentDetail.type') }}</label><span class="cfg-value">{{ typeLabel || '—' }}</span><span class="cfg-lock">🔒</span></div>
    <div class="cfg-row"><label>{{ locale.t('agentDetail.status') }}</label><span class="cfg-value"><cds-icon :shape="props.agent ? statusIcon(props.agent.status) : 'info'" size="xs" class="status-inline"></cds-icon>{{ statusLabel || '—' }}</span><span class="cfg-lock">🔒</span></div>
    <div class="cfg-row"><label>API Key</label><span class="cfg-value mono">{{ props.agent?.apiKey?.name || '—' }}</span><span class="cfg-lock">🔒</span></div>
    <div class="cfg-row"><label>{{ locale.t('agentDetail.createdAt') }}</label><span class="cfg-value muted">{{ props.agent ? fmt(props.agent.createdAt) : '—' }}</span><span class="cfg-lock">🔒</span></div>
  </div>
</template>

<style scoped>
.cfg-row { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--cds-alias-object-border-color, #f2f3f5); gap: 12px; }
.cfg-row:last-of-type { border-bottom: none; }
.cfg-row label { flex: 0 0 80px; font-size: 14px; font-weight: 500; color: var(--cds-global-typography-color-400, #4e5969); }
.cfg-value { flex: 1; font-size: 14px; word-break: break-all; min-width: 0; }
.cfg-lock { flex-shrink: 0; font-size: 12px; opacity: 0.5; }
.mono { font-family: 'SF Mono', 'Fira Code', monospace; }
.muted { color: var(--cds-global-typography-color-300, #86909c); }
.status-inline { margin-right: 4px; vertical-align: middle; }
</style>
