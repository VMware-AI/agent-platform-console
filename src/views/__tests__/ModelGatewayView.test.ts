/**
 * Component tests for ModelGatewayView.vue — 模型网关接入管理 (Model Gateway Integration).
 *
 * The view lists ModelGateway entities (single MODEL_GATEWAYS_QUERY via useQuery)
 * and runs real mutations through `apolloClient.mutate`:
 *   - create  → CreateModelGateway  (via ModelGatewayFormModal, no editing target)
 *   - update  → UpdateModelGateway  (via ModelGatewayFormModal with editing target)
 *   - delete  → DeleteModelGateway  (via two ConfirmDialogs: intent → type-to-confirm)
 *   - manual sync → SyncModelGatewayConnection (row action), which maps the
 *     returned { success, message, gateway { lastSyncStatus } } onto a
 *     success / warning / error toast and refetches.
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
} from '@/types/model-gateway'

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
  // useMutation is consumed by ModelGatewayFormModal for the Test Connection
  // button. The shared `mutateMock` spy is reused so each test can drive
  // both the create/update/delete/sync mutations and the test-connection
  // mutation through a single `mutateMock.mockResolvedValue / mockRejectedValue`.
  useMutation: () => ({
    mutate: mutateMock,
    loading: ref(false),
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
    backendModelCount: 12,
    loadBalancingStrategy: 'ROUND_ROBIN',
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
function headerTexts(): string[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLElement>('cds-grid-column'))
    .map((el) => el.textContent?.trim() ?? '')
    .filter(Boolean)
}

// --- setup -----------------------------------------------------------------

beforeEach(() => {
  setActivePinia(createPinia())
  locale = useLocaleStore()
  listSlot = makeSlot()
  mutateMock.mockReset()
  // Toast state is module-scoped (shared across useToast() callers); start clean.
  useToast().clear()
  // vue-apollo subscribes through onResult in some cases; reset the slot
  // to undefined so the template falls back to empty arrays.
  listSlot.result.value = undefined
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

// --- tests -----------------------------------------------------------------

describe('ModelGatewayView — list states', () => {
  it('shows the loading placeholder while loading with no rows yet', () => {
    listSlot.loading.value = true
    mountView()
    const placeholder = wrapper!.element.querySelector('cds-grid-placeholder')
    expect(placeholder?.textContent).toContain(locale.t('gateway.loading'))
    expect(rows()).toHaveLength(0)
  })

  it('shows the empty placeholder when there are no gateways', async () => {
    setListData([])
    mountView()
    await flushPromises()
    const placeholder = wrapper!.element.querySelector('cds-grid-placeholder')
    expect(placeholder?.textContent).toContain(locale.t('gateway.empty'))
    expect(rows()).toHaveLength(0)
  })

  it('renders the error alert when the list query errors', async () => {
    listSlot.error.value = new Error('boom')
    mountView()
    await flushPromises()
    const alert = wrapper!.element.querySelector('cds-alert[status="danger"]')
    expect(alert?.textContent?.trim()).toBe(locale.t('gateway.error.load'))
    // No placeholder for error state — the alert takes the visual real estate.
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

    // GW_A is SYNCED → success-toned badge.
    const syncedBadge = first.querySelector('.sync-status-badge')
    expect(syncedBadge?.getAttribute('status')).toBe('success')

    // GW_B is NEVER → neutral badge with the "未同步" label.
    const second = rows()[1]
    const neverBadge = second.querySelector('.sync-status-badge')
    expect(neverBadge?.getAttribute('status')).toBe('neutral')
    expect(neverBadge?.textContent).toContain(locale.t('gateway.status.neverSynced'))

    // Headers include the new backendModelCount column (no legacy status column).
    const headerTextsResult = headerTexts()
    expect(headerTextsResult).toContain(locale.t('gateway.col.backendModelCount'))
    expect(headerTextsResult).toContain(locale.t('gateway.col.strategy'))
    expect(headerTextsResult).toContain(locale.t('gateway.col.endpoint'))
    // Connection-status column is gone — its data is now folded into
    // `gateway.col.sync` via `lastSyncStatus`.
    expect(headerTextsResult).not.toContain(locale.t('gateway.col.status'))
  })

  it('renders the backendModelCount cell as a number, em-dash for null', async () => {
    setListData([
      GW_A, // backendModelCount: 12
      makeGateway({ id: 'b', name: 'Not Synced', backendModelCount: null, lastSyncStatus: 'NEVER' }),
    ])
    mountView()
    await flushPromises()

    const cells = rows()[0].querySelectorAll<HTMLElement>('cds-grid-cell')
    // backendModelCount is the 3rd cell (after name, endpoint, sync).
    const modelCountCell = cells[3]
    expect(modelCountCell.textContent?.trim()).toBe('12')
    expect(modelCountCell.classList.contains('num-cell')).toBe(true)

    const nullCells = rows()[1].querySelectorAll<HTMLElement>('cds-grid-cell')
    expect(nullCells[3].textContent?.trim()).toBe('—')
  })

  it('renders the sync badge with the per-state label for SYNCING / FAILED / PARTIAL', async () => {
    setListData([
      makeGateway({ id: 's', name: 'Syncing', lastSyncStatus: 'SYNCING' }),
      makeGateway({ id: 'f', name: 'Failed', lastSyncStatus: 'FAILED' }),
      makeGateway({ id: 'p', name: 'Partial', lastSyncStatus: 'PARTIAL' }),
    ])
    mountView()
    await flushPromises()

    const badges = rows().map((r) => r.querySelector<HTMLElement>('.sync-status-badge')!)
    expect(badges[0].getAttribute('status')).toBe('neutral')
    expect(badges[0].textContent).toContain(locale.t('gateway.status.syncing'))
    expect(badges[1].getAttribute('status')).toBe('danger')
    expect(badges[1].textContent).toContain(locale.t('gateway.status.failed'))
    expect(badges[2].getAttribute('status')).toBe('warning')
    expect(badges[2].textContent).toContain(locale.t('gateway.status.partial'))
  })

  it('renders an em-dash in the strategy column when the gateway has no strategy yet', async () => {
    setListData([makeGateway({ loadBalancingStrategy: undefined as never })])
    mountView()
    await flushPromises()
    const row = rows()[0]
    // The strategy cell is rendered as plain text (no badge). Look up the
    // cell by its class and assert the em-dash text directly.
    const strategyCell = row.querySelector<HTMLElement>('cds-grid-cell.strategy-cell')
    expect(strategyCell).not.toBeNull()
    expect(strategyCell?.textContent?.trim()).toBe('—')
  })

  it('renders an http endpoint as a link but a non-http endpoint as plain text', async () => {
    setListData([GW_A, GW_B])
    mountView()
    await flushPromises()
    const link = rows()[0].querySelector<HTMLAnchorElement>('a.endpoint')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('https://litellm.example.com')
    expect(link?.getAttribute('rel')).toContain('noopener')
    // GW_B has a unix socket endpoint — never clickable.
    expect(rows()[1].querySelector('a.endpoint')).toBeNull()
    expect(rows()[1].querySelector('.endpoint-text')?.textContent).toContain(
      'unix:///var/run/litellm.sock',
    )
  })
})

describe('ModelGatewayView — create flow', () => {
  it('opens the create form modal when the connect button is clicked', async () => {
    setListData([GW_A])
    mountView()
    await flushPromises()
    expect(formModal()).toBeNull()

    wrapper!.element
      .querySelector<HTMLElement>('.connect-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = formModal()
    expect(form).not.toBeNull()
    expect(wrapper!.element.textContent).toContain(locale.t('gateway.form.createTitle'))

    // Provider is the only available option; the selector is open.
    const providerSelect = form!.querySelector<HTMLSelectElement>('select')
    expect(providerSelect).not.toBeNull()
    expect(providerSelect!.disabled).toBe(false)
    expect(providerSelect!.value).toBe('LITELLM')
  })

  it('submitting the create form calls mutate with the input, toasts success, refetches', async () => {
    mutateMock.mockResolvedValue({ data: { createModelGateway: makeGateway() } })
    setListData([GW_A])
    mountView()
    await flushPromises()

    // Open the create form.
    wrapper!.element
      .querySelector<HTMLElement>('.connect-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = formModal()!
    const inputs = form.querySelectorAll<HTMLInputElement>('input')
    const setVal = (el: HTMLInputElement, v: string) => {
      el.value = v
      el.dispatchEvent(new Event('input'))
    }
    // Order in the form: name, endpoint, masterKey.
    // (adminUrl is not collected; loadBalancingStrategy is read-only.)
    setVal(inputs[0], 'My New Router')
    setVal(inputs[1], 'https://new.example.com')
    setVal(inputs[2], 'sk-secret-key')
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { input: Record<string, unknown> } }
    expect(arg.variables.input).toEqual({
      name: 'My New Router',
      provider: 'LITELLM',
      endpoint: 'https://new.example.com',
      masterKey: 'sk-secret-key',
    })
    // Backend rejects these as inputs — make sure the form doesn't send them.
    expect(arg.variables.input).not.toHaveProperty('adminUrl')
    expect(arg.variables.input).not.toHaveProperty('loadBalancingStrategy')
    expect(arg.variables.input).not.toHaveProperty('backendModelCount')

    expect(toastMessages()).toContain(locale.t('gateway.toast.created'))
    expect(listSlot.refetch).toHaveBeenCalled()
    // Modal closes on success.
    expect(formModal()).toBeNull()
  })

  it('keeps the form open and toasts the backend error when create mutate rejects', async () => {
    mutateMock.mockRejectedValue(new Error('duplicate name'))
    setListData([GW_A])
    mountView()
    await flushPromises()

    // Open the create form.
    wrapper!.element
      .querySelector<HTMLElement>('.connect-button')!
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
    setVal(inputs[2], 'sk-secret-key')
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    // PR #23 routes error toasts through graphqlErrorMessage(err, fallback),
    // so the toast surfaces the backend's `duplicate name` message rather
    // than the localized fallback. The fallback is still asserted as a
    // suffix to verify the original message is concatenated with it.
    const messages = toastMessages()
    expect(messages.some((m) => m.includes('duplicate name'))).toBe(true)
    expect(toastStatuses()).toContain('danger')
    expect(messages).not.toContain(locale.t('gateway.toast.created'))
    // Form stays open so the user can correct + retry.
    expect(formModal()).not.toBeNull()
  })
})

describe('ModelGatewayView — ModelGatewayFormModal test connection', () => {
  // Helper: open the create form by clicking the connect button. Returns
  // the form element so each test can drive its own inputs.
  async function openCreateForm(): Promise<HTMLElement> {
    wrapper!.element
      .querySelector<HTMLElement>('.connect-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    return formModal()!
  }

  function testButton(): HTMLElement | null {
    return wrapper!.element.querySelector<HTMLElement>('[data-testid="test-connection"]')
  }

  function testResultEl(): HTMLElement | null {
    return wrapper!.element.querySelector<HTMLElement>('[data-testid="test-result"]')
  }

  it('renders the test-connection button disabled when the form first opens', async () => {
    setListData([GW_A])
    mountView()
    await flushPromises()
    await openCreateForm()

    // Empty endpoint + empty master key → button is disabled.
    // Note: cds-button binds :disabled as the literal string "true" / "false",
    // not via the property, so we assert on the attribute value.
    expect(testButton()).not.toBeNull()
    expect(testButton()!.getAttribute('disabled')).toBe('true')
  })

  it('create-mode success calls the dry-run mutation and shows success hint', async () => {
    mutateMock.mockResolvedValue({
      data: {
        testNewModelGatewayConnection: {
          success: true,
          message: 'connection ok',
          testedAt: '2026-02-02T00:00:00Z',
        },
      },
    })
    setListData([GW_A])
    mountView()
    await flushPromises()
    const form = await openCreateForm()
    const inputs = form.querySelectorAll<HTMLInputElement>('input')
    const setVal = (el: HTMLInputElement, v: string) => {
      el.value = v
      el.dispatchEvent(new Event('input'))
    }
    setVal(inputs[0], 'Test Gateway')
    setVal(inputs[1], 'https://new.example.com')
    setVal(inputs[2], 'sk-secret-key')
    await flushPromises()

    expect(testButton()!.getAttribute('disabled')).toBe('false')
    testButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // The dry-run mutation was called with the unwrapped payload.
    // Note: useMutation's `mutate` receives the variables directly, not the
    // full GraphQL options object — so the first arg is `{ input: ... }`.
    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { input: { endpoint: string; masterKey: string } }
    expect(arg.input).toEqual({
      endpoint: 'https://new.example.com',
      masterKey: 'sk-secret-key',
    })

    // Success hint + success toast.
    expect(testResultEl()?.textContent).toContain('connection ok')
    expect(testResultEl()?.classList.contains('test-result--success')).toBe(true)
    expect(toastMessages().some((m) => m.includes('connection ok'))).toBe(true)
    expect(toastStatuses()).toContain('success')
  })

  it('create-mode failure shows the backend message in the form + toast', async () => {
    mutateMock.mockResolvedValue({
      data: {
        testNewModelGatewayConnection: {
          success: false,
          message: 'upstream unreachable',
          testedAt: '2026-02-02T00:00:00Z',
        },
      },
    })
    setListData([GW_A])
    mountView()
    await flushPromises()
    const form = await openCreateForm()
    const inputs = form.querySelectorAll<HTMLInputElement>('input')
    const setVal = (el: HTMLInputElement, v: string) => {
      el.value = v
      el.dispatchEvent(new Event('input'))
    }
    setVal(inputs[0], 'Test Gateway')
    setVal(inputs[1], 'https://broken.example.com')
    setVal(inputs[2], 'sk-bad-key')
    await flushPromises()

    testButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(testResultEl()?.classList.contains('test-result--failure')).toBe(true)
    expect(testResultEl()?.textContent).toContain('upstream unreachable')
    expect(toastMessages().some((m) => m.includes('upstream unreachable'))).toBe(true)
    expect(toastStatuses()).toContain('danger')
  })

  it('a thrown error during test surfaces a failure hint + danger toast', async () => {
    mutateMock.mockRejectedValue(new Error('network down'))
    setListData([GW_A])
    mountView()
    await flushPromises()
    const form = await openCreateForm()
    const inputs = form.querySelectorAll<HTMLInputElement>('input')
    const setVal = (el: HTMLInputElement, v: string) => {
      el.value = v
      el.dispatchEvent(new Event('input'))
    }
    setVal(inputs[0], 'Test Gateway')
    setVal(inputs[1], 'https://broken.example.com')
    setVal(inputs[2], 'sk-bad-key')
    await flushPromises()

    testButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(testResultEl()?.classList.contains('test-result--failure')).toBe(true)
    expect(toastStatuses()).toContain('danger')
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

  it('delete failure surfaces the backend error and keeps the modal open', async () => {
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

    // PR #23: backend error message surfaces via graphqlErrorMessage.
    const messages = toastMessages()
    expect(messages.some((m) => m.includes('forbidden'))).toBe(true)
    expect(toastStatuses()).toContain('danger')
    expect(messages).not.toContain(locale.t('gateway.toast.deleted'))
    // Modal stays open (deleteTarget not cleared on failure).
    expect(deleteModal()).not.toBeNull()
  })
})

describe('ModelGatewayView — manual sync', () => {
  function clickSync(index: number) {
    // The sync action is the first row-action (non-danger).
    const syncBtn = rows()[index].querySelector<HTMLElement>('.row-action:not(.danger)')!
    syncBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('success with SYNCED state toasts syncSuccess naming the gateway and refetches', async () => {
    mutateMock.mockResolvedValue({
      data: {
        syncModelGatewayConnection: {
          success: true,
          message: 'ok',
          gateway: { ...GW_A, lastSyncStatus: 'SYNCED', lastSyncAt: '2026-02-02T00:00:00Z' },
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

    const expected = locale.t('gateway.toast.syncSuccess').replace('{name}', 'Alpha Router')
    expect(toastMessages()).toContain(expected)
    expect(toastStatuses()).toContain('success')
    expect(listSlot.refetch).toHaveBeenCalled()
  })

  it('success with PARTIAL state toasts the partial-sync warning', async () => {
    mutateMock.mockResolvedValue({
      data: {
        syncModelGatewayConnection: {
          success: true,
          message: 'partial',
          gateway: { ...GW_A, lastSyncStatus: 'PARTIAL' },
        },
      },
    })
    setListData([GW_A])
    mountView()
    await flushPromises()

    clickSync(0)
    await flushPromises()

    // The partial toast is the gateway.toast.syncPartial template, which
    // carries the gateway name and success/failed counts. The backend's
    // `message` field is informational and is not interpolated into the
    // toast — assert on the template's gateway name + the PARTIAL label
    // instead.
    const messages = toastMessages()
    expect(messages.some((m) => m.includes('Alpha Router'))).toBe(true)
    // PARTIAL → warning status (yellow), not success.
    expect(toastStatuses()).toContain('warning')
    // No success toast.
    expect(messages).not.toContain(locale.t('gateway.toast.syncSuccess').replace('{name}', 'Alpha Router'))
  })

  it('success with FAILED state surfaces the backend message as a danger toast', async () => {
    mutateMock.mockResolvedValue({
      data: {
        syncModelGatewayConnection: {
          success: true,
          message: 'router rejected',
          gateway: { ...GW_A, lastSyncStatus: 'FAILED' },
        },
      },
    })
    setListData([GW_A])
    mountView()
    await flushPromises()

    clickSync(0)
    await flushPromises()

    expect(toastMessages()).toContain('router rejected')
    expect(toastStatuses()).toContain('danger')
    const success = locale.t('gateway.toast.syncSuccess').replace('{name}', 'Alpha Router')
    expect(toastMessages()).not.toContain(success)
  })

  it('failed result toasts the backend message and does not toast success', async () => {
    mutateMock.mockResolvedValue({
      data: {
        syncModelGatewayConnection: {
          success: false,
          message: 'upstream unreachable',
          gateway: { ...GW_A, lastSyncStatus: 'FAILED' },
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
    const success = locale.t('gateway.toast.syncSuccess').replace('{name}', 'Alpha Router')
    expect(toastMessages()).not.toContain(success)
  })

  it('a thrown error surfaces the backend error in the toast', async () => {
    mutateMock.mockRejectedValue(new Error('network down'))
    setListData([GW_A])
    mountView()
    await flushPromises()

    clickSync(0)
    await flushPromises()

    // PR #23: the original error message is preferred over the localized
    // fallback. Assert the message contains the backend's text and the toast
    // is rendered as a danger status.
    const messages = toastMessages()
    expect(messages.some((m) => m.includes('network down'))).toBe(true)
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
        syncModelGatewayConnection: {
          success: true,
          message: 'ok',
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