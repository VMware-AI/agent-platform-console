<script setup lang="ts">
/**
 * Platform Settings (LLD-13 + LLD-16 OQ-2) — admin-only page for operator-editable
 * config that used to live in backend startup env:
 *   - agentUser: the OS account installed agents run as on the VM (装机命令 su {{AGENT_USER}}).
 *   - Package mirror: base URL + read-only user + write-only password. This is the
 *     trusted internal source the daemon pulls agent packages from, for both the
 *     first-boot install and later pull upgrades (LLD-16 §3–4).
 *
 * The password is never returned by the API (stored encrypted). Leaving it blank
 * keeps the stored one unchanged; save sends only the fields the operator changed.
 */
import { ref, computed, watch } from 'vue'
import { useQuery, useMutation } from '@vue/apollo-composable'
import {
  PLATFORM_SETTINGS_QUERY,
  UPDATE_PLATFORM_SETTINGS_MUTATION,
} from '@/api/graphql/queries/platform-settings'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import '@/components/icons'

// Backend surface (schema/settings.graphql). Kept local — this is the only page
// that touches it, so a dedicated types module would be more indirection than value.
interface PlatformSettings {
  agentUser: string
  packageSourceUrl: string
  packageSourceUser: string
}
interface PlatformSettingsResult {
  platformSettings: PlatformSettings
}
interface UpdatePlatformSettingsInput {
  agentUser?: string
  packageSourceUrl?: string
  packageSourceUser?: string
  packageSourcePassword?: string
}
interface UpdatePlatformSettingsResult {
  updatePlatformSettings: PlatformSettings
}

const locale = useLocaleStore()
const toast = useToast()

// Form state. Password is always blank on load (the backend never returns it) and
// is only sent when the operator types a new one.
const agentUser = ref('')
const packageSourceUrl = ref('')
const packageSourceUser = ref('')
const packageSourcePassword = ref('')
const attempted = ref(false)

// Last server-known values, so save diffs against them: the input treats an omitted
// field as "unchanged" and an empty string as "clear".
const original = ref<PlatformSettings>({
  agentUser: '',
  packageSourceUrl: '',
  packageSourceUser: '',
})

const { result, loading, error } = useQuery<PlatformSettingsResult>(
  PLATFORM_SETTINGS_QUERY,
  {},
  { fetchPolicy: 'cache-and-network' },
)

function hydrate(s: PlatformSettings) {
  agentUser.value = s.agentUser
  packageSourceUrl.value = s.packageSourceUrl
  packageSourceUser.value = s.packageSourceUser
  original.value = { ...s }
}

// Dirty relative to the last server snapshot (password typed counts as dirty).
const dirty = computed(
  () =>
    agentUser.value !== original.value.agentUser ||
    packageSourceUrl.value !== original.value.packageSourceUrl ||
    packageSourceUser.value !== original.value.packageSourceUser ||
    packageSourcePassword.value !== '',
)

// Populate the form when data first arrives. Guarded by `dirty` so a background
// cache-and-network refetch can't clobber edits the operator is mid-way through.
watch(
  () => result.value?.platformSettings,
  (s) => {
    if (s && !dirty.value) hydrate(s)
  },
  { immediate: true },
)

// Mirrors the backend contract: agentUser must be non-empty (omitted = unchanged).
// No stricter format check here — a client rule the server doesn't enforce would
// reject values the backend accepts. The expected convention lives in the hint.
function agentUserError(): string | null {
  if (!agentUser.value.trim()) return locale.t('platformSettings.agent.userRequired')
  return null
}

// Mirrors backend validatePackageSourceURL: scheme ftp/http/https, host present, no
// embedded credentials (use the separate user/password fields). Empty = leave unset.
const PKG_SCHEMES = ['ftp:', 'http:', 'https:']
function urlError(): string | null {
  const raw = packageSourceUrl.value.trim()
  if (!raw) return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return locale.t('platformSettings.pkg.urlError')
  }
  if (!PKG_SCHEMES.includes(u.protocol) || !u.host) return locale.t('platformSettings.pkg.urlError')
  if (u.username || u.password) return locale.t('platformSettings.pkg.urlCredError')
  return null
}

const { mutate, loading: saving } = useMutation<
  UpdatePlatformSettingsResult,
  { input: UpdatePlatformSettingsInput }
>(UPDATE_PLATFORM_SETTINGS_MUTATION)

async function save() {
  attempted.value = true
  if (agentUserError() || urlError()) return

  const input: UpdatePlatformSettingsInput = {}
  const au = agentUser.value.trim()
  if (au !== original.value.agentUser) input.agentUser = au
  const url = packageSourceUrl.value.trim()
  if (url !== original.value.packageSourceUrl) input.packageSourceUrl = url
  const user = packageSourceUser.value.trim()
  if (user !== original.value.packageSourceUser) input.packageSourceUser = user
  // Write-only: only send a password when the operator actually typed one. Blank
  // means "keep the stored one" (an empty string would clear it server-side).
  if (packageSourcePassword.value !== '') input.packageSourcePassword = packageSourcePassword.value

  if (Object.keys(input).length === 0) {
    toast.info(locale.t('platformSettings.noChanges'))
    return
  }

  try {
    const res = await mutate({ input })
    const updated = res?.data?.updatePlatformSettings
    if (updated) hydrate(updated)
    packageSourcePassword.value = ''
    attempted.value = false
    toast.success(locale.t('platformSettings.saved'))
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('platformSettings.saveFailed')))
  }
}
</script>

<template>
  <section class="platform-settings">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('platformSettings.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('platformSettings.description') }}</p>
    </header>

    <cds-alert v-if="error" status="danger" :closable="false">
      {{ locale.t('platformSettings.loadError') }}
    </cds-alert>

    <div class="cards">
      <!-- Agent OS user -->
      <article class="card">
        <header class="card-head">
          <h2 cds-text="section" class="card-title">{{ locale.t('platformSettings.agent.title') }}</h2>
          <p class="card-desc muted">{{ locale.t('platformSettings.agent.desc') }}</p>
        </header>
        <cds-input :status="attempted && agentUserError() ? 'error' : 'neutral'">
          <label>{{ locale.t('platformSettings.agent.userLabel') }}</label>
          <input
            v-model="agentUser"
            :placeholder="locale.t('platformSettings.agent.userPlaceholder')"
            autocomplete="off"
            spellcheck="false"
            @keyup.enter="save"
          />
          <cds-control-message v-if="attempted && agentUserError()" status="error">
            {{ agentUserError() }}
          </cds-control-message>
          <cds-control-message v-else status="neutral">
            {{ locale.t('platformSettings.agent.userHint') }}
          </cds-control-message>
        </cds-input>
      </article>

      <!-- Agent package mirror -->
      <article class="card">
        <header class="card-head">
          <h2 cds-text="section" class="card-title">{{ locale.t('platformSettings.pkg.title') }}</h2>
          <p class="card-desc muted">{{ locale.t('platformSettings.pkg.desc') }}</p>
        </header>

        <cds-input :status="attempted && urlError() ? 'error' : 'neutral'">
          <label>{{ locale.t('platformSettings.pkg.urlLabel') }}</label>
          <input
            v-model="packageSourceUrl"
            :placeholder="locale.t('platformSettings.pkg.urlPlaceholder')"
            autocomplete="off"
            spellcheck="false"
            @keyup.enter="save"
          />
          <cds-control-message v-if="attempted && urlError()" status="error">
            {{ urlError() }}
          </cds-control-message>
          <cds-control-message v-else status="neutral">
            {{ locale.t('platformSettings.pkg.urlHint') }}
          </cds-control-message>
        </cds-input>

        <cds-input>
          <label>{{ locale.t('platformSettings.pkg.userLabel') }}</label>
          <input
            v-model="packageSourceUser"
            :placeholder="locale.t('platformSettings.pkg.userPlaceholder')"
            autocomplete="off"
            spellcheck="false"
            @keyup.enter="save"
          />
        </cds-input>

        <cds-input>
          <label>{{ locale.t('platformSettings.pkg.passwordLabel') }}</label>
          <input
            v-model="packageSourcePassword"
            type="password"
            :placeholder="locale.t('platformSettings.pkg.passwordPlaceholder')"
            autocomplete="new-password"
            @keyup.enter="save"
          />
          <cds-control-message status="neutral">
            {{ locale.t('platformSettings.pkg.passwordHint') }}
          </cds-control-message>
        </cds-input>
      </article>
    </div>

    <div class="actions">
      <cds-button
        :loading-state="saving ? 'loading' : 'default'"
        :disabled="saving || loading"
        @click="save"
      >
        {{ locale.t('platformSettings.save') }}
      </cds-button>
    </div>
  </section>
</template>

<style scoped>
.platform-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.cards {
  display: grid;
  gap: 16px;
  max-width: 640px;
}

.card {
  background: var(--cds-alias-object-app-background, #fafafa);
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 8px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.card-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.card-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}

.card cds-input {
  display: block;
  width: 100%;
}

.actions {
  display: flex;
  gap: 12px;
  max-width: 640px;
}
</style>
