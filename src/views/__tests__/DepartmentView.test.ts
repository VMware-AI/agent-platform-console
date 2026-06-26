/**
 * Component tests for DepartmentView.vue — the部门与成员管理 (Departments &
 * Memberships) master-detail page wired to the real backend.
 *
 * The view drives THREE separate useQuery calls:
 *   - Departments         → { result, loading, error, refetch }  (master list)
 *   - DepartmentMembers   → { result, loading, error, refetch }  (detail, per
 *                            selected department; enabled only when one is picked)
 *   - Users               → { result, loading }                  (name join +
 *                            add-member picker source)
 * and four apolloClient.mutate ops: createDepartment / deleteDepartment /
 * addMembership / removeMembership.
 *
 * GraphQL is fully mocked. `useQuery` is routed by the operation name on the
 * passed gql document so each of the three queries gets its own controllable
 * refs. `apolloClient.mutate` is a spy. Real Pinia is used so locale.t resolves
 * the real (zh-default) strings the assertions key off of — markup is asserted
 * only by stable class hooks, never brittle exact tags.
 *
 * cds-* are Clarity custom elements; we treat them as custom elements so mount()
 * does not warn or try to resolve them as Vue components.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ref, type Ref } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import type {
  DepartmentNode,
  DepartmentsResult,
  DepartmentMembersResult,
  MembershipNode,
} from '@/api/graphql/queries/departments'
import type { AccountUser } from '@/api/graphql/types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

interface UsersQueryResult {
  users: { nodes: AccountUser[] }
}

// Per-query controllable refs, re-assigned in beforeEach for a clean state.
let departmentsResult: Ref<DepartmentsResult | undefined>
let departmentsLoading: Ref<boolean>
let departmentsError: Ref<unknown>
let refetchDepartments: Mock

let membersResult: Ref<DepartmentMembersResult | undefined>
let membersLoading: Ref<boolean>
let membersError: Ref<unknown>
let refetchMembers: Mock

let usersResult: Ref<UsersQueryResult | undefined>
let usersLoading: Ref<boolean>

/**
 * Pull the operation name off a gql document so we can route useQuery. Some
 * documents (e.g. USERS_QUERY) interpolate a fragment first, so `definitions[0]`
 * may be a FragmentDefinition — pick the OperationDefinition explicitly.
 */
function operationName(doc: unknown): string {
  const definitions = (doc as {
    definitions?: Array<{ kind?: string; name?: { value?: string } }>
  })?.definitions
  const op = definitions?.find((d) => d.kind === 'OperationDefinition')
  return op?.name?.value ?? ''
}

vi.mock('@vue/apollo-composable', () => ({
  useQuery: (doc: unknown) => {
    switch (operationName(doc)) {
      case 'Departments':
        return {
          result: departmentsResult,
          loading: departmentsLoading,
          error: departmentsError,
          refetch: refetchDepartments,
        }
      case 'DepartmentMembers':
        return {
          result: membersResult,
          loading: membersLoading,
          error: membersError,
          refetch: refetchMembers,
        }
      case 'Users':
        return { result: usersResult, loading: usersLoading }
      default:
        throw new Error(`unexpected useQuery operation: ${operationName(doc)}`)
    }
  },
}))

const mutateMock = vi.fn()
vi.mock('@/api/graphql/client', () => ({
  apolloClient: {
    mutate: (...args: unknown[]) => mutateMock(...args),
  },
}))

// Import the view AFTER the mocks are registered.
import DepartmentView from '@/views/DepartmentView.vue'

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const mountConfig = {
  global: {
    config: {
      compilerOptions: {
        isCustomElement: (tag: string) => tag.startsWith('cds-'),
      },
    },
  },
}

function makeDepartment(over: Partial<DepartmentNode> = {}): DepartmentNode {
  return {
    id: 'd1',
    tenantId: 't1',
    name: 'Engineering',
    litellmTeamId: 'team-eng',
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function makeMember(over: Partial<MembershipNode> = {}): MembershipNode {
  return {
    id: 'm1',
    userId: 'u1',
    departmentId: 'd1',
    role: 'user',
    ...over,
  }
}

function makeUser(over: Partial<AccountUser> = {}): AccountUser {
  return {
    id: 'u1',
    username: 'alice',
    displayName: 'Alice Anderson',
    email: 'alice@example.com',
    role: { id: 'r1', name: 'member' },
    connectionStatus: 'online',
    lastLoginAt: null,
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  } as AccountUser
}

let wrapper: VueWrapper | null = null

beforeEach(() => {
  setActivePinia(createPinia())

  departmentsResult = ref<DepartmentsResult | undefined>(undefined)
  departmentsLoading = ref(false)
  departmentsError = ref<unknown>(null)
  refetchDepartments = vi.fn().mockResolvedValue(undefined)

  membersResult = ref<DepartmentMembersResult | undefined>(undefined)
  membersLoading = ref(false)
  membersError = ref<unknown>(null)
  refetchMembers = vi.fn().mockResolvedValue(undefined)

  usersResult = ref<UsersQueryResult | undefined>({ users: { nodes: [] } })
  usersLoading = ref(false)

  mutateMock.mockReset()
  mutateMock.mockResolvedValue({ data: {} })
  useToast().clear()
  vi.useRealTimers()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  // Both inline dialogs teleport to <body>; scrub any leftover backdrop.
  document.body.querySelectorAll('.dept-backdrop, .confirm-backdrop').forEach((el) => el.remove())
})

function dangerToasts() {
  return useToast().toasts.value.filter((t) => t.status === 'danger')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DepartmentView', () => {
  it('renders the page heading + description from locale keys', () => {
    const locale = useLocaleStore()
    wrapper = mount(DepartmentView, mountConfig)
    const text = wrapper.text()
    expect(text).toContain(locale.t('department.title'))
    expect(text).toContain(locale.t('department.description'))
  })

  // ---------------- Master list states ----------------

  it('shows the loading state for the master list before any data arrives', () => {
    const locale = useLocaleStore()
    departmentsLoading.value = true
    wrapper = mount(DepartmentView, mountConfig)
    expect(wrapper.text()).toContain(locale.t('department.list.loading'))
    expect(wrapper.find('.dept-list').exists()).toBe(false)
  })

  it('shows the empty state (not the error copy) when there are no departments', () => {
    const locale = useLocaleStore()
    departmentsResult.value = { departments: [] }
    wrapper = mount(DepartmentView, mountConfig)

    const state = wrapper.find('.panel-state')
    expect(state.text()).toContain(locale.t('department.list.empty'))
    expect(wrapper.text()).not.toContain(locale.t('department.list.error'))
    expect(wrapper.findAll('.dept-item')).toHaveLength(0)
  })

  it('shows the error state with role=alert when the departments query fails', () => {
    const locale = useLocaleStore()
    departmentsResult.value = { departments: [] }
    departmentsError.value = new Error('boom')
    wrapper = mount(DepartmentView, mountConfig)

    const alert = wrapper.find('.panel-state.error[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain(locale.t('department.list.error'))
  })

  it('renders one row per department and auto-selects the first one', () => {
    departmentsResult.value = {
      departments: [
        makeDepartment({ id: 'd1', name: 'Engineering' }),
        makeDepartment({ id: 'd2', name: 'Marketing' }),
      ],
    }
    wrapper = mount(DepartmentView, mountConfig)

    const items = wrapper.findAll('.dept-item')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('Engineering')
    expect(items[1].text()).toContain('Marketing')
    // First department auto-selected (immediate watcher) → active + pressed.
    expect(items[0].classes()).toContain('active')
    expect(items[0].attributes('aria-pressed')).toBe('true')
    expect(items[1].attributes('aria-pressed')).toBe('false')
  })

  it('shows the detail empty placeholder when no department is selected', () => {
    const locale = useLocaleStore()
    departmentsResult.value = { departments: [] }
    wrapper = mount(DepartmentView, mountConfig)
    expect(wrapper.find('.detail-empty').exists()).toBe(true)
    expect(wrapper.find('.detail-empty').text()).toContain(locale.t('department.detail.empty'))
  })

  // ---------------- Detail / members ----------------

  it('renders the selected department detail + member rows with joined user names', () => {
    const locale = useLocaleStore()
    departmentsResult.value = { departments: [makeDepartment({ id: 'd1', name: 'Engineering' })] }
    membersResult.value = {
      departmentMembers: [
        makeMember({ id: 'm1', userId: 'u1', role: 'user' }),
        makeMember({ id: 'm2', userId: 'u2', role: 'dept_admin' }),
      ],
    }
    usersResult.value = {
      users: {
        nodes: [
          makeUser({ id: 'u1', displayName: 'Alice Anderson' }),
          makeUser({ id: 'u2', displayName: 'Bob Brown', username: 'bob' }),
        ],
      },
    }
    wrapper = mount(DepartmentView, mountConfig)

    // Detail header carries the selected department name.
    expect(wrapper.find('.detail-title').text()).toBe('Engineering')

    const memberItems = wrapper.findAll('.member-item')
    expect(memberItems).toHaveLength(2)
    // Membership rows are joined client-side to the users query for display names.
    expect(memberItems[0].find('.member-name').text()).toBe('Alice Anderson')
    expect(memberItems[1].find('.member-name').text()).toBe('Bob Brown')
    // Roles surfaced via the department.role.<role> locale keys.
    expect(memberItems[0].text()).toContain(locale.t('department.role.user'))
    expect(memberItems[1].text()).toContain(locale.t('department.role.dept_admin'))
    // Member count badge reflects the list length.
    expect(wrapper.find('.members-count').text()).toContain('2')
  })

  it('falls back to an unknown-user label when a member has no matching user', () => {
    const locale = useLocaleStore()
    departmentsResult.value = { departments: [makeDepartment({ id: 'd1' })] }
    membersResult.value = { departmentMembers: [makeMember({ id: 'm1', userId: 'ghost' })] }
    usersResult.value = { users: { nodes: [] } }
    wrapper = mount(DepartmentView, mountConfig)

    const name = wrapper.find('.member-name').text()
    expect(name).toContain(locale.t('department.members.unknownUser'))
    expect(name).toContain('ghost')
  })

  it('shows the members empty state when the selected department has no members', () => {
    const locale = useLocaleStore()
    departmentsResult.value = { departments: [makeDepartment({ id: 'd1' })] }
    membersResult.value = { departmentMembers: [] }
    wrapper = mount(DepartmentView, mountConfig)

    expect(wrapper.findAll('.member-item')).toHaveLength(0)
    expect(wrapper.text()).toContain(locale.t('department.members.empty'))
  })

  it('shows the members error state with role=alert when the members query fails', () => {
    const locale = useLocaleStore()
    departmentsResult.value = { departments: [makeDepartment({ id: 'd1' })] }
    membersResult.value = { departmentMembers: [] }
    membersError.value = new Error('members boom')
    wrapper = mount(DepartmentView, mountConfig)

    const alert = wrapper.find('.members-section .panel-state.error[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain(locale.t('department.members.error'))
  })

  it('switches the detail panel when a different department is clicked', async () => {
    departmentsResult.value = {
      departments: [
        makeDepartment({ id: 'd1', name: 'Engineering' }),
        makeDepartment({ id: 'd2', name: 'Marketing' }),
      ],
    }
    wrapper = mount(DepartmentView, mountConfig)
    // Auto-selected first.
    expect(wrapper.find('.detail-title').text()).toBe('Engineering')

    await wrapper.findAll('.dept-item')[1].trigger('click')
    await flushPromises()

    expect(wrapper.find('.detail-title').text()).toBe('Marketing')
    expect(wrapper.findAll('.dept-item')[1].classes()).toContain('active')
  })

  // ---------------- Create department ----------------

  it('opens the create dialog from the toolbar button', async () => {
    const locale = useLocaleStore()
    departmentsResult.value = { departments: [] }
    wrapper = mount(DepartmentView, mountConfig)

    expect(document.body.querySelector('.dept-backdrop')).toBeNull()
    // The first toolbar button is "New Department".
    await wrapper.find('.toolbar cds-button').trigger('click')
    await flushPromises()

    const backdrop = document.body.querySelector('.dept-backdrop')
    expect(backdrop).not.toBeNull()
    expect(backdrop?.textContent).toContain(locale.t('department.create.title'))
  })

  it('rejects an empty department name with an error toast and no mutation', async () => {
    const locale = useLocaleStore()
    departmentsResult.value = { departments: [] }
    wrapper = mount(DepartmentView, mountConfig)

    await wrapper.find('.toolbar cds-button').trigger('click')
    await flushPromises()

    // Submit the form with a blank name.
    const form = document.body.querySelector<HTMLFormElement>('.dept-card')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(mutateMock).not.toHaveBeenCalled()
    expect(dangerToasts().some((t) => t.message === locale.t('department.create.nameRequired'))).toBe(
      true,
    )
  })

  it('creates a department: calls the mutation with the trimmed name, toasts, refetches, selects it', async () => {
    const locale = useLocaleStore()
    const toast = useToast()
    departmentsResult.value = { departments: [] }
    mutateMock.mockResolvedValueOnce({ data: { createDepartment: makeDepartment({ id: 'new1' }) } })
    wrapper = mount(DepartmentView, mountConfig)

    await wrapper.find('.toolbar cds-button').trigger('click')
    await flushPromises()

    // Only the name is typed (a budget is exercised in a dedicated test below).
    // Surrounding whitespace is trimmed by the component before submission.
    const nameInput = document.body.querySelectorAll<HTMLInputElement>('.dept-card input')[0]
    nameInput.value = '  Research  '
    nameInput.dispatchEvent(new Event('input'))
    await flushPromises()

    const form = document.body.querySelector<HTMLFormElement>('.dept-card')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const call = mutateMock.mock.calls[0][0] as {
      variables: { input: { name: string; maxBudget: number | null } }
    }
    expect(call.variables.input.name).toBe('Research')
    // A blank budget is omitted as null.
    expect(call.variables.input.maxBudget).toBeNull()

    expect(toast.toasts.value.some((t) => t.message === locale.t('department.toast.created'))).toBe(
      true,
    )
    expect(refetchDepartments).toHaveBeenCalled()
    // Dialog closes on success.
    expect(document.body.querySelector('.dept-backdrop')).toBeNull()
  })

  it('creates a department with a typed numeric budget: forwards maxBudget as a number', async () => {
    departmentsResult.value = { departments: [] }
    mutateMock.mockResolvedValueOnce({ data: { createDepartment: makeDepartment({ id: 'new2' }) } })
    wrapper = mount(DepartmentView, mountConfig)

    await wrapper.find('.toolbar cds-button').trigger('click')
    await flushPromises()

    const nameInput = document.body.querySelectorAll<HTMLInputElement>('.dept-card input')[0]
    // The budget field is <input type="number">; Vue's v-model coerces the typed
    // value to a JS number, and the component normalizes via String(...) before
    // parsing, so the mutation must receive the numeric budget.
    const budgetInput = document.body.querySelector<HTMLInputElement>('.dept-card input[type="number"]')!
    nameInput.value = 'Research'
    nameInput.dispatchEvent(new Event('input'))
    budgetInput.value = '250'
    budgetInput.dispatchEvent(new Event('input'))
    await flushPromises()

    const form = document.body.querySelector<HTMLFormElement>('.dept-card')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const call = mutateMock.mock.calls[0][0] as {
      variables: { input: { name: string; maxBudget: number | null } }
    }
    expect(call.variables.input.name).toBe('Research')
    expect(call.variables.input.maxBudget).toBe(250)
  })

  it('surfaces a graphql error via toast when create fails and keeps the dialog open', async () => {
    departmentsResult.value = { departments: [] }
    mutateMock.mockRejectedValueOnce({
      graphQLErrors: [{ message: 'not authorized: admin role required' }],
    })
    wrapper = mount(DepartmentView, mountConfig)

    await wrapper.find('.toolbar cds-button').trigger('click')
    await flushPromises()

    const nameInput = document.body.querySelector<HTMLInputElement>('.dept-card input')!
    nameInput.value = 'Research'
    nameInput.dispatchEvent(new Event('input'))
    await flushPromises()

    const form = document.body.querySelector<HTMLFormElement>('.dept-card')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    // Backend domain message surfaced verbatim.
    expect(dangerToasts().some((t) => t.message === 'not authorized: admin role required')).toBe(true)
    expect(refetchDepartments).not.toHaveBeenCalled()
    // Dialog stays open so the user can retry.
    expect(document.body.querySelector('.dept-backdrop')).not.toBeNull()
  })

  // ---------------- Delete department ----------------

  it('deletes a department after confirm: mutation with the id, toast, refetch', async () => {
    const locale = useLocaleStore()
    const toast = useToast()
    departmentsResult.value = { departments: [makeDepartment({ id: 'd1', name: 'Engineering' })] }
    wrapper = mount(DepartmentView, mountConfig)

    // Open the row dropdown then click the danger delete item.
    await wrapper.find('.row-menu-trigger').trigger('click')
    await flushPromises()
    await wrapper.find('.menu-item.danger').trigger('click')
    await flushPromises()

    // ConfirmDialog teleports an alertdialog; confirm.
    const confirmCard = document.body.querySelector('.confirm-card')
    expect(confirmCard).not.toBeNull()
    expect(confirmCard?.textContent).toContain(locale.t('department.confirm.deleteTitle'))

    const buttons = confirmCard!.querySelectorAll('cds-button')
    // Second button is the confirm action.
    buttons[1].dispatchEvent(new Event('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    expect((mutateMock.mock.calls[0][0] as { variables: { id: string } }).variables.id).toBe('d1')
    expect(toast.toasts.value.some((t) => t.message === locale.t('department.toast.deleted'))).toBe(
      true,
    )
    expect(refetchDepartments).toHaveBeenCalled()
  })

  it('does not delete when the confirm dialog is cancelled', async () => {
    departmentsResult.value = { departments: [makeDepartment({ id: 'd1' })] }
    wrapper = mount(DepartmentView, mountConfig)

    await wrapper.find('.row-menu-trigger').trigger('click')
    await flushPromises()
    await wrapper.find('.menu-item.danger').trigger('click')
    await flushPromises()

    const confirmCard = document.body.querySelector('.confirm-card')!
    // First button is cancel.
    confirmCard.querySelectorAll('cds-button')[0].dispatchEvent(new Event('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).not.toHaveBeenCalled()
    expect(document.body.querySelector('.confirm-card')).toBeNull()
  })

  it('surfaces a graphql error toast when delete fails', async () => {
    departmentsResult.value = { departments: [makeDepartment({ id: 'd1' })] }
    mutateMock.mockRejectedValueOnce({
      graphQLErrors: [{ message: 'department is not empty' }],
    })
    wrapper = mount(DepartmentView, mountConfig)

    await wrapper.find('.row-menu-trigger').trigger('click')
    await flushPromises()
    await wrapper.find('.menu-item.danger').trigger('click')
    await flushPromises()

    const confirmCard = document.body.querySelector('.confirm-card')!
    confirmCard.querySelectorAll('cds-button')[1].dispatchEvent(new Event('click', { bubbles: true }))
    await flushPromises()

    expect(dangerToasts().some((t) => t.message === 'department is not empty')).toBe(true)
    expect(refetchDepartments).not.toHaveBeenCalled()
  })

  // ---------------- Add member (user picker) ----------------

  it('opens the add-member dialog and offers only users not already assigned', async () => {
    const locale = useLocaleStore()
    departmentsResult.value = { departments: [makeDepartment({ id: 'd1' })] }
    membersResult.value = { departmentMembers: [makeMember({ id: 'm1', userId: 'u1' })] }
    usersResult.value = {
      users: {
        nodes: [
          makeUser({ id: 'u1', displayName: 'Alice' }),
          makeUser({ id: 'u2', displayName: 'Bob', username: 'bob' }),
        ],
      },
    }
    wrapper = mount(DepartmentView, mountConfig)

    // The members-head "Add Member" button opens the dialog.
    await wrapper.find('.members-head cds-button').trigger('click')
    await flushPromises()

    const backdrop = document.body.querySelector('.dept-backdrop')
    expect(backdrop).not.toBeNull()
    expect(backdrop?.textContent).toContain(locale.t('department.addMember.title'))

    // Picker options exclude already-assigned u1, leaving only u2 (plus the
    // disabled placeholder option).
    const select = document.body.querySelector<HTMLSelectElement>('.dept-card select')!
    const optionValues = Array.from(select.options)
      .map((o) => o.value)
      .filter((v) => v !== '')
    expect(optionValues).toEqual(['u2'])
  })

  it('shows the "all assigned" copy when every user is already a member', async () => {
    const locale = useLocaleStore()
    departmentsResult.value = { departments: [makeDepartment({ id: 'd1' })] }
    membersResult.value = { departmentMembers: [makeMember({ id: 'm1', userId: 'u1' })] }
    usersResult.value = { users: { nodes: [makeUser({ id: 'u1' })] } }
    wrapper = mount(DepartmentView, mountConfig)

    await wrapper.find('.members-head cds-button').trigger('click')
    await flushPromises()

    const backdrop = document.body.querySelector('.dept-backdrop')!
    expect(backdrop.textContent).toContain(locale.t('department.addMember.allAssigned'))
    // No picker select is rendered when there is nothing assignable.
    expect(backdrop.querySelector('select')).toBeNull()
  })

  it('adds a member: mutation with userId/departmentId/role, success toast, refetch', async () => {
    const locale = useLocaleStore()
    const toast = useToast()
    departmentsResult.value = { departments: [makeDepartment({ id: 'd1' })] }
    membersResult.value = { departmentMembers: [] }
    usersResult.value = {
      users: { nodes: [makeUser({ id: 'u2', displayName: 'Bob', username: 'bob' })] },
    }
    wrapper = mount(DepartmentView, mountConfig)

    await wrapper.find('.members-head cds-button').trigger('click')
    await flushPromises()

    // Pick the user (first select) — switch role select to dept_admin (second).
    const selects = document.body.querySelectorAll<HTMLSelectElement>('.dept-card select')
    const userSelect = selects[0]
    const roleSelect = selects[1]
    userSelect.value = 'u2'
    userSelect.dispatchEvent(new Event('change'))
    roleSelect.value = 'dept_admin'
    roleSelect.dispatchEvent(new Event('change'))
    await flushPromises()

    const form = document.body.querySelector<HTMLFormElement>('.dept-card')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const vars = (mutateMock.mock.calls[0][0] as {
      variables: { userId: string; departmentId: string; role: string }
    }).variables
    expect(vars.userId).toBe('u2')
    expect(vars.departmentId).toBe('d1')
    expect(vars.role).toBe('dept_admin')

    expect(
      toast.toasts.value.some((t) => t.message === locale.t('department.toast.memberAdded')),
    ).toBe(true)
    expect(refetchMembers).toHaveBeenCalled()
    expect(document.body.querySelector('.dept-backdrop')).toBeNull()
  })

  it('rejects add-member with no user selected: error toast, no mutation', async () => {
    const locale = useLocaleStore()
    departmentsResult.value = { departments: [makeDepartment({ id: 'd1' })] }
    membersResult.value = { departmentMembers: [] }
    usersResult.value = { users: { nodes: [makeUser({ id: 'u2' })] } }
    wrapper = mount(DepartmentView, mountConfig)

    await wrapper.find('.members-head cds-button').trigger('click')
    await flushPromises()

    // Submit without picking a user (default userId is '').
    const form = document.body.querySelector<HTMLFormElement>('.dept-card')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(mutateMock).not.toHaveBeenCalled()
    expect(
      dangerToasts().some((t) => t.message === locale.t('department.addMember.userRequired')),
    ).toBe(true)
  })

  it('surfaces a graphql error toast when add-member fails', async () => {
    departmentsResult.value = { departments: [makeDepartment({ id: 'd1' })] }
    membersResult.value = { departmentMembers: [] }
    usersResult.value = { users: { nodes: [makeUser({ id: 'u2' })] } }
    mutateMock.mockRejectedValueOnce({
      graphQLErrors: [{ message: 'membership already exists' }],
    })
    wrapper = mount(DepartmentView, mountConfig)

    await wrapper.find('.members-head cds-button').trigger('click')
    await flushPromises()

    const userSelect = document.body.querySelector<HTMLSelectElement>('.dept-card select')!
    userSelect.value = 'u2'
    userSelect.dispatchEvent(new Event('change'))
    await flushPromises()

    const form = document.body.querySelector<HTMLFormElement>('.dept-card')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(dangerToasts().some((t) => t.message === 'membership already exists')).toBe(true)
    expect(refetchMembers).not.toHaveBeenCalled()
  })

  // ---------------- Remove member ----------------

  it('removes a member after confirm: mutation with userId/departmentId, toast, refetch', async () => {
    const locale = useLocaleStore()
    const toast = useToast()
    departmentsResult.value = { departments: [makeDepartment({ id: 'd1' })] }
    membersResult.value = { departmentMembers: [makeMember({ id: 'm1', userId: 'u1' })] }
    usersResult.value = { users: { nodes: [makeUser({ id: 'u1' })] } }
    wrapper = mount(DepartmentView, mountConfig)

    // Each member row has a remove button (.member-remove).
    await wrapper.find('.member-remove').trigger('click')
    await flushPromises()

    const confirmCard = document.body.querySelector('.confirm-card')
    expect(confirmCard).not.toBeNull()
    expect(confirmCard?.textContent).toContain(locale.t('department.confirm.removeTitle'))

    confirmCard!.querySelectorAll('cds-button')[1].dispatchEvent(new Event('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const vars = (mutateMock.mock.calls[0][0] as {
      variables: { userId: string; departmentId: string }
    }).variables
    expect(vars.userId).toBe('u1')
    expect(vars.departmentId).toBe('d1')
    expect(
      toast.toasts.value.some((t) => t.message === locale.t('department.toast.memberRemoved')),
    ).toBe(true)
    expect(refetchMembers).toHaveBeenCalled()
  })

  it('surfaces a graphql error toast when remove-member fails', async () => {
    departmentsResult.value = { departments: [makeDepartment({ id: 'd1' })] }
    membersResult.value = { departmentMembers: [makeMember({ id: 'm1', userId: 'u1' })] }
    usersResult.value = { users: { nodes: [makeUser({ id: 'u1' })] } }
    mutateMock.mockRejectedValueOnce({
      graphQLErrors: [{ message: 'cannot remove the last dept admin' }],
    })
    wrapper = mount(DepartmentView, mountConfig)

    await wrapper.find('.member-remove').trigger('click')
    await flushPromises()

    const confirmCard = document.body.querySelector('.confirm-card')!
    confirmCard.querySelectorAll('cds-button')[1].dispatchEvent(new Event('click', { bubbles: true }))
    await flushPromises()

    expect(dangerToasts().some((t) => t.message === 'cannot remove the last dept admin')).toBe(true)
    expect(refetchMembers).not.toHaveBeenCalled()
  })

  // ---------------- Refresh ----------------

  it('refresh button refetches departments + members and toasts success', async () => {
    const locale = useLocaleStore()
    const toast = useToast()
    departmentsResult.value = { departments: [makeDepartment({ id: 'd1' })] }
    membersResult.value = { departmentMembers: [] }
    wrapper = mount(DepartmentView, mountConfig)

    await wrapper.find('.refresh-button').trigger('click')
    await flushPromises()

    expect(refetchDepartments).toHaveBeenCalled()
    expect(refetchMembers).toHaveBeenCalled()
    expect(
      toast.toasts.value.some((t) => t.message === locale.t('department.toast.refreshed')),
    ).toBe(true)
  })

  it('refresh is a no-op while the departments query is loading', async () => {
    departmentsLoading.value = true
    departmentsResult.value = { departments: [] }
    wrapper = mount(DepartmentView, mountConfig)

    await wrapper.find('.refresh-button').trigger('click')
    await flushPromises()

    expect(refetchDepartments).not.toHaveBeenCalled()
  })

  it('does not mutate the Apollo cache members array in place (immutability) when sorting users', () => {
    // assignableUsers sorts a copy of the users array; the source order is kept.
    const source = [
      makeUser({ id: 'u2', displayName: 'Zoe', username: 'zoe' }),
      makeUser({ id: 'u1', displayName: 'Alice', username: 'alice' }),
    ]
    departmentsResult.value = { departments: [makeDepartment({ id: 'd1' })] }
    membersResult.value = { departmentMembers: [] }
    usersResult.value = { users: { nodes: source } }
    wrapper = mount(DepartmentView, mountConfig)

    expect(source.map((u) => u.id)).toEqual(['u2', 'u1'])
  })
})
