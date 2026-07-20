<script setup lang="ts">
import { useLocaleStore } from '@/stores/locale'

defineProps<{ endpoint: string | null; ip: string; sshCommand: string }>()
defineEmits<{ (e: 'openAccessInfo'): void }>()

const locale = useLocaleStore()
</script>

<template>
  <div class="ap-rows">
    <div class="cfg-row"><label>Endpoint</label><span class="cfg-value mono">{{ endpoint || '—' }}</span><span class="cfg-lock">🔒</span></div>
    <div class="cfg-row"><label>{{ locale.t('accessInfo.ip') }}</label><span class="cfg-value mono">{{ ip || locale.t('configure.access.clickToView') }}</span><span class="cfg-lock">🔒</span></div>
    <div class="ap-action-row">
      <cds-button size="sm" @click="$emit('openAccessInfo')"><cds-icon shape="eye" size="sm" aria-hidden="true"></cds-icon>{{ locale.t('configure.access.viewFull') }}</cds-button>
      <span class="ap-hint">{{ locale.t('configure.access.viewHint') }}</span>
    </div>
  </div>
</template>

<style scoped>
.cfg-row { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--cds-alias-object-border-color, #f2f3f5); gap: 12px; }
.cfg-row label { flex: 0 0 80px; font-size: 14px; font-weight: 500; color: var(--cds-global-typography-color-400, #4e5969); }
.cfg-value { flex: 1; font-size: 14px; word-break: break-all; min-width: 0; }
.cfg-lock { flex-shrink: 0; font-size: 12px; opacity: 0.5; }
.mono { font-family: 'SF Mono', 'Fira Code', monospace; }
.ap-action-row { display: flex; align-items: center; gap: 12px; padding: 12px 0 4px; }
.ap-hint { font-size: 12px; color: var(--cds-global-typography-color-300, #86909c); }
</style>
