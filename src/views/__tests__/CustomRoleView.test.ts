/**
 * Component tests for CustomRoleView.vue — 自定义角色与权限 (Custom Roles & Permissions).
 *
 * The view is a master-detail RBAC editor wired to the real backend:
 *   - master: `customRoles` list (loading / error / empty / data); first role
 *     is auto-selected; system roles cannot be deleted.
 *   - detail: a permission matrix for the selected role. Each catalog
 *     `Permission` is a checkbox row; ticking forks a dirty `pendingKeys`
 *     buffer; Save → `setRolePermissions(roleId, permissionKeys)` → refetch.
 *   - graceful degradation: the permission catalog (`permissions` query) is
 *     admin-only. When it errors (tenant_admin path) the page falls back to the
 *     union of keys already held across roles, shows a warning alert, and hides
 *     the admin-only "add permission" control.
 *   - create role (createCustomRole) + delete role (deleteCustomRole) via
 *     dialogs/modals; success → toast + refetch, failure → graphqlErrorMessage.
 *
 * Mocking strategy:
 *   - `@vue/apollo-composable`'s `useQuery` is mocked and routed by the parsed
 *     document's operation name (`CustomRolesList` vs `PermissionCatalog`) to two
 *     independently controllable ref slots. `refetch` on the roles slot is a spy.
 *   - `@/api/graphql/client`'s `apolloClient.mutate` is a spy resolved / rejected
 *     per test to exercise success + error branches; the mutation document's
 *     operation name lets us assert which op fired.
 *   - real Pinia so `locale.t(...)` resolves real strings; assertions are driven
 *     off the same locale keys the component renders, not hard-coded text.
 *   - cds-* are Clarity custom elements; the compiler is told to treat any
 *     `cds-` tag as a custom element. We assert on plain DOM + spy/toast state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, type Ref } from 'vue'

import type { CustomRoleNode, PermissionNode } from '@/api/graphql/queries/custom-roles'

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

let rolesSlot: QuerySlot
let permsSlot: QuerySlot

vi.mock('@vue/apollo-composable', () => ({
  useQuery: (document: { definitions?: Array<{ name?: { value?: string } }> }) => {
    const opName = document?.definitions?.[0]?.name?.value
    const slot = opName === 'PermissionCatalog' ? permsSlot : rolesSlot
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

import CustomRoleView from '@/views/CustomRoleView.vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'

// Toasts live in module-scoped state in useToast; read them via a fresh call.
function toastMessages(): string[] {
  return useToast().toasts.value.map((t) => t.message)
}

// Operation name of the mutation passed to apolloClient.mutate at call index.
function mutateOpName(callIndex: number): string | undefined {
  const arg = mutateMock.mock.calls[callIndex]?.[0] as
    | { mutation?: { definitions?: Array<{ name?: { value?: string } }> } }
    | undefined
  return arg?.mutation?.definitions?.[0]?.name?.value
}

// --- fixtures --------------------------------------------------------------

function makeRole(over: Partial<CustomRoleNode> = {}): CustomRoleNode {
  return {
    id: 'role-1',
    name: 'Operators',
    isSystem: false,
    permissions: [],
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

const SYSTEM_ROLE = makeRole({
  id: 'sys-admin',
  name: 'Administrator',
  isSystem: true,
  permissions: ['agent:deploy', 'agent:delete'],
})
const CUSTOM_ROLE = makeRole({
  id: 'custom-ops',
  name: 'Operators',
  isSystem: false,
  permissions: ['agent:read'],
})
const CUSTOM_ROLE_2 = makeRole({
  id: 'custom-billing',
  name: 'Billing',
  isSystem: false,
  permissions: ['billing:view'],
})

const CATALOG: PermissionNode[] = [
  { id: 'p1', key: 'agent:read', description: 'Read agents' },
  { id: 'p2', key: 'agent:deploy', description: 'Deploy agents' },
  { id: 'p3', key: 'billing:view', description: null },
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

function setRoles(rows: CustomRoleNode[]) {
  rolesSlot.result.value = { customRoles: rows }
}
function setCatalog(rows: PermissionNode[]) {
  permsSlot.result.value = { permissions: rows }
}

let wrapper: VueWrapper | null = null
let locale: ReturnType<typeof useLocaleStore>

function mountView() {
  wrapper = mount(CustomRoleView, mountConfig)
  return wrapper
}

// --- DOM helpers -----------------------------------------------------------

function roleItems(): HTMLButtonElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLButtonElement>('.role-item'))
}
function listStateText(): string {
  return wrapper!.element.querySelector('.list-panel .panel-state')?.textContent?.trim() ?? ''
}
function matrixRows(): HTMLElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLElement>('.matrix-list .matrix-row'))
}
function matrixCheckboxes(): HTMLInputElement[] {
  return Array.from(
    wrapper!.element.querySelectorAll<HTMLInputElement>('.matrix-list input[type="checkbox"]'),
  )
}
function detailTitle(): string {
  return wrapper!.element.querySelector('.detail-title')?.textContent?.trim() ?? ''
}

beforeEach(() => {
  setActivePinia(createPinia())
  locale = useLocaleStore()
  rolesSlot = makeSlot()
  permsSlot = makeSlot()
  mutateMock.mockReset()
  // Module-scoped toast state is shared across tests; reset for clean assertions.
  useToast().clear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('CustomRoleView — roles list states', () => {
  it('shows the loading state while the roles list is loading and empty', () => {
    rolesSlot.loading.value = true
    mountView()
    expect(listStateText()).toBe(locale.t('customRole.list.loading'))
    expect(roleItems()).toHaveLength(0)
  })

  it('shows the error state (role=alert) when the roles query errors', () => {
    rolesSlot.error.value = new Error('boom')
    mountView()
    const errEl = wrapper!.element.querySelector('.list-panel .panel-state.error')
    expect(errEl?.textContent?.trim()).toBe(locale.t('customRole.list.error'))
    expect(errEl?.getAttribute('role')).toBe('alert')
  })

  it('shows the empty state when there are no custom roles', () => {
    setRoles([])
    mountView()
    expect(listStateText()).toBe(locale.t('customRole.list.empty'))
    expect(roleItems()).toHaveLength(0)
    // With no role selected, the detail pane shows its empty prompt.
    expect(wrapper!.element.querySelector('.detail-empty')?.textContent).toContain(
      locale.t('customRole.detail.empty'),
    )
  })

  it('renders a row per role and a delete affordance only for non-system roles', async () => {
    setRoles([SYSTEM_ROLE, CUSTOM_ROLE])
    mountView()
    await flushPromises()

    const items = roleItems()
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('Administrator')
    expect(items[1].textContent).toContain('Operators')
    // System role shows the system badge; custom role shows a delete button.
    expect(items[0].querySelector('.system-badge')?.textContent?.trim()).toBe(
      locale.t('customRole.badge.system'),
    )
    const deleteButtons = wrapper!.element.querySelectorAll('.role-delete')
    expect(deleteButtons).toHaveLength(1)
    // The permission count is surfaced per row.
    expect(items[0].querySelector('.role-count')?.textContent?.trim()).toBe('2')
    expect(items[1].querySelector('.role-count')?.textContent?.trim()).toBe('1')
  })
})

describe('CustomRoleView — selection + matrix', () => {
  it('auto-selects the first role and renders its detail header + granted count', async () => {
    setRoles([CUSTOM_ROLE, CUSTOM_ROLE_2])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    expect(detailTitle()).toBe('Operators')
    expect(roleItems()[0].getAttribute('aria-pressed')).toBe('true')
    // Granted count interpolated from heldKeys (one saved permission).
    expect(wrapper!.element.querySelector('.detail-sub')?.textContent).toContain('1')
  })

  it('clicking another role switches the selection', async () => {
    setRoles([CUSTOM_ROLE, CUSTOM_ROLE_2])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    roleItems()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(detailTitle()).toBe('Billing')
    expect(roleItems()[1].getAttribute('aria-pressed')).toBe('true')
    expect(roleItems()[0].getAttribute('aria-pressed')).toBe('false')
  })

  it('renders one matrix checkbox per catalog permission, ticked for held keys', async () => {
    setRoles([CUSTOM_ROLE])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    const boxes = matrixCheckboxes()
    expect(boxes).toHaveLength(CATALOG.length)
    // Each row's aria-label is the permission key; held key (agent:read) checked.
    const byKey = new Map(boxes.map((b) => [b.getAttribute('aria-label'), b]))
    expect(byKey.get('agent:read')?.checked).toBe(true)
    expect(byKey.get('agent:deploy')?.checked).toBe(false)
  })

  it('a system role renders a read-only matrix (disabled boxes, no footer, info alert)', async () => {
    setRoles([SYSTEM_ROLE])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    // System read-only alert is shown.
    expect(wrapper!.element.querySelector('.matrix-alert')?.textContent).toContain(
      locale.t('customRole.matrix.systemReadonly'),
    )
    // All checkboxes are disabled; the save/cancel footer is hidden.
    expect(matrixCheckboxes().every((b) => b.disabled)).toBe(true)
    expect(wrapper!.element.querySelector('.matrix-footer')).toBeNull()
  })

  it('filters matrix rows by the search term (key or description)', async () => {
    setRoles([CUSTOM_ROLE])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    expect(matrixRows()).toHaveLength(3)
    const search = wrapper!.element.querySelector<HTMLInputElement>('.matrix-search input')!
    search.value = 'billing'
    search.dispatchEvent(new Event('input'))
    await flushPromises()

    const rows = matrixRows()
    expect(rows).toHaveLength(1)
    expect(rows[0].querySelector('.matrix-key')?.textContent?.trim()).toBe('billing:view')
  })

  it('shows the matrix empty state when a filter matches nothing', async () => {
    setRoles([CUSTOM_ROLE])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    const search = wrapper!.element.querySelector<HTMLInputElement>('.matrix-search input')!
    search.value = 'no-such-permission-zzz'
    search.dispatchEvent(new Event('input'))
    await flushPromises()

    expect(matrixRows()).toHaveLength(0)
    const state = wrapper!.element.querySelector('.matrix-section .panel-state')
    expect(state?.textContent?.trim()).toBe(locale.t('customRole.matrix.empty'))
  })
})

describe('CustomRoleView — permission matrix toggle + save', () => {
  function toggle(key: string) {
    const box = matrixCheckboxes().find((b) => b.getAttribute('aria-label') === key)!
    box.dispatchEvent(new Event('change', { bubbles: true }))
  }
  function footerButtons(): HTMLElement[] {
    return Array.from(wrapper!.element.querySelectorAll<HTMLElement>('.matrix-footer cds-button'))
  }

  it('toggling a permission marks the matrix dirty and enables the save button', async () => {
    setRoles([CUSTOM_ROLE])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    // Save button is disabled until there is a dirty edit. (cds-button is a
    // custom element so :disabled reflects as the literal string "true"/"false".)
    const [, saveBefore] = footerButtons()
    expect(saveBefore.getAttribute('disabled')).toBe('true')

    toggle('agent:deploy')
    await flushPromises()

    const box = matrixCheckboxes().find((b) => b.getAttribute('aria-label') === 'agent:deploy')!
    expect(box.checked).toBe(true)
    // Save is now enabled (dirty).
    const [, saveAfter] = footerButtons()
    expect(saveAfter.getAttribute('disabled')).toBe('false')
  })

  it('cancel/reset reverts the dirty edit back to the saved set', async () => {
    setRoles([CUSTOM_ROLE])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    toggle('agent:deploy')
    await flushPromises()
    expect(
      matrixCheckboxes().find((b) => b.getAttribute('aria-label') === 'agent:deploy')!.checked,
    ).toBe(true)

    // Click the cancel (first footer) button.
    footerButtons()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // Buffer reset → unchecked again and save disabled.
    expect(
      matrixCheckboxes().find((b) => b.getAttribute('aria-label') === 'agent:deploy')!.checked,
    ).toBe(false)
    expect(footerButtons()[1].getAttribute('disabled')).toBe('true')
  })

  it('save calls setRolePermissions with the role id + new key set, toasts, refetches', async () => {
    mutateMock.mockResolvedValue({ data: { setRolePermissions: CUSTOM_ROLE } })
    setRoles([CUSTOM_ROLE])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    toggle('agent:deploy') // add a key on top of the saved agent:read
    await flushPromises()
    footerButtons()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    expect(mutateOpName(0)).toBe('SetCustomRolePermissions')
    const arg = mutateMock.mock.calls[0][0] as {
      variables: { roleId: string; permissionKeys: string[] }
    }
    expect(arg.variables.roleId).toBe('custom-ops')
    expect([...arg.variables.permissionKeys].sort()).toEqual(['agent:deploy', 'agent:read'])

    expect(toastMessages()).toContain(locale.t('customRole.toast.saved'))
    expect(rolesSlot.refetch).toHaveBeenCalled()
  })

  it('save failure surfaces the GraphQL error message and does not refetch', async () => {
    mutateMock.mockRejectedValue({ graphQLErrors: [{ message: 'forbidden: tenant scope' }] })
    setRoles([CUSTOM_ROLE])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    toggle('agent:deploy')
    await flushPromises()
    footerButtons()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('forbidden: tenant scope')
    expect(toastMessages()).not.toContain(locale.t('customRole.toast.saved'))
    expect(rolesSlot.refetch).not.toHaveBeenCalled()
  })
})

describe('CustomRoleView — create role flow', () => {
  function createModal(): HTMLElement | null {
    // The create-role dialog is the first cds-modal whose aria-label is the
    // create title and is not hidden.
    const modals = Array.from(wrapper!.element.querySelectorAll<HTMLElement>('cds-modal'))
    return (
      modals.find(
        (m) =>
          m.getAttribute('aria-label') === locale.t('customRole.create.title') &&
          m.getAttribute('hidden') == null,
      ) ?? null
    )
  }

  it('toolbar "create" opens the create dialog', async () => {
    setRoles([CUSTOM_ROLE])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    expect(createModal()).toBeNull()
    const createBtn = wrapper!.element.querySelector<HTMLElement>('.toolbar cds-button')!
    createBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(createModal()).not.toBeNull()
  })

  it('submitting the create form calls createCustomRole with the trimmed name, toasts, refetches', async () => {
    mutateMock.mockResolvedValue({ data: { createCustomRole: makeRole({ id: 'new', name: 'QA' }) } })
    setRoles([CUSTOM_ROLE])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.toolbar cds-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const modal = createModal()!
    const input = modal.querySelector<HTMLInputElement>('input[type="text"]')!
    input.value = '  QA  '
    input.dispatchEvent(new Event('input'))
    await flushPromises()

    modal.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    expect(mutateOpName(0)).toBe('CreateCustomRoleEntry')
    const arg = mutateMock.mock.calls[0][0] as { variables: { input: { name: string } } }
    expect(arg.variables.input.name).toBe('QA')
    expect(toastMessages()).toContain(locale.t('customRole.toast.created'))
    expect(rolesSlot.refetch).toHaveBeenCalled()
  })

  it('create failure surfaces the GraphQL error and keeps the dialog open', async () => {
    mutateMock.mockRejectedValue({ graphQLErrors: [{ message: 'name already taken' }] })
    setRoles([CUSTOM_ROLE])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.toolbar cds-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const modal = createModal()!
    const input = modal.querySelector<HTMLInputElement>('input[type="text"]')!
    input.value = 'dup'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    modal.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(toastMessages()).toContain('name already taken')
    expect(toastMessages()).not.toContain(locale.t('customRole.toast.created'))
    // Dialog stays open on failure.
    expect(createModal()).not.toBeNull()
  })
})

describe('CustomRoleView — delete role flow', () => {
  function deleteModal(): HTMLElement | null {
    const modals = Array.from(wrapper!.element.querySelectorAll<HTMLElement>('cds-modal'))
    return (
      modals.find(
        (m) =>
          m.getAttribute('aria-label') === locale.t('customRole.delete.title') &&
          m.getAttribute('hidden') == null,
      ) ?? null
    )
  }

  it('clicking the row delete button opens a confirm modal naming the target', async () => {
    setRoles([CUSTOM_ROLE])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    expect(deleteModal()).toBeNull()
    wrapper!.element
      .querySelector<HTMLElement>('.role-delete')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const modal = deleteModal()
    expect(modal).not.toBeNull()
    // Confirm message interpolates the role name.
    expect(modal?.textContent).toContain('Operators')
  })

  it('confirming delete calls deleteCustomRole with the id, toasts, refetches, closes', async () => {
    mutateMock.mockResolvedValue({ data: { deleteCustomRole: true } })
    setRoles([CUSTOM_ROLE, CUSTOM_ROLE_2])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    // Open the confirm for the first (custom-ops) role.
    wrapper!.element
      .querySelectorAll<HTMLElement>('.role-delete')[0]
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const modal = deleteModal()!
    const confirmBtn = modal.querySelector<HTMLElement>('cds-button[status="danger"]')!
    confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    expect(mutateOpName(0)).toBe('DeleteCustomRoleEntry')
    const arg = mutateMock.mock.calls[0][0] as { variables: { id: string } }
    expect(arg.variables.id).toBe('custom-ops')
    expect(toastMessages()).toContain(locale.t('customRole.toast.deleted'))
    expect(rolesSlot.refetch).toHaveBeenCalled()
    expect(deleteModal()).toBeNull()
  })

  it('delete failure surfaces the GraphQL error and keeps the confirm modal open', async () => {
    mutateMock.mockRejectedValue({ graphQLErrors: [{ message: 'role in use' }] })
    setRoles([CUSTOM_ROLE])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.role-delete')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    deleteModal()!
      .querySelector<HTMLElement>('cds-button[status="danger"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('role in use')
    expect(toastMessages()).not.toContain(locale.t('customRole.toast.deleted'))
    expect(deleteModal()).not.toBeNull()
  })
})

describe('CustomRoleView — graceful degradation when catalog query errors (tenant_admin path)', () => {
  it('falls back to the union of held keys, shows a warning alert, and hides "add permission"', async () => {
    // tenant_admin cannot read the catalog: permissions query errors.
    permsSlot.error.value = new Error('forbidden: requires admin')
    setRoles([CUSTOM_ROLE, CUSTOM_ROLE_2, SYSTEM_ROLE])
    mountView()
    await flushPromises()

    // The selected (first, custom) role still has an editable matrix.
    expect(detailTitle()).toBe('Operators')

    // Matrix rows are the union of every role's keys (sorted), since the catalog
    // is unavailable: agent:deploy, agent:delete, agent:read, billing:view.
    const keys = matrixRows().map((r) => r.querySelector('.matrix-key')?.textContent?.trim())
    expect(keys).toEqual(['agent:delete', 'agent:deploy', 'agent:read', 'billing:view'])

    // Warning alert about the unavailable catalog is shown.
    expect(wrapper!.element.querySelector('.matrix-alert')?.textContent).toContain(
      locale.t('customRole.matrix.catalogUnavailable'),
    )

    // The admin-only "add permission" control is hidden when the catalog errors.
    const matrixActionLabels = Array.from(
      wrapper!.element.querySelectorAll('.matrix-actions cds-button'),
    ).map((b) => b.textContent?.trim())
    expect(matrixActionLabels).not.toContain(locale.t('customRole.permission.add'))
  })

  it('the matrix stays editable for a custom role and saves the union-derived keys', async () => {
    mutateMock.mockResolvedValue({ data: { setRolePermissions: CUSTOM_ROLE } })
    permsSlot.error.value = new Error('forbidden: requires admin')
    setRoles([CUSTOM_ROLE, CUSTOM_ROLE_2])
    mountView()
    await flushPromises()

    // Tick a key that came from the union (billing:view, held by the other role).
    const box = matrixCheckboxes().find((b) => b.getAttribute('aria-label') === 'billing:view')!
    expect(box.disabled).toBe(false)
    box.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const saveBtn = wrapper!.element.querySelectorAll<HTMLElement>('.matrix-footer cds-button')[1]
    saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    expect(mutateOpName(0)).toBe('SetCustomRolePermissions')
    const arg = mutateMock.mock.calls[0][0] as {
      variables: { roleId: string; permissionKeys: string[] }
    }
    expect(arg.variables.roleId).toBe('custom-ops')
    expect([...arg.variables.permissionKeys].sort()).toEqual(['agent:read', 'billing:view'])
  })
})

describe('CustomRoleView — refresh toolbar action', () => {
  it('refresh refetches the roles list and toasts on success', async () => {
    setRoles([CUSTOM_ROLE])
    setCatalog(CATALOG)
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.refresh-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(rolesSlot.refetch).toHaveBeenCalled()
    expect(toastMessages()).toContain(locale.t('customRole.toast.refreshed'))
  })

  it('refresh surfaces an error toast when refetch rejects', async () => {
    setRoles([CUSTOM_ROLE])
    setCatalog(CATALOG)
    rolesSlot.refetch.mockRejectedValueOnce(new Error('network down'))
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.refresh-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('network down')
    expect(toastMessages()).not.toContain(locale.t('customRole.toast.refreshed'))
  })
})
