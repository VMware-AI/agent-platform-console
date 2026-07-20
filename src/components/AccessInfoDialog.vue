<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from '@/composables/useToast'
import { useLocaleStore } from '@/stores/locale'
import type { Agent } from '@/types/agents'

const props = defineProps<{
  open: boolean
  agent: Agent | null
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'retry'): void
}>()

const toast = useToast()
const locale = useLocaleStore()

const showPassword = ref(false)
const keyExpanded = ref(true)
const credsExpanded = ref(true)

const creds = computed(() => props.agent?.credentials)
const apiKeyName = computed(() => props.agent?.apiKey?.name || '')
const sshCmd = computed(() => creds.value?.sshCommand || '')
const ip = computed(() => creds.value?.ip || '')
const username = computed(() => creds.value?.username || '')
const passwordHint = computed(() => creds.value?.passwordHint || '')

// Field-keyed metadata for copy actions. Each entry pairs the i18n keys for
// (1) the label rendered in the toasts / aria, (2) the title shown on the
// cds-button-action's hover, and (3) the label used as the `{label}` token
// inside the per-field toast confirmation.
type CopyKey =
  | 'keyName'
  | 'user'
  | 'password'
  | 'ssh'
  | 'ip'

const copyMeta: Record<
  CopyKey,
  { label: string; title: string; lineKey: string; titleKey: string }
> = {
  keyName: {
    label: locale.t('accessInfo.section.key'),
    title: locale.t('accessInfo.copy.keyTitle'),
    lineKey: 'accessInfo.line.keyName',
    titleKey: 'accessInfo.copy.keyTitle',
  },
  user: {
    label: locale.t('accessInfo.osUser'),
    title: locale.t('accessInfo.copy.userTitle'),
    lineKey: 'accessInfo.line.osUser',
    titleKey: 'accessInfo.copy.userTitle',
  },
  password: {
    label: locale.t('accessInfo.password'),
    title: locale.t('accessInfo.copy.passwordTitle'),
    lineKey: 'accessInfo.line.password',
    titleKey: 'accessInfo.copy.passwordTitle',
  },
  ssh: {
    label: locale.t('accessInfo.sshCmd'),
    title: locale.t('accessInfo.copy.sshTitle'),
    lineKey: 'accessInfo.line.ssh',
    titleKey: 'accessInfo.copy.sshTitle',
  },
  ip: {
    label: locale.t('accessInfo.ip'),
    title: locale.t('accessInfo.copy.ipTitle'),
    lineKey: 'accessInfo.line.ip',
    titleKey: 'accessInfo.copy.ipTitle',
  },
}

function toggleSection(section: 'key' | 'creds') {
  if (section === 'key') keyExpanded.value = !keyExpanded.value
  else credsExpanded.value = !credsExpanded.value
}

async function copyText(text: string, key: CopyKey) {
  if (!text) return
  const meta = copyMeta[key]
  const okMsg = `${meta.label} ${locale.t('accessInfo.copy.okSuffix')}`
  const fallbackCopy = () => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      fallbackCopy()
    }
    toast.success(okMsg)
  } catch {
    // Clipboard API can throw on HTTP origins — fall back to execCommand
    try {
      fallbackCopy()
      toast.success(okMsg)
    } catch {
      toast.error(locale.t('accessInfo.copyFailHint'))
    }
  }
}

/** Build a formatted multi-line credential block and copy all at once. */
async function copyAll() {
  const line = (key: string, value: string) =>
    locale.t(key).replace('{value}', value)
  const lines: string[] = []
  if (apiKeyName.value) lines.push(line(copyMeta.keyName.lineKey, apiKeyName.value))
  if (username.value) lines.push(line(copyMeta.user.lineKey, username.value))
  if (passwordHint.value) lines.push(line(copyMeta.password.lineKey, passwordHint.value))
  if (sshCmd.value) lines.push(line(copyMeta.ssh.lineKey, sshCmd.value))
  if (ip.value) lines.push(line(copyMeta.ip.lineKey, ip.value))
  if (!lines.length) {
    toast.error(locale.t('accessInfo.noCreds'))
    return
  }
  const text = lines.join('\n')
  const okMsg = locale.t('accessInfo.copyAllOk')
  const fallbackCopy = () => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      fallbackCopy()
    }
    toast.success(okMsg)
  } catch {
    try {
      fallbackCopy()
      toast.success(okMsg)
    } catch {
      toast.error(locale.t('accessInfo.copyFailHint'))
    }
  }
}
</script>

<template>
  <cds-modal :hidden="!props.open" size="md" @closeChange="emit('close')">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ locale.t('accessInfo.title').replace('{name}', props.agent?.name || '') }}
      </h2>
    </cds-modal-header>

    <cds-modal-content>
      <!-- Loading -->
      <div v-if="loading" class="access-loading">
        <cds-icon shape="spinner" size="lg" class="spin"></cds-icon>
        <p>{{ locale.t('accessInfo.loading') }}</p>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="access-error">
        <cds-alert status="danger">
          <cds-alert-content>
            <p>{{ error }}</p>
            <cds-button size="sm" @click="emit('retry')">{{ locale.t('common.retry') }}</cds-button>
          </cds-alert-content>
        </cds-alert>
      </div>

      <!-- Content -->
      <div v-else class="access-content">
        <!-- Section 1: API Key -->
        <div class="accordion-section">
          <button
            type="button"
            class="accordion-trigger"
            :aria-expanded="keyExpanded"
            @click="toggleSection('key')"
          >
            <cds-icon
              :shape="keyExpanded ? 'angle' : 'angle'"
              :direction="keyExpanded ? 'down' : 'right'"
              size="sm"
              class="accordion-arrow"
            ></cds-icon>
            <span class="accordion-label">{{ locale.t('accessInfo.section.key') }}</span>
          </button>
          <div v-show="keyExpanded" class="accordion-body">
            <div class="cred-row">
              <label>{{ locale.t('agents.col.key') }}</label>
              <div class="cred-value">
                <span>{{ apiKeyName || '—' }}</span>
                <cds-button-action
                  v-if="apiKeyName"
                  shape="copy"
                  :title="copyMeta.keyName.title"
                  :aria-label="copyMeta.keyName.title"
                  @click="copyText(apiKeyName, 'keyName')"
                ></cds-button-action>
              </div>
            </div>
          </div>
        </div>

        <!-- Section 2: VM Credentials -->
        <div class="accordion-section">
          <button
            type="button"
            class="accordion-trigger"
            :aria-expanded="credsExpanded"
            @click="toggleSection('creds')"
          >
            <cds-icon
              :shape="credsExpanded ? 'angle' : 'angle'"
              :direction="credsExpanded ? 'down' : 'right'"
              size="sm"
              class="accordion-arrow"
            ></cds-icon>
            <span class="accordion-label">{{ locale.t('accessInfo.section.creds') }}</span>
          </button>
          <div v-show="credsExpanded" class="accordion-body">
            <!-- Run-as User -->
            <div class="cred-row">
              <label>{{ locale.t('accessInfo.osUser') }}</label>
              <div class="cred-value">
                <span>{{ username || '—' }}</span>
                <cds-button-action
                  v-if="username"
                  shape="copy"
                  :title="copyMeta.user.title"
                  :aria-label="copyMeta.user.title"
                  @click="copyText(username, 'user')"
                ></cds-button-action>
              </div>
            </div>

            <!-- Password -->
            <div class="cred-row">
              <label>{{ locale.t('accessInfo.password') }}</label>
              <div class="cred-value">
                <span class="pw-text">{{ showPassword ? passwordHint : '••••••••' }}</span>
                <cds-button-action
                  v-if="true"
                  :shape="showPassword ? 'eye-hide' : 'eye'"
                  :title="showPassword ? locale.t('changePassword.action.hidePwd') : locale.t('changePassword.action.showPwd')"
                  :aria-label="showPassword ? locale.t('changePassword.action.hidePwd') : locale.t('changePassword.action.showPwd')"
                  @click="showPassword = !showPassword"
                ></cds-button-action>
                <cds-button-action
                  v-if="true"
                  shape="copy"
                  :title="copyMeta.password.title"
                  :aria-label="copyMeta.password.title"
                  @click="copyText(passwordHint, 'password')"
                ></cds-button-action>
              </div>
            </div>

            <!-- SSH Command -->
            <div class="cred-row">
              <label>{{ locale.t('accessInfo.sshCmd') }}</label>
              <div class="cred-value">
                <code>{{ sshCmd || '—' }}</code>
                <cds-button-action
                  v-if="sshCmd"
                  shape="copy"
                  :title="copyMeta.ssh.title"
                  :aria-label="copyMeta.ssh.title"
                  @click="copyText(sshCmd, 'ssh')"
                ></cds-button-action>
              </div>
            </div>

            <!-- IP -->
            <div class="cred-row">
              <label>{{ locale.t('accessInfo.ip') }}</label>
              <div class="cred-value">
                <span class="mono">{{ ip || '—' }}</span>
                <cds-button-action
                  v-if="ip"
                  shape="copy"
                  :title="copyMeta.ip.title"
                  :aria-label="copyMeta.ip.title"
                  @click="copyText(ip, 'ip')"
                ></cds-button-action>
              </div>
            </div>

            <!-- Copy All -->
            <div class="copy-all-row">
              <cds-button size="sm" @click="copyAll">
                <cds-icon shape="copy" size="sm" aria-hidden="true"></cds-icon>
                {{ locale.t('accessInfo.copyAll') }}
              </cds-button>
            </div>
          </div>
        </div>

        <!-- Warning -->
        <cds-alert status="warning" class="access-warning">
          <cds-alert-content>
            {{ locale.t('accessInfo.passwordHint') }}
          </cds-alert-content>
        </cds-alert>
      </div>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button action="outline" @click="emit('close')">{{ locale.t('common.close') }}</cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
/* ---------- Title ---------- */
.modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

/* ---------- States ---------- */
.access-loading {
  text-align: center;
  padding: 48px 0;
}
.access-loading p {
  margin-top: 16px;
  color: var(--cds-global-typography-color-300, #86909c);
  font-size: 14px;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.access-error {
  padding: 8px 0;
}

/* ---------- Accordion ---------- */
.accordion-section {
  border: 1px solid var(--cds-alias-object-border-color, #e5e6eb);
  border-radius: 6px;
  margin-bottom: 12px;
  overflow: hidden;
}
.accordion-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  background: var(--cds-alias-object-app-background, #f7f8fa);
  border: none;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: background 0.15s;
}
.accordion-trigger:hover {
  background: var(--cds-alias-object-app-background, #eef0f4);
}
.accordion-arrow {
  flex-shrink: 0;
  transition: transform 0.2s;
  color: var(--cds-global-typography-color-300, #86909c);
}
.accordion-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--cds-global-typography-color-500, #1d2129);
}
.accordion-body {
  padding: 4px 16px 12px;
}

/* ---------- Credential Rows ---------- */
.cred-row {
  display: flex;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #f2f3f5);
}
.cred-row:last-of-type {
  border-bottom: none;
}
.cred-row label {
  flex: 0 0 80px;
  font-size: 14px;
  font-weight: 500;
  color: var(--cds-global-typography-color-400, #4e5969);
}
.cred-value {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.cred-value code {
  background: var(--cds-alias-object-app-background, #f2f3f5);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  word-break: break-all;
}
.cred-value span {
  font-size: 14px;
  word-break: break-all;
}
.mono {
  font-family: 'SF Mono', 'Fira Code', monospace;
}
.pw-text {
  font-family: monospace;
}

/* ---------- Copy All ---------- */
.copy-all-row {
  padding: 12px 0 4px;
  border-top: 1px dashed #e5e6eb;
  margin-top: 8px;
}

/* ---------- Warning ---------- */
.access-warning {
  margin-top: 12px;
}
</style>
