/**
 * Component tests for SupplierModelView.vue — 供应商模型管理 / rate-limit policies.
 *
 * The view lists raw RateLimitPolicy nodes (rpm/tpm caps) and derives a UI
 * `type` (COMBINED / REQUEST / TOKEN) from which caps are set. It runs real
 * mutations via the shared Apollo client:
 *   - upsert (create/edit) via SupplierModelFormModal (inline cds-modal,
 *     `.policy-form`); the draft `type` is persisted back as rpm/tpm,
 *   - setEnabled (row toggle + batch enable/disable) → SetRateLimitPolicyEnabled,
 *   - delete (single + batch) via ConfirmDialog (teleported → `.confirm-backdrop`).
 *
 * Mocking strategy (mirrors ModelRouteView.test.ts):
 *   - `@vue/apollo-composable`'s `useQuery` is mocked to a single controllable
 *     slot (result/loading/refetch) so every state (loading / empty / data) is
 *     driven deterministically; `refetch` is a spy.
 *   - `@/api/graphql/client`'s `apolloClient.mutate` is a spy resolved / rejected
 *     per test to exercise success + error branches of every mutation.
 *   - real Pinia so `locale.t(...)` resolves real strings; assertions key off the
 *     same `locale.t` keys the component renders, not hard-coded text.
 *   - cds-* are Clarity custom elements; the Vue compiler is told to treat any
 *     `cds-` tag as a custom element. We assert plain DOM + emitted/spy calls.
 *
 * Note: this view surfaces query errors only through refetch/refresh + mutation
 * toasts (it has no inline error alert), so the "error" state is exercised via a
 * failed refresh and failed mutations.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, type Ref } from 'vue'

import type {
  RateLimitPolicyNode,
  RateLimitPoliciesResult,
} from '@/api/graphql/queries/rate-limit-policies'

// --- mocks -----------------------------------------------------------------

interface QuerySlot {
  result: Ref<unknown>
  loading: Ref<boolean>
  error: Ref<unknown>
  refetch: ReturnType<typeof vi.fn>
}

let listSlot: QuerySlot

function makeSlot(): QuerySlot {
  return {
    result: ref<unknown>(undefined),
    loading: ref(false),
    error: ref<unknown>(null),
    refetch: vi.fn().mockResolvedValue(undefined),
  }
}

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

import SupplierModelView from '@/views/SupplierModelView.vue'
import { useLocaleStore } from '@/stores/locale'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

// Toasts live in module-scoped state in useToast; read them via a fresh call.
function toastMessages(): string[] {
  return useToast().toasts.value.map((t) => t.message)
}
function toastStatuses(): string[] {
  return useToast().toasts.value.map((t) => t.status)
}

// --- fixtures --------------------------------------------------------------

function makeNode(over: Partial<RateLimitPolicyNode> = {}): RateLimitPolicyNode {
  return {
    id: 'p-1',
    name: 'Alpha Policy',
    rpm: 1000,
    tpm: 100000,
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

// COMBINED (both caps), enabled.
const POLICY_A = makeNode({ id: 'a', name: 'Alpha Policy', rpm: 1000, tpm: 100000, enabled: true })
// REQUEST only (rpm set, tpm 0), disabled.
const POLICY_B = makeNode({ id: 'b', name: 'Beta Policy', rpm: 500, tpm: 0, enabled: false })
// TOKEN only (tpm set, rpm 0), enabled.
const POLICY_C = makeNode({ id: 'c', name: 'Gamma Policy', rpm: 0, tpm: 50000, enabled: true })

const mountConfig = {
  global: {
    config: {
      compilerOptions: {
        isCustomElement: (tag: string) => tag.startsWith('cds-'),
      },
    },
  },
}

function setListData(rows: RateLimitPolicyNode[]) {
  listSlot.result.value = { rateLimitPolicies: rows } satisfies RateLimitPoliciesResult
}

let wrapper: VueWrapper | null = null
let locale: ReturnType<typeof useLocaleStore>

function mountView() {
  wrapper = mount(SupplierModelView, mountConfig)
  return wrapper
}

// --- DOM helpers -----------------------------------------------------------

function rows(): HTMLElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLElement>('cds-grid-row'))
}
function confirmBackdrop(): HTMLElement | null {
  return document.body.querySelector('.confirm-backdrop')
}
function policyForm(): HTMLElement | null {
  return wrapper!.element.querySelector('.policy-form')
}
function checkboxes(): HTMLInputElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLInputElement>('input.app-checkbox'))
}

beforeEach(() => {
  setActivePinia(createPinia())
  locale = useLocaleStore()
  // Set admin role so v-if="['admin','tenant_admin'].includes(auth.role ?? '')"
  // guards pass and create/edit/delete/toggle buttons are rendered.
  useAuthStore().role = 'admin'
  listSlot = makeSlot()
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

describe('SupplierModelView — list states', () => {
  it('disables the refresh button while loading', () => {
    listSlot.loading.value = true
    mountView()
    const refreshBtn = wrapper!.element.querySelector<HTMLElement>('.refresh-button')!
    expect(refreshBtn.hasAttribute('disabled')).toBe(true)
  })

  it('renders the empty placeholder when there are no policies', async () => {
    setListData([])
    mountView()
    await flushPromises()
    const placeholder = wrapper!.element.querySelector('cds-grid-placeholder')
    expect(placeholder?.textContent).toContain(locale.t('supplier.empty'))
    expect(rows()).toHaveLength(0)
    // Footer (pagination) is hidden when there are no policies.
    expect(wrapper!.element.querySelector('cds-grid-footer')).toBeNull()
  })

  it('renders one row per policy with the localized status badge text', async () => {
    setListData([POLICY_A, POLICY_B])
    mountView()
    await flushPromises()

    expect(rows()).toHaveLength(2)
    const first = rows()[0]
    expect(first.textContent).toContain('Alpha Policy')
    // Enabled policy → enabled status string (localized, not raw boolean).
    expect(first.textContent).toContain(locale.t('supplier.status.enabled'))

    const second = rows()[1]
    expect(second.textContent).toContain('Beta Policy')
    expect(second.textContent).toContain(locale.t('supplier.status.disabled'))
  })

  it('shows the pagination summary reflecting the total count', async () => {
    setListData([POLICY_A, POLICY_B, POLICY_C])
    mountView()
    await flushPromises()

    const expected = locale
      .t('supplier.pagination.summary')
      .replace('{start}', '1')
      .replace('{end}', '3')
      .replace('{total}', '3')
    expect(wrapper!.element.querySelector('.pager-summary')?.textContent).toContain(expected)
  })
})

describe('SupplierModelView — upsert (rpm/tpm ↔ derived type)', () => {
  function openCreate() {
    // First toolbar button is the create action.
    const createBtn = wrapper!.element.querySelector<HTMLElement>('.toolbar cds-button')!
    createBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('opens the create form from the toolbar create button', async () => {
    setListData([POLICY_A])
    mountView()
    await flushPromises()
    expect(policyForm()).toBeNull()

    openCreate()
    await flushPromises()
    expect(policyForm()).not.toBeNull()
  })

  it('creating a COMBINED policy mutates with both rpm and tpm, toasts created, refetches', async () => {
    mutateMock.mockResolvedValue({ data: { upsertRateLimitPolicy: makeNode() } })
    setListData([POLICY_A])
    mountView()
    await flushPromises()

    openCreate()
    await flushPromises()

    const form = policyForm()!
    // Name is the first text input; default type is COMBINED so both caps persist.
    const nameInput = form.querySelector<HTMLInputElement>('input[autocomplete="off"]')!
    nameInput.value = 'New Combined'
    nameInput.dispatchEvent(new Event('input'))
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as {
      variables: { input: { name: string; rpm: number; tpm: number; enabled: boolean } }
    }
    expect(arg.variables.input.name).toBe('New Combined')
    // COMBINED → both caps are persisted as the (default) positive values.
    expect(arg.variables.input.rpm).toBeGreaterThan(0)
    expect(arg.variables.input.tpm).toBeGreaterThan(0)

    expect(toastMessages()).toContain(locale.t('supplier.toast.created'))
    expect(listSlot.refetch).toHaveBeenCalled()
    // Dialog closes on success.
    expect(policyForm()).toBeNull()
  })

  it('REQUEST type zeroes tpm; TOKEN type zeroes rpm', async () => {
    mutateMock.mockResolvedValue({ data: { upsertRateLimitPolicy: makeNode() } })
    setListData([POLICY_A])
    mountView()
    await flushPromises()

    const submitType = async (type: 'REQUEST' | 'TOKEN', name: string) => {
      openCreate()
      await flushPromises()
      const form = policyForm()!
      const nameInput = form.querySelector<HTMLInputElement>('input[autocomplete="off"]')!
      nameInput.value = name
      nameInput.dispatchEvent(new Event('input'))
      const typeSelect = form.querySelector<HTMLSelectElement>('cds-select select')!
      typeSelect.value = type
      typeSelect.dispatchEvent(new Event('change'))
      await flushPromises()
      form.dispatchEvent(new Event('submit'))
      await flushPromises()
    }

    await submitType('REQUEST', 'Req Only')
    const reqInput = (mutateMock.mock.calls.at(-1)![0] as {
      variables: { input: { rpm: number; tpm: number } }
    }).variables.input
    // REQUEST keeps rpm, zeroes tpm.
    expect(reqInput.tpm).toBe(0)
    expect(reqInput.rpm).toBeGreaterThan(0)

    await submitType('TOKEN', 'Tok Only')
    const tokInput = (mutateMock.mock.calls.at(-1)![0] as {
      variables: { input: { rpm: number; tpm: number } }
    }).variables.input
    // TOKEN keeps tpm, zeroes rpm.
    expect(tokInput.rpm).toBe(0)
    expect(tokInput.tpm).toBeGreaterThan(0)
  })

  it('editing an existing policy toasts updated (not created)', async () => {
    mutateMock.mockResolvedValue({ data: { upsertRateLimitPolicy: makeNode() } })
    setListData([POLICY_A])
    mountView()
    await flushPromises()

    // Row edit action is the first non-danger row-action button.
    const editBtn = rows()[0].querySelector<HTMLElement>('.row-action')!
    editBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = policyForm()!
    expect(form).not.toBeNull()
    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    // Existing name is prefilled, so the edit submits with the policy's name.
    const arg = mutateMock.mock.calls[0][0] as { variables: { input: { name: string } } }
    expect(arg.variables.input.name).toBe('Alpha Policy')

    expect(toastMessages()).toContain(locale.t('supplier.toast.updated'))
    expect(toastMessages()).not.toContain(locale.t('supplier.toast.created'))
    expect(listSlot.refetch).toHaveBeenCalled()
  })

  it('surfaces the backend GraphQL error and keeps the dialog open on save failure', async () => {
    mutateMock.mockRejectedValue({ graphQLErrors: [{ message: 'name already exists' }] })
    setListData([POLICY_A])
    mountView()
    await flushPromises()

    openCreate()
    await flushPromises()
    const form = policyForm()!
    const nameInput = form.querySelector<HTMLInputElement>('input[autocomplete="off"]')!
    nameInput.value = 'Dup Policy'
    nameInput.dispatchEvent(new Event('input'))
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    // graphqlErrorMessage prefers the backend message over the generic fallback.
    expect(toastMessages()).toContain('name already exists')
    expect(toastMessages()).not.toContain(locale.t('supplier.toast.created'))
    // Dialog stays open so the user can correct + retry.
    expect(policyForm()).not.toBeNull()
  })
})

describe('SupplierModelView — setEnabled', () => {
  it('toggling a disabled policy mutates enabled=true and toasts the enabled count', async () => {
    mutateMock.mockResolvedValue({ data: { setRateLimitPolicyEnabled: makeNode() } })
    setListData([POLICY_B]) // disabled
    mountView()
    await flushPromises()

    // The toggle action is the 3rd row-action (edit, apply, enable/disable, delete).
    const actions = Array.from(rows()[0].querySelectorAll<HTMLElement>('.row-action'))
    const toggleBtn = actions[2]
    toggleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { id: string; enabled: boolean } }
    expect(arg.variables.id).toBe('b')
    expect(arg.variables.enabled).toBe(true)

    const expected = locale.t('supplier.toast.enabled').replace('{count}', '1')
    expect(toastMessages()).toContain(expected)
    expect(toastStatuses()).toContain('success')
    expect(listSlot.refetch).toHaveBeenCalled()
  })

  it('toggling an enabled policy mutates enabled=false and toasts the disabled count', async () => {
    mutateMock.mockResolvedValue({ data: { setRateLimitPolicyEnabled: makeNode() } })
    setListData([POLICY_A]) // enabled
    mountView()
    await flushPromises()

    const actions = Array.from(rows()[0].querySelectorAll<HTMLElement>('.row-action'))
    actions[2].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const arg = mutateMock.mock.calls[0][0] as { variables: { enabled: boolean } }
    expect(arg.variables.enabled).toBe(false)
    expect(toastMessages()).toContain(locale.t('supplier.toast.disabled').replace('{count}', '1'))
  })

  it('batch enable mutates once per selected id and clears the selection', async () => {
    mutateMock.mockResolvedValue({ data: { setRateLimitPolicyEnabled: makeNode() } })
    setListData([POLICY_A, POLICY_B])
    mountView()
    await flushPromises()

    // Select-all checkbox is the first app-checkbox (header column).
    const selectAll = checkboxes()[0]
    selectAll.checked = true
    selectAll.dispatchEvent(new Event('change'))
    await flushPromises()

    // Selected summary reflects 2 selected.
    expect(wrapper!.element.querySelector('.selected-summary')?.textContent).toContain(
      locale.t('supplier.selected').replace('{count}', '2'),
    )

    // Open the batch dropdown (second toolbar cds-button) then click "enable".
    const batchTrigger = Array.from(
      wrapper!.element.querySelectorAll<HTMLElement>('.toolbar cds-button'),
    )[1]
    batchTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    const enableOption = Array.from(
      wrapper!.element.querySelectorAll<HTMLElement>('.menu-option'),
    ).find((b) => b.textContent?.includes(locale.t('supplier.batch.enable')))!
    enableOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // One mutation per selected policy.
    expect(mutateMock).toHaveBeenCalledTimes(2)
    expect(toastMessages()).toContain(locale.t('supplier.toast.enabled').replace('{count}', '2'))
    // Selection is cleared after a successful batch.
    expect(wrapper!.element.querySelector('.selected-summary')).toBeNull()
  })

  it('a failing setEnabled surfaces the GraphQL error toast', async () => {
    mutateMock.mockRejectedValue({ graphQLErrors: [{ message: 'forbidden: requires admin' }] })
    setListData([POLICY_A])
    mountView()
    await flushPromises()

    const actions = Array.from(rows()[0].querySelectorAll<HTMLElement>('.row-action'))
    actions[2].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('forbidden: requires admin')
    expect(toastMessages()).not.toContain(locale.t('supplier.toast.disabled').replace('{count}', '1'))
  })
})

describe('SupplierModelView — delete', () => {
  function openSingleConfirm(index: number) {
    const deleteBtn = rows()[index].querySelector<HTMLElement>('.row-action.danger')!
    deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('requesting delete opens a confirm dialog naming the target policy', async () => {
    setListData([POLICY_A, POLICY_B])
    mountView()
    await flushPromises()

    openSingleConfirm(0)
    await flushPromises()

    const card = confirmBackdrop()
    expect(card).not.toBeNull()
    expect(card?.getAttribute('aria-label')).toBe(locale.t('supplier.confirm.deleteTitle'))
    // Body interpolates the policy name.
    expect(card?.textContent).toContain('Alpha Policy')
  })

  it('confirming a single delete mutates with the target id, toasts count, refetches', async () => {
    mutateMock.mockResolvedValue({ data: { deleteRateLimitPolicy: true } })
    setListData([POLICY_A, POLICY_B])
    mountView()
    await flushPromises()

    openSingleConfirm(1)
    await flushPromises()

    const confirmBtn = confirmBackdrop()!.querySelector<HTMLElement>('cds-button[status="danger"]')!
    confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { id: string } }
    expect(arg.variables.id).toBe('b')
    expect(toastMessages()).toContain(locale.t('supplier.toast.deleted').replace('{count}', '1'))
    expect(listSlot.refetch).toHaveBeenCalled()
    expect(confirmBackdrop()).toBeNull()
  })

  it('cancelling the confirm dialog closes it without mutating', async () => {
    setListData([POLICY_A])
    mountView()
    await flushPromises()

    openSingleConfirm(0)
    await flushPromises()
    const cancelBtn = confirmBackdrop()!.querySelector<HTMLElement>('cds-button[action="outline"]')!
    cancelBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(confirmBackdrop()).toBeNull()
    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('batch delete shows the batch confirm body and mutates once per selected id', async () => {
    mutateMock.mockResolvedValue({ data: { deleteRateLimitPolicy: true } })
    setListData([POLICY_A, POLICY_B])
    mountView()
    await flushPromises()

    // Select all then trigger batch delete.
    const selectAll = checkboxes()[0]
    selectAll.checked = true
    selectAll.dispatchEvent(new Event('change'))
    await flushPromises()

    const batchTrigger = Array.from(
      wrapper!.element.querySelectorAll<HTMLElement>('.toolbar cds-button'),
    )[1]
    batchTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    const deleteOption = Array.from(
      wrapper!.element.querySelectorAll<HTMLElement>('.menu-option.danger'),
    )[0]
    deleteOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // Batch confirm dialog with the batch title + interpolated count body.
    const card = confirmBackdrop()
    expect(card?.getAttribute('aria-label')).toBe(locale.t('supplier.confirm.batchDeleteTitle'))
    expect(card?.textContent).toContain(
      locale.t('supplier.confirm.batchDeleteBody').replace('{count}', '2'),
    )

    card!.querySelector<HTMLElement>('cds-button[status="danger"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(2)
    expect(toastMessages()).toContain(locale.t('supplier.toast.deleted').replace('{count}', '2'))
  })

  it('a failing delete surfaces the GraphQL error toast', async () => {
    mutateMock.mockRejectedValue({ graphQLErrors: [{ message: 'policy is in use by 2 virtual key(s)' }] })
    setListData([POLICY_A])
    mountView()
    await flushPromises()

    openSingleConfirm(0)
    await flushPromises()
    confirmBackdrop()!.querySelector<HTMLElement>('cds-button[status="danger"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('policy is in use by 2 virtual key(s)')
    expect(toastMessages()).not.toContain(locale.t('supplier.toast.deleted').replace('{count}', '1'))
  })
})

describe('SupplierModelView — filtering + refresh', () => {
  it('status filter narrows the visible rows to enabled policies', async () => {
    setListData([POLICY_A, POLICY_B, POLICY_C]) // A+C enabled, B disabled
    mountView()
    await flushPromises()
    expect(rows()).toHaveLength(3)

    // Open the STATUS column filter menu (2nd column's filter button).
    const filterButtons = Array.from(
      wrapper!.element.querySelectorAll<HTMLElement>('cds-button-action[shape="filter"]'),
    )
    // [0] = NAME filter, [1] = STATUS filter.
    filterButtons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const enabledOption = Array.from(
      wrapper!.element.querySelectorAll<HTMLElement>('.filter-option'),
    ).find((b) => b.textContent?.includes(locale.t('supplier.filter.status.ENABLED')))!
    enabledOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // Only the two enabled policies remain.
    expect(rows()).toHaveLength(2)
    const names = rows().map((r) => r.textContent)
    expect(names.some((t) => t?.includes('Alpha Policy'))).toBe(true)
    expect(names.some((t) => t?.includes('Gamma Policy'))).toBe(true)
    expect(names.some((t) => t?.includes('Beta Policy'))).toBe(false)
  })

  it('refresh refetches and toasts on success', async () => {
    setListData([POLICY_A])
    mountView()
    await flushPromises()

    const refreshBtn = wrapper!.element.querySelector<HTMLElement>('.refresh-button')!
    refreshBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(listSlot.refetch).toHaveBeenCalled()
    expect(toastMessages()).toContain(locale.t('supplier.toast.refreshed'))
  })

  it('refresh surfaces an error toast when refetch rejects', async () => {
    setListData([POLICY_A])
    listSlot.refetch.mockRejectedValueOnce(new Error('network down'))
    mountView()
    await flushPromises()

    wrapper!.element.querySelector<HTMLElement>('.refresh-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('network down')
    expect(toastMessages()).not.toContain(locale.t('supplier.toast.refreshed'))
  })
})
