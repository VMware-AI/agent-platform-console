/**
 * Component tests for AgentTemplateView.vue — the智能体模板 (Agent Templates)
 * catalog page wired to the real backend.
 *
 * The view:
 *   - useQuery(AGENT_TEMPLATES_QUERY) → { result, loading, error, refetch }
 *   - renders one grid row per template, sorted by `kind` (locale-aware)
 *   - renders install-method + status via locale keys
 *     (`agentTemplate.installMethod.${m}` / `agentTemplate.status.${s}`)
 *   - shows the placeholder (empty vs. load-error copy) when there are no rows
 *   - "New Template" / row "Edit" open the upsert dialog (create vs. edit)
 *   - submit → apolloClient.mutate(UPSERT_AGENT_TEMPLATE) → success toast + refetch
 *   - a mutation failure surfaces graphqlErrorMessage via an error toast
 *   - refresh → refetch + toast
 *
 * GraphQL is fully mocked: '@vue/apollo-composable' (useQuery returns
 * controllable refs) and '@/api/graphql/client' (apolloClient.mutate is a spy).
 * Real Pinia is used so locale.t resolves real (zh-default) strings, which the
 * assertions key off of rather than brittle markup.
 *
 * cds-* are Clarity custom elements; we register them as native custom elements
 * so mount() does not warn or try to resolve them as Vue components.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ref, type Ref } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import type {
  AgentTemplateNode,
  AgentTemplatesResult,
} from '@/api/graphql/queries/agent-templates'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Controllable refs that back the mocked useQuery. Re-assigned per test in
// beforeEach so each case gets a clean state.
let resultRef: Ref<AgentTemplatesResult | undefined>
let loadingRef: Ref<boolean>
let errorRef: Ref<unknown>
let refetchMock: Mock

vi.mock('@vue/apollo-composable', () => ({
  useQuery: () => ({
    result: resultRef,
    loading: loadingRef,
    error: errorRef,
    refetch: refetchMock,
  }),
}))

const mutateMock = vi.fn()
vi.mock('@/api/graphql/client', () => ({
  apolloClient: {
    mutate: (...args: unknown[]) => mutateMock(...args),
  },
}))

// Import the view AFTER the mocks are registered.
import AgentTemplateView from '@/views/AgentTemplateView.vue'

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const mountConfig = {
  global: {
    config: {
      compilerOptions: {
        isCustomElement: (tag: string) => tag.startsWith('cds-'),
      },
    },
  },
}

function makeTemplate(over: Partial<AgentTemplateNode> = {}): AgentTemplateNode {
  return {
    id: 't1',
    kind: 'goose',
    display: 'Goose',
    description: 'Default agent',
    installMethod: 'offline_tar',
    installCommand: null,
    status: 'active',
    version: '1.3.0',
    knowledgeRoot: null,
    knowledgePrompt: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function rows(wrapper: VueWrapper): ReturnType<VueWrapper['findAll']> {
  return wrapper.findAll('cds-grid-row')
}

let wrapper: VueWrapper | null = null

beforeEach(() => {
  setActivePinia(createPinia())
  resultRef = ref<AgentTemplatesResult | undefined>(undefined)
  loadingRef = ref(false)
  errorRef = ref<unknown>(null)
  refetchMock = vi.fn().mockResolvedValue(undefined)
  mutateMock.mockReset()
  mutateMock.mockResolvedValue({ data: {} })
  useToast().clear()
  vi.useRealTimers()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  // The dialog teleports to <body>; scrub any leftover backdrop.
  document.body.querySelectorAll('.at-backdrop').forEach((el) => el.remove())
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentTemplateView', () => {
  it('renders the page heading + description from locale keys', () => {
    const locale = useLocaleStore()
    wrapper = mount(AgentTemplateView, mountConfig)
    const text = wrapper.text()
    expect(text).toContain(locale.t('agentTemplate.title'))
    expect(text).toContain(locale.t('agentTemplate.description'))
  })

  it('shows the empty placeholder (not the error copy) when data is empty', () => {
    const locale = useLocaleStore()
    resultRef.value = { agentTemplates: [] }
    wrapper = mount(AgentTemplateView, mountConfig)

    expect(rows(wrapper)).toHaveLength(0)
    const placeholder = wrapper.find('cds-grid-placeholder')
    expect(placeholder.exists()).toBe(true)
    expect(placeholder.text()).toContain(locale.t('agentTemplate.empty'))
    expect(placeholder.text()).not.toContain(locale.t('agentTemplate.loadError'))
  })

  it('shows the load-error copy with role=alert when the query errors', () => {
    const locale = useLocaleStore()
    resultRef.value = { agentTemplates: [] }
    errorRef.value = new Error('boom')
    wrapper = mount(AgentTemplateView, mountConfig)

    const placeholder = wrapper.find('cds-grid-placeholder')
    expect(placeholder.exists()).toBe(true)
    expect(placeholder.text()).toContain(locale.t('agentTemplate.loadError'))
    // The error message carries an alert role for screen readers.
    expect(placeholder.find('[role="alert"]').exists()).toBe(true)
    // No "create" CTA in the error placeholder.
    expect(placeholder.find('cds-button').exists()).toBe(false)
  })

  it('does NOT show the placeholder while loading with no rows', () => {
    loadingRef.value = true
    resultRef.value = { agentTemplates: [] }
    wrapper = mount(AgentTemplateView, mountConfig)
    expect(wrapper.find('cds-grid-placeholder').exists()).toBe(false)
  })

  it('renders one row per template, sorted by kind', () => {
    resultRef.value = {
      agentTemplates: [
        makeTemplate({ id: 'b', kind: 'xiaoguai', display: 'Xiaoguai' }),
        makeTemplate({ id: 'a', kind: 'goose', display: 'Goose' }),
        makeTemplate({ id: 'c', kind: 'qoder', display: 'Qoder' }),
      ],
    }
    wrapper = mount(AgentTemplateView, mountConfig)

    const r = rows(wrapper)
    expect(r).toHaveLength(3)
    // Sorted ascending by kind: goose < qoder < xiaoguai.
    expect(r[0].text()).toContain('goose')
    expect(r[1].text()).toContain('qoder')
    expect(r[2].text()).toContain('xiaoguai')
  })

  it('renders install-method and status via locale keys + version fallback', () => {
    const locale = useLocaleStore()
    resultRef.value = {
      agentTemplates: [
        makeTemplate({
          id: 'a',
          kind: 'goose',
          installMethod: 'curl',
          status: 'deferred',
          version: null,
        }),
      ],
    }
    wrapper = mount(AgentTemplateView, mountConfig)

    const row = rows(wrapper)[0]
    expect(row.text()).toContain(locale.t('agentTemplate.installMethod.curl'))
    expect(row.text()).toContain(locale.t('agentTemplate.status.deferred'))
    // Null version renders the em-dash fallback.
    expect(row.text()).toContain('—')
  })

  it('marks active rows with a success badge and deferred with neutral', () => {
    resultRef.value = {
      agentTemplates: [
        makeTemplate({ id: 'a', kind: 'aaa', status: 'active' }),
        makeTemplate({ id: 'b', kind: 'bbb', status: 'deferred' }),
      ],
    }
    wrapper = mount(AgentTemplateView, mountConfig)

    const r = rows(wrapper)
    expect(r[0].find('cds-badge').attributes('status')).toBe('success')
    expect(r[1].find('cds-badge').attributes('status')).toBe('neutral')
  })

  it('opens the create dialog (kind editable) from the toolbar button', async () => {
    resultRef.value = { agentTemplates: [] }
    const locale = useLocaleStore()
    wrapper = mount(AgentTemplateView, mountConfig)

    // Dialog gated by `open`; not present yet.
    expect(document.body.querySelector('.at-backdrop')).toBeNull()

    // The first toolbar button is "New Template".
    await wrapper.find('.toolbar cds-button').trigger('click')
    await flushPromises()

    const backdrop = document.body.querySelector('.at-backdrop')
    expect(backdrop).not.toBeNull()
    // Create title, not edit title.
    expect(backdrop?.textContent).toContain(locale.t('agentTemplate.dialog.createTitle'))
    // Creating → kind input is editable (not readonly).
    const kindInput = document.body.querySelector<HTMLInputElement>('.at-card input')
    expect(kindInput?.readOnly).toBe(false)
  })

  it('opens the edit dialog with the row prefilled and kind locked', async () => {
    const tpl = makeTemplate({ id: 'a', kind: 'goose', display: 'Goose Prime' })
    resultRef.value = { agentTemplates: [tpl] }
    const locale = useLocaleStore()
    wrapper = mount(AgentTemplateView, mountConfig)

    await rows(wrapper)[0].find('.row-action').trigger('click')
    await flushPromises()

    const backdrop = document.body.querySelector('.at-backdrop')
    expect(backdrop).not.toBeNull()
    expect(backdrop?.textContent).toContain(locale.t('agentTemplate.dialog.editTitle'))

    const kindInput = document.body.querySelector<HTMLInputElement>('.at-card input')
    // Editing → kind is the identity and is read-only, prefilled from the row.
    expect(kindInput?.value).toBe('goose')
    expect(kindInput?.readOnly).toBe(true)
  })

  it('submitting a new template calls upsert mutation, toasts success, and refetches', async () => {
    resultRef.value = { agentTemplates: [] }
    const locale = useLocaleStore()
    const toast = useToast()
    wrapper = mount(AgentTemplateView, mountConfig)

    await wrapper.find('.toolbar cds-button').trigger('click')
    await flushPromises()

    // Fill the two required fields (kind + display).
    const inputs = document.body.querySelectorAll<HTMLInputElement>('.at-card input')
    const kindInput = inputs[0]
    const displayInput = inputs[1]
    kindInput.value = 'codex'
    kindInput.dispatchEvent(new Event('input'))
    displayInput.value = 'Codex CLI'
    displayInput.dispatchEvent(new Event('input'))
    await flushPromises()

    const form = document.body.querySelector<HTMLFormElement>('.at-form')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    // Mutation invoked with the trimmed input (create path).
    expect(mutateMock).toHaveBeenCalledTimes(1)
    const call = mutateMock.mock.calls[0][0] as { variables: { input: Record<string, unknown> } }
    expect(call.variables.input.kind).toBe('codex')
    expect(call.variables.input.display).toBe('Codex CLI')

    // Success toast uses the "created" key (zh default).
    expect(toast.toasts.value.some((t) => t.message === locale.t('agentTemplate.toast.created'))).toBe(true)
    // Refetch was triggered to refresh the list.
    expect(refetchMock).toHaveBeenCalled()
    // Dialog closed on success.
    await flushPromises()
    expect(document.body.querySelector('.at-backdrop')).toBeNull()
  })

  it('editing an existing template toasts the "updated" message', async () => {
    const tpl = makeTemplate({ id: 'a', kind: 'goose', display: 'Goose' })
    resultRef.value = { agentTemplates: [tpl] }
    const locale = useLocaleStore()
    const toast = useToast()
    wrapper = mount(AgentTemplateView, mountConfig)

    await rows(wrapper)[0].find('.row-action').trigger('click')
    await flushPromises()

    const form = document.body.querySelector<HTMLFormElement>('.at-form')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    expect(toast.toasts.value.some((t) => t.message === locale.t('agentTemplate.toast.updated'))).toBe(true)
  })

  it('surfaces a graphql error message via toast when the mutation fails', async () => {
    resultRef.value = { agentTemplates: [] }
    const toast = useToast()
    mutateMock.mockRejectedValueOnce({
      graphQLErrors: [{ message: 'not authorized: admin role required' }],
    })
    wrapper = mount(AgentTemplateView, mountConfig)

    await wrapper.find('.toolbar cds-button').trigger('click')
    await flushPromises()

    const inputs = document.body.querySelectorAll<HTMLInputElement>('.at-card input')
    inputs[0].value = 'codex'
    inputs[0].dispatchEvent(new Event('input'))
    inputs[1].value = 'Codex'
    inputs[1].dispatchEvent(new Event('input'))
    await flushPromises()

    const form = document.body.querySelector<HTMLFormElement>('.at-form')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    // The backend domain message is shown verbatim (graphqlErrorMessage extracts it).
    const errs = toast.toasts.value.filter((t) => t.status === 'danger')
    expect(errs.some((t) => t.message === 'not authorized: admin role required')).toBe(true)
    // Refetch must NOT run on failure.
    expect(refetchMock).not.toHaveBeenCalled()
    // Dialog stays open so the user can retry.
    expect(document.body.querySelector('.at-backdrop')).not.toBeNull()
  })

  it('refresh button calls refetch and toasts success', async () => {
    resultRef.value = { agentTemplates: [makeTemplate()] }
    const locale = useLocaleStore()
    const toast = useToast()
    wrapper = mount(AgentTemplateView, mountConfig)

    await wrapper.find('.refresh-button').trigger('click')
    await flushPromises()

    expect(refetchMock).toHaveBeenCalledTimes(1)
    expect(toast.toasts.value.some((t) => t.message === locale.t('agentTemplate.toast.refreshed'))).toBe(true)
  })

  it('refresh is a no-op while the query is loading', async () => {
    loadingRef.value = true
    resultRef.value = { agentTemplates: [] }
    wrapper = mount(AgentTemplateView, mountConfig)

    await wrapper.find('.refresh-button').trigger('click')
    await flushPromises()

    expect(refetchMock).not.toHaveBeenCalled()
  })

  it('refresh failure surfaces an error toast', async () => {
    resultRef.value = { agentTemplates: [] }
    const locale = useLocaleStore()
    const toast = useToast()
    refetchMock.mockRejectedValueOnce(new Error('network down'))
    wrapper = mount(AgentTemplateView, mountConfig)

    await wrapper.find('.refresh-button').trigger('click')
    await flushPromises()

    const errs = toast.toasts.value.filter((t) => t.status === 'danger')
    // Falls back to the generic refreshFailed key (Error has no graphQLErrors,
    // but graphqlErrorMessage uses error.message → "network down").
    expect(errs.length).toBeGreaterThan(0)
    expect(
      errs.some(
        (t) => t.message === 'network down' || t.message === locale.t('agentTemplate.toast.refreshFailed'),
      ),
    ).toBe(true)
  })

  it('does not sort the Apollo cache array in place (immutability)', () => {
    const source = [
      makeTemplate({ id: 'b', kind: 'xiaoguai' }),
      makeTemplate({ id: 'a', kind: 'goose' }),
    ]
    resultRef.value = { agentTemplates: source }
    wrapper = mount(AgentTemplateView, mountConfig)

    // The original array order is preserved (component sorts a copy).
    expect(source.map((t) => t.kind)).toEqual(['xiaoguai', 'goose'])
  })
})
