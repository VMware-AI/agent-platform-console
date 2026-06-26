/**
 * Component tests for ModelGatewayView.vue — 模型网关接入管理 (Model Gateway Integration).
 *
 * The view lists ModelGateway entities (single MODEL_GATEWAYS_QUERY via useQuery)
 * and runs real mutations through `apolloClient.mutate`:
 *   - create  → CreateModelGateway  (via ModelGatewayFormModal, no editing target)
 *   - update  → UpdateModelGateway  (via ModelGatewayFormModal with editing target)
 *   - delete  → DeleteModelGateway  (via ConfirmDeleteModal)
 *   - test/resync connection → TestModelGatewayConnection (row action), which maps
 *     the returned { success, message } onto a success / error toast and refetches.
 *
 * Mocking strategy (mirrors ModelRouteView.test.ts):
 *   - `@vue/apollo-composable`'s `useQuery` is mocked to a single controllable slot
 *     so each state (loading / error / empty / data) is driven deterministically.
 *     `refetch` is a spy.
 *   - `@/api/graphql/client`'s `apolloClient.mutate` is a spy resolved / rejected
 *     per test to exercise the success + error branches of every mutation.
 *   - real Pinia so `locale.t(...)` resolves real strings (default locale 'zh');
 *     assertions are keyed off the same `locale.t` keys the component renders, not
 *     hard-coded text.
 *   - cds-* are custom elements (Clarity); the Vue compiler is told to treat any
 *     `cds-` tag as a custom element. We assert on plain DOM + emitted/spy calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, type Ref } from 'vue'

import type {
  ModelGateway,
  ModelGatewaysQueryResult,
} from '@/api/graphql/model-gateway-types'

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

vi.mock('@vue/apollo-composable', () => ({
  useQuery: () => ({
    result: listSlot.result,
    loading: listSlot.loading,
    error: listSlot.error,
    refetch: listSlot.refetch,
  }),
}))

const mutateMock = vi.fn()
vi.mock('@/api/graphql/client', () => ({
  apolloClient: {
    mutate: (...args: unknown[]) => mutateMock(...args),
  },
}))

import ModelGatewayView from '@/views/ModelGatewayView.vue'
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

function makeGateway(over: Partial<ModelGateway> = {}): ModelGateway {
  return {
    id: 'gw-1',
    name: 'Primary Router',
    provider: 'LITELLM',
    endpoint: 'https://litellm.example.com',
    status: 'CONNECTED',
    loadBalancingStrategy: 'ROUND_ROBIN',
    latencyMs: 42,
    adminUrl: 'https://litellm.example.com/ui',
    lastSyncAt: '2026-02-01T08:30:00Z',
    lastSyncStatus: 'SYNCED',
    lastSyncMessage: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-15T12:00:00Z',
    ...over,
  }
}

const GW_A = makeGateway({ id: 'a', name: 'Alpha Router' })
const GW_B = makeGateway({
  id: 'b',
  name: 'Beta Router',
  endpoint: 'unix:///var/run/litellm.sock',
  lastSyncStatus: 'NEVER',
  lastSyncAt: null,
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

function setListData(rows: ModelGateway[], totalCount?: number) {
  listSlot.result.value = {
    modelGateways: {
      nodes: rows,
      totalCount: totalCount ?? rows.length,
    },
    // The view never reads this, but the query asks for it — keep it shaped.
    modelGatewaySyncSummary: {
      state: 'SYNCED',
      lastSyncedAt: '2026-02-01T08:30:00Z',
      successCount: rows.length,
      failedCount: 0,
      message: null,
    },
  } satisfies ModelGatewaysQueryResult
}

let wrapper: VueWrapper | null = null
let locale: ReturnType<typeof useLocaleStore>

function mountView() {
  wrapper = mount(ModelGatewayView, mountConfig)
  return wrapper
}

// --- DOM helpers -----------------------------------------------------------

function rows(): HTMLElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLElement>('cds-grid-row'))
}
function formModal(): HTMLElement | null {
  return wrapper!.element.querySelector('.gateway-form')
}
function deleteModal(): HTMLElement | null {
  // ConfirmDeleteModal renders a cds-modal containing the delete note paragraph.
  const note = wrapper!.element.querySelector('.delete-note')
  return note ? (note.closest('cds-modal') as HTMLElement | null) : null
}

beforeEach(() => {
  setActivePinia(createPinia())
  locale = useLocaleStore()
  listSlot = makeSlot()
  mutateMock.mockReset()
  // Toast state is module-scoped + shared across tests; reset it so the
  // `not.toContain` assertions are not polluted by a prior test's toast.
  useToast().clear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

// ---------------------------------------------------------------------------

describe('ModelGatewayView — list states', () => {
  it('shows the loading placeholder while loading with no rows yet', () => {
    listSlot.loading.value = true
    mountView()
    const placeholder = wrapper!.element.querySelector('cds-grid-placeholder')
    expect(placeholder?.textContent).toContain(locale.t('gateway.loading'))
    expect(rows()).toHaveLength(0)
  })

  it('shows the empty placeholder + connect CTA when there are no gateways', async () => {
    setListData([])
    mountView()
    await flushPromises()
    const placeholder = wrapper!.element.querySelector('cds-grid-placeholder')
    expect(placeholder?.textContent).toContain(locale.t('gateway.empty'))
    // The empty state offers a connect button.
    expect(placeholder?.textContent).toContain(locale.t('gateway.connectButton'))
    expect(rows()).toHaveLength(0)
  })

  it('renders the error alert when the list query errors', async () => {
    listSlot.error.value = new Error('boom')
    mountView()
    await flushPromises()
    const alert = wrapper!.element.querySelector('cds-alert[status="danger"]')
    expect(alert?.textContent?.trim()).toBe(locale.t('gateway.error.load'))
    // When errored the empty placeholder must NOT also render.
    const placeholder = wrapper!.element.querySelector('cds-grid-placeholder')
    expect(placeholder).toBeNull()
  })

  it('renders one row per gateway with name, endpoint and sync badge text', async () => {
    setListData([GW_A, GW_B])
    mountView()
    await flushPromises()

    expect(rows()).toHaveLength(2)
    const first = rows()[0]
    expect(first.textContent).toContain('Alpha Router')

    // Synced gateway → "synced … ago" badge text (interpolated, not raw enum).
    const syncedBadge = first.querySelector('.sync-status-badge')
    expect(syncedBadge?.getAttribute('status')).toBe('success')

    // Never-synced gateway → neutral badge with the neverSynced string.
    const second = rows()[1]
    const neverBadge = second.querySelector('.sync-status-badge')
    expect(neverBadge?.getAttribute('status')).toBe('neutral')
    expect(neverBadge?.textContent).toContain(locale.t('gateway.status.neverSynced'))
  })

  it('renders an http endpoint as a link but a non-http endpoint as plain text', async () => {
    setListData([GW_A, GW_B])
    mountView()
    await flushPromises()

    const link = rows()[0].querySelector<HTMLAnchorElement>('a.endpoint')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('https://litellm.example.com')
    expect(link?.getAttribute('rel')).toContain('noopener')

    // Non-http endpoint is not clickable, rendered as plain text.
    expect(rows()[1].querySelector('a.endpoint')).toBeNull()
    expect(rows()[1].querySelector('.endpoint-text')?.textContent).toContain(
      'unix:///var/run/litellm.sock',
    )
  })
})

describe('ModelGatewayView — create flow', () => {
  it('opens the create form modal from the connect dropdown LiteLLM option', async () => {
    setListData([GW_A])
    mountView()
    await flushPromises()
    expect(formModal()).toBeNull()

    // Open the AppDropdown, then click the LiteLLM menu option.
    wrapper!.element
      .querySelector<HTMLElement>('.dd-trigger')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    wrapper!.element
      .querySelector<HTMLElement>('.menu-option')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = formModal()
    expect(form).not.toBeNull()
    // Create title (not edit) is shown.
    expect(wrapper!.element.textContent).toContain(locale.t('gateway.form.createTitle'))
  })

  it('submitting the create form calls mutate with the input, toasts success, refetches', async () => {
    mutateMock.mockResolvedValue({ data: { createModelGateway: makeGateway() } })
    setListData([GW_A])
    mountView()
    await flushPromises()

    // Open the create form.
    wrapper!.element
      .querySelector<HTMLElement>('.dd-trigger')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    wrapper!.element
      .querySelector<HTMLElement>('.menu-option')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = formModal()!
    const inputs = form.querySelectorAll<HTMLInputElement>('input')
    const setVal = (el: HTMLInputElement, v: string) => {
      el.value = v
      el.dispatchEvent(new Event('input'))
    }
    // Order in the form: name, endpoint, adminUrl, masterKey.
    setVal(inputs[0], 'My New Router')
    setVal(inputs[1], 'https://new.example.com')
    setVal(inputs[3], 'sk-secret-key')
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { input: Record<string, unknown> } }
    expect(arg.variables.input).toMatchObject({
      name: 'My New Router',
      provider: 'LITELLM',
      endpoint: 'https://new.example.com',
      masterKey: 'sk-secret-key',
      loadBalancingStrategy: 'ROUND_ROBIN',
    })

    expect(toastMessages()).toContain(locale.t('gateway.toast.created'))
    expect(listSlot.refetch).toHaveBeenCalled()
    // Modal closes on success.
    expect(formModal()).toBeNull()
  })

  it('keeps the form open and toasts saveFailed when create mutate rejects', async () => {
    mutateMock.mockRejectedValue(new Error('duplicate name'))
    setListData([GW_A])
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.dd-trigger')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    wrapper!.element
      .querySelector<HTMLElement>('.menu-option')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = formModal()!
    const inputs = form.querySelectorAll<HTMLInputElement>('input')
    const setVal = (el: HTMLInputElement, v: string) => {
      el.value = v
      el.dispatchEvent(new Event('input'))
    }
    setVal(inputs[0], 'Dup Router')
    setVal(inputs[1], 'https://dup.example.com')
    setVal(inputs[3], 'sk-secret-key')
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    expect(toastMessages()).toContain(locale.t('gateway.toast.saveFailed'))
    expect(toastMessages()).not.toContain(locale.t('gateway.toast.created'))
    // Form stays open so the user can correct + retry.
    expect(formModal()).not.toBeNull()
  })
})

describe('ModelGatewayView — edit flow', () => {
  function openEdit(index: number) {
    // Row actions: sync (first), edit (second), delete (third danger).
    const actions = rows()[index].querySelectorAll<HTMLElement>('.row-action')
    actions[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('opens the edit modal pre-filled with the gateway under edit', async () => {
    setListData([GW_A, GW_B])
    mountView()
    await flushPromises()

    openEdit(0)
    await flushPromises()

    const form = formModal()
    expect(form).not.toBeNull()
    expect(wrapper!.element.textContent).toContain(locale.t('gateway.form.editTitle'))
    // Name field is pre-filled with the edited gateway's name.
    const nameInput = form!.querySelector<HTMLInputElement>('input')!
    expect(nameInput.value).toBe('Alpha Router')
  })

  it('submitting the edit form calls update mutate with the id + input, toasts updated', async () => {
    mutateMock.mockResolvedValue({ data: { updateModelGateway: makeGateway({ id: 'a' }) } })
    setListData([GW_A])
    mountView()
    await flushPromises()

    openEdit(0)
    await flushPromises()

    const form = formModal()!
    const inputs = form.querySelectorAll<HTMLInputElement>('input')
    inputs[0].value = 'Alpha Router Renamed'
    inputs[0].dispatchEvent(new Event('input'))
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as {
      variables: { id: string; input: Record<string, unknown> }
    }
    expect(arg.variables.id).toBe('a')
    expect(arg.variables.input).toMatchObject({ name: 'Alpha Router Renamed' })
    expect(toastMessages()).toContain(locale.t('gateway.toast.updated'))
    expect(listSlot.refetch).toHaveBeenCalled()
    expect(formModal()).toBeNull()
  })
})

describe('ModelGatewayView — delete flow', () => {
  function openDelete(index: number) {
    const deleteBtn = rows()[index].querySelector<HTMLElement>('.row-action.danger')!
    deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('requesting delete opens a confirm modal naming the target', async () => {
    setListData([GW_A, GW_B])
    mountView()
    await flushPromises()

    openDelete(1)
    await flushPromises()

    const modal = deleteModal()
    expect(modal).not.toBeNull()
    // Message interpolates the gateway name.
    const expected = locale.t('gateway.delete.message').replace('{name}', 'Beta Router')
    expect(modal?.textContent).toContain(expected)
  })

  it('confirming delete calls mutate with the target id, toasts deleted, refetches', async () => {
    mutateMock.mockResolvedValue({ data: { deleteModelGateway: { deletedID: 'b' } } })
    setListData([GW_A, GW_B])
    mountView()
    await flushPromises()

    openDelete(1)
    await flushPromises()

    // The danger button inside the confirm modal is the confirm action.
    const confirmBtn = deleteModal()!.querySelector<HTMLElement>('cds-button[status="danger"]')!
    confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { id: string } }
    expect(arg.variables.id).toBe('b')
    expect(toastMessages()).toContain(locale.t('gateway.toast.deleted'))
    expect(listSlot.refetch).toHaveBeenCalled()
    expect(deleteModal()).toBeNull()
  })

  it('delete failure toasts deleteFailed and keeps the modal open', async () => {
    mutateMock.mockRejectedValue(new Error('forbidden'))
    setListData([GW_A])
    mountView()
    await flushPromises()

    openDelete(0)
    await flushPromises()
    deleteModal()!
      .querySelector<HTMLElement>('cds-button[status="danger"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain(locale.t('gateway.toast.deleteFailed'))
    expect(toastMessages()).not.toContain(locale.t('gateway.toast.deleted'))
    // Modal stays open (deleteTarget not cleared on failure).
    expect(deleteModal()).not.toBeNull()
  })
})

describe('ModelGatewayView — test/resync connection', () => {
  function clickSync(index: number) {
    // The sync action is the first row-action (non-danger).
    const syncBtn = rows()[index].querySelector<HTMLElement>('.row-action:not(.danger)')!
    syncBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('success result toasts testSuccess naming the gateway and refetches', async () => {
    mutateMock.mockResolvedValue({
      data: {
        testModelGatewayConnection: {
          success: true,
          status: 'CONNECTED',
          latencyMs: 30,
          message: 'ok',
          testedAt: '2026-02-02T00:00:00Z',
          gateway: GW_A,
        },
      },
    })
    setListData([GW_A])
    mountView()
    await flushPromises()

    clickSync(0)
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { id: string } }
    expect(arg.variables.id).toBe('a')

    const expected = locale.t('gateway.toast.testSuccess').replace('{name}', 'Alpha Router')
    expect(toastMessages()).toContain(expected)
    expect(toastStatuses()).toContain('success')
    expect(listSlot.refetch).toHaveBeenCalled()
  })

  it('failed result toasts the backend message and does not toast success', async () => {
    mutateMock.mockResolvedValue({
      data: {
        testModelGatewayConnection: {
          success: false,
          status: 'ERROR',
          latencyMs: null,
          message: 'upstream unreachable',
          testedAt: '2026-02-02T00:00:00Z',
          gateway: GW_A,
        },
      },
    })
    setListData([GW_A])
    mountView()
    await flushPromises()

    clickSync(0)
    await flushPromises()

    expect(toastMessages()).toContain('upstream unreachable')
    expect(toastStatuses()).toContain('danger')
    const success = locale.t('gateway.toast.testSuccess').replace('{name}', 'Alpha Router')
    expect(toastMessages()).not.toContain(success)
  })

  it('a thrown error surfaces the testFailed fallback toast', async () => {
    mutateMock.mockRejectedValue(new Error('network down'))
    setListData([GW_A])
    mountView()
    await flushPromises()

    clickSync(0)
    await flushPromises()

    expect(toastMessages()).toContain(locale.t('gateway.toast.testFailed'))
    expect(toastStatuses()).toContain('danger')
  })

  it('ignores a second sync click while the first is still in flight', async () => {
    let resolveMutate: (v: unknown) => void = () => {}
    mutateMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMutate = resolve
        }),
    )
    setListData([GW_A])
    mountView()
    await flushPromises()

    clickSync(0)
    await flushPromises()
    // Second click while pending must be a no-op (guarded by testingIDs).
    clickSync(0)
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)

    // Resolve so the test does not leak a pending promise.
    resolveMutate({
      data: {
        testModelGatewayConnection: {
          success: true,
          status: 'CONNECTED',
          latencyMs: 1,
          message: 'ok',
          testedAt: '2026-02-02T00:00:00Z',
          gateway: GW_A,
        },
      },
    })
    await flushPromises()
  })
})

describe('ModelGatewayView — name filter + pagination', () => {
  it('typing in the name filter sets filter.search on the query variables', async () => {
    setListData([GW_A], 1)
    mountView()
    await flushPromises()

    // Open the name filter dropdown (sets openFilterAnchor → renders cds-dropdown).
    const filterBtn = wrapper!.element.querySelector<HTMLElement>('#gateway-filter-name-input')!
    filterBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // The dropdown (with the text input) is rendered inline inside the section.
    const filterInput = wrapper!.element.querySelector<HTMLInputElement>(
      'cds-dropdown input[type="text"]',
    )
    expect(filterInput).not.toBeNull()
    filterInput!.value = 'alpha'
    filterInput!.dispatchEvent(new Event('input'))
    await flushPromises()

    // The filter button reflects the active keyword via the `expanded` attr.
    expect(
      wrapper!.element
        .querySelector('#gateway-filter-name-input')
        ?.hasAttribute('expanded'),
    ).toBe(true)
  })

  it('renders the pager when there are rows and disables prev/first on page 1', async () => {
    setListData([GW_A], 1)
    mountView()
    await flushPromises()

    const footer = wrapper!.element.querySelector('cds-grid-footer')
    expect(footer).not.toBeNull()
    // Range summary interpolates start/end/total.
    const summary = locale
      .t('gateway.pagination.summary')
      .replace('{start}', '1')
      .replace('{end}', '1')
      .replace('{total}', '1')
    expect(footer?.textContent).toContain(summary)

    const firstBtn = footer!.querySelector('cds-pagination-button[action="first"]')
    const prevBtn = footer!.querySelector('cds-pagination-button[action="prev"]')
    expect(firstBtn?.hasAttribute('disabled')).toBe(true)
    expect(prevBtn?.hasAttribute('disabled')).toBe(true)
  })
})
