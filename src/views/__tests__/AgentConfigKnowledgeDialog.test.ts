/**
 * Component tests for AgentConfigKnowledgeDialog.vue.
 *
 * Verifies the real behavior described in the component header:
 *  - open gates rendering (Teleport to body)
 *  - the mounted set from props.config.knowledge is pre-checked
 *  - search filters by name + version
 *  - toggling a checkbox updates the selection immutably (props untouched)
 *  - submit emits the full chosen id array; close emits 'close'
 *  - saving disables the actions and blocks close/submit
 *
 * cds-* are custom elements (from the Clarity design-system); we tell Vue's
 * compiler to treat any `cds-` tag as a custom element so mount() doesn't warn
 * or try to resolve them as components. We assert on plain DOM nodes (the search
 * <input>, the checkbox <input>s) which are real, not custom.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import AgentConfigKnowledgeDialog from '@/views/AgentConfigKnowledgeDialog.vue'
import type {
  AgentConfigNode,
  KnowledgeArtifactNode,
} from '@/types/agent-config'

const mountConfig = {
  global: {
    config: {
      compilerOptions: {
        // Treat every <cds-*> tag as a native custom element.
        isCustomElement: (tag: string) => tag.startsWith('cds-'),
      },
    },
  },
}

function makeArtifact(over: Partial<KnowledgeArtifactNode> = {}): KnowledgeArtifactNode {
  return {
    id: 'a1',
    name: 'Runbook',
    kind: 'knowledge',
    version: '1.0.0',
    uri: 'oci://x/a1',
    sha256: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

const ART_A = makeArtifact({ id: 'a1', name: 'Runbook', version: '1.0.0' })
const ART_B = makeArtifact({ id: 'a2', name: 'API Guide', version: '2.3.0' })
const ART_C = makeArtifact({ id: 'a3', name: 'Troubleshooting', version: '1.1.0' })

function makeConfig(knowledge: KnowledgeArtifactNode[]): AgentConfigNode {
  return {
    id: 'cfg-1',
    name: 'Default Goose',
    agentType: 'goose',
    isDefault: true,
    artifactId: null,
    knowledge,
    createdAt: '2026-01-01T00:00:00Z',
  }
}

// All dialog DOM is teleported to <body>; query there, not inside the wrapper.
function backdrop(): HTMLElement | null {
  return document.body.querySelector('.kp-backdrop')
}
function checkboxes(): HTMLInputElement[] {
  return Array.from(document.body.querySelectorAll<HTMLInputElement>('.kp-row input[type="checkbox"]'))
}
function checkedIds(rows: HTMLInputElement[], artifacts: KnowledgeArtifactNode[]): string[] {
  return rows
    .map((cb, i) => (cb.checked ? artifacts[i].id : null))
    .filter((id): id is string => id !== null)
}

let wrapper: VueWrapper | null = null

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  // Defensive: Teleport cleanup happens on unmount, but make sure body is clean.
  document.body.querySelectorAll('.kp-backdrop').forEach((el) => el.remove())
})

describe('AgentConfigKnowledgeDialog', () => {
  it('renders nothing when open=false', () => {
    wrapper = mount(AgentConfigKnowledgeDialog, {
      ...mountConfig,
      props: { open: false, config: makeConfig([ART_A]), artifacts: [ART_A, ART_B] },
    })
    expect(backdrop()).toBeNull()
  })

  it('renders the dialog with the config name when open=true', () => {
    const config = makeConfig([])
    wrapper = mount(AgentConfigKnowledgeDialog, {
      ...mountConfig,
      props: { open: true, config, artifacts: [ART_A, ART_B] },
    })
    const card = backdrop()
    expect(card).not.toBeNull()
    expect(card?.getAttribute('role')).toBe('dialog')
    expect(card?.textContent).toContain('Default Goose')
    // One row per artifact.
    expect(checkboxes()).toHaveLength(2)
  })

  it('pre-checks exactly the mounted set from props.config.knowledge', () => {
    // config mounts a1 and a3; a2 must be unchecked.
    const config = makeConfig([ART_A, ART_C])
    wrapper = mount(AgentConfigKnowledgeDialog, {
      ...mountConfig,
      props: { open: true, config, artifacts: [ART_A, ART_B, ART_C] },
    })
    const rows = checkboxes()
    expect(rows).toHaveLength(3)
    expect(checkedIds(rows, [ART_A, ART_B, ART_C])).toEqual(['a1', 'a3'])
  })

  it('filters the artifact list by name (case-insensitive)', async () => {
    wrapper = mount(AgentConfigKnowledgeDialog, {
      ...mountConfig,
      props: { open: true, config: makeConfig([]), artifacts: [ART_A, ART_B, ART_C] },
    })
    const input = document.body.querySelector<HTMLInputElement>('.kp-search input')!
    input.value = 'guide'
    input.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()

    const rows = document.body.querySelectorAll('.kp-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('API Guide')
  })

  it('filters by version too (name + version are searched)', async () => {
    wrapper = mount(AgentConfigKnowledgeDialog, {
      ...mountConfig,
      props: { open: true, config: makeConfig([]), artifacts: [ART_A, ART_B, ART_C] },
    })
    const input = document.body.querySelector<HTMLInputElement>('.kp-search input')!
    input.value = '2.3'
    input.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()

    const rows = document.body.querySelectorAll('.kp-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('API Guide')
  })

  it('toggling a checkbox updates selection immutably and does NOT mutate props.config.knowledge', async () => {
    const mounted = [ART_A]
    const config = makeConfig(mounted)
    wrapper = mount(AgentConfigKnowledgeDialog, {
      ...mountConfig,
      props: { open: true, config, artifacts: [ART_A, ART_B] },
    })

    // Add a2.
    const rows = checkboxes()
    rows[1].checked = true
    rows[1].dispatchEvent(new Event('change'))
    await wrapper.vm.$nextTick()

    // Submit and read back the emitted ids — selection should now be a1 + a2.
    const submitBtn = document.body.querySelector<HTMLElement>('.kp-actions cds-button[status="primary"]')!
    submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    const submitEvents = wrapper.emitted('submit')
    expect(submitEvents).toBeTruthy()
    expect([...(submitEvents![0][0] as string[])].sort()).toEqual(['a1', 'a2'])

    // The original config array (the source of truth) must be untouched.
    expect(config.knowledge).toBe(mounted)
    expect(config.knowledge.map((a) => a.id)).toEqual(['a1'])
  })

  it('un-checking a pre-selected row removes it from the submitted set', async () => {
    const config = makeConfig([ART_A, ART_B])
    wrapper = mount(AgentConfigKnowledgeDialog, {
      ...mountConfig,
      props: { open: true, config, artifacts: [ART_A, ART_B] },
    })

    const rows = checkboxes()
    expect(rows[0].checked).toBe(true)
    rows[0].checked = false
    rows[0].dispatchEvent(new Event('change'))
    await wrapper.vm.$nextTick()

    const submitBtn = document.body.querySelector<HTMLElement>('.kp-actions cds-button[status="primary"]')!
    submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    const submitEvents = wrapper.emitted('submit')
    expect(submitEvents![0][0]).toEqual(['a2'])
  })

  it('submit emits the full chosen id array (the pre-checked set when untouched)', async () => {
    const config = makeConfig([ART_A, ART_C])
    wrapper = mount(AgentConfigKnowledgeDialog, {
      ...mountConfig,
      props: { open: true, config, artifacts: [ART_A, ART_B, ART_C] },
    })

    const submitBtn = document.body.querySelector<HTMLElement>('.kp-actions cds-button[status="primary"]')!
    submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    const submitEvents = wrapper.emitted('submit')
    expect(submitEvents).toBeTruthy()
    expect([...(submitEvents![0][0] as string[])].sort()).toEqual(['a1', 'a3'])
  })

  it('cancel button emits close', async () => {
    wrapper = mount(AgentConfigKnowledgeDialog, {
      ...mountConfig,
      props: { open: true, config: makeConfig([]), artifacts: [ART_A] },
    })
    const cancelBtn = document.body.querySelector<HTMLElement>('.kp-actions cds-button[action="outline"]')!
    cancelBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('clicking the backdrop emits close', async () => {
    wrapper = mount(AgentConfigKnowledgeDialog, {
      ...mountConfig,
      props: { open: true, config: makeConfig([]), artifacts: [ART_A] },
    })
    const bd = backdrop()!
    // Click on the backdrop itself (target === currentTarget) closes.
    bd.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('clicking inside the card does NOT emit close', async () => {
    wrapper = mount(AgentConfigKnowledgeDialog, {
      ...mountConfig,
      props: { open: true, config: makeConfig([]), artifacts: [ART_A] },
    })
    const card = document.body.querySelector<HTMLElement>('.kp-card')!
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toBeFalsy()
  })

  it('saving=true blocks close and submit, and marks the primary button loading', async () => {
    const config = makeConfig([ART_A])
    wrapper = mount(AgentConfigKnowledgeDialog, {
      ...mountConfig,
      props: { open: true, config, artifacts: [ART_A], saving: true },
    })

    const cancelBtn = document.body.querySelector<HTMLElement>('.kp-actions cds-button[action="outline"]')!
    const submitBtn = document.body.querySelector<HTMLElement>('.kp-actions cds-button[status="primary"]')!
    cancelBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    backdrop()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toBeFalsy()
    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(submitBtn.getAttribute('loading-state')).toBe('loading')
    // Both buttons reflect the disabled prop.
    expect(submitBtn.hasAttribute('disabled')).toBe(true)
    expect(cancelBtn.hasAttribute('disabled')).toBe(true)
  })

  it('shows the loading state while artifacts are still loading', () => {
    wrapper = mount(AgentConfigKnowledgeDialog, {
      ...mountConfig,
      props: { open: true, config: makeConfig([]), artifacts: [], artifactsLoading: true },
    })
    const state = document.body.querySelector('.kp-list .kp-state')
    expect(state).not.toBeNull()
    expect(checkboxes()).toHaveLength(0)
  })

  it('shows the empty state when there are no artifacts', () => {
    wrapper = mount(AgentConfigKnowledgeDialog, {
      ...mountConfig,
      props: { open: true, config: makeConfig([]), artifacts: [] },
    })
    const state = document.body.querySelector('.kp-list .kp-state')
    expect(state).not.toBeNull()
    expect(checkboxes()).toHaveLength(0)
  })

  it('re-opening re-seeds the selection from the (new) config and resets search', async () => {
    const config = makeConfig([ART_A])
    wrapper = mount(AgentConfigKnowledgeDialog, {
      ...mountConfig,
      props: { open: true, config, artifacts: [ART_A, ART_B] },
    })
    // Type a search, then close.
    const input = document.body.querySelector<HTMLInputElement>('.kp-search input')!
    input.value = 'guide'
    input.dispatchEvent(new Event('input'))
    await wrapper.setProps({ open: false })

    // Re-open with a config that mounts a2 instead.
    const config2 = makeConfig([ART_B])
    await wrapper.setProps({ open: true, config: config2 })

    // Search is reset (all rows visible again) and selection reflects config2.
    const newInput = document.body.querySelector<HTMLInputElement>('.kp-search input')!
    expect(newInput.value).toBe('')
    const rows = checkboxes()
    expect(checkedIds(rows, [ART_A, ART_B])).toEqual(['a2'])
  })
})
