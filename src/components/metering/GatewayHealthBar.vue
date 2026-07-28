<script setup lang="ts">
// Caller: GatewaySpendPanel.vue (replacing inline gateway failure banner)
// Pure presentational — all data via props, no I/O

export interface GatewayStatus {
  gatewayName: string
  ok: boolean
}

defineProps<{
  gateways: GatewayStatus[]
}>()
</script>

<template>
  <div v-if="gateways.length > 0" class="gateway-health">
    <span
      v-for="gw in gateways"
      :key="gw.gatewayName"
      class="gw-dot"
      :class="gw.ok ? 'up' : 'down'"
      :title="`${gw.gatewayName}: ${gw.ok ? 'UP' : 'DOWN'}`"
    >●</span>
    <span class="gw-label">{{ gateways.filter((g) => g.ok).length }}/{{ gateways.length }} UP</span>
  </div>
</template>

<style scoped>
.gateway-health {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
}
.gw-dot { font-size: 10px; line-height: 1; }
.gw-dot.up { color: var(--cds-alias-status-success, #1b8a4b); }
.gw-dot.down { color: var(--cds-alias-status-danger, #c92100); }
.gw-label { opacity: 0.6; margin-left: 4px; }
</style>
