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
    loadBalancingStrategy: 'SIMPLE_SHUFFLE',
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

  it('renders the backendModelCount cell as a number, zero for never-synced', async () => {
    setListData([
      GW_A, // backendModelCount: 12
      // Before the first sync the DB column is NULL; the backend's
      // `toModelGateway` projects it as `0` so the frontend never sees
      // a nullable value here.
      makeGateway({ id: 'b', name: 'Not Synced', backendModelCount: 0, lastSyncStatus: 'NEVER' }),
    ])
    mountView()
    await flushPromises()

    const cells = rows()[0].querySelectorAll<HTMLElement>('cds-grid-cell')
    // backendModelCount is the 3rd cell (after name, endpoint, sync).
    const modelCountCell = cells[3]
    expect(modelCountCell.textContent?.trim()).toBe('12')
    expect(modelCountCell.classList.contains('num-cell')).toBe(true)

    const neverSyncedCells = rows()[1].querySelectorAll<HTMLElement>('cds-grid-cell')
    expect(neverSyncedCells[3].textContent?.trim()).toBe('0')
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
    // Backend `loadBalancingStrategy` is nullable until the first sync
    // populates the column from /config/router.
    setListData([makeGateway({ loadBalancingStrategy: null })])
    mountView()
    await flushPromises()
    const row = rows()[0]
    // The strategy cell is rendered as plain text (no badge). Look up the
    // cell by its class and assert the em-dash text directly.
    const strategyCell = row.querySelector<HTMLElement>('cds-grid-cell.strategy-cell')
    expect(strategyCell).not.toBeNull()
    expect(strategyCell?.textContent?.trim()).toBe('—')
  })

  it('maps each LoadBalancingStrategy enum value to its localized label', async () => {
    const cases: { strategy: 'SIMPLE_SHUFFLE' | 'LEAST_BUSY' | 'LATENCY_BASED_ROUTING' | 'USAGE_BASED_ROUTING_V2' | 'COST_BASED_ROUTING'; key: string }[] = [
      { strategy: 'SIMPLE_SHUFFLE',         key: 'gateway.strategy.simpleShuffle' },
      { strategy: 'LEAST_BUSY',             key: 'gateway.strategy.leastBusy' },
      { strategy: 'LATENCY_BASED_ROUTING',  key: 'gateway.strategy.latencyBasedRouting' },
      { strategy: 'USAGE_BASED_ROUTING_V2', key: 'gateway.strategy.usageBasedRoutingV2' },
      { strategy: 'COST_BASED_ROUTING',     key: 'gateway.strategy.costBasedRouting' },
    ]
    setListData(cases.map((c, i) =>
      makeGateway({ id: `g-${i}`, name: `gw-${c.strategy}`, loadBalancingStrategy: c.strategy }),
    ))
    mountView()
    await flushPromises()
    const renderedRows = rows()
    cases.forEach((c, i) => {
      expect(renderedRows[i].querySelector<HTMLElement>('cds-grid-cell.strategy-cell')?.textContent?.trim())
        .toBe(locale.t(c.key))
    })
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

describe('ModelGatewayView — delete flow (two-step)', () => {
  /* `ConfirmDialog` teleports its markup to <body>. The two dialogs share
     the same `.confirm-backdrop` selector and use a Vue `<Transition>`,
     so at any moment only one backdrop is in the DOM — the one whose
     `open` prop is true. Helpers below grab whichever backdrop is
     currently visible. The two dialogs are distinguished by their title:
       step 1 — `gateway.delete.title` ("删除模型网关接入")
       step 2 — `gateway.delete.confirm.title` ("再次确认删除") */
  function openDelete(index: number) {
    const deleteBtn = rows()[index].querySelector<HTMLElement>('.row-action.danger')!
    deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  function currentDialog(): HTMLElement | null {
    return document.body.querySelector<HTMLElement>('.confirm-backdrop')
  }

  function confirmButton(): HTMLElement {
    const dialog = currentDialog()
    if (!dialog) throw new Error('no confirm dialog open')
    const btns = dialog.querySelectorAll<HTMLElement>('.confirm-actions cds-button')
    return btns[1]!
  }

  function cancelButton(): HTMLElement {
    const dialog = currentDialog()
    if (!dialog) throw new Error('no confirm dialog open')
    return dialog.querySelector<HTMLElement>('.confirm-actions cds-button')!
  }

  function typeToConfirmInput(): HTMLInputElement {
    const dialog = currentDialog()
    if (!dialog) throw new Error('no confirm dialog open')
    const input = dialog.querySelector<HTMLInputElement>('input[type="text"]')
    if (!input) throw new Error('type-to-confirm input missing — step-2 dialog not open')
    return input
  }

  function isStep2Open(): boolean {
    const dialog = currentDialog()
    if (!dialog) return false
    return dialog.querySelector('input[type="text"]') !== null
  }

  async function setTypeToConfirm(value: string) {
    const input = typeToConfirmInput()
    // Vue's controlled-input binding (`:value="typedInput"`) re-applies the
    // reactive value back to the DOM on every render. Writing the DOM value
    // directly and dispatching `input` would race with that and get reset
    // on the next flush. Using the native setter bypasses Vue's tracking
    // so the input event handler sees the value the test meant to type.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    // Vue updates `typedInput` synchronously, but the re-render that
    // re-applies `:value` to the DOM and recomputes `confirmDisabled`
    // runs on the next microtask. Wait one tick before assertions.
    await flushPromises()
  }

  function isConfirmDisabled(): boolean {
    return confirmButton().getAttribute('disabled') === 'true'
  }

  function clickConfirm() {
    confirmButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  function clickCancel() {
    cancelButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('row delete click opens the intent dialog naming the target', async () => {
    setListData([GW_A, GW_B])
    mountView()
    await flushPromises()

    openDelete(1)
    await flushPromises()

    const dialog = currentDialog()
    expect(dialog).not.toBeNull()
    const expected = locale.t('gateway.delete.message').replace('{name}', 'Beta Router')
    expect(dialog?.textContent).toContain(expected)
    expect(dialog?.querySelector('.confirm-title')?.textContent).toBe(
      locale.t('gateway.delete.title'),
    )
    expect(isStep2Open()).toBe(false)
  })

  it('cancel on the intent dialog closes it without calling the mutation', async () => {
    setListData([GW_A])
    mountView()
    await flushPromises()

    openDelete(0)
    await flushPromises()
    expect(currentDialog()).not.toBeNull()

    clickCancel()
    await flushPromises()

    expect(currentDialog()).toBeNull()
    expect(mutateMock).not.toHaveBeenCalled()
    expect(toastMessages()).toEqual([])
  })

  it('confirming the intent dialog opens the type-to-confirm dialog', async () => {
    setListData([GW_A])
    mountView()
    await flushPromises()

    openDelete(0)
    await flushPromises()
    clickConfirm()
    await flushPromises()

    const dialog = currentDialog()
    expect(dialog).not.toBeNull()
    expect(dialog?.querySelector('.confirm-title')?.textContent).toBe(
      locale.t('gateway.delete.confirm.title'),
    )
    expect(dialog?.querySelector('.confirm-body')?.textContent).toContain('Alpha Router')
    // The gateway name must render as bold inline — not as a literal
    // `{{name}}` placeholder left in the body. (Regression guard.)
    const bold = dialog?.querySelector('.confirm-body strong')
    expect(bold?.textContent).toBe('Alpha Router')
    expect(dialog?.querySelector('.confirm-body')?.textContent).not.toContain('{{name}}')
    expect(isStep2Open()).toBe(true)
    // Confirm button is disabled until the typed name matches.
    expect(isConfirmDisabled()).toBe(true)
  })

  it('step-2 confirm is disabled until the typed name matches the gateway', async () => {
    setListData([GW_A])
    mountView()
    await flushPromises()

    openDelete(0)
    await flushPromises()
    clickConfirm()
    await flushPromises()

    expect(isConfirmDisabled()).toBe(true)

    // Wrong value → still disabled.
    await setTypeToConfirm('alpha-router')   // case-sensitive, target is 'Alpha Router'
    expect(isConfirmDisabled()).toBe(true)

    // Trailing whitespace must be trimmed before matching.
    await setTypeToConfirm('  Alpha Router  ')
    expect(isConfirmDisabled()).toBe(false)
  })

  it('matching the type-to-confirm input fires the delete mutation, toasts success, refetches', async () => {
    mutateMock.mockResolvedValue({ data: { deleteModelGateway: { deletedID: 'a' } } })
    setListData([GW_A])
    mountView()
    await flushPromises()

    openDelete(0)
    await flushPromises()
    clickConfirm()
    await flushPromises()

    await setTypeToConfirm('Alpha Router')
    clickConfirm()
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { id: string } }
    expect(arg.variables.id).toBe('a')
    expect(toastMessages()).toContain(locale.t('gateway.toast.deleted'))
    expect(toastStatuses()).toContain('success')
    expect(listSlot.refetch).toHaveBeenCalled()
    expect(currentDialog()).toBeNull()
  })

  it('mutation failure surfaces the backend error and clears the dialog', async () => {
    mutateMock.mockRejectedValue(new Error('forbidden'))
    setListData([GW_A])
    mountView()
    await flushPromises()

    openDelete(0)
    await flushPromises()
    clickConfirm()
    await flushPromises()
    await setTypeToConfirm('Alpha Router')
    clickConfirm()
    await flushPromises()

    const messages = toastMessages()
    expect(messages.some((m) => m.includes('forbidden'))).toBe(true)
    expect(toastStatuses()).toContain('danger')
    expect(messages).not.toContain(locale.t('gateway.toast.deleted'))
    // The dialog was cleared before the mutation ran.
    expect(currentDialog()).toBeNull()
  })

  it('cancel on the type-to-confirm dialog closes it without calling the mutation', async () => {
    setListData([GW_A])
    mountView()
    await flushPromises()

    openDelete(0)
    await flushPromises()
    clickConfirm()
    await flushPromises()
    expect(currentDialog()).not.toBeNull()

    clickCancel()
    await flushPromises()

    expect(currentDialog()).toBeNull()
    expect(mutateMock).not.toHaveBeenCalled()
    expect(toastMessages()).toEqual([])
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