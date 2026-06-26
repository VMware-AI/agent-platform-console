<script setup lang="ts">
/**
 * Small create-role + add-permission modals for CustomRoleView.
 *
 * Both are simple single-field forms rendered as `cds-modal`s. The parent owns
 * all data + mutation calls; this component only collects input and emits it.
 * Kept as one file (two tiny dialogs) to avoid a large parent view.
 */
import { ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'

const props = defineProps<{
  /** Which dialog is open, if any. */
  mode: 'createRole' | 'addPermission' | null
  /** Whether a submit is in flight (locks inputs + buttons). */
  busy: boolean
  /** Whether defining permissions is allowed (admin-only on the backend). */
  canDefinePermission: boolean
}>()

const locale = useLocaleStore()

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
    :aria-label="locale.t('customRole.create.title')"
    @closeChange="close"
  >
    <cds-modal-header>
      <h2 cds-text="title" class="cr-modal-title">{{ locale.t('customRole.create.title') }}</h2>
    </cds-modal-header>
    <cds-modal-content>
      <form class="cr-form" @submit.prevent="submitRole">
        <cds-input>
          <label>{{ locale.t('customRole.create.nameLabel') }}</label>
          <input
            v-model="roleName"
            type="text"
            :placeholder="locale.t('customRole.create.namePlaceholder')"
            :disabled="busy"
            :aria-label="locale.t('customRole.create.nameLabel')"
            maxlength="64"
            autofocus
            aria-required="true"
          />
        </cds-input>
      </form>
    </cds-modal-content>
    <cds-modal-actions>
      <cds-button action="outline" :disabled="busy" @click="close">
        {{ locale.t('customRole.action.cancel') }}
      </cds-button>
      <cds-button
        status="primary"
        :loading-state="busy ? 'loading' : 'default'"
        :disabled="busy || roleName.trim().length === 0"
        @click="submitRole"
      >
        {{ locale.t('customRole.action.create') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>

  <!-- Define (upsert) a permission -->
  <cds-modal
    :hidden="mode !== 'addPermission'"
    :closable="!busy"
    size="sm"
    :aria-label="locale.t('customRole.permission.addTitle')"
    @closeChange="close"
  >
    <cds-modal-header>
      <h2 cds-text="title" class="cr-modal-title">{{ locale.t('customRole.permission.addTitle') }}</h2>
    </cds-modal-header>
    <cds-modal-content>
      <form class="cr-form" @submit.prevent="submitPermission">
        <cds-input>
          <label>{{ locale.t('customRole.permission.keyLabel') }}</label>
          <input
            v-model="permKey"
            type="text"
            :placeholder="locale.t('customRole.permission.keyPlaceholder')"
            :disabled="busy"
            :aria-label="locale.t('customRole.permission.keyLabel')"
            maxlength="128"
            autofocus
            aria-required="true"
          />
        </cds-input>
        <cds-input>
          <label>{{ locale.t('customRole.permission.descLabel') }}</label>
          <input
            v-model="permDescription"
            type="text"
            :placeholder="locale.t('customRole.permission.descPlaceholder')"
            :disabled="busy"
            :aria-label="locale.t('customRole.permission.descLabel')"
            maxlength="256"
          />
        </cds-input>
      </form>
    </cds-modal-content>
    <cds-modal-actions>
      <cds-button action="outline" :disabled="busy" @click="close">
        {{ locale.t('customRole.action.cancel') }}
      </cds-button>
      <cds-button
        status="primary"
        :loading-state="busy ? 'loading' : 'default'"
        :disabled="busy || permKey.trim().length === 0"
        @click="submitPermission"
      >
        {{ locale.t('customRole.action.save') }}
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
