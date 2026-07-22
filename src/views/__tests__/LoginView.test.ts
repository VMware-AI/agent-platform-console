/**
 * Component tests for LoginView.vue.
 *
 * The view reads auth state through `useAuthStore()` (a Pinia store) and drives
 * navigation through `useRouter().push`. We mock both:
 *
 *  - `@/stores/auth` returns a controllable, reactive store stub so we can drive
 *    `isLoading` / `error` and assert that `login(email, password, remember)` is
 *    invoked with exactly the typed credentials. Mocking the store (instead of
 *    apolloClient) keeps the test focused on the view's real contract with auth
 *    and avoids coupling to the GraphQL mutation internals.
 *  - `vue-router` so the post-success `router.push({ name: 'overview' })` is
 *    observable without a live router.
 *
 * The locale store stays REAL (real Pinia via setActivePinia) so `locale.t(...)`
 * resolves the actual i18n strings — assertions target locale-key-driven text,
 * emitted behavior, and the credentials handed to the store, never brittle
 * markup. `cds-*` are custom elements (Clarity); the vitest/vite config already
 * registers them, so we assert on plain DOM (<input>, button, alert text).
 *
 * States / behaviors covered: initial render, loading (inputs/submit disabled,
 * button loading), error (cds-alert with the creds locale string + clearError
 * on input), client-side validation gating submit, a successful submit (correct
 * args + navigation), a failed submit (no navigation), the remember checkbox,
 * the password-visibility toggle, and Enter-to-submit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

/* ---------- Mock the auth store ---------- */

// A reactive stub matching the slice of the real auth store the view consumes:
// reactive `isLoading` / `error`, plus `login` / `clearError` actions. `login`
// resolves true/false to emulate success/failure; tests tweak its impl.
const loginSpy = vi.fn<[string, string, boolean], Promise<boolean>>()
const clearErrorSpy = vi.fn(() => {
  authState.error = null
})

const authState = reactive({
  isLoading: false,
  error: null as string | null,
  login: loginSpy,
  clearError: clearErrorSpy,
})

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authState,
}))

/* ---------- Mock vue-router ---------- */

const pushSpy = vi.fn().mockResolvedValue(undefined)
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushSpy }),
}))

// Imported AFTER the mocks are registered.
import LoginView from '@/views/LoginView.vue'
import { useLocaleStore } from '@/stores/locale'

/* ---------- Helpers ---------- */

function makeWrapper(): VueWrapper {
  return mount(LoginView)
}

// Real locale (default 'zh') so we can compare rendered text to live strings.
let locale: ReturnType<typeof useLocaleStore>

const VALID_EMAIL = 'admin@example.com'
const VALID_PASSWORD = 's3cret-pw'

function emailInput(wrapper: VueWrapper) {
  return wrapper.find('input[type="email"]')
}
function passwordInput(wrapper: VueWrapper) {
  // type flips between password/text via the visibility toggle; target by
  // autocomplete which is stable.
  return wrapper.find('input[autocomplete="current-password"]')
}
function rememberInput(wrapper: VueWrapper) {
  return wrapper.find('input[type="checkbox"]')
}
function submitButton(wrapper: VueWrapper) {
  return wrapper.find('cds-button[type="submit"]')
}

// `:disabled` / `:loading` on a custom element (cds-button) bind the boolean as
// a string attribute ("true" / "false") rather than being removed, so assert on
// the value, not mere attribute presence.
function isSubmitDisabled(wrapper: VueWrapper): boolean {
  return submitButton(wrapper).attributes('disabled') === 'true'
}
function isSubmitLoading(wrapper: VueWrapper): boolean {
  return submitButton(wrapper).attributes('loading') === 'true'
}

async function fillCredentials(wrapper: VueWrapper, email = VALID_EMAIL, password = VALID_PASSWORD) {
  await emailInput(wrapper).setValue(email)
  await passwordInput(wrapper).setValue(password)
}

/* ---------- Setup / teardown ---------- */

beforeEach(() => {
  setActivePinia(createPinia())
  locale = useLocaleStore()
  authState.isLoading = false
  authState.error = null
  loginSpy.mockReset()
  loginSpy.mockResolvedValue(true)
  clearErrorSpy.mockClear()
  pushSpy.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

/* ---------- Tests ---------- */

describe('LoginView — initial render', () => {
  it('renders heading, email/password fields and submit button from locale keys', () => {
    const wrapper = makeWrapper()

    // Heading + submit label come straight from the real locale dictionary.
    expect(wrapper.text()).toContain(locale.t('login.heading'))
    expect(submitButton(wrapper).text()).toBe(locale.t('login.submit'))

    expect(emailInput(wrapper).exists()).toBe(true)
    expect(passwordInput(wrapper).exists()).toBe(true)
    expect(rememberInput(wrapper).exists()).toBe(true)
  })

  it('starts with no error alert and a disabled submit (empty form)', () => {
    const wrapper = makeWrapper()

    expect(wrapper.find('cds-alert').exists()).toBe(false)
    // canSubmit is false until both fields are valid.
    expect(isSubmitDisabled(wrapper)).toBe(true)
  })

  it('sets the document title from the app.title locale key on mount', () => {
    makeWrapper()
    expect(document.title).toBe(locale.t('app.title'))
  })
})

describe('LoginView — validation gating', () => {
  it('keeps submit disabled with an invalid email', async () => {
    const wrapper = makeWrapper()
    await emailInput(wrapper).setValue('not-an-email')
    await passwordInput(wrapper).setValue(VALID_PASSWORD)

    expect(isSubmitDisabled(wrapper)).toBe(true)
  })

  it('enables submit once email is valid and password is non-empty', async () => {
    const wrapper = makeWrapper()
    await fillCredentials(wrapper)

    expect(isSubmitDisabled(wrapper)).toBe(false)
  })

  it('does not call login when the form is submitted while invalid', async () => {
    const wrapper = makeWrapper()
    // Only email, no password → invalid.
    await emailInput(wrapper).setValue(VALID_EMAIL)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(loginSpy).not.toHaveBeenCalled()
    // Shows the inline email/password validation message after an attempt.
    expect(wrapper.text()).toContain(locale.t('login.error.password'))
  })

  it('shows the inline email-format error after a submit attempt', async () => {
    const wrapper = makeWrapper()
    await emailInput(wrapper).setValue('bad@')
    await passwordInput(wrapper).setValue(VALID_PASSWORD)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(loginSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain(locale.t('login.error.email'))
  })
})

describe('LoginView — successful submit', () => {
  it('calls auth.login with email/password/remember and navigates to overview', async () => {
    loginSpy.mockResolvedValue(true)
    const wrapper = makeWrapper()

    await fillCredentials(wrapper)
    await rememberInput(wrapper).setValue(true)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(loginSpy).toHaveBeenCalledTimes(1)
    expect(loginSpy).toHaveBeenCalledWith(VALID_EMAIL, VALID_PASSWORD, true)
    expect(pushSpy).toHaveBeenCalledWith({ name: 'overview' })
  })

  it('passes remember=true when the checkbox is left unchecked (default)', async () => {
    loginSpy.mockResolvedValue(true)
    const wrapper = makeWrapper()

    await fillCredentials(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(loginSpy).toHaveBeenCalledWith(VALID_EMAIL, VALID_PASSWORD, true)
  })
})

describe('LoginView — failed submit', () => {
  it('does not navigate when login resolves false', async () => {
    loginSpy.mockResolvedValue(false)
    const wrapper = makeWrapper()

    await fillCredentials(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(loginSpy).toHaveBeenCalledTimes(1)
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('renders the creds error alert (locale key) when the store sets an error', async () => {
    const wrapper = makeWrapper()
    expect(wrapper.find('cds-alert').exists()).toBe(false)

    // Simulate the store recording a failed login.
    authState.error = 'Invalid email or password.'
    await flushPromises()

    const alert = wrapper.find('cds-alert')
    expect(alert.exists()).toBe(true)
    // The alert text is locale-driven, NOT the raw store message.
    expect(alert.text()).toContain(locale.t('login.error.creds'))
  })

  it('clears the store error when the user edits the email field', async () => {
    const wrapper = makeWrapper()
    authState.error = 'Invalid email or password.'
    await flushPromises()
    expect(wrapper.find('cds-alert').exists()).toBe(true)

    await emailInput(wrapper).setValue('a@b.com')
    await flushPromises()

    expect(clearErrorSpy).toHaveBeenCalled()
    expect(authState.error).toBeNull()
    expect(wrapper.find('cds-alert').exists()).toBe(false)
  })
})

describe('LoginView — loading state', () => {
  it('disables inputs and submit while auth.isLoading is true', async () => {
    authState.isLoading = true
    const wrapper = makeWrapper()
    await flushPromises()

    // Native <input> elements DO get Vue's boolean-attr treatment (present when
    // true, absent when false), so presence is the right assertion here.
    expect(emailInput(wrapper).attributes('disabled')).toBeDefined()
    expect(passwordInput(wrapper).attributes('disabled')).toBeDefined()
    expect(rememberInput(wrapper).attributes('disabled')).toBeDefined()
    // canSubmit folds in !isLoading, so submit is disabled even with valid creds.
    expect(isSubmitDisabled(wrapper)).toBe(true)
  })

  it('marks the submit button as loading while auth.isLoading is true', async () => {
    authState.isLoading = true
    const wrapper = makeWrapper()
    await flushPromises()

    expect(isSubmitLoading(wrapper)).toBe(true)
  })

  it('does not submit (login not called) when loading even with valid creds', async () => {
    const wrapper = makeWrapper()
    await fillCredentials(wrapper)
    // Flip to loading after filling.
    authState.isLoading = true
    await flushPromises()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(loginSpy).not.toHaveBeenCalled()
  })
})

describe('LoginView — interactions', () => {
  it('toggles password visibility via the eye button', async () => {
    const wrapper = makeWrapper()
    const pwd = passwordInput(wrapper)

    expect(pwd.attributes('type')).toBe('password')

    await wrapper.find('.pwd-toggle').trigger('click')

    expect(passwordInput(wrapper).attributes('type')).toBe('text')
  })

  it('submits via Enter pressed inside the form (not just the button)', async () => {
    loginSpy.mockResolvedValue(true)
    const wrapper = makeWrapper()
    await fillCredentials(wrapper)

    await emailInput(wrapper).trigger('keydown.enter')
    await flushPromises()

    expect(loginSpy).toHaveBeenCalledWith(VALID_EMAIL, VALID_PASSWORD, true)
    expect(pushSpy).toHaveBeenCalledWith({ name: 'overview' })
  })

  it('trims nothing extra: forwards the raw typed email to the store', async () => {
    // The view forwards email.value as typed; trimming/normalization is the
    // store's job. Assert the view does not mangle the credential.
    loginSpy.mockResolvedValue(true)
    const wrapper = makeWrapper()
    await fillCredentials(wrapper, VALID_EMAIL, VALID_PASSWORD)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(loginSpy).toHaveBeenCalledWith(VALID_EMAIL, VALID_PASSWORD, true)
  })
})
