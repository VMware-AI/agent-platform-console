<script setup lang="ts" generic="T extends { id: string }">
// Two-column transfer / shuttle box (design doc §3.1).
//
// A generic wrapper that takes a `candidates` list (left) and a `selected`
// list (right) of the same type, with 4 arrow buttons in the middle:
//   >   moves the focused left item to the right
//   >>  moves every left item to the right
//   <   moves the focused right item to the left
//   <<  moves every right item to the left
//
// The component is fully controlled: it emits `update:selected` with the new
// array whenever the operator moves items. Render slots let the parent
// customise the row layout per side — e.g. show a name + status dot for
// supplier models, or a model alias + provider tag for routes.
//
// Why hand-rolled instead of <cds-tree-view>: Clarity's tree-view is
// read-only (it has no transfer semantics) and using it would force the
// parent to re-implement selection state on top. Two bare <ul>s with arrow
// buttons is the minimum needed to be both keyboard-accessible and
// screen-reader-friendly.

import { computed, ref } from 'vue'

const props = defineProps<{
  candidates: readonly T[]
  selected: readonly T[]
  // When true, the candidates column is loaded asynchronously; show a
  // muted "loading" state instead of the list. Parent keeps the source of
  // truth — this is purely cosmetic.
  loading?: boolean
  // Caption rendered above the left (candidates) column.
  leftLabel: string
  // Caption rendered above the right (selected) column.
  rightLabel: string
  // i18n key prefix; the parent owns the strings. We render via slot so
  // the form can mix in their own badge / dot / etc.
}>()

const emit = defineEmits<{
  (event: 'update:selected', value: T[]): void
}>()

const focusedLeftId = ref<string | null>(null)
const focusedRightId = ref<string | null>(null)

// selectedIds is the fast-lookup set of the right column. Computed so it
// always reflects the parent's `selected` prop (no drift if the parent
// resets it externally).
const selectedIds = computed(() => new Set(props.selected.map((it) => it.id)))

const availableLeft = computed(() =>
  props.candidates.filter((it) => !selectedIds.value.has(it.id)),
)

function moveToRight(ids: Set<string>) {
  if (ids.size === 0) return
  const toAdd = props.candidates.filter((it) => ids.has(it.id))
  // Dedupe defensively — the source-of-truth set should already exclude
  // already-selected rows, but a fast-flick click can race a parent reset.
  const merged = [...props.selected, ...toAdd.filter((it) => !selectedIds.value.has(it.id))]
  emit('update:selected', merged)
  focusedLeftId.value = null
}

function moveToLeft(ids: Set<string>) {
  if (ids.size === 0) return
  emit(
    'update:selected',
    props.selected.filter((it) => !ids.has(it.id)),
  )
  focusedRightId.value = null
}

function moveFocusedRight() {
  if (focusedLeftId.value) moveToRight(new Set([focusedLeftId.value]))
  else moveToRight(new Set(availableLeft.value.map((it) => it.id)))
}

function moveAllRight() {
  moveToRight(new Set(availableLeft.value.map((it) => it.id)))
}

function moveFocusedLeft() {
  if (focusedRightId.value) moveToLeft(new Set([focusedRightId.value]))
  else moveToLeft(new Set(props.selected.map((it) => it.id)))
}

function moveAllLeft() {
  moveToLeft(new Set(props.selected.map((it) => it.id)))
}

function onLeftClick(id: string, event: MouseEvent) {
  // Single click = focus; double click = move.
  if (event.detail === 2) {
    moveToRight(new Set([id]))
    return
  }
  focusedLeftId.value = id
  focusedRightId.value = null
}

function onRightClick(id: string, event: MouseEvent) {
  if (event.detail === 2) {
    moveToLeft(new Set([id]))
    return
  }
  focusedRightId.value = id
  focusedLeftId.value = null
}

function onLeftKey(event: KeyboardEvent, id: string) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    moveToRight(new Set([id]))
  }
}

function onRightKey(event: KeyboardEvent, id: string) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    moveToLeft(new Set([id]))
  }
}
</script>

<template>
  <div class="shuttle">
    <div class="shuttle-col">
      <div class="shuttle-label">{{ leftLabel }}</div>
      <ul class="shuttle-list" role="listbox" :aria-label="leftLabel">
        <li
          v-for="item in availableLeft"
          :key="item.id"
          class="shuttle-item"
          :class="{ focused: focusedLeftId === item.id }"
          role="option"
          :aria-selected="focusedLeftId === item.id"
          tabindex="0"
          @click="(event: MouseEvent) => onLeftClick(item.id, event)"
          @keydown="(event: KeyboardEvent) => onLeftKey(event, item.id)"
        >
          <slot name="left-item" :item="item" />
        </li>
        <li v-if="loading" class="shuttle-empty" role="presentation">…</li>
        <li v-else-if="availableLeft.length === 0" class="shuttle-empty" role="presentation">
          —
        </li>
      </ul>
    </div>

    <div class="shuttle-actions">
      <button
        type="button"
        class="shuttle-action"
        :disabled="availableLeft.length === 0"
        :title="focusedLeftId ? '>' : '>>'"
        @click="moveFocusedRight"
      >
        <cds-icon shape="angle" direction="right" size="sm" aria-hidden="true"></cds-icon>
      </button>
      <button
        type="button"
        class="shuttle-action"
        :disabled="availableLeft.length === 0"
        title="<<"
        @click="moveAllRight"
      >
        <cds-icon shape="angle" direction="right" size="sm" aria-hidden="true"></cds-icon>
        <cds-icon shape="angle" direction="right" size="sm" aria-hidden="true"></cds-icon>
      </button>
      <button
        type="button"
        class="shuttle-action"
        :disabled="selected.length === 0"
        :title="focusedRightId ? '<' : '<<'"
        @click="moveFocusedLeft"
      >
        <cds-icon shape="angle" direction="left" size="sm" aria-hidden="true"></cds-icon>
      </button>
      <button
        type="button"
        class="shuttle-action"
        :disabled="selected.length === 0"
        title=">>"
        @click="moveAllLeft"
      >
        <cds-icon shape="angle" direction="left" size="sm" aria-hidden="true"></cds-icon>
        <cds-icon shape="angle" direction="left" size="sm" aria-hidden="true"></cds-icon>
      </button>
    </div>

    <div class="shuttle-col">
      <div class="shuttle-label">{{ rightLabel }}</div>
      <ul class="shuttle-list" role="listbox" :aria-label="rightLabel">
        <li
          v-for="item in selected"
          :key="item.id"
          class="shuttle-item"
          :class="{ focused: focusedRightId === item.id }"
          role="option"
          :aria-selected="focusedRightId === item.id"
          tabindex="0"
          @click="(event: MouseEvent) => onRightClick(item.id, event)"
          @keydown="(event: KeyboardEvent) => onRightKey(event, item.id)"
        >
          <slot name="right-item" :item="item" />
        </li>
        <li v-if="selected.length === 0" class="shuttle-empty" role="presentation">—</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.shuttle {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 8px;
  align-items: stretch;
  min-height: 220px;
}
.shuttle-col {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--cds-alias-object-border-color, #8c8c8c);
  border-radius: 4px;
  background: var(--cds-alias-object-container-background, #fff);
  min-width: 0;
}
.shuttle-label {
  padding: 6px 10px;
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.shuttle-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  max-height: 280px;
}
.shuttle-item {
  padding: 6px 10px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.shuttle-item:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.shuttle-item.focused {
  background: color-mix(in srgb, var(--cds-alias-object-interaction-color, #0072a3) 18%, transparent);
}
.shuttle-item:focus-visible {
  outline: 2px solid var(--cds-alias-object-interaction-color, #0072a3);
  outline-offset: -2px;
}
.shuttle-empty {
  padding: 12px 10px;
  text-align: center;
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 12px;
}
.shuttle-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.shuttle-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--cds-alias-object-border-color, #8c8c8c);
  border-radius: 3px;
  padding: 4px 6px;
  cursor: pointer;
  color: inherit;
}
.shuttle-action:hover:not(:disabled) {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.shuttle-action:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
</style>
