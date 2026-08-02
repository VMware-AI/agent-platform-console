<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useQuery, useMutation } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import {
  LICENSE_STATUS_QUERY,
  ACTIVATE_LICENSE_MUTATION,
  type LicenseStatus,
} from '@/api/graphql/queries/license'

const locale = useLocaleStore()
const toast = useToast()

const { refetch, onResult } = useQuery(LICENSE_STATUS_QUERY, undefined, () => ({
  fetchPolicy: 'network-only',
}))

const status = ref<LicenseStatus | null>(null)
onResult(({ data }) => {
  status.value = (data?.licenseStatus as LicenseStatus | undefined) ?? null
})

onMounted(() => {
  void refetch()
})

// ── mode presentation ──
const modeMeta = computed(() => {
  const m = status.value?.mode ?? 'trial'
  if (m === 'licensed') {
    return { label: locale.t('license.mode.licensed'), cls: 'ok' }
  }
  if (m === 'expired') {
    return { label: locale.t('license.mode.expired'), cls: 'bad' }
  }
  return { label: locale.t('license.mode.trial'), cls: 'warn' }
})

const expiresText = computed(() => {
  const s = status.value
  if (!s) return ''
  const d = new Date(s.expiresAt)
  if (Number.isNaN(d.getTime())) return s.expiresAt
  return d.toLocaleDateString(locale.locale === 'zh' ? 'zh-CN' : 'en-US')
})

// ── activation ──
const licenseKey = ref('')
const { mutate: doActivate, loading: activating, onDone: onActivateDone, onError: onActivateError } =
  useMutation(ACTIVATE_LICENSE_MUTATION)

function onActivate() {
  if (activating.value) return
  const key = licenseKey.value.trim()
  if (!key) {
    toast.error(locale.t('license.keyRequired'))
    return
  }
  void doActivate({ key })
}

onActivateDone(() => {
  licenseKey.value = ''
  toast.success(locale.t('license.activated'))
  void refetch()
})

onActivateError((e) => {
  const msg = (e.graphQLErrors?.[0]?.message as string | undefined) ?? e.message
  toast.error(msg || locale.t('license.activateError'))
})

// ── copy bind IP ──
async function copyBindIP() {
  const ip = status.value?.bindIP ?? ''
  if (!ip) return
  try {
    await navigator.clipboard.writeText(ip)
    toast.success(locale.t('license.copied'))
  } catch {
    toast.error(locale.t('license.copyFailed'))
  }
}
</script>

<template>
  <section class="lic">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('license.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('license.desc') }}</p>
    </header>

    <!-- Status card -->
    <cds-card class="card">
      <div class="cp">
        <div class="st-row">
          <div class="st-badge" :class="modeMeta.cls">{{ modeMeta.label }}</div>
          <div class="st-days">
            <span class="st-num">{{ status?.daysRemaining ?? '–' }}</span>
            <span class="st-unit">{{ locale.t('license.daysLeft') }}</span>
          </div>
          <div class="st-meta">
            <div v-if="status?.customer" class="st-line">{{ locale.t('license.customer') }}：{{ status.customer }}</div>
            <div v-if="status?.edition" class="st-line">{{ locale.t('license.edition') }}：{{ status.edition }}</div>
            <div class="st-line">{{ locale.t('license.expires') }}：{{ expiresText }}</div>
            <div v-if="status?.mode === 'trial'" class="st-line muted">{{ locale.t('license.trialNote') }}</div>
          </div>
        </div>
      </div>
    </cds-card>

    <!-- Bind info card -->
    <cds-card class="card">
      <div class="cp">
        <h2>{{ locale.t('license.bindInfo') }}</h2>
        <p class="mu">{{ locale.t('license.bindDesc') }}</p>
        <div class="bind-row">
          <code class="bind-ip">{{ status?.bindIP || locale.t('license.noPool') }}</code>
          <cds-button size="sm" action="outline" @click="copyBindIP" :disabled="!status?.bindIP">
            {{ locale.t('license.copy') }}
          </cds-button>
        </div>
        <ol class="steps">
          <li>{{ locale.t('license.step1') }}</li>
          <li>{{ locale.t('license.step2') }}</li>
          <li>{{ locale.t('license.step3') }}</li>
          <li>{{ locale.t('license.step4') }}</li>
        </ol>
      </div>
    </cds-card>

    <!-- Activate card -->
    <cds-card class="card">
      <div class="cp">
        <h2>{{ locale.t('license.activate') }}</h2>
        <textarea
          v-model="licenseKey"
          class="fctl key-input"
          :placeholder="locale.t('license.keyPlaceholder')"
          rows="4"
          spellcheck="false"
        />
        <div class="act-row">
          <cds-button status="primary" @click="onActivate" :loading="activating" :disabled="activating">
            {{ locale.t('license.activateBtn') }}
          </cds-button>
        </div>
      </div>
    </cds-card>
  </section>
</template>

<style scoped>
/* Page shell + typography mirror UserRoleView (用户与权限) so the 许可管理
   page reads with the same visual weight as the rest of 系统配置. */
.lic {
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
.card { width: 100%; }
.cp { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.st-row { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.st-badge { padding: 6px 14px; border-radius: 999px; font-weight: 600; font-size: 14px; }
.st-badge.ok { background: #e8f8ee; color: #1e9e56; }
.st-badge.warn { background: #fff4e5; color: #d98324; }
.st-badge.bad { background: #fdeaea; color: #d14343; }
.st-days { display: flex; align-items: baseline; gap: 6px; }
.st-num { font-size: 40px; font-weight: 700; line-height: 1; }
.st-unit { font-size: 14px; color: #8a8f99; }
.st-meta { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #5f6470; }
.st-line.muted { color: #9aa0ab; }
.bind-row { display: flex; align-items: center; gap: 12px; }
.bind-ip { font-family: monospace; font-size: 16px; background: #f2f4f7; border-radius: 6px; padding: 6px 10px; }
.steps { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #5f6470; }
.key-input { font-family: monospace; font-size: 13px; resize: vertical; }
.act-row { display: flex; }
.mu { font-size: 12px; color: #9aa0ab; }
</style>
