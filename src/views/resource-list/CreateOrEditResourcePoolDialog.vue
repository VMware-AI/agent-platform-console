<script setup lang="ts">
/**
 * Create-or-edit dialog for a single resource pool.
 *
 * Mirrors the UserFormDialog pattern but is a "create-or-edit" two-mode
 * dialog: the same component is opened for both new and existing rows
 * (existing rows pass an optional `pool` prop to pre-fill the inputs).
 *
 * Submit emits `submit(input)` with the normalized `CreateResourcePoolInput`
 * or `UpdateResourcePoolInput` payload — the parent decides which mutation
 * to fire.
 */
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type { CreateResourcePoolInput, ResourcePool } from '@/api/graphql/types'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  /** When provided, the dialog pre-fills the inputs and emits an Update
   *  payload; when omitted, the dialog starts blank and emits a Create. */
  pool?: ResourcePool | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', payload: { mode: 'create' | 'update'; input: CreateResourcePoolInput }): void
}>()

const locale = useLocaleStore()

const name = ref('')
const endpoint = ref('')
const datacenterCount = ref<string>('')
const clusterCount = ref<string>('')

const isEdit = computed(() => !!props.pool)

const titleKey = computed(() =>
  isEdit.value ? 'resources.form.title.edit' : 'resources.form.title.create',
)

watch(
  () => props.open,
  (o) => {
    if (o) {
      name.value = props.pool?.name ?? ''
      endpoint.value = props.pool?.endpoint ?? ''
      datacenterCount.value =
        props.pool?.datacenterCount !== undefined && props.pool?.datacenterCount !== null
          ? String(props.pool.datacenterCount)
          : ''
      clusterCount.value =
        props.pool?.clusterCount !== undefined && props.pool?.clusterCount !== null
          ? String(props.pool.clusterCount)
          : ''
    }
  },
  { immediate: true },
)

const formValid = computed(() => {
  if (!name.value.trim()) return false
  if (!endpoint.value.trim()) return false
  // numeric fields are optional; if filled they must be non-negative ints
  if (datacenterCount.value.trim() && Number.isNaN(parseInt(datacenterCount.value, 10))) return false
  if (clusterCount.value.trim() && Number.isNaN(parseInt(clusterCount.value, 10))) return false
  return true
})

function onSubmit() {
  if (!formValid.value) return
  const input: CreateResourcePoolInput = {
    name: name.value.trim(),
    endpoint: endpoint.value.trim(),
    datacenterCount: datacenterCount.value.trim()
      ? parseInt(datacenterCount.value, 10)
      : null,
    clusterCount: clusterCount.value.trim()
      ? parseInt(clusterCount.value, 10)
      : null,
  }
  emit('submit', { mode: isEdit.value ? 'update' : 'create', input })
}

function close() {
  emit('close')
}
function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="resource-fade">
      <div
        v-if="open"
        class="resource-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="locale.t(titleKey)"
        @click="onBackdropClick"
      >
        <div class="resource-card" @click.stop>
          <h2 cds-text="section" class="resource-title">
            {{ locale.t(titleKey) }}
          </h2>

          <form class="resource-form" @submit.prevent="onSubmit">
            <label class="resource-field">
              <span class="resource-label">{{ locale.t('resources.form.name') }}</span>
              <input
                type="text"
                class="app-input"
                :value="name"
                @input="(e: Event) => name = (e.target as HTMLInputElement).value"
              />
            </label>

            <label class="resource-field">
              <span class="resource-label">{{ locale.t('resources.form.endpoint') }}</span>
              <input
                type="text"
                class="app-input"
                :value="endpoint"
                placeholder="https://vc.example.local/sdk"
                @input="(e: Event) => endpoint = (e.target as HTMLInputElement).value"
              />
            </label>

            <div class="resource-row">
              <label class="resource-field">
                <span class="resource-label">{{ locale.t('resources.form.datacenter') }}</span>
                <input
                  type="number"
                  min="0"
                  class="app-input"
                  :value="datacenterCount"
                  @input="(e: Event) => datacenterCount = (e.target as HTMLInputElement).value"
                />
              </label>

              <label class="resource-field">
                <span class="resource-label">{{ locale.t('resources.form.cluster') }}</span>
                <input
                  type="number"
                  min="0"
                  class="app-input"
                  :value="clusterCount"
                  @input="(e: Event) => clusterCount = (e.target as HTMLInputElement).value"
                />
              </label>
            </div>

            <div class="resource-actions">
              <cds-button type="button" action="outline" @click="close">
                {{ locale.t('common.cancel') }}
              </cds-button>
              <cds-button
                type="submit"
                action="solid"
                status="primary"
                :disabled="!formValid"
              >
                {{ locale.t('resources.form.submit') }}
              </cds-button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.resource-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(11, 18, 32, 0.55);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  z-index: 1100;
  padding: 24px;
}

.resource-card {
  width: min(520px, 100%);
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.resource-title {
  margin: 0;
  font-size: 18px;
}

.resource-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.resource-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.resource-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--cds-alias-typography-color-300, #565656);
}

.resource-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.app-input {
  font: inherit;
  font-size: 14px;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border-radius: 4px;
  border: 1px solid var(--cds-alias-object-border-color, #cbd4d8);
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  outline: none;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
  box-sizing: border-box;
}
.app-input:focus {
  border-color: var(--cds-alias-status-info, #0079ad);
  box-shadow: 0 0 0 2px var(--cds-alias-object-interaction-background-hover, #e0f6ff);
}

.resource-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.resource-fade-enter-active,
.resource-fade-leave-active {
  transition: opacity 0.18s ease;
}
.resource-fade-enter-from,
.resource-fade-leave-to {
  opacity: 0;
}
</style>