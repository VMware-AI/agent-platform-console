import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import ConfirmDialog from '@/views/user-role/ConfirmDialog.vue'

/**
 * ConfirmDialog is a Teleport-to-body confirm modal driven entirely by props:
 *   open / title / body / danger.
 * It emits `confirm` (primary action) and `close` (cancel button + backdrop
 * click). The confirm <cds-button> renders status="danger" vs "primary" based
 * on the `danger` prop. These tests assert that real behavior.
 *
 * Because the component Teleports to <body>, we mount with `attachTo` a live
 * node and query the teleported markup from `document.body` (Test Utils' own
 * `wrapper.find` does not traverse into Teleport targets). `cds-button` is a
 * Clarity custom element — already registered as such in vite/vitest config —
 * so it mounts as a plain unknown element; we read its attributes/text and
 * dispatch native `click` events on it (Vue's @click is a native DOM listener).
 */

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(ConfirmDialog, {
    attachTo: document.body,
    props: {
      open: true,
      title: 'Delete user',
      body: 'This action cannot be undone.',
      ...props,
    },
    global: {
      plugins: [createPinia()],
    },
  })
}

function backdrop(): HTMLElement | null {
  return document.body.querySelector('.confirm-backdrop')
}

function confirmButton(): HTMLElement {
  const btns = document.body.querySelectorAll('.confirm-actions cds-button')
  // Order in template: [cancel, confirm].
  return btns[1] as HTMLElement
}

function cancelButton(): HTMLElement {
  const btns = document.body.querySelectorAll('.confirm-actions cds-button')
  return btns[0] as HTMLElement
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  // Teleported nodes live on body; clear them so tests stay isolated.
  document.body.innerHTML = ''
})

describe('ConfirmDialog', () => {
  it('does not render anything when `open` is false', () => {
    const wrapper = mountDialog({ open: false })
    expect(backdrop()).toBeNull()
    wrapper.unmount()
  })

  it('renders the backdrop, title and body from props when open', () => {
    const wrapper = mountDialog()

    const bd = backdrop()
    expect(bd).not.toBeNull()
    expect(bd!.getAttribute('role')).toBe('alertdialog')
    expect(bd!.getAttribute('aria-modal')).toBe('true')
    expect(bd!.getAttribute('aria-label')).toBe('Delete user')

    expect(document.body.querySelector('.confirm-title')!.textContent).toBe('Delete user')
    expect(document.body.querySelector('.confirm-body')!.textContent).toBe(
      'This action cannot be undone.',
    )
    wrapper.unmount()
  })

  it('reflects updated title/body props reactively', async () => {
    const wrapper = mountDialog()
    await wrapper.setProps({ title: 'Remove role', body: 'Members lose access.' })

    expect(document.body.querySelector('.confirm-title')!.textContent).toBe('Remove role')
    expect(document.body.querySelector('.confirm-body')!.textContent).toBe('Members lose access.')
    wrapper.unmount()
  })

  it('emits `confirm` when the confirm button is clicked', async () => {
    const wrapper = mountDialog()

    confirmButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits `close` when the cancel button is clicked', async () => {
    const wrapper = mountDialog()

    cancelButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits `close` when the backdrop itself is clicked', async () => {
    const wrapper = mountDialog()

    // Backdrop click only closes when target === currentTarget (the backdrop).
    backdrop()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('does NOT emit `close` when a click originates inside the card', async () => {
    const wrapper = mountDialog()

    // Clicking the card bubbles to the backdrop handler, but target !==
    // currentTarget so onBackdropClick is a no-op.
    document.body.querySelector('.confirm-card')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })

  it('renders the confirm button with primary status by default (danger off)', () => {
    const wrapper = mountDialog()

    const confirm = confirmButton()
    expect(confirm.getAttribute('status')).toBe('primary')
    expect(confirm.getAttribute('action')).toBe('solid')
    wrapper.unmount()
  })

  it('renders the confirm button with danger status when `danger` is true', () => {
    const wrapper = mountDialog({ danger: true })

    const confirm = confirmButton()
    expect(confirm.getAttribute('status')).toBe('danger')
    expect(confirm.getAttribute('action')).toBe('solid')
    wrapper.unmount()
  })

  it('keeps the cancel button as an outline action regardless of danger', () => {
    const wrapper = mountDialog({ danger: true })

    expect(cancelButton().getAttribute('action')).toBe('outline')
    wrapper.unmount()
  })

  it('teleports the dialog markup onto <body>, not inside the wrapper root', () => {
    const wrapper = mountDialog()

    // The backdrop is a direct descendant of body, not of the mounted root el.
    expect(document.body.querySelector('.confirm-backdrop')).not.toBeNull()
    expect(wrapper.element.querySelector?.('.confirm-backdrop') ?? null).toBeNull()
    wrapper.unmount()
  })
})
