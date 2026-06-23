<script setup lang="ts">
import { useLocaleStore } from '@/stores/locale'

const props = defineProps<{
  open: boolean
  name: string
  deleting: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'confirm'): void
}>()

const locale = useLocaleStore()

function close() {
  if (!props.deleting) emit('close')
}
</script>

<template>
  <cds-modal :hidden="!open" :closable="!deleting" size="sm" @closeChange="close">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">{{ locale.t('gateway.delete.title') }}</h2>
    </cds-modal-header>
    <cds-modal-content>
      <cds-alert status="danger">
        {{ locale.t('gateway.delete.message').replace('{name}', name) }}
      </cds-alert>
      <p class="delete-note">{{ locale.t('gateway.delete.warning') }}</p>
    </cds-modal-content>
    <cds-modal-actions>
      <cds-button action="outline" :disabled="deleting" @click="close">
        {{ locale.t('gateway.action.cancel') }}
      </cds-button>
      <cds-button
        status="danger"
        :loading-state="deleting ? 'loading' : 'default'"
        :disabled="deleting"
        @click="emit('confirm')"
      >
        {{ locale.t('gateway.action.delete') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.modal-title {
  margin: 0;
}
.delete-note {
  margin: 16px 0 0;
  color: var(--cds-alias-typography-color-300, #565656);
}
</style>
