<script setup lang="ts">
defineProps<{ endpoint: string | null; ip: string; sshCommand: string }>()
defineEmits<{ (e: 'openAccessInfo'): void }>()
</script>

<template>
  <div class="ap-rows">
    <div class="cfg-row"><label>Endpoint</label><span class="cfg-value mono">{{ endpoint || '—' }}</span><span class="cfg-lock">🔒</span></div>
    <div class="cfg-row"><label>IP 地址</label><span class="cfg-value mono">{{ ip || '（点击下方按钮查看）' }}</span><span class="cfg-lock">🔒</span></div>
    <div class="ap-action-row">
      <cds-button size="sm" @click="$emit('openAccessInfo')"><cds-icon shape="eye" size="sm" aria-hidden="true"></cds-icon>查看完整访问信息</cds-button>
      <span class="ap-hint">跳转至访问信息弹窗，查看 SSH 连接命令与登录凭据</span>
    </div>
  </div>
</template>

<style scoped>
.cfg-row { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #f2f3f5; gap: 12px; }
.cfg-row label { flex: 0 0 80px; font-size: 14px; font-weight: 500; color: #4e5969; }
.cfg-value { flex: 1; font-size: 14px; word-break: break-all; min-width: 0; }
.cfg-lock { flex-shrink: 0; font-size: 12px; opacity: 0.5; }
.mono { font-family: 'SF Mono', 'Fira Code', monospace; }
.ap-action-row { display: flex; align-items: center; gap: 12px; padding: 12px 0 4px; }
.ap-hint { font-size: 12px; color: #86909c; }
</style>
