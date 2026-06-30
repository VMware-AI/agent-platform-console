/**
 * Component tests for AgentConfigView.vue — the Agent Config management table
 * (LLD-11 OKF knowledge grounding).
 *
 * What the unit actually does (see the SFC header):
 *   - useQuery(AGENT_CONFIGS_QUERY, queryVars) → master list, filterable by
 *     agentType (omitting the var when "__ALL__" is selected)
 *   - useQuery(KNOWLEDGE_ARTIFACTS_QUERY)       → the picker's artifact catalog
 *   - row actions drive the read-only detail modal + mounted knowledge edge
 *   - the only mutation is apolloClient.mutate(SET_AGENT_CONFIG_KNOWLEDGE),
 *     which on success toasts agentConfig.toast.saved, closes the dialog, and
 *     refetches the config list; on failure toasts the GraphQL error message
 *   - list states: loading / error / empty / data
 *
 * Strategy:
 *   - Mock '@vue/apollo-composable' so the two useQuery calls return controllable
 *     refs (in call order: configs, then artifacts).
 *   - Mock '@/api/graphql/client' so apolloClient.mutate is a spy we drive.
 *   - Real Pinia so locale.t() resolves real strings (default locale = 'zh').
 *   - cds-* are custom elements (per the vite/vitest config); declare them so
 *     mount() doesn't try to resolve them as components.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'

import { useToast } from '@/composables/useToast'
import type {
  AgentConfigNode,
  KnowledgeArtifactNode,
} from '@/types/agent-config'

// ---- Apollo mocks --------------------------------------------------------

// Controllable refs shared between the mock factory and each test. They are
// re-seeded in beforeEach.
const configsResult = ref<{ agentConfigs: AgentConfigNode[] } | undefined>(undefined)
const configsLoading = ref(false)
const configsError = ref<unknown>(null)
const artifactsResult = ref<{ artifacts: KnowledgeArtifactNode[] } | undefined>(undefined)
const artifactsLoading = ref(false)

const refetchConfigs = vi.fn().mockResolvedValue(undefined)

// useQuery is called twice in setup order: (1) configs, (2) artifacts.
const useQueryMock = vi.fn()

vi.mock('@vue/apollo-composable', () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}))

const mutateMock = vi.fn()

vi.mock('@/api/graphql/client', () => ({
  apolloClient: {
    mutate: (...args: unknown[]) => mutateMock(...args),
  },
}))

// Imported AFTER the mocks are registered.
import AgentConfigView from '@/views/AgentConfigView.vue'
import {
  AGENT_CONFIGS_QUERY,
  KNOWLEDGE_ARTIFACTS_QUERY,
  SET_AGENT_CONFIG_KNOWLEDGE,
} from '@/api/graphql/queries/agent-config'

// ---- Fixtures ------------------------------------------------------------

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

function makeConfig(over: Partial<AgentConfigNode> = {}): AgentConfigNode {
  return {
    id: 'cfg-1',
    name: 'Default Goose',
    agentType: 'goose',
    isDefault: true,
    artifactId: null,
    knowledge: [],
    createdAt: '2026-01-02T03:04:05Z',
    ...over,
  }
}

const CFG_GOOSE = makeConfig({
  id: 'cfg-1',
  name: 'Default Goose',
  agentType: 'goose',
  isDefault: true,
  knowledge: [ART_A],
})
const CFG_CLAUDE = makeConfig({
  id: 'cfg-2',
  name: 'Claude Worker',
  agentType: 'claude',
  isDefault: false,
  knowledge: [],
})

const mountConfig = {
  global: {
    config: {
      compilerOptions: {
        isCustomElement: (tag: string) => tag.startsWith('cds-'),
      },
    },
  },
}

// ---- DOM helpers ---------------------------------------------------------

function rowActions(wrapper: VueWrapper) {
  return wrapper.findAll('.row-action')
}
function actionByText(wrapper: VueWrapper, text: string) {
  const action = rowActions(wrapper).find((button) => button.text() === text)
  if (!action) throw new Error(`missing row action: ${text}`)
  return action
}
function dialogCard(): HTMLElement | null {
  return document.body.querySelector('.kp-backdrop')
}

function mountView(): VueWrapper {
  return mount(AgentConfigView, mountConfig) as unknown as VueWrapper
}

let wrapper: VueWrapper | null = null

beforeEach(() => {
  setActivePinia(createPinia())

  // Toast state is module-scoped (shared across useToast() callers); start clean.
  useToast().clear()

  // Reset shared reactive state to a clean default each test.
  configsResult.value = undefined
  configsLoading.value = false
  configsError.value = null
  artifactsResult.value = undefined
  artifactsLoading.value = false
  refetchConfigs.mockClear().mockResolvedValue(undefined)
  mutateMock.mockReset()

  // First useQuery call → configs; second → artifacts.
  useQueryMock.mockReset()
  useQueryMock
    .mockImplementationOnce(() => ({
      result: configsResult,
      loading: configsLoading,
      error: configsError,
      refetch: refetchConfigs,
    }))
    .mockImplementationOnce(() => ({
      result: artifactsResult,
      loading: artifactsLoading,
    }))
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.querySelectorAll('.kp-backdrop').forEach((el) => el.remove())
  vi.useRealTimers()
})

describe('AgentConfigView', () => {
  it('wires the two queries to the real query documents', () => {
    wrapper = mountView()
    expect(useQueryMock).toHaveBeenCalledTimes(2)
    expect(useQueryMock.mock.calls[0][0]).toBe(AGENT_CONFIGS_QUERY)
    expect(useQueryMock.mock.calls[1][0]).toBe(KNOWLEDGE_ARTIFACTS_QUERY)
  })

  it('shows the loading state while configs load and no data yet', () => {
    configsLoading.value = true
    configsResult.value = undefined
    wrapper = mountView()
    const state = wrapper.find('cds-grid-placeholder p')
    expect(state.exists()).toBe(true)
    expect(state.text()).toBe('加载中…')
    expect(wrapper.find('cds-grid-row').exists()).toBe(false)
  })

  it('shows the error state when the configs query errors', () => {
    configsError.value = new Error('boom')
    wrapper = mountView()
    const state = wrapper.find('cds-grid-placeholder p')
    expect(state.exists()).toBe(true)
    expect(state.text()).toBe('配置加载失败')
  })

  it('shows the empty state when there are no configs', () => {
    configsResult.value = { agentConfigs: [] }
    wrapper = mountView()
    const state = wrapper.find('cds-grid-placeholder p')
    expect(state.exists()).toBe(true)
    expect(state.text()).toBe('暂无智能体配置')
    expect(wrapper.find('cds-grid-row').exists()).toBe(false)
  })

  it('renders one table row per config', async () => {
    configsResult.value = { agentConfigs: [CFG_GOOSE, CFG_CLAUDE] }
    wrapper = mountView()
    await flushPromises()

    const rows = wrapper.findAll('cds-grid-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('Default Goose')
    expect(rows[1].text()).toContain('Claude Worker')
    expect(rowActions(wrapper)).toHaveLength(6)
  })

  it('renders the default badge text from the locale key for default configs', async () => {
    configsResult.value = { agentConfigs: [CFG_GOOSE] }
    wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('cds-grid-row').text()).toContain('默认')

    await actionByText(wrapper, '查看').trigger('click')
    await flushPromises()
    const isDefaultRow = wrapper.findAll('.detail-row dd')[1]
    expect(isDefaultRow.text()).toBe('是')
  })

  it('viewing a config opens the detail modal for that config', async () => {
    configsResult.value = { agentConfigs: [CFG_GOOSE, CFG_CLAUDE] }
    wrapper = mountView()
    await flushPromises()

    await rowActions(wrapper)[3].trigger('click')
    await flushPromises()

    expect(wrapper.find('cds-modal-header').text()).toContain('Claude Worker')
    // Non-default config → "否" on the isDefault row.
    expect(wrapper.findAll('.detail-row dd')[1].text()).toBe('否')
  })

  it('shows the mounted knowledge packs of the selected config', async () => {
    configsResult.value = { agentConfigs: [CFG_GOOSE] }
    wrapper = mountView()
    await flushPromises()

    await actionByText(wrapper, '查看').trigger('click')
    await flushPromises()

    const packs = wrapper.findAll('.pack-item')
    expect(packs).toHaveLength(1)
    expect(packs[0].text()).toContain('Runbook')
    expect(packs[0].text()).toContain('v1.0.0')
    // Count chip reflects the edge length.
    expect(wrapper.find('.knowledge-count').text()).toContain('1')
  })

  it('shows the knowledge empty state when the selected config has no packs', async () => {
    configsResult.value = { agentConfigs: [CFG_CLAUDE] }
    wrapper = mountView()
    await flushPromises()
    await actionByText(wrapper, '查看').trigger('click')
    await flushPromises()

    expect(wrapper.find('.pack-item').exists()).toBe(false)
    expect(wrapper.find('.knowledge-section .panel-state.muted').text()).toBe('尚未挂载任何知识包')
  })

  it('opening the editor passes the selected config + artifact catalog to the dialog', async () => {
    configsResult.value = { agentConfigs: [CFG_GOOSE] }
    artifactsResult.value = { artifacts: [ART_A, ART_B] }
    wrapper = mountView()
    await flushPromises()

    // The "Edit packs" button opens the dialog (Teleported to body).
    expect(dialogCard()).toBeNull()
    await actionByText(wrapper, '编辑').trigger('click')
    await flushPromises()

    const card = dialogCard()
    expect(card).not.toBeNull()
    // Dialog title uses the config name; the catalog has 2 rows.
    expect(card?.textContent).toContain('Default Goose')
    expect(document.body.querySelectorAll('.kp-row input[type="checkbox"]')).toHaveLength(2)
  })

  it('submitting the editor calls the mutation with config id + chosen ids, toasts success, closes, and refetches', async () => {
    configsResult.value = { agentConfigs: [CFG_GOOSE] }
    artifactsResult.value = { artifacts: [ART_A, ART_B] }
    mutateMock.mockResolvedValue({ data: { setAgentConfigKnowledge: CFG_GOOSE } })
    wrapper = mountView()
    await flushPromises()

    await actionByText(wrapper, '编辑').trigger('click')
    await flushPromises()

    // Add a2 to the pre-checked set (a1 already on).
    const boxes = document.body.querySelectorAll<HTMLInputElement>('.kp-row input[type="checkbox"]')
    boxes[1].checked = true
    boxes[1].dispatchEvent(new Event('change'))
    await flushPromises()

    const submitBtn = document.body.querySelector<HTMLElement>('.kp-actions cds-button[status="primary"]')!
    submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const callArg = mutateMock.mock.calls[0][0] as {
      mutation: unknown
      variables: { configId: string; knowledgeArtifactIds: string[] }
    }
    expect(callArg.mutation).toBe(SET_AGENT_CONFIG_KNOWLEDGE)
    expect(callArg.variables.configId).toBe('cfg-1')
    expect([...callArg.variables.knowledgeArtifactIds].sort()).toEqual(['a1', 'a2'])

    // Success path: refetch + dialog closed.
    expect(refetchConfigs).toHaveBeenCalledTimes(1)
    expect(dialogCard()).toBeNull()

    // A success toast carrying the real locale string (zh) was pushed.
    const toasts = useToast().toasts.value
    expect(toasts).toHaveLength(1)
    expect(toasts[0].status).toBe('success')
    expect(toasts[0].message).toBe('已更新挂载的知识包')
  })

  it('surfaces a GraphQL error via toast and keeps the dialog open when the mutation fails', async () => {
    configsResult.value = { agentConfigs: [CFG_GOOSE] }
    artifactsResult.value = { artifacts: [ART_A] }
    mutateMock.mockRejectedValue({
      graphQLErrors: [{ message: 'forbidden: requires admin' }],
    })
    wrapper = mountView()
    await flushPromises()

    await actionByText(wrapper, '编辑').trigger('click')
    await flushPromises()

    const submitBtn = document.body.querySelector<HTMLElement>('.kp-actions cds-button[status="primary"]')!
    submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    // Failure → NOT refetched, dialog stays open.
    expect(refetchConfigs).not.toHaveBeenCalled()
    expect(dialogCard()).not.toBeNull()

    // The toast surfaces the first GraphQL error message via graphqlErrorMessage.
    const toasts = useToast().toasts.value
    expect(toasts).toHaveLength(1)
    expect(toasts[0].status).toBe('danger')
    expect(toasts[0].message).toBe('forbidden: requires admin')
  })

  it('refresh button triggers refetch and is disabled while loading', async () => {
    configsResult.value = { agentConfigs: [CFG_GOOSE] }
    wrapper = mountView()
    await flushPromises()

    const refreshBtn = wrapper.find('.refresh-button')
    expect((refreshBtn.element as HTMLButtonElement).disabled).toBe(false)
    await refreshBtn.trigger('click')
    await flushPromises()
    expect(refetchConfigs).toHaveBeenCalledTimes(1)
  })

  it('refresh is guarded while configs are loading (disabled + no refetch)', async () => {
    configsLoading.value = true
    configsResult.value = { agentConfigs: [CFG_GOOSE] }
    wrapper = mountView()
    await flushPromises()

    const refreshBtn = wrapper.find('.refresh-button')
    expect((refreshBtn.element as HTMLButtonElement).disabled).toBe(true)
    await refreshBtn.trigger('click')
    await flushPromises()
    expect(refetchConfigs).not.toHaveBeenCalled()
  })
})
