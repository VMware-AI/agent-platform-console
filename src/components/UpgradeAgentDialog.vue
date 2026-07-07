<script setup lang="ts">
/**
 * Upgrade Agent Dialog — enqueues a platform pull upgrade (LLD-16 §4). The daemon
 * executes it on its next heartbeat and reports back. targetVersion is free text:
 * the backend validates the FORMAT only (there is no mirror version listing to pick
 * from), so the same regex is mirrored here for immediate feedback.
 *
 * Reused for a single agent (agentName set) and a batch (agentName null, count > 1).
 */
import { ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'

const props = defineProps<{
  open: boolean
  /** Single-agent upgrade shows the name; null = batch (shows count). */
  agentName: string | null
  count: number
  submitting: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', targetVersion: string): void
}>()

const locale = useLocaleStore()
const version = ref('')
const attempted = ref(false)

// Mirrors agent-platform-backend internal/agentmgr/service.go versionRe + the daemon
// is_valid_version: safe as a package_url path segment (no '/', no '..', no shell meta).
const VERSION_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/
const versionValid = () => VERSION_RE.test(version.value.trim())

watch(
  () => props.open,
  (o) => {
    if (o) {
      version.value = ''
      attempted.value = false
    }
  },
)

function submit() {
  attempted.value = true
  if (!versionValid()) return
  emit('submit', version.value.trim())
}
</script>

<template>
  <cds-modal
    :hidden="!props.open"
    :closable="!props.submitting"
    size="md"
    @closeChange="emit('close')"
  >
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">{{ locale.t('agents.upgrade.title') }}</h2>
    </cds-modal-header>
    <cds-modal-content>
      <div class="upgrade-body">
        <cds-alert status="info" :closable="false">
          {{
            props.agentName
              ? locale.t('agents.upgrade.single').replace('{name}', props.agentName)
              : locale.t('agents.upgrade.batch').replace('{n}', String(props.count))
          }}
        </cds-alert>
        <cds-input :status="attempted && !versionValid() ? 'error' : 'neutral'">
          <label>{{ locale.t('agents.upgrade.version') }}</label>
          <input
            v-model="version"
            :placeholder="locale.t('agents.upgrade.versionPlaceholder')"
            @keyup.enter="submit"
          />
          <cds-control-message v-if="attempted && !versionValid()" status="error">
            {{ locale.t('agents.upgrade.versionError') }}
          </cds-control-message>
          <cds-control-message v-else status="neutral">
            {{ locale.t('agents.upgrade.versionHint') }}
          </cds-control-message>
        </cds-input>
      </div>
    </cds-modal-content>
    <cds-modal-actions>
      <cds-button action="outline" :disabled="props.submitting" @click="emit('close')">
        {{ locale.t('agents.upgrade.cancel') }}
      </cds-button>
      <cds-button
        :loading-state="props.submitting ? 'loading' : 'default'"
        :disabled="props.submitting"
        @click="submit"
      >
        {{ locale.t('agents.upgrade.submit') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.modal-title {
  margin: 0;
}
.upgrade-body {
  display: grid;
  gap: 16px;
}
</style>
