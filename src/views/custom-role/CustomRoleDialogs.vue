<script setup lang="ts">
/**
 * Small create-role + add-permission modals for CustomRoleView.
 *
 * Both are simple single-field forms rendered as `cds-modal`s. The parent owns
 * all data + mutation calls; this component only collects input and emits it.
 * Kept as one file (two tiny dialogs) to avoid a large parent view.
 *
 * i18n is injected via the `tt` prop so the dialogs share the parent's
 * self-contained FALLBACK dictionary (the shared locale store is off-limits).
 */
import { ref, watch } from 'vue'

const props = defineProps<{
  /** Which dialog is open, if any. */
  mode: 'createRole' | 'addPermission' | null
  /** Whether a submit is in flight (locks inputs + buttons). */
  busy: boolean
  /** Whether defining permissions is allowed (admin-only on the backend). */
  canDefinePermission: boolean
  /** Translator from the parent's FALLBACK dictionary. */
  tt: (key: string) => string
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'createRole', name: string): void
  (event: 'addPermission', payload: { key: string; description: string }): void
}>()

const roleName = ref('')
const permKey = ref('')
const permDescription = ref('')

// Reset fields whenever a dialog (re)opens so stale input never leaks across.
watch(
  () => props.mode,
  (mode) => {
    if (mode === 'createRole') {
      roleName.value = ''
    } else if (mode === 'addPermission') {
      permKey.value = ''
      permDescription.value = ''
    }
  },
)

function close() {
  if (!props.busy) emit('close')
}

function submitRole() {
  const name = roleName.value.trim()
  if (!name || props.busy) return
  emit('createRole', name)
}

function submitPermission() {
  const key = permKey.value.trim()
  if (!key || props.busy || !props.canDefinePermission) return
  emit('addPermission', { key, description: permDescription.value.trim() })
}
</script>

<template>
  <!-- Create custom role -->
  <cds-modal
    :hidden="mode !== 'createRole'"
    :closable="!busy"
    size="sm"
    @closeChange="close"
  >
    <cds-modal-header>
      <h2 cds-text="title" class="cr-modal-title">{{ tt('customRole.create.title') }}</h2>
    </cds-modal-header>
    <cds-modal-content>
      <form class="cr-form" @submit.prevent="submitRole">
        <cds-input>
          <label>{{ tt('customRole.create.nameLabel') }}</label>
          <input
            v-model="roleName"
            type="text"
            :placeholder="tt('customRole.create.namePlaceholder')"
            :disabled="busy"
            :aria-label="tt('customRole.create.nameLabel')"
            maxlength="64"
            autofocus
          />
        </cds-input>
      </form>
    </cds-modal-content>
    <cds-modal-actions>
      <cds-button action="outline" :disabled="busy" @click="close">
        {{ tt('customRole.action.cancel') }}
      </cds-button>
      <cds-button
        status="primary"
        :loading-state="busy ? 'loading' : 'default'"
        :disabled="busy || roleName.trim().length === 0"
        @click="submitRole"
      >
        {{ tt('customRole.action.create') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>

  <!-- Define (upsert) a permission -->
  <cds-modal
    :hidden="mode !== 'addPermission'"
    :closable="!busy"
    size="sm"
    @closeChange="close"
  >
    <cds-modal-header>
      <h2 cds-text="title" class="cr-modal-title">{{ tt('customRole.permission.addTitle') }}</h2>
    </cds-modal-header>
    <cds-modal-content>
      <form class="cr-form" @submit.prevent="submitPermission">
        <cds-input>
          <label>{{ tt('customRole.permission.keyLabel') }}</label>
          <input
            v-model="permKey"
            type="text"
            :placeholder="tt('customRole.permission.keyPlaceholder')"
            :disabled="busy"
            :aria-label="tt('customRole.permission.keyLabel')"
            maxlength="128"
            autofocus
          />
        </cds-input>
        <cds-input>
          <label>{{ tt('customRole.permission.descLabel') }}</label>
          <input
            v-model="permDescription"
            type="text"
            :placeholder="tt('customRole.permission.descPlaceholder')"
            :disabled="busy"
            :aria-label="tt('customRole.permission.descLabel')"
            maxlength="256"
          />
        </cds-input>
      </form>
    </cds-modal-content>
    <cds-modal-actions>
      <cds-button action="outline" :disabled="busy" @click="close">
        {{ tt('customRole.action.cancel') }}
      </cds-button>
      <cds-button
        status="primary"
        :loading-state="busy ? 'loading' : 'default'"
        :disabled="busy || permKey.trim().length === 0"
        @click="submitPermission"
      >
        {{ tt('customRole.action.save') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.cr-modal-title {
  margin: 0;
}
.cr-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
