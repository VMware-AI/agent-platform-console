<script setup lang="ts">
/**
 * Platform Settings view (`/platform/settings`) — LLD-13 §3.2 / issue #17 PR-B.
 *
 * Admin-only page that reads + edits the single global `agentUser` setting
 * against the REAL backend GraphQL endpoint (`/query`, via Apollo
 * `apolloClient`):
 *   - `platformSettings.agentUser` loads via `useQuery(PLATFORM_SETTINGS_QUERY)`,
 *   - the Save button fires `useMutation(UPDATE_PLATFORM_SETTINGS_MUTATION)`.
 *
 * `agentUser` is the OS user that installed agents run as on the host
 * ({{AGENT_USER}}). The backend rejects a blank/empty value, so Save is
 * disabled when the field is empty or unchanged, and the backend's own error
 * message is surfaced inline when a mutation rejects.
 */
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import {
  PLATFORM_SETTINGS_QUERY,
  UPDATE_PLATFORM_SETTINGS_MUTATION,
} from '@/api/graphql/queries/platformSettings'
import type {
  PlatformSettingsQueryResult,
  UpdatePlatformSettingsResult,
  UpdatePlatformSettingsVars,
} from '@/api/graphql/types'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

/* ---------- Load current settings ---------- */
const { result, loading, error, refetch } = useQuery<PlatformSettingsQueryResult>(
  PLATFORM_SETTINGS_QUERY,
  undefined,
  () => ({ fetchPolicy: 'cache-and-network' }),
)

/** The last-loaded server value — the baseline the edit is diffed against. */
const loadedAgentUser = computed(() => result.value?.platformSettings?.agentUser ?? '')

/** Working copy of the editable field. Re-seeded whenever the server value
 *  changes (initial load + after a successful save's refetch). */
const agentUser = ref('')

watch(
  loadedAgentUser,
  (next) => {
    agentUser.value = next
  },
  { immediate: true },
)

/* ---------- Save ---------- */
const { mutate: updateMutate, loading: saving } = useMutation<
  UpdatePlatformSettingsResult,
  UpdatePlatformSettingsVars
>(UPDATE_PLATFORM_SETTINGS_MUTATION)

/** Backend rejection message (if any) for the most recent save attempt. */
const saveError = ref<string | null>(null)

const trimmed = computed(() => agentUser.value.trim())
const isEmpty = computed(() => trimmed.value.length === 0)
const isUnchanged = computed(() => trimmed.value === loadedAgentUser.value.trim())
const canSave = computed(() => !isEmpty.value && !isUnchanged.value && !saving.value)

function onInput(e: Event) {
  agentUser.value = (e.target as HTMLInputElement).value
  // Clear a stale backend error as soon as the user edits the field.
  saveError.value = null
}

async function onSave() {
  if (!canSave.value) return
  saveError.value = null
  try {
    const r = await updateMutate({ input: { agentUser: trimmed.value } })
    const saved = r?.data?.updatePlatformSettings?.agentUser
    if (saved !== undefined) {
      toast.success(locale.t('settings.platform.saveOk'))
      // Re-pull so loadedAgentUser (the baseline) reflects the saved value and
      // Save disables again until the next edit.
      refetch()
    }
  } catch (err) {
    console.error('[settings] save platform settings failed', err)
    const message = err instanceof Error && err.message ? err.message : locale.t('settings.platform.saveFail')
    saveError.value = message
    toast.error(locale.t('settings.platform.saveFail'))
  }
}
</script>

<template>
  <section class="platform-settings">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('settings.platform.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('settings.platform.description') }}</p>
    </header>

    <cds-alert v-if="error" status="danger" closable>
      {{ locale.t('settings.platform.loadError') }}
    </cds-alert>

    <div v-if="loading && !result" class="loading-block">
      <cds-progress-circle size="xl" status="info"></cds-progress-circle>
      <p cds-text="subsection">{{ locale.t('settings.platform.loading') }}</p>
    </div>

    <form v-else class="settings-form" @submit.prevent="onSave">
      <label class="settings-field">
        <span class="settings-label">{{ locale.t('settings.platform.agentUser') }}</span>
        <input
          type="text"
          class="app-input"
          :value="agentUser"
          :placeholder="locale.t('settings.platform.agentUserPlaceholder')"
          :aria-label="locale.t('settings.platform.agentUser')"
          @input="onInput"
        />
        <span class="settings-hint">{{ locale.t('settings.platform.agentUserHint') }}</span>
      </label>

      <cds-alert v-if="saveError" status="danger" class="settings-save-alert" closable>
        {{ saveError }}
      </cds-alert>

      <div class="settings-actions">
        <cds-button
          type="submit"
          action="solid"
          status="primary"
          :disabled="!canSave"
        >
          <cds-icon
            v-if="saving"
            shape="circle-loader"
            size="sm"
            aria-hidden="true"
          ></cds-icon>
          {{ saving ? locale.t('settings.platform.saving') : locale.t('settings.platform.save') }}
        </cds-button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.platform-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.page-head {
  flex-shrink: 0;
}

.heading {
  margin: 0;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font-size: 28px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.desc {
  margin: 12px 0 0;
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 14px;
  line-height: 1.5;
  max-width: 720px;
}

.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}

.loading-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 0;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 12px;
  max-width: 520px;
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--cds-alias-typography-color-300, #565656);
}

.settings-hint {
  font-size: 12px;
  margin-top: 2px;
  color: var(--cds-alias-typography-color-400, #80838a);
}

.settings-save-alert {
  width: 100%;
}

.settings-actions {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
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
</style>
