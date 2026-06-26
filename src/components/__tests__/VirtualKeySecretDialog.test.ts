/**
 * Component tests for VirtualKeySecretDialog.vue.
 *
 * This dialog shows a freshly-issued virtual-key secret exactly once. It must:
 *  - render the secret verbatim while open, and hide via :hidden when closed
 *  - copy the secret on demand (clipboard API first, execCommand fallback) and
 *    surface a success toast; surface an error toast when both paths fail
 *  - emit 'close' from both the "Done" action and the modal's closeChange
 *
 * useToast is mocked so we can assert the success/error notifications without a
 * live <ToastContainer>. cds-* are custom elements (Clarity design-system); we
 * tell the Vue compiler to treat any `cds-` tag as a custom element so mount()
 * renders them as plain DOM we can query. The modal content (incl. the secret
 * <code>) is rendered inline (no Teleport), so we query the wrapper directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
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

import VirtualKeySecretDialog from '@/components/VirtualKeySecretDialog.vue'

const SECRET = 'sk-live-abc123XYZ-789'

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
  toastSuccess.mockReset()
  toastError.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
  // Remove the clipboard override between tests so each can set its own.
  delete (navigator as { clipboard?: unknown }).clipboard
})

function setClipboard(writeText: ((v: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
    writable: true,
  })
}

// jsdom does not implement document.execCommand, so define it before spying.
// Returns the spy so tests can assert it was invoked with 'copy'.
function stubExecCommand(result: boolean) {
  const spy = vi.fn().mockReturnValue(result)
  Object.defineProperty(document, 'execCommand', {
    value: spy,
    configurable: true,
    writable: true,
  })
  return spy
}

describe('VirtualKeySecretDialog', () => {
  it('renders the secret verbatim and is visible when open=true', () => {
    wrapper = mount(VirtualKeySecretDialog, {
      ...mountConfig,
      props: { open: true, secret: SECRET },
    })
    const code = wrapper.find('.secret-value')
    expect(code.exists()).toBe(true)
    expect(code.text()).toBe(SECRET)

    // :hidden is bound to !open → open=true means NOT hidden.
    const modal = wrapper.find('cds-modal')
    expect(modal.attributes('hidden')).toBeUndefined()
  })

  it('marks the modal hidden when open=false', () => {
    wrapper = mount(VirtualKeySecretDialog, {
      ...mountConfig,
      props: { open: false, secret: SECRET },
    })
    const modal = wrapper.find('cds-modal')
    // Boolean attribute is present (truthy) when hidden.
    expect(modal.attributes('hidden')).toBe('')
  })

  it('copies via the clipboard API and shows a success toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard(writeText)

    wrapper = mount(VirtualKeySecretDialog, {
      ...mountConfig,
      props: { open: true, secret: SECRET },
    })

    const copyBtn = wrapper.find('.secret-row cds-button')
    await copyBtn.trigger('click')
    await wrapper.vm.$nextTick()

    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText).toHaveBeenCalledWith(SECRET)
    expect(toastSuccess).toHaveBeenCalledOnce()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('falls back to execCommand when the clipboard API rejects, still succeeds', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    setClipboard(writeText)
    const execSpy = stubExecCommand(true)

    wrapper = mount(VirtualKeySecretDialog, {
      ...mountConfig,
      props: { open: true, secret: SECRET },
    })

    await wrapper.find('.secret-row cds-button').trigger('click')
    await wrapper.vm.$nextTick()

    expect(writeText).toHaveBeenCalledOnce()
    expect(execSpy).toHaveBeenCalledWith('copy')
    expect(toastSuccess).toHaveBeenCalledOnce()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('uses execCommand directly when the clipboard API is unavailable', async () => {
    setClipboard(undefined)
    const execSpy = stubExecCommand(true)

    wrapper = mount(VirtualKeySecretDialog, {
      ...mountConfig,
      props: { open: true, secret: SECRET },
    })

    await wrapper.find('.secret-row cds-button').trigger('click')
    await wrapper.vm.$nextTick()

    expect(execSpy).toHaveBeenCalledWith('copy')
    expect(toastSuccess).toHaveBeenCalledOnce()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('shows an error toast when both clipboard API and execCommand fail', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    setClipboard(writeText)
    // execCommand returns false → fallback throws → outer catch → error toast.
    const execSpy = stubExecCommand(false)

    wrapper = mount(VirtualKeySecretDialog, {
      ...mountConfig,
      props: { open: true, secret: SECRET },
    })

    await wrapper.find('.secret-row cds-button').trigger('click')
    await wrapper.vm.$nextTick()

    expect(execSpy).toHaveBeenCalledWith('copy')
    expect(toastError).toHaveBeenCalledOnce()
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('emits close when the "Done" action is clicked', async () => {
    wrapper = mount(VirtualKeySecretDialog, {
      ...mountConfig,
      props: { open: true, secret: SECRET },
    })

    // The Done button lives in cds-modal-actions (the action footer).
    const doneBtn = wrapper.find('cds-modal-actions cds-button')
    await doneBtn.trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('emits close when the modal fires closeChange (× / backdrop / esc)', async () => {
    wrapper = mount(VirtualKeySecretDialog, {
      ...mountConfig,
      props: { open: true, secret: SECRET },
    })

    await wrapper.find('cds-modal').trigger('closeChange')

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('copying does not emit close (reveal stays until explicitly dismissed)', async () => {
    setClipboard(vi.fn().mockResolvedValue(undefined))
    wrapper = mount(VirtualKeySecretDialog, {
      ...mountConfig,
      props: { open: true, secret: SECRET },
    })

    await wrapper.find('.secret-row cds-button').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toBeFalsy()
  })
})
