/**
 * Component tests for AgentSnapshotView.vue (智能体快照与生命周期).
 *
 * The view is a master-detail page wired to the real backend:
 *   - agents come from AGENTS_QUERY via useQuery (agent picker)
 *   - agentSnapshots come from AGENT_SNAPSHOTS_QUERY via useQuery (detail list)
 *   - snapshotAgent / revertAgentSnapshot / setAgentStatus / recycleAgent are
 *     fired through apolloClient.mutate (NOT useMutation)
 *
 * We therefore mock two boundaries:
 *   1. '@vue/apollo-composable' useQuery → returns controllable refs. The two
 *      useQuery calls are distinguished by the gql document passed in; we hand
 *      back the right pair of refs so we can drive loading / empty / error / data.
 *   2. '@/api/graphql/client' apolloClient.mutate → a vi.fn we can resolve or
 *      reject to assert the create / revert / status / recycle flows and the
 *      toast that each surfaces.
 *
 * Real Pinia is used (setActivePinia) so locale.t() resolves the real zh
 * strings (the store defaults to 'zh'); we assert against those, not markup.
 * cds-* are registered as custom elements so mount() doesn't choke on them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, type Ref } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import {
  AGENT_SNAPSHOTS_QUERY,
  SNAPSHOT_AGENT_MUTATION,
  REVERT_AGENT_SNAPSHOT_MUTATION,
  SET_AGENT_STATUS_MUTATION,
  RECYCLE_AGENT_MUTATION,
  type AgentSnapshotNode,
} from '@/api/graphql/queries/agent-snapshots'
import { AGENTS_QUERY } from '@/api/graphql/queries/agents'

// --- toast spy ---------------------------------------------------------------
// Capture every toast so we can assert which locale-key message surfaced.
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}))

// --- apolloClient.mutate spy -------------------------------------------------
const mutate = vi.fn()
vi.mock('@/api/graphql/client', () => ({
  apolloClient: { mutate: (...args: unknown[]) => mutate(...args) },
}))

// --- useQuery mock -----------------------------------------------------------
// One controllable bundle of refs per query. The view calls useQuery twice; we
// route by the gql document. refetch is a spy that re-resolves so the view's
// `await refetchSnapshots()` calls complete.
interface QueryBundle {
  result: Ref<unknown>
  loading: Ref<boolean>
  error: Ref<unknown>
  refetch: ReturnType<typeof vi.fn>
}

function makeBundle(initial: unknown = null): QueryBundle {
  return {
    result: ref(initial),
    loading: ref(false),
    error: ref(null),
    refetch: vi.fn().mockResolvedValue({ data: null }),
  }
}

let agentsBundle: QueryBundle
let snapshotsBundle: QueryBundle

vi.mock('@vue/apollo-composable', () => ({
  useQuery: (document: unknown) => {
    if (document === AGENTS_QUERY) return agentsBundle
    if (document === AGENT_SNAPSHOTS_QUERY) return snapshotsBundle
    throw new Error('unexpected useQuery document')
  },
}))

import AgentSnapshotView from '@/views/AgentSnapshotView.vue'

const mountConfig = {
  global: {
    config: {
      compilerOptions: {
        isCustomElement: (tag: string) => tag.startsWith('cds-'),
      },
    },
  },
}

// --- fixtures ----------------------------------------------------------------
function makeAgentNode(over: Record<string, unknown> = {}) {
  return {
    id: 'ag-1',
    name: 'Goose One',
    type: 'goose',
    status: 'stopped',
    apiKey: null,
    owner: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    endpoint: null,
    ...over,
  }
}

function agentsPage(nodes: Record<string, unknown>[]) {
  return {
    agents: {
      nodes,
      totalCount: nodes.length,
      pageInfo: { page: 1, pageSize: 100, totalPages: 1 },
    },
  }
}

function makeSnapshot(over: Partial<AgentSnapshotNode> = {}): AgentSnapshotNode {
  return {
    name: 'pre-upgrade',
    description: 'before the big change',
    state: 'poweredOn',
    createdAt: '2026-02-01T00:00:00Z',
    ...over,
  }
}

let wrapper: VueWrapper | null = null
function confirmBackdrops(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('.confirm-backdrop'))
}

beforeEach(() => {
  setActivePinia(createPinia())
  toastSuccess.mockReset()
  toastError.mockReset()
  mutate.mockReset()
  mutate.mockResolvedValue({ data: {} })
  agentsBundle = makeBundle(agentsPage([makeAgentNode()]))
  snapshotsBundle = makeBundle({ agentSnapshots: [makeSnapshot()] })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.querySelectorAll('.snap-backdrop, .confirm-backdrop').forEach((el) => el.remove())
})

async function mountView() {
  wrapper = mount(AgentSnapshotView, mountConfig)
  // The agents watcher (immediate) selects the first agent; let reactivity settle.
  await flushPromises()
  return wrapper
}

describe('AgentSnapshotView', () => {
  it('renders the page title and auto-selects the first agent in the picker', async () => {
    await mountView()
    expect(wrapper!.text()).toContain('智能体快照与生命周期')
    // Picker has an option per agent and defaults to the first agent's id.
    const select = wrapper!.find('select').element as HTMLSelectElement
    expect(select.value).toBe('ag-1')
    const options = wrapper!.findAll('option').map((o) => o.text())
    expect(options).toContain('Goose One')
  })

  it('shows the detail-empty state when there are no agents to select', async () => {
    agentsBundle = makeBundle(agentsPage([]))
    snapshotsBundle = makeBundle({ agentSnapshots: [] })
    await mountView()
    // No agent selected → empty placeholder, no lifecycle bar.
    expect(wrapper!.find('.detail-empty').exists()).toBe(true)
    expect(wrapper!.text()).toContain('请在上方选择一个智能体')
    expect(wrapper!.find('.lifecycle').exists()).toBe(false)
  })

  it('lists the selected agent snapshots with their data', async () => {
    snapshotsBundle = makeBundle({
      agentSnapshots: [
        makeSnapshot({ name: 'snap-a', description: 'first', state: 'poweredOn' }),
        makeSnapshot({ name: 'snap-b', description: null, state: 'poweredOff' }),
      ],
    })
    await mountView()
    const rows = wrapper!.findAll('.snap-table tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('snap-a')
    expect(rows[0].text()).toContain('first')
    expect(rows[0].text()).toContain('poweredOn')
    // Null description falls back to the localized placeholder ("—").
    expect(rows[1].text()).toContain('snap-b')
    expect(rows[1].text()).toContain('poweredOff')
    // The list-title count reflects the number of snapshots.
    expect(wrapper!.find('.snapshots-count').text()).toContain('2')
  })

  it('shows the empty-snapshots state when the selected agent has none', async () => {
    snapshotsBundle = makeBundle({ agentSnapshots: [] })
    await mountView()
    expect(wrapper!.find('.snap-table').exists()).toBe(false)
    expect(wrapper!.text()).toContain('该智能体暂无快照')
  })

  it('shows the loading state while snapshots are loading and none cached yet', async () => {
    snapshotsBundle = makeBundle({ agentSnapshots: [] })
    snapshotsBundle.loading.value = true
    await mountView()
    const state = wrapper!.find('.panel-state')
    expect(state.exists()).toBe(true)
    expect(state.text()).toContain('正在加载快照…')
  })

  it('shows the error state (role=alert) when the snapshots query errors', async () => {
    snapshotsBundle = makeBundle({ agentSnapshots: [] })
    snapshotsBundle.error.value = new Error('boom')
    await mountView()
    const alert = wrapper!.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('快照加载失败')
  })

  it('opens the create-snapshot dialog and creates via apolloClient.mutate then refetches + toasts success', async () => {
    await mountView()
    // The view component instance exposes the methods used by the template.
    const vm = wrapper!.vm as unknown as {
      submitCreate: (p: { name: string; description: string | null }) => Promise<void>
      createOpen: boolean
    }
    await vm.submitCreate({ name: 'new-snap', description: 'desc' })
    await flushPromises()

    expect(mutate).toHaveBeenCalledTimes(1)
    const call = mutate.mock.calls[0][0]
    expect(call.mutation).toBe(SNAPSHOT_AGENT_MUTATION)
    expect(call.variables).toEqual({
      input: { agentId: 'ag-1', name: 'new-snap', description: 'desc' },
    })
    expect(snapshotsBundle.refetch).toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalledWith('快照已创建')
  })

  it('surfaces a backend graphQL error message via toast when create fails', async () => {
    mutate.mockRejectedValueOnce({ graphQLErrors: [{ message: 'snapshot quota exceeded' }] })
    await mountView()
    const vm = wrapper!.vm as unknown as {
      submitCreate: (p: { name: string; description: string | null }) => Promise<void>
    }
    await vm.submitCreate({ name: 'x', description: null })
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith('snapshot quota exceeded')
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('revert is gated behind a confirm dialog and sends confirm:true with the snapshot name', async () => {
    snapshotsBundle = makeBundle({ agentSnapshots: [makeSnapshot({ name: 'snap-to-revert' })] })
    await mountView()

    // Click the row's revert button → confirm dialog appears, no mutation yet.
    const revertBtn = wrapper!.find('.snap-table tbody tr .actions-col cds-button')
    await revertBtn.trigger('click')
    await flushPromises()
    expect(confirmBackdrops().length).toBeGreaterThan(0)
    expect(mutate).not.toHaveBeenCalled()

    // The confirm dialog body should mention the targeted snapshot name.
    const revertDialog = confirmBackdrops().find((bd) => bd.textContent?.includes('snap-to-revert'))
    expect(revertDialog).toBeTruthy()

    // Confirm → mutation fires with confirm:true.
    const vm = wrapper!.vm as unknown as { confirmRevert: () => Promise<void> }
    await vm.confirmRevert()
    await flushPromises()

    expect(mutate).toHaveBeenCalledTimes(1)
    const call = mutate.mock.calls[0][0]
    expect(call.mutation).toBe(REVERT_AGENT_SNAPSHOT_MUTATION)
    expect(call.variables).toEqual({
      input: { agentId: 'ag-1', snapshotName: 'snap-to-revert', confirm: true },
    })
    expect(snapshotsBundle.refetch).toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalledWith('已回滚到快照')
  })

  it('recycle is gated behind a confirm dialog and sends confirm:true for the agent', async () => {
    await mountView()
    const vm = wrapper!.vm as unknown as {
      askRecycle: () => void
      confirmRecycle: () => Promise<void>
      recycleOpen: boolean
    }

    // Opening the recycle confirm should not call the backend.
    vm.askRecycle()
    await flushPromises()
    expect(vm.recycleOpen).toBe(true)
    expect(mutate).not.toHaveBeenCalled()

    await vm.confirmRecycle()
    await flushPromises()

    expect(mutate).toHaveBeenCalledTimes(1)
    const call = mutate.mock.calls[0][0]
    expect(call.mutation).toBe(RECYCLE_AGENT_MUTATION)
    expect(call.variables).toEqual({ input: { agentId: 'ag-1', confirm: true } })
    expect(toastSuccess).toHaveBeenCalledWith('智能体已回收')
  })

  it('setAgentStatus(start) fires for a stopped agent and toasts success', async () => {
    // Default fixture agent is stopped → Start is enabled.
    await mountView()
    const vm = wrapper!.vm as unknown as {
      changeStatus: (s: string) => Promise<void>
      canStart: boolean
      canStop: boolean
    }
    expect(vm.canStart).toBe(true)
    expect(vm.canStop).toBe(false)

    await vm.changeStatus('running')
    await flushPromises()

    expect(mutate).toHaveBeenCalledTimes(1)
    const call = mutate.mock.calls[0][0]
    expect(call.mutation).toBe(SET_AGENT_STATUS_MUTATION)
    expect(call.variables).toEqual({ id: 'ag-1', status: 'running' })
    expect(toastSuccess).toHaveBeenCalledWith('生命周期状态已更新')
  })

  it('exposes canStop (not canStart) when the selected agent is running', async () => {
    agentsBundle = makeBundle(agentsPage([makeAgentNode({ status: 'running' })]))
    await mountView()
    const vm = wrapper!.vm as unknown as { canStart: boolean; canStop: boolean }
    expect(vm.canStart).toBe(false)
    expect(vm.canStop).toBe(true)
  })

  it('surfaces a fallback toast when setAgentStatus fails without a graphQL message', async () => {
    mutate.mockRejectedValueOnce(new Error('network down'))
    await mountView()
    const vm = wrapper!.vm as unknown as { changeStatus: (s: string) => Promise<void> }
    await vm.changeStatus('running')
    await flushPromises()
    // graphqlErrorMessage falls back to the error's own .message here.
    expect(toastError).toHaveBeenCalledWith('network down')
  })

  it('refresh refetches snapshots and toasts success', async () => {
    await mountView()
    const vm = wrapper!.vm as unknown as { refresh: () => Promise<void> }
    await vm.refresh()
    await flushPromises()
    expect(snapshotsBundle.refetch).toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalledWith('快照列表已刷新')
  })

  it('changing the picker selection re-targets which agent the lifecycle ops act on', async () => {
    agentsBundle = makeBundle(
      agentsPage([
        makeAgentNode({ id: 'ag-1', name: 'Goose One', status: 'stopped' }),
        makeAgentNode({ id: 'ag-2', name: 'Goose Two', status: 'running' }),
      ]),
    )
    await mountView()

    const select = wrapper!.find('select')
    await select.setValue('ag-2')
    await flushPromises()

    const vm = wrapper!.vm as unknown as {
      changeStatus: (s: string) => Promise<void>
      canStop: boolean
    }
    // ag-2 is running → Stop is the available action.
    expect(vm.canStop).toBe(true)
    await vm.changeStatus('stopped')
    await flushPromises()

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0][0].variables).toEqual({ id: 'ag-2', status: 'stopped' })
  })
})
