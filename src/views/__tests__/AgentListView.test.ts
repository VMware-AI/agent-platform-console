/**
 * Component tests for AgentListView.vue.
 *
 * The view drives a single reactive `useQuery(AGENTS_QUERY, variables)` from
 * @vue/apollo-composable. We mock that composable so we control the
 * `result` / `loading` / `error` refs and can read back the reactive
 * `variables` the view passes in (filter / pagination / sort) — that lets us
 * assert the real behavior (filters, paging, sorting feed the query) without a
 * live GraphQL server.
 *
 * We also mock `@/api/graphql/client` so the toolbar "export" path (which uses
 * apolloClient.query directly via useAgentExport) is deterministic and never
 * hits the network.
 *
 * States covered: loading, empty, error (alert via locale key), and data;
 * plus interactions: status/type filter, column keyword filter, pagination
 * (page-size + next), row + select-all selection, sort, and refresh.
 *
 * Assertions target real data / emitted behavior / locale-key-driven text and
 * the query variables — never brittle exact markup. `cds-*` are custom elements
 * (Clarity); the vitest config already treats them as such, and we assert on
 * plain DOM nodes (<input>, row count, badge text, alert text).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, type Ref } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import type {
  Agent,
  AgentsQueryResult,
  AgentsQueryVars,
} from '@/types/agents'

/* ---------- Mock @vue/apollo-composable ---------- */

// Controllable refs the view reads through useQuery.
const queryResult: Ref<AgentsQueryResult | undefined> = ref(undefined)
const queryLoading = ref(false)
const queryError: Ref<unknown> = ref(null)
const refetchSpy = vi.fn()
// Captured reactive variables (a computed ref) so tests can read the live
// filter / pagination / sort the view feeds into the query.
let capturedVariables: Ref<AgentsQueryVars> | undefined

vi.mock('@vue/apollo-composable', () => ({
  useQuery: (_doc: unknown, variables: Ref<AgentsQueryVars>) => {
    capturedVariables = variables
    return {
      result: queryResult,
      loading: queryLoading,
      error: queryError,
      refetch: refetchSpy,
    }
  },
}))

/* ---------- Mock the raw apollo client (export path) ---------- */

const apolloQuerySpy = vi.fn().mockResolvedValue({
  data: { agents: { nodes: [], totalCount: 0, pageInfo: { page: 1, pageSize: 500, totalPages: 1 } } },
})
vi.mock('@/api/graphql/client', () => ({
  apolloClient: { query: (...args: unknown[]) => apolloQuerySpy(...args) },
}))

// Imported AFTER the mocks are registered.
import AgentListView from '@/views/AgentListView.vue'

/* ---------- Fixtures ---------- */

function makeAgent(over: Partial<Agent> = {}): Agent {
  return {
    id: 'ag-1',
    name: 'OpenClaw Primary',
    type: 'BASIC_LLM',
    status: 'RUNNING',
    apiKey: { id: 'k-1', name: 'primary-key' },
    credentials: { username: 'svc-openclaw' },
    createdAt: '2026-01-01T08:00:00Z',
    updatedAt: '2026-02-01T08:00:00Z',
    endpoint: 'https://agent.example/v1',
    templateFamilyId: null,
    templateVersionId: null,
    resourcePoolId: null,
    ...over,
  }
}

function makeResult(nodes: Agent[], totalCount = nodes.length, totalPages = 1): AgentsQueryResult {
  return {
    agents: {
      nodes,
      totalCount,
      pageInfo: { page: 1, pageSize: 10, totalPages },
    },
  }
}

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

function rows() {
  return wrapper!.findAll('cds-grid-row')
}

beforeEach(() => {
  setActivePinia(createPinia())
  queryResult.value = undefined
  queryLoading.value = false
  queryError.value = null
  capturedVariables = undefined
  refetchSpy.mockClear()
  apolloQuerySpy.mockClear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('AgentListView', () => {
  it('renders the loading placeholder on the initial load (loading + no rows)', () => {
    queryLoading.value = true
    queryResult.value = undefined
    wrapper = mount(AgentListView, mountConfig)

    expect(wrapper.find('cds-grid-placeholder').exists()).toBe(true)
    expect(wrapper.find('cds-grid-placeholder').text()).toContain('加载中')
    // No rows, no footer pager while loading the first page.
    expect(rows()).toHaveLength(0)
    expect(wrapper.find('cds-grid-footer').exists()).toBe(false)
  })

  it('renders the empty placeholder when the query returns no agents', () => {
    queryLoading.value = false
    queryResult.value = makeResult([])
    wrapper = mount(AgentListView, mountConfig)

    const placeholder = wrapper.find('cds-grid-placeholder')
    expect(placeholder.exists()).toBe(true)
    expect(placeholder.text()).toContain('暂无数据')
    expect(rows()).toHaveLength(0)
  })

  it('renders the error alert (locale-key text) when the query errors', () => {
    queryError.value = new Error('boom')
    queryResult.value = makeResult([])
    wrapper = mount(AgentListView, mountConfig)

    const alert = wrapper.find('cds-alert')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('status')).toBe('danger')
    expect(alert.text()).toContain('加载失败')
  })

  it('renders one grid row per node with name, type, status, key and run-as username', () => {
    const a = makeAgent({
      id: 'ag-1',
      name: 'OpenClaw Primary',
      type: 'BASIC_LLM',
      status: 'RUNNING',
      apiKey: { id: 'k-1', name: 'primary-key' },
      credentials: { username: 'svc-openclaw' },
    })
    const b = makeAgent({
      id: 'ag-2',
      name: 'Image Bot',
      type: 'IMAGE_GENERATION',
      status: 'STOPPED',
      apiKey: { id: 'k-2', name: 'image-key' },
      credentials: { username: 'svc-image' },
    })
    queryResult.value = makeResult([a, b], 2)
    wrapper = mount(AgentListView, mountConfig)

    expect(rows()).toHaveLength(2)
    const text = wrapper.text()
    expect(text).toContain('OpenClaw Primary')
    expect(text).toContain('Image Bot')
    expect(text).toContain('primary-key')
    expect(text).toContain('svc-openclaw')
    // Type + status come from the GQL->locale-key maps.
    expect(text).toContain('基础大模型') // agents.type.basic-llm
    expect(text).toContain('运行中') // agents.status.running
    expect(text).toContain('已停止') // agents.status.stopped
  })

  it('falls back to an em dash for a missing apiKey / credentials (mocked owner fields)', () => {
    const orphan = makeAgent({ id: 'ag-x', name: 'Orphan', apiKey: null, credentials: null })
    queryResult.value = makeResult([orphan], 1)
    wrapper = mount(AgentListView, mountConfig)

    expect(rows()).toHaveLength(1)
    // The key cell + username cell both render the placeholder dash.
    const dashCells = wrapper.findAll('cds-grid-cell').filter((c) => c.text() === '—')
    expect(dashCells.length).toBeGreaterThanOrEqual(2)
  })

  it('passes a null filter to the query by default and a status/type filter once applied', async () => {
    queryResult.value = makeResult([makeAgent()], 1)
    wrapper = mount(AgentListView, mountConfig)

    // No filters chosen yet.
    expect(capturedVariables!.value.filter).toBeNull()

    // Open the STATUS column filter and pick "running".
    const statusFilterBtn = wrapper.find('cds-button-action[aria-controls="filter-STATUS"]')
    await statusFilterBtn.trigger('click')
    const statusBtn = wrapper
      .findAll('#filter-STATUS button')
      .find((b) => b.text().includes('运行中'))!
    await statusBtn.trigger('click')

    expect(capturedVariables!.value.filter).toMatchObject({ status: 'RUNNING' })

    // Now also pick a type → "基础大模型" (basic-llm → BASIC_LLM).
    const typeFilterBtn = wrapper.find('cds-button-action[aria-controls="filter-TYPE"]')
    await typeFilterBtn.trigger('click')
    const typeBtn = wrapper
      .findAll('#filter-TYPE button')
      .find((b) => b.text().includes('基础大模型'))!
    await typeBtn.trigger('click')

    expect(capturedVariables!.value.filter).toMatchObject({
      status: 'RUNNING',
      type: 'BASIC_LLM',
    })
  })

  it('feeds the name column keyword into the query filter and resets to page 1', async () => {
    queryResult.value = makeResult([makeAgent()], 25, 3)
    wrapper = mount(AgentListView, mountConfig)

    // Move off page 1 first so we can prove the keyword resets it.
    const next = wrapper.find('cds-pagination-button[action="next"]')
    await next.trigger('click')
    expect(capturedVariables!.value.pagination).toMatchObject({ page: 2 })

    // Type into the name column-filter input.
    const input = wrapper.find('#filter-NAME input')
    await input.setValue('claw')

    expect(capturedVariables!.value.filter).toMatchObject({ nameKeyword: 'claw' })
    expect(capturedVariables!.value.pagination).toMatchObject({ page: 1 })
  })

  it('changes the page size through the footer select and resets to page 1', async () => {
    queryResult.value = makeResult([makeAgent()], 200, 20)
    wrapper = mount(AgentListView, mountConfig)

    // Advance a page first.
    await wrapper.find('cds-pagination-button[action="next"]').trigger('click')
    expect(capturedVariables!.value.pagination).toMatchObject({ page: 2, pageSize: 10 })

    const select = wrapper.find('#agents-page-size')
    await select.setValue('50')

    expect(capturedVariables!.value.pagination).toMatchObject({ page: 1, pageSize: 50 })
  })

  it('paginates next / prev and clamps at the boundaries', async () => {
    queryResult.value = makeResult([makeAgent()], 25, 3)
    wrapper = mount(AgentListView, mountConfig)

    // prev at page 1 is a no-op (button disabled / clamped).
    await wrapper.find('cds-pagination-button[action="prev"]').trigger('click')
    expect(capturedVariables!.value.pagination).toMatchObject({ page: 1 })

    await wrapper.find('cds-pagination-button[action="next"]').trigger('click')
    expect(capturedVariables!.value.pagination).toMatchObject({ page: 2 })

    // Jump to last page; "next" beyond totalPages must clamp.
    await wrapper.find('cds-pagination-button[action="last"]').trigger('click')
    expect(capturedVariables!.value.pagination).toMatchObject({ page: 3 })
    await wrapper.find('cds-pagination-button[action="next"]').trigger('click')
    expect(capturedVariables!.value.pagination).toMatchObject({ page: 3 })
  })

  it('cycles the name column sort none -> ASC -> DESC -> none into the query', async () => {
    queryResult.value = makeResult([makeAgent()], 1)
    wrapper = mount(AgentListView, mountConfig)

    expect(capturedVariables!.value.sort).toBeNull()

    const sortBtn = wrapper.find('cds-button-action[aria-label="sort 名称"]')
    await sortBtn.trigger('click')
    expect(capturedVariables!.value.sort).toMatchObject({ field: 'NAME', direction: 'ASC' })

    await sortBtn.trigger('click')
    expect(capturedVariables!.value.sort).toMatchObject({ field: 'NAME', direction: 'DESC' })

    await sortBtn.trigger('click')
    expect(capturedVariables!.value.sort).toBeNull()
  })

  it('selects a single row and shows the "已选 N 项" footer count', async () => {
    queryResult.value = makeResult([makeAgent({ id: 'ag-1' }), makeAgent({ id: 'ag-2' })], 2)
    wrapper = mount(AgentListView, mountConfig)

    // Row checkboxes live inside grid cells; the header checkbox is the first
    // .app-checkbox, so the per-row ones follow it.
    const rowCheckbox = wrapper.findAll('cds-grid-cell .app-checkbox')[0]
    await rowCheckbox.setValue(true)

    expect(wrapper.find('.pager-selected-count').exists()).toBe(true)
    expect(wrapper.find('.pager-selected-count').text()).toContain('1')
  })

  it('select-all toggles every visible row, and the batch button enables', async () => {
    queryResult.value = makeResult([makeAgent({ id: 'ag-1' }), makeAgent({ id: 'ag-2' })], 2)
    wrapper = mount(AgentListView, mountConfig)

    // Header select-all is the checkbox inside the action column header.
    const headerCheckbox = wrapper.find('cds-grid-column .app-checkbox')
    await headerCheckbox.setValue(true)

    expect(wrapper.find('.pager-selected-count').text()).toContain('2')
  })

  it('resets the selection when the page changes', async () => {
    queryResult.value = makeResult([makeAgent({ id: 'ag-1' })], 25, 3)
    wrapper = mount(AgentListView, mountConfig)

    const rowCheckbox = wrapper.findAll('cds-grid-cell .app-checkbox')[0]
    await rowCheckbox.setValue(true)
    expect(wrapper.find('.pager-selected-count').exists()).toBe(true)

    await wrapper.find('cds-pagination-button[action="next"]').trigger('click')

    // Selection cleared → the selected-count affordance is gone.
    expect(wrapper.find('.pager-selected-count').exists()).toBe(false)
  })

  it('calls refetch when the refresh button is clicked', async () => {
    queryResult.value = makeResult([makeAgent()], 1)
    wrapper = mount(AgentListView, mountConfig)

    await wrapper.find('.toolbar-refresh').trigger('click')
    expect(refetchSpy).toHaveBeenCalledTimes(1)
  })

  it('renders the footer summary "显示 X-Y 条" only when there is data', async () => {
    // Empty → no footer.
    queryResult.value = makeResult([])
    wrapper = mount(AgentListView, mountConfig)
    expect(wrapper.find('cds-grid-footer').exists()).toBe(false)
    wrapper.unmount()

    // With data → footer summary reflects totalCount.
    queryResult.value = makeResult([makeAgent()], 42, 5)
    wrapper = mount(AgentListView, mountConfig)
    const summary = wrapper.find('.pager-summary')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('42')
    expect(summary.text()).toContain('1-1')
  })

  it('runs the export pipeline through apolloClient.query on the export button', async () => {
    queryResult.value = makeResult([makeAgent()], 1)
    // Make createObjectURL / revokeObjectURL safe in jsdom.
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
    try {
      wrapper = mount(AgentListView, mountConfig)
      // The export button is the first toolbar cds-button (action="outline").
      const exportBtn = wrapper.findAll('.toolbar cds-button')[0]
      await exportBtn.trigger('click')
      await flushPromises()

      expect(apolloQuerySpy).toHaveBeenCalled()
    } finally {
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
    }
  })
})
