<script setup lang="ts">
import { useLocaleStore } from '@/stores/locale'

defineProps<{
  size?: number
}>()

const locale = useLocaleStore()
</script>

<template>
  <svg
    :width="size ?? 32"
    :height="size ?? 32"
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    :aria-label="locale.t('app.brand')"
    class="brand-logo"
  >
    <defs>
      <linearGradient id="bl-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#3b82f6" />
        <stop offset="100%" stop-color="#1d4ed8" />
      </linearGradient>
    </defs>

    <!-- Outer hex = the platform container -->
    <path
      d="M16 2 L28 9 L28 23 L16 30 L4 23 L4 9 Z"
      fill="url(#bl-grad)"
    />
    <!-- Subtle inner highlight stroke -->
    <path
      d="M16 2 L28 9 L28 23 L16 30 L4 23 L4 9 Z"
      fill="none"
      stroke="rgba(255,255,255,0.25)"
      stroke-width="0.6"
    />

    <!-- Connection lines between nodes (drawn first so nodes sit on top) -->
    <g stroke="rgba(255,255,255,0.65)" stroke-width="0.9" stroke-linecap="round" fill="none">
      <line x1="16" y1="11" x2="11" y2="17" />
      <line x1="16" y1="11" x2="21" y2="17" />
      <line x1="11" y1="17" x2="16" y2="22" />
      <line x1="21" y1="17" x2="16" y2="22" />
      <line x1="11" y1="17" x2="21" y2="17" />
    </g>

    <!-- Agent nodes -->
    <g fill="#ffffff">
      <circle cx="16" cy="11" r="2.4" />
      <circle cx="11" cy="17" r="1.9" />
      <circle cx="21" cy="17" r="1.9" />
      <circle cx="16" cy="22" r="1.5" />
    </g>

    <!-- Center sparkle to suggest intelligence -->
    <circle cx="16" cy="16" r="0.9" fill="#fde68a" />
  </svg>
</template>

<style scoped>
.brand-logo {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
