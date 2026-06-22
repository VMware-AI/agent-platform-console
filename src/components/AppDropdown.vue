<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  /** Where the popup appears relative to the trigger. */
  align?: 'start' | 'end'
  /** Pixel offset below (or above) the trigger. */
  offset?: number
  /**
   * When true, the trigger click is ignored and the panel won't open.
   * Pair this with a `:disabled` on the inner trigger element so the
   * trigger's own click handler also stops the event — otherwise the
   * `.dd-trigger` wrapper would still fire this `toggle` and re-open it.
   */
  disabled?: boolean
}>()

const open = ref(false)
const triggerEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)

function toggle() {
  if (props.disabled) return
  open.value = !open.value
}

function close() {
  open.value = false
}

function onDocClick(e: MouseEvent) {
  if (!open.value) return
  const t = e.target as Node
  if (triggerEl.value?.contains(t)) return
  if (panelEl.value?.contains(t)) return
  close()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('click', onDocClick, true)
  document.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick, true)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <span class="dd">
    <span ref="triggerEl" class="dd-trigger" @click="toggle">
      <slot name="trigger" :open="open" />
    </span>
    <span
      v-if="open"
      ref="panelEl"
      class="dd-panel"
      :class="`dd-align-${props.align ?? 'end'}`"
      :style="{ marginTop: `${props.offset ?? 6}px` }"
      role="menu"
    >
      <slot :close="close" />
    </span>
  </span>
</template>

<style scoped>
.dd {
  position: relative;
  display: inline-flex;
}
.dd-trigger {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}
.dd-panel {
  position: absolute;
  top: 100%;
  z-index: 1000;
  min-width: 200px;
  background: var(--cds-alias-object-container-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 6px 0;
  display: flex;
  flex-direction: column;
}
.dd-align-start { left: 0; }
.dd-align-end   { right: 0; }
</style>
