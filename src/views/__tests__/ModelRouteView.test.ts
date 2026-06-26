/**
 * Component tests for ModelRouteView.vue — 模型路由 (Model Routes).
 *
 * The view lists ModelRoute entities (mapped from the backend's denormalized
 * `backendGatewayId` + `gatewayName` + `uiStrategy` shape via `toUiRoute`) and
 * runs real mutations through Apollo:
 *   - create / update via ModelRouteFormModal (inline cds-modal, `.route-form`);
 *     the gateway <select> is fed from a SEPARATE MODEL_GATEWAYS_QUERY.
 *   - setModelRouteEnabled (row enable/disable + batch enable/disable),
 *   - deleteModelRoute via ConfirmDialog (teleported → `.confirm-backdrop`),
 *   - updateModelRoute(uiStrategy) via the per-row strategy menu.
 *
 * Mocking strategy (mirrors GatewayConnectionView.test.ts):
 *   - `@vue/apollo-composable`'s `useQuery` is mocked and routed by the parsed
 *     document's operation name (`ModelRoutes` vs `ModelGateways`) to two
 *     independently-controllable slots so every list state (loading / empty /
 *     error / data) is deterministic. Each query's `refetch` is a spy.
 *   - `@/api/graphql/client`'s `apolloClient.mutate` is a spy resolved / rejected
 *     per test to exercise the success + error branches of each mutation. It is
 *     also routed by the mutation's operation name so batch + delete tests can
 *     mix outcomes.
 *   - real Pinia so `locale.t(...)` resolves real strings; assertions key off the
 *     same `locale.t` keys the component renders, not hard-coded text.
 *   - cds-* are custom elements (Clarity); the Vue compiler is told to treat any
 *     `cds-` tag as a custom element. Assertions are on plain DOM + spy calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, type Ref } from 'vue'

import type { ModelRouteNode, ModelRoutesResult } from '@/api/graphql/queries/model-routes'

// --- mocks -----------------------------------------------------------------

interface QuerySlot {
  result: Ref<unknown>
  loading: Ref<boolean>
  error: Ref<unknown>
  refetch: ReturnType<typeof vi.fn>
}

function makeSlot(): QuerySlot {
  return {
    result: ref<unknown>(undefined),
    loading: ref(false),
    error: ref<unknown>(null),
    refetch: vi.fn().mockResolvedValue(undefined),
  }
}

let routesSlot: QuerySlot
let gatewaysSlot: QuerySlot

vi.mock('@vue/apollo-composable', () => ({
  useQuery: (document: { definitions?: Array<{ name?: { value?: string } }> }) => {
    const opName = document?.definitions?.[0]?.name?.value
    const slot = opName === 'ModelGateways' ? gatewaysSlot : routesSlot
    return {
      result: slot.result,
      loading: slot.loading,
      error: slot.error,
      refetch: slot.refetch,
    }
  },
}))

// mutate is routed by mutation operation name so a single spy can serve every
// mutation; tests override per-op responses via `mutateByOp`.
const mutateByOp = new Map<string, (vars: Record<string, unknown>) => unknown>()
const mutateSpy = vi.fn(
  (arg: {
    mutation?: { definitions?: Array<{ name?: { value?: string } }> }
    variables?: Record<string, unknown>
  }) => {
    const op = arg.mutation?.definitions?.[0]?.name?.value ?? ''
    const handler = mutateByOp.get(op)
    if (handler) return Promise.resolve().then(() => handler(arg.variables ?? {}))
    return Promise.resolve({ data: {} })
  },
)

vi.mock('@/api/graphql/client', () => ({
  apolloClient: {
    mutate: (...args: unknown[]) => mutateSpy(args[0] as never),
  },
}))

import ModelRouteView from '@/views/ModelRouteView.vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'

// Toasts live in module-scoped state; read them via a fresh call.
function toastMessages(): string[] {
  return useToast().toasts.value.map((t) => t.message)
}
function toastStatuses(): string[] {
  return useToast().toasts.value.map((t) => t.status)
}

// --- fixtures --------------------------------------------------------------

function makeRoute(over: Partial<ModelRouteNode> = {}): ModelRouteNode {
  return {
    id: 'route-1',
    name: 'Default Route',
    backendGatewayId: 'gw-1',
    gatewayName: 'Primary Gateway',
    supportedModels: ['gpt-4o', 'claude-3'],
    uiStrategy: 'ROUND_ROBIN',
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...over,
  }
}

const ROUTE_A = makeRoute({ id: 'a', name: 'Alpha Route', backendGatewayId: 'gw-1' })
const ROUTE_B = makeRoute({
  id: 'b',
  name: 'Beta Route',
  backendGatewayId: 'gw-2',
  gatewayName: 'Secondary Gateway',
  uiStrategy: 'RANDOM',
  enabled: false,
  supportedModels: ['m1', 'm2', 'm3', 'm4', 'm5'],
})

const GATEWAYS = [
  { id: 'gw-1', name: 'Primary Gateway' },
  { id: 'gw-2', name: 'Secondary Gateway' },
]

const mountConfig = {
  global: {
    config: {
      compilerOptions: {
        isCustomElement: (tag: string) => tag.startsWith('cds-'),
      },
    },
  },
}

function setRoutes(rows: ModelRouteNode[]) {
  routesSlot.result.value = { modelRoutes: rows } satisfies ModelRoutesResult
}
function setGateways(rows: Array<{ id: string; name: string }>) {
  gatewaysSlot.result.value = { modelGateways: { nodes: rows } }
}

let wrapper: VueWrapper | null = null
let locale: ReturnType<typeof useLocaleStore>

function mountView() {
  wrapper = mount(ModelRouteView, mountConfig)
  return wrapper
}

// --- DOM helpers -----------------------------------------------------------

function rows(): HTMLElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLElement>('cds-grid-row'))
}
function confirmBackdrop(): HTMLElement | null {
  return document.body.querySelector('.confirm-backdrop')
}
function routeForm(): HTMLElement | null {
  // ModelRouteFormModal renders only when formOpen (v-if); its form is `.route-form`.
  return wrapper!.element.querySelector('.route-form')
}
function clickToolbarCreate() {
  // First toolbar cds-button is the create action.
  wrapper!.element
    .querySelector<HTMLElement>('.toolbar cds-button')!
    .dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

beforeEach(() => {
  setActivePinia(createPinia())
  locale = useLocaleStore()
  routesSlot = makeSlot()
  gatewaysSlot = makeSlot()
  setGateways(GATEWAYS)
  mutateSpy.mockClear()
  mutateByOp.clear()
  useToast().clear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.querySelectorAll('.confirm-backdrop').forEach((el) => el.remove())
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------

describe('ModelRouteView — list states', () => {
  it('shows the empty placeholder when there are no routes', async () => {
    setRoutes([])
    mountView()
    await flushPromises()

    const placeholder = wrapper!.element.querySelector('cds-grid-placeholder')
    expect(placeholder?.textContent).toContain(locale.t('modelRoute.empty'))
    expect(rows()).toHaveLength(0)
  })

  it('renders one row per route with the localized strategy + status text', async () => {
    setRoutes([ROUTE_A, ROUTE_B])
    mountView()
    await flushPromises()

    expect(rows()).toHaveLength(2)

    const first = rows()[0]
    expect(first.textContent).toContain('Alpha Route')
    expect(first.textContent).toContain('Primary Gateway')
    // Strategy comes from the localized enum key, not the raw enum value.
    expect(first.textContent).toContain(locale.t('modelRoute.strategy.ROUND_ROBIN'))
    expect(first.textContent).toContain(locale.t('modelRoute.status.enabled'))

    const second = rows()[1]
    expect(second.textContent).toContain('Beta Route')
    expect(second.textContent).toContain(locale.t('modelRoute.strategy.RANDOM'))
    expect(second.textContent).toContain(locale.t('modelRoute.status.disabled'))
  })

  it('shows only the first 3 models plus a +N overflow chip', async () => {
    setRoutes([ROUTE_B]) // 5 models
    mountView()
    await flushPromises()

    const modelList = rows()[0].querySelector<HTMLElement>('.model-list')!
    // First 3 model names are present; the 4th/5th are folded into "+2".
    expect(modelList.textContent).toContain('m1')
    expect(modelList.textContent).toContain('m3')
    expect(modelList.querySelector('.more-models')?.textContent).toContain('+2')
  })

  it('disables the refresh button while the routes query is loading', async () => {
    routesSlot.loading.value = true
    setRoutes([])
    mountView()
    await flushPromises()

    const refreshBtn = wrapper!.element.querySelector<HTMLElement>('.refresh-button')!
    expect(refreshBtn.hasAttribute('disabled')).toBe(true)
  })
})

describe('ModelRouteView — create / update via form modal', () => {
  function fillForm(form: HTMLElement, name: string, models: string, gatewayId?: string) {
    const nameInput = form.querySelector<HTMLInputElement>('cds-input input')!
    nameInput.value = name
    nameInput.dispatchEvent(new Event('input'))

    if (gatewayId !== undefined) {
      const gatewaySelect = form.querySelector<HTMLSelectElement>('cds-select select')!
      gatewaySelect.value = gatewayId
      gatewaySelect.dispatchEvent(new Event('change'))
    }

    const textarea = form.querySelector<HTMLTextAreaElement>('textarea')!
    textarea.value = models
    textarea.dispatchEvent(new Event('input'))
  }

  it('opens the create dialog from the toolbar and the gateway dropdown is fed from MODEL_GATEWAYS', async () => {
    setRoutes([ROUTE_A])
    mountView()
    await flushPromises()
    expect(routeForm()).toBeNull()

    clickToolbarCreate()
    await flushPromises()

    const form = routeForm()
    expect(form).not.toBeNull()
    // The gateway <select> (first cds-select) options mirror MODEL_GATEWAYS_QUERY's
    // nodes. The second cds-select holds load-balancing strategies, so scope to the
    // first one only.
    const gatewaySelect = form!.querySelector<HTMLSelectElement>('cds-select select')!
    const options = Array.from(gatewaySelect.querySelectorAll<HTMLOptionElement>('option'))
    expect(options.map((o) => o.value)).toEqual(['gw-1', 'gw-2'])
    expect(options.map((o) => o.textContent?.trim())).toEqual([
      'Primary Gateway',
      'Secondary Gateway',
    ])
  })

  it('submitting create calls createModelRoute with the mapped input, toasts + refetches', async () => {
    mutateByOp.set('CreateModelRoute', () => ({ data: { createModelRoute: makeRoute() } }))
    setRoutes([ROUTE_A])
    mountView()
    await flushPromises()

    clickToolbarCreate()
    await flushPromises()

    const form = routeForm()!
    fillForm(form, 'New Route', 'modelX, modelY', 'gw-2')
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    // exactly one create mutation
    const createCalls = mutateSpy.mock.calls.filter(
      (c) => (c[0] as { mutation?: { definitions?: Array<{ name?: { value?: string } }> } }).mutation
        ?.definitions?.[0]?.name?.value === 'CreateModelRoute',
    )
    expect(createCalls).toHaveLength(1)
    const vars = (createCalls[0][0] as { variables: { input: Record<string, unknown> } }).variables
    // The draft is mapped back to the backend input shape (gatewayId →
    // backendGatewayId, strategy → uiStrategy, parsed model list).
    expect(vars.input).toMatchObject({
      name: 'New Route',
      backendGatewayId: 'gw-2',
      gatewayName: 'Secondary Gateway',
      uiStrategy: 'ROUND_ROBIN',
      supportedModels: ['modelX', 'modelY'],
    })

    expect(toastMessages()).toContain(locale.t('modelRoute.toast.created'))
    expect(routesSlot.refetch).toHaveBeenCalled()
    expect(routeForm()).toBeNull() // closes on success
  })

  it('editing an existing route calls updateModelRoute with its id and toasts updated', async () => {
    mutateByOp.set('UpdateModelRoute', () => ({ data: { updateModelRoute: makeRoute() } }))
    setRoutes([ROUTE_A])
    mountView()
    await flushPromises()

    // The "edit" row action opens the form pre-populated for ROUTE_A.
    const editBtn = Array.from(
      rows()[0].querySelectorAll<HTMLElement>('.row-action'),
    ).find((b) => b.getAttribute('title') === locale.t('modelRoute.action.edit'))!
    editBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = routeForm()!
    // Name pre-filled from the route; change models then submit.
    const textarea = form.querySelector<HTMLTextAreaElement>('textarea')!
    textarea.value = 'gpt-4o'
    textarea.dispatchEvent(new Event('input'))
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    const updateCalls = mutateSpy.mock.calls.filter(
      (c) => (c[0] as { mutation?: { definitions?: Array<{ name?: { value?: string } }> } }).mutation
        ?.definitions?.[0]?.name?.value === 'UpdateModelRoute',
    )
    expect(updateCalls).toHaveLength(1)
    const vars = (updateCalls[0][0] as { variables: { id: string } }).variables
    expect(vars.id).toBe('a')
    expect(toastMessages()).toContain(locale.t('modelRoute.toast.updated'))
    expect(toastMessages()).not.toContain(locale.t('modelRoute.toast.created'))
  })

  it('surfaces the backend GraphQL error and keeps the dialog open on create failure', async () => {
    mutateByOp.set('CreateModelRoute', () => {
      throw { graphQLErrors: [{ message: 'route name already exists' }] }
    })
    setRoutes([ROUTE_A])
    mountView()
    await flushPromises()

    clickToolbarCreate()
    await flushPromises()

    const form = routeForm()!
    fillForm(form, 'Dup Route', 'm1', 'gw-1')
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(toastMessages()).toContain('route name already exists')
    expect(toastMessages()).not.toContain(locale.t('modelRoute.toast.created'))
    expect(routeForm()).not.toBeNull() // stays open for retry
  })
})

describe('ModelRouteView — strategy menu (updateModelRoute uiStrategy)', () => {
  it('choosing a different strategy calls updateModelRoute with only uiStrategy', async () => {
    mutateByOp.set('UpdateModelRoute', () => ({ data: { updateModelRoute: makeRoute() } }))
    setRoutes([ROUTE_A]) // ROUND_ROBIN
    mountView()
    await flushPromises()

    // Open the per-row strategy menu.
    rows()[0]
      .querySelector<HTMLElement>('.strategy-trigger')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const menu = document.body.querySelector('.strategy-menu') ??
      wrapper!.element.querySelector('.strategy-menu')
    expect(menu).not.toBeNull()
    // Pick a strategy different from the current ROUND_ROBIN.
    const randomOption = Array.from(
      menu!.querySelectorAll<HTMLElement>('.strategy-menu-option'),
    ).find((b) => b.textContent?.includes(locale.t('modelRoute.strategy.RANDOM')))!
    randomOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const updateCalls = mutateSpy.mock.calls.filter(
      (c) => (c[0] as { mutation?: { definitions?: Array<{ name?: { value?: string } }> } }).mutation
        ?.definitions?.[0]?.name?.value === 'UpdateModelRoute',
    )
    expect(updateCalls).toHaveLength(1)
    const vars = (updateCalls[0][0] as { variables: { id: string; input: Record<string, unknown> } })
      .variables
    expect(vars.id).toBe('a')
    expect(vars.input).toEqual({ uiStrategy: 'RANDOM' })
    expect(toastMessages()).toContain(
      locale.t('modelRoute.toast.strategyUpdated').replace('{name}', 'Alpha Route'),
    )
  })

  it('choosing the current strategy is a no-op (no mutation)', async () => {
    setRoutes([ROUTE_A]) // ROUND_ROBIN
    mountView()
    await flushPromises()

    rows()[0]
      .querySelector<HTMLElement>('.strategy-trigger')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const menu = document.body.querySelector('.strategy-menu') ??
      wrapper!.element.querySelector('.strategy-menu')
    const sameOption = Array.from(
      menu!.querySelectorAll<HTMLElement>('.strategy-menu-option'),
    ).find((b) => b.textContent?.includes(locale.t('modelRoute.strategy.ROUND_ROBIN')))!
    sameOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const updateCalls = mutateSpy.mock.calls.filter(
      (c) => (c[0] as { mutation?: { definitions?: Array<{ name?: { value?: string } }> } }).mutation
        ?.definitions?.[0]?.name?.value === 'UpdateModelRoute',
    )
    expect(updateCalls).toHaveLength(0)
  })
})

describe('ModelRouteView — toggle enabled (setModelRouteEnabled)', () => {
  it('toggling an enabled route disables it via setModelRouteEnabled(false)', async () => {
    mutateByOp.set('SetModelRouteEnabled', () => ({
      data: { setModelRouteEnabled: makeRoute({ enabled: false }) },
    }))
    setRoutes([ROUTE_A]) // enabled
    mountView()
    await flushPromises()

    const toggleBtn = Array.from(
      rows()[0].querySelectorAll<HTMLElement>('.row-action'),
    ).find((b) => b.getAttribute('title') === locale.t('modelRoute.action.disable'))!
    toggleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const setCalls = mutateSpy.mock.calls.filter(
      (c) => (c[0] as { mutation?: { definitions?: Array<{ name?: { value?: string } }> } }).mutation
        ?.definitions?.[0]?.name?.value === 'SetModelRouteEnabled',
    )
    expect(setCalls).toHaveLength(1)
    const vars = (setCalls[0][0] as { variables: { id: string; enabled: boolean } }).variables
    expect(vars).toEqual({ id: 'a', enabled: false })
    expect(toastMessages()).toContain(locale.t('modelRoute.toast.disabled').replace('{count}', '1'))
    expect(routesSlot.refetch).toHaveBeenCalled()
  })

  it('a failed toggle surfaces the fallback action-failed toast', async () => {
    mutateByOp.set('SetModelRouteEnabled', () => {
      throw new Error('boom')
    })
    setRoutes([ROUTE_B]) // disabled → enable attempt
    mountView()
    await flushPromises()

    const toggleBtn = Array.from(
      rows()[0].querySelectorAll<HTMLElement>('.row-action'),
    ).find((b) => b.getAttribute('title') === locale.t('modelRoute.action.enable'))!
    toggleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // graphqlErrorMessage falls back to error.message.
    expect(toastMessages()).toContain('boom')
    expect(toastStatuses()).toContain('danger')
  })
})

describe('ModelRouteView — delete flow', () => {
  function openConfirm(index: number) {
    const deleteBtn = rows()[index].querySelector<HTMLElement>('.row-action.danger')!
    deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('requesting delete opens a confirm dialog naming the target route', async () => {
    setRoutes([ROUTE_A, ROUTE_B])
    mountView()
    await flushPromises()

    openConfirm(0)
    await flushPromises()

    const card = confirmBackdrop()
    expect(card).not.toBeNull()
    expect(card?.getAttribute('aria-label')).toBe(locale.t('modelRoute.confirm.deleteTitle'))
    expect(card?.textContent).toContain('Alpha Route')
  })

  it('confirming delete calls deleteModelRoute with the id, toasts + refetches', async () => {
    mutateByOp.set('DeleteModelRoute', () => ({ data: { deleteModelRoute: true } }))
    setRoutes([ROUTE_A, ROUTE_B])
    mountView()
    await flushPromises()

    openConfirm(1)
    await flushPromises()

    confirmBackdrop()!
      .querySelector<HTMLElement>('cds-button[status="danger"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const deleteCalls = mutateSpy.mock.calls.filter(
      (c) => (c[0] as { mutation?: { definitions?: Array<{ name?: { value?: string } }> } }).mutation
        ?.definitions?.[0]?.name?.value === 'DeleteModelRoute',
    )
    expect(deleteCalls).toHaveLength(1)
    expect((deleteCalls[0][0] as { variables: { id: string } }).variables.id).toBe('b')
    expect(toastMessages()).toContain(locale.t('modelRoute.toast.deleted').replace('{count}', '1'))
    expect(routesSlot.refetch).toHaveBeenCalled()
    expect(confirmBackdrop()).toBeNull()
  })

  it('cancelling the confirm dialog closes it without calling mutate', async () => {
    setRoutes([ROUTE_A])
    mountView()
    await flushPromises()

    openConfirm(0)
    await flushPromises()

    confirmBackdrop()!
      .querySelector<HTMLElement>('cds-button[action="outline"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(confirmBackdrop()).toBeNull()
    const deleteCalls = mutateSpy.mock.calls.filter(
      (c) => (c[0] as { mutation?: { definitions?: Array<{ name?: { value?: string } }> } }).mutation
        ?.definitions?.[0]?.name?.value === 'DeleteModelRoute',
    )
    expect(deleteCalls).toHaveLength(0)
  })

  it('delete failure surfaces the backend GraphQL error', async () => {
    mutateByOp.set('DeleteModelRoute', () => {
      throw { graphQLErrors: [{ message: 'forbidden: requires admin' }] }
    })
    setRoutes([ROUTE_A])
    mountView()
    await flushPromises()

    openConfirm(0)
    await flushPromises()
    confirmBackdrop()!
      .querySelector<HTMLElement>('cds-button[status="danger"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('forbidden: requires admin')
    expect(toastMessages()).not.toContain(
      locale.t('modelRoute.toast.deleted').replace('{count}', '1'),
    )
  })
})

describe('ModelRouteView — filtering', () => {
  it('a name filter narrows the visible rows', async () => {
    setRoutes([ROUTE_A, ROUTE_B])
    mountView()
    await flushPromises()
    expect(rows()).toHaveLength(2)

    // Open the NAME column filter menu.
    const nameFilterBtn = wrapper!.element.querySelectorAll<HTMLElement>(
      'cds-button-action[shape="filter"]',
    )[0]
    nameFilterBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const filterInput = (document.body.querySelector('.filter-panel input') ??
      wrapper!.element.querySelector('.filter-panel input')) as HTMLInputElement
    expect(filterInput).not.toBeNull()
    filterInput.value = 'Beta'
    filterInput.dispatchEvent(new Event('input'))
    await flushPromises()

    expect(rows()).toHaveLength(1)
    expect(rows()[0].textContent).toContain('Beta Route')
    expect(rows()[0].textContent).not.toContain('Alpha Route')
  })
})

describe('ModelRouteView — batch actions', () => {
  function selectRow(index: number) {
    const checkbox = rows()[index].querySelector<HTMLInputElement>('input[type="checkbox"]')!
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))
  }

  // The batch menu lives inside AppDropdown's panel, only rendered after the
  // trigger is clicked. Returns the .menu-option whose text matches `key`.
  async function openBatchMenuOption(key: string): Promise<HTMLElement> {
    wrapper!.element
      .querySelector<HTMLElement>('.dd-trigger')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    return Array.from(wrapper!.element.querySelectorAll<HTMLElement>('.menu-option')).find((b) =>
      b.textContent?.includes(key),
    )!
  }

  it('batch enable calls setModelRouteEnabled once per selected id and clears selection', async () => {
    const seen: Array<{ id: string; enabled: boolean }> = []
    mutateByOp.set('SetModelRouteEnabled', (vars) => {
      seen.push(vars as { id: string; enabled: boolean })
      return { data: { setModelRouteEnabled: makeRoute() } }
    })
    setRoutes([ROUTE_A, ROUTE_B])
    mountView()
    await flushPromises()

    selectRow(0)
    selectRow(1)
    await flushPromises()
    // Selection summary reflects 2 selected.
    expect(wrapper!.element.textContent).toContain(
      locale.t('modelRoute.selected').replace('{count}', '2'),
    )

    // Open the batch dropdown and click "enable selected".
    const enableBtn = await openBatchMenuOption(locale.t('modelRoute.batch.enable'))
    enableBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(seen).toHaveLength(2)
    expect(seen.map((v) => v.id).sort()).toEqual(['a', 'b'])
    expect(seen.every((v) => v.enabled === true)).toBe(true)
    expect(toastMessages()).toContain(locale.t('modelRoute.toast.enabled').replace('{count}', '2'))
    // Selection cleared after a successful batch.
    expect(wrapper!.element.textContent).not.toContain(
      locale.t('modelRoute.selected').replace('{count}', '2'),
    )
  })

  it('batch delete opens the batch confirm dialog instead of mutating immediately', async () => {
    setRoutes([ROUTE_A, ROUTE_B])
    mountView()
    await flushPromises()

    selectRow(0)
    selectRow(1)
    await flushPromises()

    const deleteBtn = await openBatchMenuOption(locale.t('modelRoute.batch.delete'))
    deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const card = confirmBackdrop()
    expect(card).not.toBeNull()
    // The batch-delete title + body (interpolating the count) are shown.
    expect(card?.getAttribute('aria-label')).toBe(locale.t('modelRoute.confirm.batchDeleteTitle'))
    expect(card?.textContent).toContain(
      locale.t('modelRoute.confirm.batchDeleteBody').replace('{count}', '2'),
    )
    // No delete mutation yet — confirmation pending.
    const deleteCalls = mutateSpy.mock.calls.filter(
      (c) => (c[0] as { mutation?: { definitions?: Array<{ name?: { value?: string } }> } }).mutation
        ?.definitions?.[0]?.name?.value === 'DeleteModelRoute',
    )
    expect(deleteCalls).toHaveLength(0)
  })
})

describe('ModelRouteView — refresh + pagination', () => {
  it('refresh refetches the routes and toasts on success', async () => {
    setRoutes([ROUTE_A])
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.refresh-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(routesSlot.refetch).toHaveBeenCalled()
    expect(toastMessages()).toContain(locale.t('modelRoute.toast.refreshed'))
  })

  it('paginates: page size 10 shows the first page and "next" reveals the rest', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      makeRoute({ id: `r${i}`, name: `Route ${String(i).padStart(2, '0')}` }),
    )
    setRoutes(many)
    mountView()
    await flushPromises()

    // Default page size is 10.
    expect(rows()).toHaveLength(10)

    const nextBtn = wrapper!.element.querySelector<HTMLElement>(
      'cds-pagination-button[action="next"]',
    )!
    nextBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // Remaining 2 rows on page 2.
    expect(rows()).toHaveLength(2)
  })
})
