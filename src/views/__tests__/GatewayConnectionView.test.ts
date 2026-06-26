/**
 * Component tests for GatewayConnectionView.vue — 网关连接 (Gateway Connections).
 *
 * The view lists the raw GatewayConnection entities and runs real mutations via
 * Apollo:
 *   - register (create) via RegisterGatewayConnectionDialog (inline cds-modal),
 *   - delete (confirm) via ConfirmDialog (teleported → `.confirm-backdrop`),
 *   - test connection (row action) → testGatewayConnection returns a bare
 *     GatewayStatus enum that is surfaced as a success / error / warning toast.
 *   - a header banner shows modelGatewaySyncSummary (litellm sync rollup).
 *
 * Mocking strategy (mirrors ArtifactView.test.ts):
 *   - `@vue/apollo-composable`'s `useQuery` is mocked and routed by the parsed
 *     document's operation name (`GatewayConnectionsList` vs
 *     `GatewayConnectionsSyncSummary`) to two independently-controllable slots, so
 *     every state (loading / error / empty / data) is driven deterministically.
 *     Each query's `refetch` is a spy.
 *   - `@/api/graphql/client`'s `apolloClient.mutate` is a spy we resolve / reject
 *     per test to exercise the success + error branches of every mutation.
 *   - real Pinia so `locale.t(...)` resolves real strings; assertions are keyed off
 *     the same `locale.t` keys the component renders, not hard-coded text.
 *   - cds-* are custom elements (Clarity); the Vue compiler is told to treat any
 *     `cds-` tag as a custom element. We assert on plain DOM + emitted/spy calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, type Ref } from 'vue'

import type {
  GatewayConnectionNode,
  GatewayConnectionsListResult,
  GatewayConnectionsSyncSummaryResult,
  GatewaySyncSummaryNode,
} from '@/api/graphql/queries/gateway-connections'

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

let listSlot: QuerySlot
let summarySlot: QuerySlot

vi.mock('@vue/apollo-composable', () => ({
  useQuery: (document: { definitions?: Array<{ name?: { value?: string } }> }) => {
    const opName = document?.definitions?.[0]?.name?.value
    const slot = opName === 'GatewayConnectionsSyncSummary' ? summarySlot : listSlot
    return {
      result: slot.result,
      loading: slot.loading,
      error: slot.error,
      refetch: slot.refetch,
    }
  },
}))

const mutateMock = vi.fn()
vi.mock('@/api/graphql/client', () => ({
  apolloClient: {
    mutate: (...args: unknown[]) => mutateMock(...args),
  },
}))

import GatewayConnectionView from '@/views/GatewayConnectionView.vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'

// Toasts live in module-scoped state in useToast; read them via a fresh call.
function toastMessages(): string[] {
  return useToast().toasts.value.map((t) => t.message)
}
function toastStatuses(): string[] {
  return useToast().toasts.value.map((t) => t.status)
}

// --- fixtures --------------------------------------------------------------

function makeConnection(over: Partial<GatewayConnectionNode> = {}): GatewayConnectionNode {
  return {
    id: 'conn-1',
    name: 'Primary Gateway',
    endpoint: 'https://litellm.example.com',
    status: 'connected',
    loadBalanceStrategy: 'simple_shuffle',
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function makeSummary(over: Partial<GatewaySyncSummaryNode> = {}): GatewaySyncSummaryNode {
  return {
    state: 'SYNCED',
    lastSyncedAt: '2026-02-01T08:30:00Z',
    successCount: 5,
    failedCount: 1,
    message: null,
    ...over,
  }
}

const CONN_A = makeConnection({ id: 'a', name: 'Alpha Gateway' })
const CONN_B = makeConnection({
  id: 'b',
  name: 'Beta Gateway',
  endpoint: 'unix:///var/run/litellm.sock',
  status: 'error',
  loadBalanceStrategy: 'latency',
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

function setListData(rows: GatewayConnectionNode[]) {
  listSlot.result.value = { gatewayConnections: rows } satisfies GatewayConnectionsListResult
}
function setSummaryData(summary: GatewaySyncSummaryNode) {
  summarySlot.result.value = {
    modelGatewaySyncSummary: summary,
  } satisfies GatewayConnectionsSyncSummaryResult
}

let wrapper: VueWrapper | null = null
let locale: ReturnType<typeof useLocaleStore>

function mountView() {
  wrapper = mount(GatewayConnectionView, mountConfig)
  return wrapper
}

// --- DOM helpers -----------------------------------------------------------

function rows(): HTMLElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLElement>('cds-grid-row'))
}
function confirmBackdrop(): HTMLElement | null {
  return document.body.querySelector('.confirm-backdrop')
}
function registerModal(): HTMLElement | null {
  // The register dialog is an inline cds-modal inside the wrapper, shown only
  // when registerOpen is true (v-if). Its form has class `.gateway-form`.
  return wrapper!.element.querySelector('.gateway-form')
}

beforeEach(() => {
  setActivePinia(createPinia())
  locale = useLocaleStore()
  listSlot = makeSlot()
  summarySlot = makeSlot()
  mutateMock.mockReset()
  // Toast state is module-scoped and shared across tests; reset it so
  // `not.toContain` assertions are not polluted by a prior test's toast.
  useToast().clear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.querySelectorAll('.confirm-backdrop').forEach((el) => el.remove())
})

// ---------------------------------------------------------------------------

describe('GatewayConnectionView — list states', () => {
  it('shows the loading placeholder while loading with no rows yet', () => {
    listSlot.loading.value = true
    mountView()
    const placeholder = wrapper!.element.querySelector('cds-grid-placeholder')
    expect(placeholder?.textContent).toContain(locale.t('gatewayConn.loading'))
    expect(rows()).toHaveLength(0)
  })

  it('shows the empty placeholder when there are no connections', async () => {
    setListData([])
    mountView()
    await flushPromises()
    const placeholder = wrapper!.element.querySelector('cds-grid-placeholder')
    expect(placeholder?.textContent).toContain(locale.t('gatewayConn.empty'))
    expect(rows()).toHaveLength(0)
  })

  it('renders the error alert when the list query errors', async () => {
    listSlot.error.value = new Error('boom')
    mountView()
    await flushPromises()
    const alert = wrapper!.element.querySelector('cds-alert[status="danger"]')
    expect(alert?.textContent?.trim()).toBe(locale.t('gatewayConn.error'))
    expect(alert?.getAttribute('role')).toBe('alert')
  })

  it('renders one row per connection with localized status + strategy text', async () => {
    setListData([CONN_A, CONN_B])
    mountView()
    await flushPromises()

    expect(rows()).toHaveLength(2)
    const first = rows()[0]
    expect(first.textContent).toContain('Alpha Gateway')
    // Status + strategy come from localized enum keys, not raw enum values.
    expect(first.textContent).toContain(locale.t('gatewayConn.status.connected'))
    expect(first.textContent).toContain(locale.t('gatewayConn.strategy.simple_shuffle'))

    const second = rows()[1]
    expect(second.textContent).toContain(locale.t('gatewayConn.status.error'))
    expect(second.textContent).toContain(locale.t('gatewayConn.strategy.latency'))
  })

  it('renders an http endpoint as a link but a non-http endpoint as plain text', async () => {
    setListData([CONN_A, CONN_B])
    mountView()
    await flushPromises()

    const link = rows()[0].querySelector<HTMLAnchorElement>('a.endpoint-link')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('https://litellm.example.com')
    expect(link?.getAttribute('rel')).toContain('noopener')

    // Non-http endpoint is not clickable.
    expect(rows()[1].querySelector('a.endpoint-link')).toBeNull()
    expect(rows()[1].textContent).toContain('unix:///var/run/litellm.sock')
  })
})

describe('GatewayConnectionView — sync summary banner', () => {
  it('does not render the banner when there is no summary', async () => {
    setListData([CONN_A])
    mountView()
    await flushPromises()
    expect(wrapper!.element.querySelector('.sync-summary')).toBeNull()
  })

  it('renders state badge, success/fail counts and last-synced time when present', async () => {
    setListData([CONN_A])
    setSummaryData(makeSummary({ state: 'SYNCED', successCount: 5, failedCount: 1 }))
    mountView()
    await flushPromises()

    const banner = wrapper!.element.querySelector('.sync-summary')
    expect(banner).not.toBeNull()
    expect(banner?.textContent).toContain(locale.t('gatewayConn.syncState.SYNCED'))
    // Counts string interpolates {ok}/{fail}.
    const counts = locale.t('gatewayConn.summary.counts').replace('{ok}', '5').replace('{fail}', '1')
    expect(banner?.textContent).toContain(counts)
    expect(banner?.textContent).toContain(locale.t('gatewayConn.summary.lastSynced'))
  })

  it('shows the "never" string when the summary has never synced', async () => {
    setListData([CONN_A])
    setSummaryData(makeSummary({ state: 'NEVER', lastSyncedAt: null }))
    mountView()
    await flushPromises()
    const banner = wrapper!.element.querySelector('.sync-summary')
    expect(banner?.textContent).toContain(locale.t('gatewayConn.summary.never'))
  })
})

describe('GatewayConnectionView — register dialog', () => {
  it('opens the register dialog from the toolbar register button', async () => {
    setListData([CONN_A])
    mountView()
    await flushPromises()
    expect(registerModal()).toBeNull()

    // First toolbar button is the register/outline action.
    const registerBtn = wrapper!.element.querySelector<HTMLElement>('.toolbar cds-button')!
    registerBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(registerModal()).not.toBeNull()
  })

  it('submitting the form calls mutate with the input, toasts success and refetches', async () => {
    mutateMock.mockResolvedValue({ data: { registerGatewayConnection: makeConnection() } })
    setListData([CONN_A])
    setSummaryData(makeSummary())
    mountView()
    await flushPromises()

    wrapper!.element.querySelector<HTMLElement>('.toolbar cds-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = registerModal()!
    const setVal = (sel: string, v: string) => {
      const el = form.querySelector<HTMLInputElement>(sel)!
      el.value = v
      el.dispatchEvent(new Event('input'))
    }
    setVal('#gw-form-name', 'My New Gateway')
    setVal('#gw-form-endpoint', 'https://new.example.com')
    setVal('#gw-form-master-key', 'sk-secret')
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { input: Record<string, unknown> } }
    expect(arg.variables.input).toMatchObject({
      name: 'My New Gateway',
      endpoint: 'https://new.example.com',
      masterKey: 'sk-secret',
    })

    expect(toastMessages()).toContain(locale.t('gatewayConn.toast.created'))
    expect(listSlot.refetch).toHaveBeenCalled()
    expect(summarySlot.refetch).toHaveBeenCalled()
    // Dialog closes on success.
    expect(registerModal()).toBeNull()
  })

  it('surfaces the backend GraphQL error via toast and keeps the dialog open on failure', async () => {
    mutateMock.mockRejectedValue({ graphQLErrors: [{ message: 'name already exists' }] })
    setListData([CONN_A])
    mountView()
    await flushPromises()

    wrapper!.element.querySelector<HTMLElement>('.toolbar cds-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = registerModal()!
    const setVal = (sel: string, v: string) => {
      const el = form.querySelector<HTMLInputElement>(sel)!
      el.value = v
      el.dispatchEvent(new Event('input'))
    }
    setVal('#gw-form-name', 'Dup Gateway')
    setVal('#gw-form-endpoint', 'https://dup.example.com')
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    // graphqlErrorMessage prefers the backend message over the generic fallback.
    expect(toastMessages()).toContain('name already exists')
    expect(toastMessages()).not.toContain(locale.t('gatewayConn.toast.created'))
    // Dialog stays open so the user can correct + retry.
    expect(registerModal()).not.toBeNull()
  })
})

describe('GatewayConnectionView — delete flow', () => {
  function openConfirm(index: number) {
    const deleteBtn = rows()[index].querySelector<HTMLElement>('.row-action.danger')!
    deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('requesting delete opens a confirm dialog naming the target', async () => {
    setListData([CONN_A, CONN_B])
    mountView()
    await flushPromises()

    openConfirm(0)
    await flushPromises()

    const card = confirmBackdrop()
    expect(card).not.toBeNull()
    expect(card?.getAttribute('aria-label')).toBe(locale.t('gatewayConn.confirm.deleteTitle'))
    // Body interpolates the connection name.
    expect(card?.textContent).toContain('Alpha Gateway')
  })

  it('confirming delete calls mutate with the target id, toasts success and refetches', async () => {
    mutateMock.mockResolvedValue({ data: { deleteGatewayConnection: true } })
    setListData([CONN_A, CONN_B])
    setSummaryData(makeSummary())
    mountView()
    await flushPromises()

    openConfirm(1)
    await flushPromises()

    const confirmBtn = confirmBackdrop()!.querySelector<HTMLElement>('cds-button[status="danger"]')!
    confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { id: string } }
    expect(arg.variables.id).toBe('b')
    expect(toastMessages()).toContain(locale.t('gatewayConn.toast.deleted'))
    expect(listSlot.refetch).toHaveBeenCalled()
    expect(summarySlot.refetch).toHaveBeenCalled()
    expect(confirmBackdrop()).toBeNull()
  })

  it('delete failure surfaces the GraphQL error', async () => {
    mutateMock.mockRejectedValue({ graphQLErrors: [{ message: 'forbidden: requires admin' }] })
    setListData([CONN_A])
    mountView()
    await flushPromises()

    openConfirm(0)
    await flushPromises()
    confirmBackdrop()!.querySelector<HTMLElement>('cds-button[status="danger"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('forbidden: requires admin')
    expect(toastMessages()).not.toContain(locale.t('gatewayConn.toast.deleted'))
  })

  it('cancelling the confirm dialog closes it without calling mutate', async () => {
    setListData([CONN_A])
    mountView()
    await flushPromises()

    openConfirm(0)
    await flushPromises()
    // The outline (non-danger) button is the cancel action.
    const cancelBtn = confirmBackdrop()!.querySelector<HTMLElement>('cds-button[action="outline"]')!
    cancelBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(confirmBackdrop()).toBeNull()
    expect(mutateMock).not.toHaveBeenCalled()
  })
})

describe('GatewayConnectionView — test connection maps GatewayStatus → toast', () => {
  function clickTest(index: number) {
    const testBtn = rows()[index].querySelector<HTMLElement>('.row-action:not(.danger)')!
    testBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('"connected" → success toast naming the connection', async () => {
    mutateMock.mockResolvedValue({ data: { testGatewayConnection: 'connected' } })
    setListData([CONN_A])
    mountView()
    await flushPromises()

    clickTest(0)
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { id: string } }
    expect(arg.variables.id).toBe('a')

    const expected = locale.t('gatewayConn.toast.testConnected').replace('{name}', 'Alpha Gateway')
    expect(toastMessages()).toContain(expected)
    expect(toastStatuses()).toContain('success')
    // Both queries refetched to reflect the live ping result.
    expect(listSlot.refetch).toHaveBeenCalled()
    expect(summarySlot.refetch).toHaveBeenCalled()
  })

  it('"error" → error toast naming the connection', async () => {
    mutateMock.mockResolvedValue({ data: { testGatewayConnection: 'error' } })
    setListData([CONN_A])
    mountView()
    await flushPromises()

    clickTest(0)
    await flushPromises()

    const expected = locale.t('gatewayConn.toast.testError').replace('{name}', 'Alpha Gateway')
    expect(toastMessages()).toContain(expected)
    expect(toastStatuses()).toContain('danger')
  })

  it('"disconnected" (any other enum) → warning toast naming the connection', async () => {
    mutateMock.mockResolvedValue({ data: { testGatewayConnection: 'disconnected' } })
    setListData([CONN_A])
    mountView()
    await flushPromises()

    clickTest(0)
    await flushPromises()

    const expected = locale
      .t('gatewayConn.toast.testDisconnected')
      .replace('{name}', 'Alpha Gateway')
    expect(toastMessages()).toContain(expected)
    expect(toastStatuses()).toContain('warning')
  })

  it('a thrown error surfaces the testFailed fallback toast', async () => {
    mutateMock.mockRejectedValue(new Error('network down'))
    setListData([CONN_A])
    mountView()
    await flushPromises()

    clickTest(0)
    await flushPromises()

    // graphqlErrorMessage falls back to error.message when no graphQLErrors.
    expect(toastMessages()).toContain('network down')
    expect(toastStatuses()).toContain('danger')
  })
})

describe('GatewayConnectionView — refresh toolbar action', () => {
  it('refresh refetches list + summary and toasts on success', async () => {
    setListData([CONN_A])
    setSummaryData(makeSummary())
    mountView()
    await flushPromises()

    const refreshBtn = wrapper!.element.querySelector<HTMLElement>('.refresh-button')!
    refreshBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(listSlot.refetch).toHaveBeenCalled()
    expect(summarySlot.refetch).toHaveBeenCalled()
    expect(toastMessages()).toContain(locale.t('gatewayConn.toast.refreshed'))
  })

  it('refresh surfaces an error toast when refetch rejects', async () => {
    setListData([CONN_A])
    listSlot.refetch.mockRejectedValueOnce(new Error('network down'))
    mountView()
    await flushPromises()

    wrapper!.element.querySelector<HTMLElement>('.refresh-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('network down')
    expect(toastMessages()).not.toContain(locale.t('gatewayConn.toast.refreshed'))
  })
})
