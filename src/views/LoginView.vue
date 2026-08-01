<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLocaleStore } from '@/stores/locale'
import '@/components/icons'
import '@/styles/login.css'

const auth = useAuthStore()
const locale = useLocaleStore()
const router = useRouter()

const email = ref('')
const password = ref('')
const remember = ref(false)
const attempted = ref(false)
const showPassword = ref(false)

// Storage key for the last successfully-logged-in email, kept ONLY when the
// operator checked "remember me" on that login. Pre-fills the email field
// (and re-checks the box) the next time the login page renders, matching
// the httpOnly cookie's "remember me" behaviour on the auth side. Stored
// alongside the other `clarity-*` keys (theme, locale, auth-user) so it's
// cleared in lockstep when the user wipes site data from DevTools.
const REMEMBERED_EMAIL_KEY = 'clarity-auth-email'

function readRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? ''
  } catch {
    // Storage unavailable (private mode, sandboxed iframe) — fall back to
    // a blank form. The login flow itself is unaffected; only the
    // pre-fill convenience is lost.
    return ''
  }
}

function writeRememberedEmail(value: string): void {
  try {
    localStorage.setItem(REMEMBERED_EMAIL_KEY, value)
  } catch {
    // Ignore — see readRememberedEmail().
  }
}

function clearRememberedEmail(): void {
  try {
    localStorage.removeItem(REMEMBERED_EMAIL_KEY)
  } catch {
    // Ignore.
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emailValid = computed(() => EMAIL_RE.test(email.value.trim()))
const passwordValid = computed(() => password.value.length > 0)
const canSubmit = computed(
  () => emailValid.value && passwordValid.value && !auth.isLoading,
)

const showEmailError = computed(
  () => attempted.value && email.value.length > 0 && !emailValid.value,
)
const showPasswordError = computed(
  () => attempted.value && password.value.length === 0,
)

function onEmailInput(e: Event) {
  const target = e.target as HTMLInputElement
  email.value = target.value
  if (auth.error) auth.clearError()
}

function onPasswordInput(e: Event) {
  const target = e.target as HTMLInputElement
  password.value = target.value
  if (auth.error) auth.clearError()
}

function onRememberInput(e: Event) {
  const target = e.target as HTMLInputElement
  remember.value = target.checked
}

async function onSubmit(e: Event) {
  e.preventDefault()
  attempted.value = true
  if (!canSubmit.value) return
  const ok = await auth.login(email.value, password.value, remember.value)
  if (ok) {
    // Mirror the remember flag onto the saved-email slot: when the operator
    // opted in, persist the trimmed email so the next visit pre-fills the
    // field; when they opted out, wipe any prior remembered value so an
    // explicit "don't remember me" doesn't leak into a future session.
    // The trim matches what we send to the backend, so the pre-filled
    // value is byte-identical to the one the server expects.
    if (remember.value) {
      writeRememberedEmail(email.value.trim())
    } else {
      clearRememberedEmail()
    }
    router.push({ name: 'overview' })
  }
}

// Inputs are slotted into cds-input's shadow DOM, so the browser's
// implicit form submission (Enter → submit) doesn't fire. Handle it
// explicitly: when Enter is pressed anywhere in the form, run the same
// submit logic. The real <button type="submit"> also fires `submit`,
// so we route everything through the same path.
function onKeydownEnter(e: KeyboardEvent) {
  // Ignore Enter on <textarea> — let it insert a newline.
  const target = e.target as HTMLElement | null
  if (target && target.tagName === 'TEXTAREA') return
  // Don't double-submit if the focused element is already the submit button.
  if (target && target.tagName === 'BUTTON') return
  e.preventDefault()
  onSubmit(e)
}

onMounted(() => {
  document.title = locale.t('app.title')
  // Pre-fill the email field from the last "remember me" login so the
  // operator doesn't retype their identifier every visit. Also re-check
  // the box to match the state that originally saved the email — if the
  // operator unchecks it before submitting, the existing else-branch in
  // onSubmit() clears the slot, so the dis/alignment self-corrects.
  const remembered = readRememberedEmail()
  if (remembered) {
    email.value = remembered
    remember.value = true
  }
})
</script>

<template>
  <section class="login-page">
    <span class="orb o1" aria-hidden="true"></span>
    <span class="orb o2" aria-hidden="true"></span>
    <svg
      class="constellation"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g class="lines" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="0.6" stroke-linecap="round">
        <path d="M150 180 L380 250" />
        <path d="M380 250 L620 120" />
        <path d="M620 120 L900 280" />
        <path d="M900 280 L1180 160" />
        <path d="M1180 160 L1430 240" />
        <path d="M280 720 L540 620" />
        <path d="M540 620 L800 780" />
        <path d="M800 780 L1080 700" />
        <path d="M1080 700 L1360 800" />
        <path d="M380 250 L540 620" />
        <path d="M900 280 L800 780" />
        <path d="M1180 160 L1360 800" />
        <path d="M150 180 L280 720" />
        <path d="M1500 500 L1430 240" />
        <path d="M1500 500 L1360 800" />
        <path d="M200 80 L620 120" />
        <path d="M1350 60 L1180 160" />
        <path d="M60 380 L150 180" />
        <path d="M1540 700 L1360 800" />
        <path d="M380 850 L800 780" />
      </g>
      <g class="nodes">
        <!-- Large prominent nodes (some sit behind the login card — that's intentional) -->
        <circle cx="380"  cy="250" r="26" fill="rgba(125,211,252,0.10)" />
        <circle cx="380"  cy="250" r="3"   fill="rgba(255,255,255,0.95)" />
        <circle cx="900"  cy="280" r="30" fill="rgba(167,139,250,0.12)" />
        <circle cx="900"  cy="280" r="3.2" fill="rgba(255,255,255,0.95)" />
        <circle cx="620"  cy="120" r="22" fill="rgba(125,211,252,0.10)" />
        <circle cx="620"  cy="120" r="2.6" fill="rgba(255,255,255,0.95)" />

        <!-- Medium nodes with soft halos -->
        <circle cx="1180" cy="160" r="16" fill="rgba(125,211,252,0.08)" />
        <circle cx="1180" cy="160" r="1.8" fill="rgba(125,211,252,0.9)" />
        <circle cx="540"  cy="620" r="14" fill="rgba(125,211,252,0.08)" />
        <circle cx="540"  cy="620" r="1.6" fill="rgba(125,211,252,0.85)" />
        <circle cx="1080" cy="700" r="14" fill="rgba(167,139,250,0.08)" />
        <circle cx="1080" cy="700" r="1.7" fill="rgba(167,139,250,0.85)" />
        <circle cx="1430" cy="240" r="13" fill="rgba(167,139,250,0.07)" />
        <circle cx="1430" cy="240" r="1.5" fill="rgba(167,139,250,0.8)" />
        <circle cx="800"  cy="780" r="12" fill="rgba(125,211,252,0.07)" />
        <circle cx="800"  cy="780" r="1.4" fill="rgba(125,211,252,0.8)" />

        <!-- Small bright nodes (no halo) -->
        <circle cx="150"  cy="180" r="1.4" fill="rgba(125,211,252,0.8)" />
        <circle cx="280"  cy="720" r="1.3" fill="rgba(125,211,252,0.75)" />
        <circle cx="1500" cy="500" r="1.4" fill="rgba(167,139,250,0.75)" />
        <circle cx="1360" cy="800" r="1.3" fill="rgba(125,211,252,0.7)" />
        <circle cx="200"  cy="80"  r="1.3" fill="rgba(167,139,250,0.7)" />
        <circle cx="1350" cy="60"  r="1.4" fill="rgba(125,211,252,0.75)" />
        <circle cx="60"   cy="380" r="1.3" fill="rgba(125,211,252,0.7)" />
        <circle cx="1540" cy="700" r="1.2" fill="rgba(167,139,250,0.65)" />
        <circle cx="380"  cy="850" r="1.3" fill="rgba(167,139,250,0.7)" />

        <!-- Tiny dim specks (deepest layer) -->
        <circle cx="1450" cy="380" r="1"   fill="rgba(125,211,252,0.5)" />
        <circle cx="50"   cy="600" r="1"   fill="rgba(167,139,250,0.5)" />
        <circle cx="1100" cy="60"  r="1"   fill="rgba(125,211,252,0.45)" />
        <circle cx="240"  cy="500" r="0.9" fill="rgba(167,139,250,0.4)" />
        <circle cx="1300" cy="430" r="0.9" fill="rgba(125,211,252,0.4)" />
        <circle cx="700"  cy="820" r="0.9" fill="rgba(125,211,252,0.4)" />
      </g>
    </svg>
    <div class="login-card" role="region" :aria-label="locale.t('login.heading')">
      <aside class="login-brand">
        <div>
          <h1 class="login-brand-title">{{ locale.t('app.title') }}</h1>
          <p class="login-brand-tagline">{{ locale.t('login.tagline') }}</p>
        </div>
        <small class="login-brand-meta">{{ locale.t('login.copyright') }}</small>
      </aside>

      <form class="login-form-wrap" @submit="onSubmit" @keydown.enter="onKeydownEnter" novalidate>
        <h2>{{ locale.t('login.heading') }}</h2>

        <cds-alert
          v-if="auth.error"
          status="danger"
          closable
          @closeChange="auth.clearError"
        >
          {{ locale.t('login.error.creds') }}
        </cds-alert>

        <cds-input :status="showEmailError ? 'error' : 'neutral'">
          <label>{{ locale.t('login.email') }}</label>
          <cds-control-action action="prefix">
            <cds-icon shape="envelope"></cds-icon>
          </cds-control-action>
          <input
            type="email"
            autocomplete="email"
            :placeholder="locale.t('login.email.placeholder')"
            :value="email"
            @input="onEmailInput"
            :disabled="auth.isLoading"
            required
          />
          <cds-control-message v-if="showEmailError" status="error" aria-live="polite">
            {{ locale.t('login.error.email') }}
          </cds-control-message>
        </cds-input>

        <cds-input :status="showPasswordError ? 'error' : 'neutral'" class="pwd-input">
          <label>{{ locale.t('login.password') }}</label>
          <cds-control-action action="prefix">
            <cds-icon shape="lock"></cds-icon>
          </cds-control-action>
          <input
            slot="input"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            :placeholder="locale.t('login.password.placeholder')"
            :value="password"
            @input="onPasswordInput"
            :disabled="auth.isLoading"
            required
          />
          <button
            slot="suffix"
            type="button"
            class="pwd-toggle"
            :aria-label="locale.t(showPassword ? 'login.password.hide' : 'login.password.show')"
            :disabled="auth.isLoading"
            @click="showPassword = !showPassword"
          >
            <cds-icon :shape="showPassword ? 'eye-hide' : 'eye'" size="sm"></cds-icon>
          </button>
          <cds-control-message v-if="showPasswordError" status="error" aria-live="polite">
            {{ locale.t('login.error.password') }}
          </cds-control-message>
        </cds-input>

        <cds-checkbox>
          <label>{{ locale.t('login.remember') }}</label>
          <input
            type="checkbox"
            :checked="remember"
            @change="onRememberInput"
            :disabled="auth.isLoading"
          />
        </cds-checkbox>

        <cds-button
          type="submit"
          :disabled="!canSubmit"
          :loading="auth.isLoading"
          block
        >
          {{ locale.t('login.submit') }}
        </cds-button>
      </form>
    </div>
  </section>
</template>

<style scoped>
/* cds-input's internal --padding controls the slotted <input>'s padding.
   Override it to reserve room on the right for the eye button. */
.pwd-input {
  --padding: 4px 36px 4px 12px;
}
/* cds-input's input-message-container has overflow: hidden which clips
   the hover tooltip — turn it off so the title can render below. */
.pwd-input :deep(.input-message-container) {
  overflow: visible;
}
/* The eye is in cds-input's shadow DOM (slotted), so Vue scoped styles
   need :deep() to reach it. Also override cds-input's pointer-events:none
   on the .suffix wrapper so the button is clickable, and give it a
   real height + flex centering so the eye lines up with the input. */
.pwd-input :deep(.suffix) {
  pointer-events: auto;
  display: flex;
  align-items: center;
  top: 0;
  height: 100%;
}
.pwd-input :deep(.pwd-toggle) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: none;
  border: 0;
  padding: 0;
  margin: 0;
  cursor: pointer;
  color: var(--cds-alias-typography-color-300, #6b6b6b);
  border-radius: 4px;
  transition: color 0.12s ease, background-color 0.12s ease;
}
.pwd-input :deep(.pwd-toggle:hover:not(:disabled)) {
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.pwd-input :deep(.pwd-toggle:disabled) {
  cursor: not-allowed;
  opacity: 0.5;
}
.pwd-input :deep(.pwd-toggle:focus-visible) {
  outline: 2px solid var(--cds-alias-status-info, #0079ad);
  outline-offset: 1px;
}
</style>
