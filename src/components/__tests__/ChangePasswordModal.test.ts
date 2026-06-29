/**
 * Component tests for ChangePasswordModal.vue.
 *
 * The modal is mounted by AppShell while `auth.mustChangePassword === true`.
 * It exposes three password fields, live complexity feedback, a mismatch
 * warning, and a single submit button gated on full validation. Submit
 * calls `auth.changePassword(oldPassword, newPassword)`. The modal owns no
 * close logic — the parent's v-if re-evaluates when the flag clears.
 *
 * - useToast and useAuthStore are mocked so we assert call args without a
 *   live Apollo client or a live ToastContainer.
 * - cds-* are Clarity custom elements; the isCustomElement compiler option
 *   makes Vue render them as plain DOM we can query.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock the toast composable BEFORE importing the component.
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: toastSuccess,
    error: toastError,
    info: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
  }),
}))

const authChangePassword = vi.fn()
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    changePassword: authChangePassword,
    // The modal doesn't read mustChangePassword, but expose it for
    // completeness in case future changes add the binding.
    mustChangePassword: true,
    error: null as string | null,
  }),
}))

import ChangePasswordModal from '@/components/ChangePasswordModal.vue'

const mountConfig = {
  global: {
    config: {
      compilerOptions: {
        isCustomElement: (tag: string) => tag.startsWith('cds-'),
      },
    },
  },
}

let wrapper: VueWrapper | null = null

beforeEach(() => {
  setActivePinia(createPinia())
  authChangePassword.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

function mountModal() {
  wrapper = mount(ChangePasswordModal, mountConfig)
  return wrapper
}

function fillForm(old: string, next: string, confirm: string) {
  const inputs = wrapper!.findAll('input[type="password"]')
  inputs[0].setValue(old)
  inputs[1].setValue(next)
  inputs[2].setValue(confirm)
}

function submitButton() {
  // The submit button is the only <button> inside cds-modal-actions. We use
  // a native <button> rather than <cds-button> so the themed shell is
  // reliably visible inside the modal-actions slot (Clarity web-component
  // styles don't reach the button's shadow root from there).
  return wrapper!.find('cds-modal-actions .submit-btn')
}

// Native <button>: when bound via :disabled, the disabled property is set
// on the element and the attribute is rendered as the empty string when
// truthy or absent when falsy. We check the element's `disabled` property
// rather than the attribute string for a cleaner semantic assertion.
function buttonDisabled(): boolean {
  return (submitButton().element as HTMLButtonElement).disabled === true
}

describe('ChangePasswordModal — rendering', () => {
  it('renders the modal with the testid', () => {
    mountModal()
    expect(wrapper!.find('[data-testid="change-password-modal"]').exists()).toBe(true)
  })

  it('renders three password fields (current, new, confirm)', () => {
    mountModal()
    const inputs = wrapper!.findAll('input[type="password"]')
    expect(inputs).toHaveLength(3)
  })

  it('renders the static password hint so users see the rules up front', () => {
    mountModal()
    // The modal reuses the create-user form's hint so expectations match
    // between the two flows. The locale key is intentionally not mocked —
    // we assert on the resolved zh string the real locale store returns.
    const hint = wrapper!.find('[data-testid="password-hint"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toBe('密码须包含大小写字母、数字,长度 ≥ 12')
  })

  it('renders the submit button as a native button styled to match Clarity solid+primary', () => {
    mountModal()
    const btn = submitButton()
    // The native button is what users see and click; it carries the disabled
    // state and the .submit-btn class which provides the solid+primary look
    // via scoped styles (Clarity design tokens).
    expect(btn.element.tagName).toBe('BUTTON')
    expect(btn.classes()).toContain('submit-btn')
  })

  it('does not show the live complexity error list until the user types', () => {
    mountModal()
    // Empty form: only the static hint is shown; the live reasons list is
    // hidden so the modal does not look "already broken" on open.
    expect(wrapper!.find('[data-testid="password-complexity-reasons"]').exists()).toBe(
      false,
    )
  })

  it('shows the live complexity error list once the new password fails any rule', async () => {
    mountModal()
    // 'abc' fails length + uppercase + digit, satisfies lowercase. Use a
    // value that triggers at least 3 reasons to keep the assertion robust.
    fillForm('OldPass0!', 'abc', 'abc')
    await flushPromises()
    const list = wrapper!.find('[data-testid="password-complexity-reasons"]')
    expect(list.exists()).toBe(true)
    const items = list.findAll('li')
    expect(items.length).toBeGreaterThanOrEqual(3)
  })
})

describe('ChangePasswordModal — submit gating', () => {
  it('submit button is disabled with empty fields', () => {
    mountModal()
    expect(buttonDisabled()).toBe(true)
  })

  it('submit button is disabled when new and confirm do not match', async () => {
    mountModal()
    fillForm('OldPass0!', 'NewPassw0rd!', 'DifferentPass0!')
    await flushPromises()
    expect(buttonDisabled()).toBe(true)
  })

  it('submit button is disabled when the new password fails complexity', async () => {
    mountModal()
    fillForm('OldPass0!', 'short', 'short')
    await flushPromises()
    expect(buttonDisabled()).toBe(true)
  })

  it('submit button enables when all three conditions pass', async () => {
    mountModal()
    fillForm('OldPass0!', 'NewPassw0rd!', 'NewPassw0rd!')
    await flushPromises()
    expect(buttonDisabled()).toBe(false)
  })
})

describe('ChangePasswordModal — submit behavior', () => {
  it('clicking submit calls auth.changePassword with old + new', async () => {
    authChangePassword.mockResolvedValue(true)
    mountModal()
    fillForm('OldPass0!', 'NewPassw0rd!', 'NewPassw0rd!')
    await flushPromises()

    await submitButton().trigger('click')
    await flushPromises()

    expect(authChangePassword).toHaveBeenCalledTimes(1)
    expect(authChangePassword).toHaveBeenCalledWith('OldPass0!', 'NewPassw0rd!')
  })

  it('success path surfaces the success toast', async () => {
    authChangePassword.mockResolvedValue(true)
    mountModal()
    fillForm('OldPass0!', 'NewPassw0rd!', 'NewPassw0rd!')
    await flushPromises()

    await submitButton().trigger('click')
    await flushPromises()

    // The real locale store resolves the key. With default locale 'zh' the
    // success toast reads "密码已更新"; assert the call happened with a
    // non-empty string instead of the literal key (locale is not mocked here).
    expect(toastSuccess).toHaveBeenCalledTimes(1)
    const arg = toastSuccess.mock.calls[0][0]
    expect(typeof arg).toBe('string')
    expect(arg.length).toBeGreaterThan(0)
    expect(arg).not.toBe('changePassword.toast.ok') // resolved, not the key
    expect(toastError).not.toHaveBeenCalled()
  })

  it('failure path surfaces the error toast and re-enables the button', async () => {
    authChangePassword.mockResolvedValue(false)
    mountModal()
    fillForm('OldPass0!', 'NewPassw0rd!', 'NewPassw0rd!')
    await flushPromises()

    await submitButton().trigger('click')
    await flushPromises()

    expect(toastError).toHaveBeenCalledTimes(1)
    expect(buttonDisabled()).toBe(false)
  })
})