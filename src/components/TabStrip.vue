<script setup lang="ts">
/**
 * Lightweight tab strip — Clarity Design has no dedicated `<cds-tabs>`
 * primitive in the installed version, so we render an accessible list of
 * tab buttons styled with Clarity design tokens. Matches the look of cds's
 * vertical / horizontal tab examples (bottom-border accent for active).
 */
defineProps<{
  modelValue: string
  tabs: Array<{ key: string; label: string }>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

function select(key: string) {
  emit('update:modelValue', key)
}
</script>

<template>
  <div role="tablist" class="tab-strip">
    <button
      v-for="t in tabs"
      :key="t.key"
      type="button"
      role="tab"
      :aria-selected="modelValue === t.key"
      :tabindex="modelValue === t.key ? 0 : -1"
      :class="['tab-strip-tab', { active: modelValue === t.key }]"
      @click="select(t.key)"
    >
      <span>{{ t.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.tab-strip {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  padding: 0 4px;
}

.tab-strip-tab {
  appearance: none;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 10px 18px;
  font: inherit;
  font-size: 14px;
  color: var(--cds-alias-typography-color-300, #565656);
  cursor: pointer;
  transition: color 0.12s ease, border-color 0.12s ease;
}

.tab-strip-tab:hover {
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}

.tab-strip-tab.active {
  color: var(--cds-alias-status-info, #0079ad);
  border-bottom-color: var(--cds-alias-status-info, #0079ad);
  font-weight: 600;
}

.tab-strip-tab:focus-visible {
  outline: 2px solid var(--cds-alias-status-info, #0079ad);
  outline-offset: -2px;
  border-radius: 2px;
}
</style>