<script setup lang="ts">
/**
 * Profile dialog — opened from the UserMenu's "个人资料" button via the
 * `/profile` route. The view renders as a modal overlay via
 * `Teleport to="body"` so it floats above whatever content the user was on,
 * without replacing it. On close, we `router.back()` to restore the
 * previous route.
 *
 * Data sources:
 *   - Identity fields (username / displayName / email / role) come from
 *     the `auth` store, which is populated by the `Me` query at boot and
 *     after every password change.
 *   - Metadata fields (lastLoginAt / connectionStatus / createdAt /
 *     enabled) are optional on the `Me` resolver; the UI renders a
 *     "暂未提供" placeholder when null so the dialog works against the
 *     current backend surface and gains content automatically when the
 *     resolver grows.
 *
 * "修改密码" lives as a sibling item in the UserMenu (above "关于"),
 * where it opens the existing `ChangePasswordModal` in closable mode.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLocaleStore } from '@/stores/locale'
import '@/components/icons'

const auth = useAuthStore()
const locale = useLocaleStore()
const router = useRouter()

function close() {
  // Navigate back to wherever the user came from. `router.back()` is the
  // right primitive — it preserves the browser history. Falls back to
  // overview if there's no entry to pop (e.g. the user typed /profile
  // directly into the address bar).
  if (window.history.length > 1) {
    router.back()
  } else {
    router.replace({ name: 'overview' })
  }
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}

const profile = computed(() => auth.user)

const lastLogin = computed(() => {
  const iso = auth.user?.lastLoginAt
  return iso ? fmtDateTime(iso) : locale.t('profile.unavailable')
})
const createdAt = computed(() => {
  const iso = auth.user?.createdAt
  return iso ? fmtDateTime(iso) : locale.t('profile.unavailable')
})
const connectionStatusLabel = computed(() => {
  const s = auth.user?.connectionStatus
  if (s === 'ONLINE') return locale.t('profile.status.online')
  if (s === 'OFFLINE') return locale.t('profile.status.offline')
  return locale.t('profile.unavailable')
})
const mustChangeLabel = computed(() =>
  auth.mustChangePassword
    ? locale.t('profile.mustChange.yes')
    : locale.t('profile.mustChange.no'),
)

function fmtDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="profile-backdrop"
      role="dialog"
      aria-modal="true"
      :aria-label="locale.t('profile.title')"
      @click="onBackdropClick"
    >
      <div class="profile-card" @click.stop>
        <button
          type="button"
          class="profile-close-x"
          :aria-label="locale.t('about.close')"
          :title="locale.t('about.close')"
          @click="close"
        >
          <cds-icon shape="times" size="md"></cds-icon>
        </button>

        <header class="profile-header">
          <h2 cds-text="title" class="profile-title">
            {{ locale.t('profile.title') }}
          </h2>
          <p cds-text="body" class="profile-desc muted">
            {{ locale.t('profile.description') }}
          </p>
        </header>

        <div class="grid">
          <article class="card">
            <h3 cds-text="section" class="card-title">
              {{ locale.t('profile.section.identity') }}
            </h3>
            <dl class="kv">
              <div class="kv-row">
                <dt>{{ locale.t('profile.field.username') }}</dt>
                <dd>{{ profile?.username ?? '—' }}</dd>
              </div>
              <div class="kv-row">
                <dt>{{ locale.t('profile.field.displayName') }}</dt>
                <dd>{{ profile?.displayName ?? '—' }}</dd>
              </div>
              <div class="kv-row">
                <dt>{{ locale.t('profile.field.email') }}</dt>
                <dd>{{ profile?.email ?? '—' }}</dd>
              </div>
              <div class="kv-row">
                <dt>{{ locale.t('profile.field.role') }}</dt>
                <dd>
                  <cds-badge status="info">{{ auth.role ?? '—' }}</cds-badge>
                </dd>
              </div>
            </dl>
          </article>

          <article class="card">
            <h3 cds-text="section" class="card-title">
              {{ locale.t('profile.section.metadata') }}
            </h3>
            <dl class="kv">
              <div class="kv-row">
                <dt>{{ locale.t('profile.field.createdAt') }}</dt>
                <dd>{{ createdAt }}</dd>
              </div>
              <div class="kv-row">
                <dt>{{ locale.t('profile.field.lastLogin') }}</dt>
                <dd>{{ lastLogin }}</dd>
              </div>
              <div class="kv-row">
                <dt>{{ locale.t('profile.field.status') }}</dt>
                <dd>{{ connectionStatusLabel }}</dd>
              </div>
              <div class="kv-row">
                <dt>{{ locale.t('profile.field.mustChange') }}</dt>
                <dd>{{ mustChangeLabel }}</dd>
              </div>
            </dl>
          </article>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.profile-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(11, 18, 32, 0.55);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  z-index: 100;
  padding: 24px;
}

.profile-card {
  position: relative;
  width: min(720px, 100%);
  max-height: min(80vh, 720px);
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  padding: 28px 32px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
}

.profile-close-x {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  color: var(--cds-alias-typography-color-300, #6b6b6b);
  cursor: pointer;
  border-radius: 6px;
}
.profile-close-x:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.profile-close-x :deep(cds-icon) {
  --color: currentColor;
  color: inherit;
}

.profile-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 4px;
}

.profile-title {
  margin: 0;
  font-size: 20px;
}

.profile-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  max-width: 560px;
}

.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  min-width: 0;
}

.card {
  background: var(--cds-alias-object-app-background, #fafafa);
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 8px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}

.kv {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kv-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 12px;
  align-items: center;
  font-size: 13px;
  line-height: 1.5;
}

.kv-row dt {
  color: var(--cds-alias-typography-color-300, #565656);
  font-weight: 500;
}

.kv-row dd {
  margin: 0;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  word-break: break-all;
}
</style>