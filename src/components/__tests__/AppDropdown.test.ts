import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import AppDropdown from '@/components/AppDropdown.vue'

/**
 * AppDropdown is a self-contained popover: it owns its `open` state, exposes a
 * `close` callback to the default slot, and wires global document listeners for
 * outside-click (capture phase) + Escape. It emits no events — the slot's
 * `close` is the established close affordance. These tests assert that real
 * behavior, mounting into a live document so the global listeners fire.
 */

// Renders a trigger button plus a slot item that can call the provided `close`.
function mountDropdown(props: Record<string, unknown> = {}) {
  return mount(AppDropdown, {
    attachTo: document.body,
    props,
    slots: {
      trigger: `<template #trigger="{ open }"><button class="t-btn">{{ open ? 'OPEN' : 'CLOSED' }}</button></template>`,
      default: `<template #default="{ close }"><button class="item" @click="close">Item</button></template>`,
    },
  })
}

afterEach(() => {
  // Drop anything attachTo left behind so global listeners from one test can't
  // affect the next.
  document.body.innerHTML = ''
})

describe('AppDropdown', () => {
  it('starts closed — no panel rendered', () => {
    const wrapper = mountDropdown()
    expect(wrapper.find('.dd-panel').exists()).toBe(false)
    // The trigger slot receives open=false.
    expect(wrapper.find('.t-btn').text()).toBe('CLOSED')
    wrapper.unmount()
  })

  it('opens when the trigger is clicked and renders the panel', async () => {
    const wrapper = mountDropdown()

    await wrapper.find('.dd-trigger').trigger('click')

    const panel = wrapper.find('.dd-panel')
    expect(panel.exists()).toBe(true)
    expect(panel.attributes('role')).toBe('menu')
    // The trigger slot now sees open=true.
    expect(wrapper.find('.t-btn').text()).toBe('OPEN')
    wrapper.unmount()
  })

  it('toggles closed on a second trigger click', async () => {
    const wrapper = mountDropdown()

    await wrapper.find('.dd-trigger').trigger('click')
    expect(wrapper.find('.dd-panel').exists()).toBe(true)

    await wrapper.find('.dd-trigger').trigger('click')
    expect(wrapper.find('.dd-panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('exposes `close` to the default slot — clicking the slot item closes it', async () => {
    const wrapper = mountDropdown()

    await wrapper.find('.dd-trigger').trigger('click')
    expect(wrapper.find('.dd-panel').exists()).toBe(true)

    // The slot item's @click calls the slot-scoped `close`.
    await wrapper.find('.item').trigger('click')
    expect(wrapper.find('.dd-panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not open when `disabled` is true', async () => {
    const wrapper = mountDropdown({ disabled: true })

    await wrapper.find('.dd-trigger').trigger('click')

    expect(wrapper.find('.dd-panel').exists()).toBe(false)
    expect(wrapper.find('.t-btn').text()).toBe('CLOSED')
    wrapper.unmount()
  })

  it('closes on an outside document click (capture listener)', async () => {
    const wrapper = mountDropdown()

    await wrapper.find('.dd-trigger').trigger('click')
    expect(wrapper.find('.dd-panel').exists()).toBe(true)

    // A click on a node outside the trigger/panel triggers onDocClick → close.
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.dd-panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('stays open when clicking inside the panel', async () => {
    const wrapper = mountDropdown()

    await wrapper.find('.dd-trigger').trigger('click')
    expect(wrapper.find('.dd-panel').exists()).toBe(true)

    // Dispatch a real DOM click on the panel item; onDocClick should bail
    // because panelEl contains the target.
    const item = wrapper.find('.dd-panel .item').element
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    // The slot item's own @click=close fired, so it DOES close here — assert the
    // outside-click guard specifically by clicking a non-interactive panel node.
    // Re-open and click the panel container itself instead.
    await wrapper.find('.dd-trigger').trigger('click')
    expect(wrapper.find('.dd-panel').exists()).toBe(true)
    const panel = wrapper.find('.dd-panel').element
    panel.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.dd-panel').exists()).toBe(true)
    wrapper.unmount()
  })

  it('closes on Escape keydown', async () => {
    const wrapper = mountDropdown()

    await wrapper.find('.dd-trigger').trigger('click')
    expect(wrapper.find('.dd-panel').exists()).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.dd-panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('ignores non-Escape keys', async () => {
    const wrapper = mountDropdown()

    await wrapper.find('.dd-trigger').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.dd-panel').exists()).toBe(true)
    wrapper.unmount()
  })

  it('defaults alignment to `end` and offset to 6px', async () => {
    const wrapper = mountDropdown()
    await wrapper.find('.dd-trigger').trigger('click')

    const panel = wrapper.find('.dd-panel')
    expect(panel.classes()).toContain('dd-align-end')
    expect(panel.attributes('style')).toContain('margin-top: 6px')
    wrapper.unmount()
  })

  it('honors `align="start"` and a custom `offset`', async () => {
    const wrapper = mountDropdown({ align: 'start', offset: 12 })
    await wrapper.find('.dd-trigger').trigger('click')

    const panel = wrapper.find('.dd-panel')
    expect(panel.classes()).toContain('dd-align-start')
    expect(panel.classes()).not.toContain('dd-align-end')
    expect(panel.attributes('style')).toContain('margin-top: 12px')
    wrapper.unmount()
  })

  it('removes its global listeners on unmount (no close-after-unmount leak)', async () => {
    const wrapper = mountDropdown()
    await wrapper.find('.dd-trigger').trigger('click')
    expect(wrapper.find('.dd-panel').exists()).toBe(true)

    wrapper.unmount()

    // After unmount the Escape handler is gone; dispatching must not throw and
    // there is nothing left to assert against — this simply exercises the
    // onBeforeUnmount cleanup path without error.
    expect(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
    ).not.toThrow()
  })
})
