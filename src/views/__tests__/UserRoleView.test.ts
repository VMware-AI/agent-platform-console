/**
 * Component tests for UserRoleView.vue — 用户与权限 (/platform/users).
 *
 * UserRoleView is a thin shell: a page header + a <TabStrip> + the active tab
 * (UsersTab | RolesTab). All data and operations live in the two tabs, so the
 * tests mount the real shell and exercise the tab through which the data flows.
 *
 * Coverage:
 *   - shell: header text, both tab labels, default tab = Users, switching tabs
 *     swaps which grid renders.
 *   - Users tab states: loading, empty, error (cds-alert), data (a row per user).
 *   - Users tab interactions through the real ops:
 *       * reset password  → ConfirmDialog → resetUserPassword mutation →
 *         PasswordRevealDialog reveals the generated password + refetch.
 *       * toggle enabled   → ConfirmDialog → toggleUserEnabled mutation +
 *         success toast keyed off enabled state, + refetch.
 *       * delete user      → ConfirmDialog → deleteUser mutation + toast.
 *       * create user      → opens UserFormDialog.
 *       * bind role        → opens BindRoleDialog; submit → assignUsersToRole.
 *   - Roles tab: a row per role + delete disabled for builtIn roles.
 *
 * Mocking strategy (matches the codebase's view-test convention):
 *   - `@vue/apollo-composable`'s `useQuery` / `useMutation` are mocked and routed
 *     by the parsed document's OperationDefinition name to independent,
 *     controllable ref slots / mutate spies.
 *   - real Pinia so `locale.t(...)` resolves real strings; assertions are driven
 *     off the same locale keys the components render, not hard-coded markup.
 *   - cds-* are Clarity custom elements; the compiler is told to treat any `cds-`
 *     tag as a custom element. Assertions use plain DOM + spy/toast state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, type Ref } from 'vue'

import type { AccountUser, Role } from '@/types/user-role'

// --- apollo query / mutation slots -----------------------------------------

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

// Keyed by GraphQL operation name.
let querySlots: Record<string, QuerySlot>
let mutateFns: Record<string, ReturnType<typeof vi.fn>>

function opNameOf(doc: unknown): string {
  // The gql documents prepend fragment definitions, so definitions[0] is often a
  // FragmentDefinition — find the OperationDefinition explicitly.
  const defs =
    (doc as { definitions?: Array<{ kind?: string; name?: { value?: string } }> })?.definitions ?? []
  const op = defs.find((d) => d.kind === 'OperationDefinition')
  return op?.name?.value ?? ''
}

vi.mock('@vue/apollo-composable', () => ({
  useQuery: (doc: unknown) => {
    const name = opNameOf(doc)
    const slot = (querySlots[name] ??= makeSlot())
    return {
      result: slot.result,
      loading: slot.loading,
      error: slot.error,
      refetch: slot.refetch,
    }
  },
  useMutation: (doc: unknown) => {
    const name = opNameOf(doc)
    const mutate = (mutateFns[name] ??= vi.fn())
    return { mutate, loading: ref(false) }
  },
}))

import UserRoleView from '@/views/UserRoleView.vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'

// --- helpers ---------------------------------------------------------------

function toastMessages(): string[] {
  return useToast().toasts.value.map((t) => t.message)
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

// --- fixtures --------------------------------------------------------------

function makeUser(over: Partial<AccountUser> = {}): AccountUser {
  return {
    id: 'u1',
    username: 'alice',
    displayName: 'Alice',
    email: 'alice@example.com',
    role: { id: 'r-admin', name: 'Administrator' },
    connectionStatus: 'ONLINE',
    lastLoginAt: '2026-01-05T10:00:00Z',
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...over,
  }
}

function makeRole(over: Partial<Role> = {}): Role {
  return {
    id: 'r-admin',
    name: 'Administrator',
    description: 'Full access',
    userCount: 2,
    builtIn: true,
    ...over,
  }
}

const ROLES: Role[] = [
  makeRole(),
  makeRole({ id: 'r-ops', name: 'Operator', description: 'Operate agents', userCount: 1, builtIn: true }),
]

function setUsers(users: AccountUser[], totalCount = users.length, totalPages = 1) {
  querySlots.Users.result.value = {
    users: {
      nodes: users,
      totalCount,
      pageInfo: { page: 1, pageSize: 10, totalPages },
    },
  }
}

function setRoles(roles: Role[]) {
  querySlots.Roles.result.value = {
    roles: {
      nodes: roles,
      totalCount: roles.length,
      pageInfo: { page: 1, pageSize: 10, totalPages: 1 },
    },
  }
}

let wrapper: VueWrapper | null = null
let locale: ReturnType<typeof useLocaleStore>

function mountView() {
  wrapper = mount(UserRoleView, mountConfig)
  return wrapper
}

// --- DOM helpers -----------------------------------------------------------

function tabButtons(): HTMLButtonElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
}

function userGrid(): Element | null {
  return wrapper!.element.querySelector('cds-grid[aria-label="users"]')
}
function roleGrid(): Element | null {
  return wrapper!.element.querySelector('cds-grid[aria-label="roles"]')
}

function userRows(): Element[] {
  return Array.from(userGrid()?.querySelectorAll('cds-grid-row') ?? [])
}

function placeholderText(grid: Element | null): string {
  return grid?.querySelector('cds-grid-placeholder')?.textContent?.trim() ?? ''
}

// Find an open dialog (Teleported to body) by its aria-label.
function dialogByLabel(label: string): HTMLElement | null {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[aria-label]')).find(
    (el) => el.getAttribute('aria-label') === label && el.getAttribute('role')?.includes('dialog'),
  ) ?? null
}

// The confirm dialog body element (role=alertdialog) currently mounted.
function confirmDialog(): HTMLElement | null {
  const dialogs = Array.from(document.body.querySelectorAll<HTMLElement>('[role="alertdialog"]'))
  return dialogs[dialogs.length - 1] ?? null
}

function confirmButton(dlg: HTMLElement): HTMLElement {
  // ConfirmDialog renders [cancel, confirm]; confirm is the last cds-button.
  const buttons = Array.from(dlg.querySelectorAll<HTMLElement>('cds-button'))
  return buttons[buttons.length - 1]
}

function click(el: Element | null) {
  el?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

// Switch to a tab by its 0-based index (0 = users, 1 = roles).
async function switchTab(index: number) {
  click(tabButtons()[index])
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  locale = useLocaleStore()
  querySlots = {
    Users: makeSlot(),
    Roles: makeSlot(),
    UsersByRole: makeSlot(),
  }
  mutateFns = {}
  useToast().clear()
  // jsdom has no real clipboard; stub it so PasswordRevealDialog.copy doesn't throw.
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  // Teleported dialogs land in document.body — clean up between tests.
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('UserRoleView — shell + tabs', () => {
  it('renders the page header (title + description) from locale keys', () => {
    setUsers([])
    setRoles(ROLES)
    mountView()

    expect(wrapper!.element.querySelector('.heading')?.textContent?.trim()).toBe(
      locale.t('users.title'),
    )
    expect(wrapper!.element.querySelector('.desc')?.textContent?.trim()).toBe(
      locale.t('users.description'),
    )
  })

  it('renders both tab labels and defaults to the Users tab', () => {
    setUsers([makeUser()])
    setRoles(ROLES)
    mountView()

    const labels = tabButtons().map((b) => b.textContent?.trim())
    expect(labels).toEqual([locale.t('users.tabs.users'), locale.t('users.tabs.roles')])
    // Users tab is active and rendered; roles grid is not mounted.
    expect(tabButtons()[0].getAttribute('aria-selected')).toBe('true')
    expect(userGrid()).not.toBeNull()
    expect(roleGrid()).toBeNull()
  })

  it('clicking the Roles tab swaps the rendered grid', async () => {
    setUsers([makeUser()])
    setRoles(ROLES)
    mountView()
    await flushPromises()

    await switchTab(1)

    expect(tabButtons()[1].getAttribute('aria-selected')).toBe('true')
    expect(roleGrid()).not.toBeNull()
    expect(userGrid()).toBeNull()
  })
})

describe('UserRoleView — Users tab states', () => {
  it('shows the loading placeholder while users are loading and none are present', () => {
    querySlots.Users.loading.value = true
    setRoles(ROLES)
    mountView()

    expect(placeholderText(userGrid())).toContain(locale.t('users.loading'))
    expect(userRows()).toHaveLength(0)
  })

  it('shows the empty placeholder when there are no users', () => {
    setUsers([])
    setRoles(ROLES)
    mountView()

    expect(placeholderText(userGrid())).toContain(locale.t('users.empty'))
    expect(userRows()).toHaveLength(0)
  })

  it('shows an error alert when the users query errors', () => {
    querySlots.Users.error.value = new Error('boom')
    setRoles(ROLES)
    mountView()

    const alert = wrapper!.element.querySelector('cds-alert')
    expect(alert?.textContent?.trim()).toBe(locale.t('users.error'))
    expect(alert?.getAttribute('status')).toBe('danger')
  })

  it('renders a row per user with the username and role name', async () => {
    setUsers([
      makeUser({ id: 'u1', username: 'alice', role: { id: 'r-admin', name: 'Administrator' } }),
      makeUser({ id: 'u2', username: 'bob', role: { id: 'r-ops', name: 'Operator' } }),
    ])
    setRoles(ROLES)
    mountView()
    await flushPromises()

    const rows = userRows()
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('alice')
    expect(rows[0].textContent).toContain('Administrator')
    expect(rows[1].textContent).toContain('bob')
    expect(rows[1].textContent).toContain('Operator')
  })
})

describe('UserRoleView — Users tab interactions (real ops mocked)', () => {
  function actionButton(rowIndex: number, label: string): HTMLElement {
    const row = userRows()[rowIndex]
    return row.querySelector<HTMLElement>(`cds-button-action[aria-label="${label}"]`)!
  }

  // UserFormDialog renders a <cds-modal> whose header shows the create title;
  // it has no role=dialog aria-label, so detect it via the modal element.
  function userFormModal(): HTMLElement | null {
    const modal = wrapper!.element.querySelector<HTMLElement>('cds-modal')
    if (!modal) return null
    return modal.textContent?.includes(locale.t('users.form.title.create')) ? modal : null
  }

  it('opening "create user" mounts the UserFormDialog', async () => {
    setUsers([makeUser()])
    setRoles(ROLES)
    mountView()
    await flushPromises()

    expect(userFormModal()).toBeNull()
    const createBtn = wrapper!.element.querySelector<HTMLElement>('.toolbar cds-button')!
    click(createBtn)
    await flushPromises()

    expect(userFormModal()).not.toBeNull()
  })

  it('reset password → confirm → resetUserPassword reveals the new password + refetches', async () => {
    mutateFns.ResetUserPassword = vi.fn().mockResolvedValue({
      data: {
        resetUserPassword: {
          user: { ...makeUser(), username: 'alice' },
          generatedPassword: 'Tmp-PW-9999',
        },
      },
    })
    setUsers([makeUser({ username: 'alice' })])
    setRoles(ROLES)
    mountView()
    await flushPromises()

    click(actionButton(0, locale.t('users.action.resetPwd')))
    await flushPromises()

    const dlg = confirmDialog()!
    // Confirm body names the target user.
    expect(dlg.textContent).toContain('alice')

    click(confirmButton(dlg))
    await flushPromises()

    expect(mutateFns.ResetUserPassword).toHaveBeenCalledTimes(1)
    expect(mutateFns.ResetUserPassword.mock.calls[0][0]).toEqual({ id: 'u1' })
    // The revealed plaintext password is rendered in the reveal dialog.
    expect(document.body.textContent).toContain('Tmp-PW-9999')
    expect(toastMessages()).toContain(locale.t('users.toast.resetPwdOk'))
    expect(querySlots.Users.refetch).toHaveBeenCalled()
  })

  it('reset password failure surfaces the backend error and reveals nothing', async () => {
    mutateFns.ResetUserPassword = vi.fn().mockRejectedValue(new Error('nope'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setUsers([makeUser({ username: 'alice' })])
    setRoles(ROLES)
    mountView()
    await flushPromises()

    click(actionButton(0, locale.t('users.action.resetPwd')))
    await flushPromises()
    click(confirmButton(confirmDialog()!))
    await flushPromises()

    // PR #23: error toasts route through graphqlErrorMessage, so the toast
    // surfaces the backend message ("nope") rather than the localized fallback.
    const messages = toastMessages()
    expect(messages.some((m) => m.includes('nope'))).toBe(true)
    expect(messages).not.toContain(locale.t('users.toast.resetPwdOk'))
    expect(querySlots.Users.refetch).not.toHaveBeenCalled()
  })

  it('toggle enabled → confirm → toggleUserEnabled with the "disable" toast for an enabled user', async () => {
    mutateFns.ToggleUserEnabled = vi.fn().mockResolvedValue({
      data: { toggleUserEnabled: { user: makeUser({ enabled: false }) } },
    })
    setUsers([makeUser({ id: 'u1', username: 'alice', enabled: true })])
    setRoles(ROLES)
    mountView()
    await flushPromises()

    // Enabled user → the action button is labelled "disable".
    click(actionButton(0, locale.t('users.action.disable')))
    await flushPromises()
    click(confirmButton(confirmDialog()!))
    await flushPromises()

    expect(mutateFns.ToggleUserEnabled).toHaveBeenCalledTimes(1)
    expect(mutateFns.ToggleUserEnabled.mock.calls[0][0]).toEqual({ id: 'u1' })
    expect(toastMessages()).toContain(
      locale.t('users.toast.disableOk').replace('{name}', 'alice'),
    )
    expect(querySlots.Users.refetch).toHaveBeenCalled()
  })

  it('toggle enabled uses the "enable" affordance + toast for a disabled user', async () => {
    mutateFns.ToggleUserEnabled = vi.fn().mockResolvedValue({
      data: { toggleUserEnabled: { user: makeUser({ enabled: true }) } },
    })
    setUsers([makeUser({ id: 'u9', username: 'carol', enabled: false })])
    setRoles(ROLES)
    mountView()
    await flushPromises()

    click(actionButton(0, locale.t('users.action.enable')))
    await flushPromises()
    click(confirmButton(confirmDialog()!))
    await flushPromises()

    expect(mutateFns.ToggleUserEnabled.mock.calls[0][0]).toEqual({ id: 'u9' })
    expect(toastMessages()).toContain(
      locale.t('users.toast.enableOk').replace('{name}', 'carol'),
    )
  })

  it('delete user → confirm → deleteUser with the id + success toast + refetch', async () => {
    mutateFns.DeleteUser = vi.fn().mockResolvedValue({ data: { deleteUser: { id: 'u1' } } })
    setUsers([makeUser({ id: 'u1', username: 'alice' })])
    setRoles(ROLES)
    mountView()
    await flushPromises()

    click(actionButton(0, locale.t('users.action.delete')))
    await flushPromises()
    const dlg = confirmDialog()!
    expect(dlg.textContent).toContain('alice')

    click(confirmButton(dlg))
    await flushPromises()

    expect(mutateFns.DeleteUser).toHaveBeenCalledTimes(1)
    expect(mutateFns.DeleteUser.mock.calls[0][0]).toEqual({ id: 'u1' })
    expect(toastMessages()).toContain(
      locale.t('users.toast.deleteOk').replace('{name}', 'alice'),
    )
    expect(querySlots.Users.refetch).toHaveBeenCalled()
  })

  it('bind role → opens BindRoleDialog → submit calls assignUsersToRole with the role + user ids', async () => {
    mutateFns.AssignUsersToRole = vi.fn().mockResolvedValue({
      data: { assignUsersToRole: { role: makeRole(), assignedCount: 1 } },
    })
    setUsers([makeUser({ id: 'u1', username: 'alice', role: { id: 'r-admin', name: 'Administrator' } })])
    setRoles(ROLES)
    mountView()
    await flushPromises()

    click(actionButton(0, locale.t('users.action.bindRole')))
    await flushPromises()

    const bindDlg = dialogByLabel(locale.t('users.bind.title'))
    expect(bindDlg).not.toBeNull()

    // The row's user is pre-checked, so submit is enabled. Click the submit
    // button (last cds-button in the bind dialog actions).
    const buttons = Array.from(bindDlg!.querySelectorAll<HTMLElement>('cds-button'))
    click(buttons[buttons.length - 1])
    await flushPromises()

    expect(mutateFns.AssignUsersToRole).toHaveBeenCalledTimes(1)
    const vars = mutateFns.AssignUsersToRole.mock.calls[0][0] as {
      input: { roleId: string; userIds: string[] }
    }
    expect(vars.input.roleId).toBe('r-admin')
    expect(vars.input.userIds).toContain('u1')
    expect(toastMessages()).toContain(
      locale.t('users.toast.bindOk').replace('{count}', '1'),
    )
    expect(querySlots.Users.refetch).toHaveBeenCalled()
  })
})

describe('UserRoleView — Roles tab', () => {
  it('renders a row per role with name + userCount, and disables delete for builtIn roles', async () => {
    setUsers([makeUser()])
    setRoles([
      makeRole({ id: 'r-admin', name: 'Administrator', userCount: 3, builtIn: true }),
      makeRole({ id: 'r-custom', name: 'Custom', userCount: 0, builtIn: false }),
    ])
    mountView()
    await flushPromises()

    await switchTab(1)

    const rows = Array.from(roleGrid()!.querySelectorAll('cds-grid-row'))
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('Administrator')
    expect(rows[0].querySelector('.user-count-link')?.textContent?.trim()).toBe('3')

    // builtIn role's delete button is disabled; the custom role's is not.
    // cds-button-action is a custom element, so the boolean `:disabled` binding
    // reflects as the literal string "true"/"false".
    const builtInDelete = rows[0].querySelector('cds-button-action[shape="trash"]')
    const customDelete = rows[1].querySelector('cds-button-action[shape="trash"]')
    expect(builtInDelete?.getAttribute('disabled')).toBe('true')
    expect(customDelete?.getAttribute('disabled')).toBe('false')
  })

  it('shows the empty placeholder when there are no roles', async () => {
    setUsers([makeUser()])
    setRoles([])
    mountView()
    await flushPromises()

    await switchTab(1)

    expect(placeholderText(roleGrid())).toContain(locale.t('roles.empty'))
  })

  it('clicking the userCount link loads the role users via UsersByRole', async () => {
    const underRole = [makeUser({ id: 'u1', username: 'alice' })]
    querySlots.UsersByRole.refetch.mockResolvedValue({
      data: { users: { nodes: underRole, totalCount: underRole.length } },
    })
    setUsers([makeUser()])
    setRoles([makeRole({ id: 'r-admin', name: 'Administrator', userCount: 1, builtIn: true })])
    mountView()
    await flushPromises()

    await switchTab(1)

    click(roleGrid()!.querySelector('.user-count-link'))
    await flushPromises()

    expect(querySlots.UsersByRole.refetch).toHaveBeenCalledWith({ roleId: 'r-admin' })
  })
})
