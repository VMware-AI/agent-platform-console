/**
 * Component tests for VirtualKeyView.vue — 虚拟密钥 / per-user LiteLLM virtual keys.
 *
 * The view lists VirtualKey governance metadata (the secret is NEVER queryable —
 * it is returned ONCE by issue / regenerate and surfaced in a one-time dialog).
 * It runs real mutations via the shared Apollo client:
 *   - issue   → ISSUE_VIRTUAL_KEY      (via VirtualKeyFormModal `.key-form`); on
 *               success closes the form, reveals the secret dialog, toasts created.
 *   - regenerate → REGENERATE_VIRTUAL_KEY (row "more" menu); reveals a fresh secret.
 *   - setEnabled → SET_VIRTUAL_KEY_ENABLED (row toggle + batch enable/disable);
 *               skips terminal 'revoked' keys, toasts the enabled/disabled count.
 *   - revoke  → REVOKE_VIRTUAL_KEY     (delete confirm via ConfirmDialog, teleported
 *               → `.confirm-backdrop`); skips already-revoked keys.
 *
 * Mocking strategy (mirrors SupplierModelView.test.ts):
 *   - `@vue/apollo-composable`'s `useQuery` is mocked. The view fires FOUR queries
 *     (keys / users / agents / policies); we route each to its own controllable
 *     slot by the gql operation name so every list/selector state is deterministic.
 *     `loading` + `refetch` belong to the KEYS query (the only one the view reads).
 *   - `@/api/graphql/client`'s `apolloClient.mutate` is a spy routed by mutation
 *     operation name → returns the right result shape (issue/regen carry a secret).
 *   - real Pinia so `locale.t(...)` resolves real strings; assertions key off the
 *     same `locale.t` keys the component renders, not hard-coded text.
 *   - cds-* are Clarity custom elements (configured globally in vitest/vite); we
 *     assert plain DOM + emitted/spy calls, not brittle markup.
 *
 * The view has no inline error alert — query failure surfaces via a failed refresh
 * toast, and mutation failure via per-action error toasts (graphqlErrorMessage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, type Ref } from 'vue'

import type { VirtualKeyNode, VirtualKeysResult } from '@/api/graphql/queries/virtual-keys'

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

// One slot per query the view fires. Routed by gql operation name.
let keysSlot: QuerySlot
let usersSlot: QuerySlot
let agentsSlot: QuerySlot
let agentsSlot: QuerySlot

// Resolve the gql OperationDefinition name. Some documents interpolate their
// fragment BEFORE the operation (e.g. USERS_QUERY), so definitions[0] may be a
// FragmentDefinition — scan for the operation definition rather than assuming [0].
function operationName(doc: unknown): string {
  const definitions = (doc as {
    definitions?: Array<{ kind?: string; name?: { value?: string } }>
  })?.definitions
  const op = definitions?.find((d) => d?.kind === 'OperationDefinition')
  return op?.name?.value ?? definitions?.[0]?.name?.value ?? ''
}

vi.mock('@vue/apollo-composable', () => ({
  useQuery: (doc: unknown) => {
    const name = operationName(doc)
    const slot =
      name === 'Users'
        ? usersSlot
        : name === 'Agents'
          ? agentsSlot
          : keysSlot
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

import VirtualKeyView from '@/views/VirtualKeyView.vue'
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

function makeNode(over: Partial<VirtualKeyNode> = {}): VirtualKeyNode {
  return {
    id: 'k-1',
    alias: 'Primary Key',
    userId: 'u-1',
    agentId: 'a-1',
    status: 'active',
    expiresAt: null,
    createdAt: '2026-01-01T08:30:00Z',
    ...over,
  }
}

const KEY_ACTIVE = makeNode({ id: 'k-active', alias: 'Alpha Key', status: 'active' })
const KEY_DISABLED = makeNode({
  id: 'k-disabled',
  alias: 'Beta Key',
  status: 'disabled',
  agentId: 'a-2',
})
const KEY_REVOKED = makeNode({
  id: 'k-revoked',
  alias: 'Gamma Key',
  status: 'revoked',
  agentId: null,
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

function setKeys(rows: VirtualKeyNode[]) {
  keysSlot.result.value = { virtualKeys: rows } satisfies VirtualKeysResult
}

let wrapper: VueWrapper | null = null
let locale: ReturnType<typeof useLocaleStore>

function mountView() {
  wrapper = mount(VirtualKeyView, mountConfig)
  return wrapper
}

// --- DOM helpers -----------------------------------------------------------

function rows(): HTMLElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLElement>('cds-grid-row'))
}
function confirmBackdrop(): HTMLElement | null {
  return document.body.querySelector('.confirm-backdrop')
}
function keyForm(): HTMLElement | null {
  return wrapper!.element.querySelector('.key-form')
}
function secretDialog(): HTMLElement | null {
  return wrapper!.element.querySelector('.secret-value')
}
function checkboxes(): HTMLInputElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLInputElement>('input.app-checkbox'))
}
// Opens the row's "more" dropdown (panel renders behind `v-if="open"`, so a
// flush is required) and returns its menu options.
async function rowMenuOptions(rowIndex: number): Promise<HTMLElement[]> {
  const trigger = rows()[rowIndex].querySelector<HTMLElement>('.more-button')!
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flushPromises()
  return Array.from(rows()[rowIndex].querySelectorAll<HTMLElement>('.menu-option'))
}

beforeEach(() => {
  setActivePinia(createPinia())
  // revoke/regenerate buttons are guarded by v-if="auth.role==='admin'"; set admin
  // so these controls are visible in all tests that exercise those paths.
  useAuthStore().role = 'admin'
  locale = useLocaleStore()
  keysSlot = makeSlot()
  usersSlot = makeSlot()
  agentsSlot = makeSlot()
  // Selector + agent-name resolution data the view reads on render.
  usersSlot.result.value = {
    users: { nodes: [{ id: 'u-1', username: 'alice', displayName: 'Alice', email: 'a@x.io' }] },
  }
  agentsSlot.result.value = {
    agents: {
      nodes: [
        { id: 'a-1', name: 'Agent One' },
        { id: 'a-2', name: 'Agent Two' },
      ],
    },
  }
  mutateMock.mockReset()
  // Default: route each mutation to a success shape by operation name.
  mutateMock.mockImplementation((opts: { mutation: unknown }) => {
    const name = operationName(opts.mutation)
    if (name === 'IssueVirtualKey') {
      return Promise.resolve({
        data: { issueVirtualKey: { secret: 'sk-issued-secret', virtualKey: makeNode() } },
      })
    }
    if (name === 'RegenerateVirtualKey') {
      return Promise.resolve({
        data: { regenerateVirtualKey: { secret: 'sk-rotated-secret', virtualKey: makeNode() } },
      })
    }
    if (name === 'SetVirtualKeyEnabled') {
      return Promise.resolve({ data: { setVirtualKeyEnabled: makeNode() } })
    }
    return Promise.resolve({ data: { revokeVirtualKey: true } })
  })
  // Toast state is module-scoped and shared across tests; reset so negative
  // assertions are not polluted by a prior test's toast.
  useToast().clear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.querySelectorAll('.confirm-backdrop').forEach((el) => el.remove())
})

// ---------------------------------------------------------------------------

describe('VirtualKeyView — list states', () => {
  it('disables the refresh button while the keys query is loading', () => {
    keysSlot.loading.value = true
    mountView()
    const refreshBtn = wrapper!.element.querySelector<HTMLElement>('.refresh-button')!
    expect(refreshBtn.hasAttribute('disabled')).toBe(true)
  })

  it('renders the empty placeholder when there are no keys', async () => {
    setKeys([])
    mountView()
    await flushPromises()

    const placeholder = wrapper!.element.querySelector('cds-grid-placeholder')
    expect(placeholder?.textContent).toContain(locale.t('virtualKey.empty'))
    expect(rows()).toHaveLength(0)
    // Footer (pagination) hidden when empty.
    expect(wrapper!.element.querySelector('cds-grid-footer')).toBeNull()
  })

  it('renders one row per key with localized status + resolved agent/policy names', async () => {
    setKeys([KEY_ACTIVE, KEY_DISABLED])
    mountView()
    await flushPromises()

    expect(rows()).toHaveLength(2)

    const first = rows()[0]
    expect(first.textContent).toContain('Alpha Key')
    // active → enabled status string (localized, not the raw 'active' enum).
    expect(first.textContent).toContain(locale.t('virtualKey.status.enabled'))
    // agentId resolved to the agent's display name via the agents query.
    expect(first.textContent).toContain('Agent One')

    const second = rows()[1]
    expect(second.textContent).toContain('Beta Key')
    expect(second.textContent).toContain(locale.t('virtualKey.status.disabled'))
    expect(second.textContent).toContain('Agent Two')
  })

  it('renders revoked keys without a row-actions menu (terminal state)', async () => {
    setKeys([KEY_REVOKED])
    mountView()
    await flushPromises()

    const row = rows()[0]
    expect(row.textContent).toContain('Gamma Key')
    expect(row.textContent).toContain(locale.t('virtualKey.status.revoked'))
    // Terminal: no "more" actions menu, and the row checkbox is disabled.
    expect(row.querySelector('.more-button')).toBeNull()
    const checkbox = row.querySelector<HTMLInputElement>('input.app-checkbox')!
    expect(checkbox.disabled).toBe(true)
  })

  it('shows the pagination summary reflecting the total count', async () => {
    setKeys([KEY_ACTIVE, KEY_DISABLED, KEY_REVOKED])
    mountView()
    await flushPromises()

    const expected = locale
      .t('virtualKey.pagination.summary')
      .replace('{start}', '1')
      .replace('{end}', '3')
      .replace('{total}', '3')
    expect(wrapper!.element.querySelector('.pager-summary')?.textContent).toContain(expected)
  })
})

describe('VirtualKeyView — issue (one-time secret dialog)', () => {
  function openCreate() {
    // First toolbar button is the create action.
    const createBtn = wrapper!.element.querySelector<HTMLElement>('.toolbar cds-button')!
    createBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('opens the issue form from the toolbar create button', async () => {
    setKeys([KEY_ACTIVE])
    mountView()
    await flushPromises()
    expect(keyForm()).toBeNull()

    openCreate()
    await flushPromises()
    expect(keyForm()).not.toBeNull()
  })

  it('issuing mutates ISSUE_VIRTUAL_KEY, reveals the secret once, toasts created, refetches', async () => {
    setKeys([KEY_ACTIVE])
    mountView()
    await flushPromises()

    openCreate()
    await flushPromises()

    // Owner + agent default to the first option (valid); submit the form.
    keyForm()!.dispatchEvent(new Event('submit'))
    await flushPromises()

    // Exactly the issue mutation ran, with the form draft mapped to input.
    expect(mutateMock).toHaveBeenCalledTimes(1)
    const call = mutateMock.mock.calls[0][0] as {
      mutation: unknown
      variables: { input: { userId: string; agentId: string | null } }
    }
    expect(operationName(call.mutation)).toBe('IssueVirtualKey')
    expect(call.variables.input.userId).toBe('u-1')
    expect(call.variables.input.agentId).toBe('a-1')

    // One-time secret is revealed (the value the mutation returned).
    expect(secretDialog()).not.toBeNull()
    expect(secretDialog()?.textContent).toContain('sk-issued-secret')

    expect(toastMessages()).toContain(locale.t('virtualKey.toast.created'))
    expect(keysSlot.refetch).toHaveBeenCalled()
    // Form closes on success.
    expect(keyForm()).toBeNull()
  })

  it('surfaces the backend error and keeps the form open when issue fails', async () => {
    mutateMock.mockImplementationOnce(() =>
      Promise.reject({ graphQLErrors: [{ message: 'quota exceeded' }] }),
    )
    setKeys([KEY_ACTIVE])
    mountView()
    await flushPromises()

    openCreate()
    await flushPromises()
    keyForm()!.dispatchEvent(new Event('submit'))
    await flushPromises()

    // graphqlErrorMessage prefers the backend message over the generic fallback.
    expect(toastMessages()).toContain('quota exceeded')
    expect(toastMessages()).not.toContain(locale.t('virtualKey.toast.created'))
    // No secret leaked; form stays open so the operator can retry.
    expect(secretDialog()).toBeNull()
    expect(keyForm()).not.toBeNull()
  })
})

describe('VirtualKeyView — regenerate (secret rotation)', () => {
  it('regenerating mutates REGENERATE_VIRTUAL_KEY, reveals the rotated secret, toasts, refetches', async () => {
    setKeys([KEY_ACTIVE])
    mountView()
    await flushPromises()

    // Row "more" menu → first option is regenerate.
    const options = await rowMenuOptions(0)
    const regenerate = options.find((o) =>
      o.textContent?.includes(locale.t('virtualKey.action.regenerate')),
    )!
    regenerate.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const call = mutateMock.mock.calls[0][0] as { mutation: unknown; variables: { id: string } }
    expect(operationName(call.mutation)).toBe('RegenerateVirtualKey')
    expect(call.variables.id).toBe('k-active')

    expect(secretDialog()?.textContent).toContain('sk-rotated-secret')
    expect(toastMessages()).toContain(locale.t('virtualKey.toast.regenerated'))
    expect(keysSlot.refetch).toHaveBeenCalled()
  })

  it('surfaces the backend error toast and reveals no secret when regenerate fails', async () => {
    mutateMock.mockImplementationOnce(() =>
      Promise.reject({ graphQLErrors: [{ message: 'key is revoked' }] }),
    )
    setKeys([KEY_ACTIVE])
    mountView()
    await flushPromises()

    const options = await rowMenuOptions(0)
    options
      .find((o) => o.textContent?.includes(locale.t('virtualKey.action.regenerate')))!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('key is revoked')
    expect(toastMessages()).not.toContain(locale.t('virtualKey.toast.regenerated'))
    expect(secretDialog()).toBeNull()
  })
})

describe('VirtualKeyView — setEnabled (toggle + batch)', () => {
  it('toggling a disabled key mutates enabled=true and toasts the enabled count', async () => {
    setKeys([KEY_DISABLED])
    mountView()
    await flushPromises()

    const options = await rowMenuOptions(0)
    // Disabled key → the toggle reads "enable".
    const toggle = options.find((o) =>
      o.textContent?.includes(locale.t('virtualKey.action.enable')),
    )!
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const call = mutateMock.mock.calls[0][0] as {
      mutation: unknown
      variables: { id: string; enabled: boolean }
    }
    expect(operationName(call.mutation)).toBe('SetVirtualKeyEnabled')
    expect(call.variables.id).toBe('k-disabled')
    expect(call.variables.enabled).toBe(true)

    expect(toastMessages()).toContain(locale.t('virtualKey.toast.enabled').replace('{count}', '1'))
    expect(toastStatuses()).toContain('success')
    expect(keysSlot.refetch).toHaveBeenCalled()
  })

  it('toggling an active key mutates enabled=false and toasts the disabled count', async () => {
    setKeys([KEY_ACTIVE])
    mountView()
    await flushPromises()

    const options = await rowMenuOptions(0)
    options
      .find((o) => o.textContent?.includes(locale.t('virtualKey.action.disable')))!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const call = mutateMock.mock.calls[0][0] as { variables: { enabled: boolean } }
    expect(call.variables.enabled).toBe(false)
    expect(toastMessages()).toContain(locale.t('virtualKey.toast.disabled').replace('{count}', '1'))
  })

  it('a failing setEnabled surfaces the GraphQL error toast', async () => {
    mutateMock.mockImplementationOnce(() =>
      Promise.reject({ graphQLErrors: [{ message: 'forbidden: requires admin' }] }),
    )
    setKeys([KEY_ACTIVE])
    mountView()
    await flushPromises()

    const options = await rowMenuOptions(0)
    options
      .find((o) => o.textContent?.includes(locale.t('virtualKey.action.disable')))!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('forbidden: requires admin')
    expect(toastMessages()).not.toContain(
      locale.t('virtualKey.toast.disabled').replace('{count}', '1'),
    )
  })

  it('batch enable mutates once per selected (non-revoked) key and clears the selection', async () => {
    setKeys([KEY_ACTIVE, KEY_DISABLED])
    mountView()
    await flushPromises()

    // Select-all checkbox is the first app-checkbox (header column).
    const selectAll = checkboxes()[0]
    selectAll.checked = true
    selectAll.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(wrapper!.element.querySelector('.selected-summary')?.textContent).toContain(
      locale.t('virtualKey.selected').replace('{count}', '2'),
    )

    // Open the batch dropdown (second toolbar cds-button) then click "enable".
    const batchTrigger = Array.from(
      wrapper!.element.querySelectorAll<HTMLElement>('.toolbar cds-button'),
    )[1]
    batchTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    const enableOption = Array.from(
      wrapper!.element.querySelectorAll<HTMLElement>('.menu-option'),
    ).find((b) => b.textContent?.includes(locale.t('virtualKey.batch.enable')))!
    enableOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // One mutation per selected key (both non-revoked).
    expect(mutateMock).toHaveBeenCalledTimes(2)
    expect(mutateMock.mock.calls.every(([o]) => operationName((o as { mutation: unknown }).mutation) === 'SetVirtualKeyEnabled')).toBe(true)
    expect(toastMessages()).toContain(locale.t('virtualKey.toast.enabled').replace('{count}', '2'))
    // Selection cleared after a successful batch.
    expect(wrapper!.element.querySelector('.selected-summary')).toBeNull()
  })
})

describe('VirtualKeyView — revoke (delete confirm)', () => {
  async function openDelete(rowIndex: number) {
    const options = await rowMenuOptions(rowIndex)
    options
      .find((o) => o.textContent?.includes(locale.t('virtualKey.action.delete')))!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('requesting delete opens a confirm dialog naming the target key', async () => {
    setKeys([KEY_ACTIVE])
    mountView()
    await flushPromises()

    await openDelete(0)
    await flushPromises()

    const card = confirmBackdrop()
    expect(card).not.toBeNull()
    expect(card?.getAttribute('aria-label')).toBe(locale.t('virtualKey.confirm.deleteTitle'))
    // Body interpolates the key's display name.
    expect(card?.textContent).toContain('Alpha Key')
  })

  it('confirming a single delete mutates REVOKE_VIRTUAL_KEY with the id, toasts count, refetches', async () => {
    setKeys([KEY_ACTIVE, KEY_DISABLED])
    mountView()
    await flushPromises()

    await openDelete(1)
    await flushPromises()

    const confirmBtn = confirmBackdrop()!.querySelector<HTMLElement>('cds-button[status="danger"]')!
    confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const call = mutateMock.mock.calls[0][0] as { mutation: unknown; variables: { id: string } }
    expect(operationName(call.mutation)).toBe('RevokeVirtualKey')
    expect(call.variables.id).toBe('k-disabled')

    expect(toastMessages()).toContain(locale.t('virtualKey.toast.deleted').replace('{count}', '1'))
    expect(keysSlot.refetch).toHaveBeenCalled()
    expect(confirmBackdrop()).toBeNull()
  })

  it('cancelling the confirm dialog closes it without mutating', async () => {
    setKeys([KEY_ACTIVE])
    mountView()
    await flushPromises()

    await openDelete(0)
    await flushPromises()
    const cancelBtn = confirmBackdrop()!.querySelector<HTMLElement>('cds-button[action="outline"]')!
    cancelBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(confirmBackdrop()).toBeNull()
    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('a failing revoke surfaces the GraphQL error toast', async () => {
    mutateMock.mockImplementationOnce(() =>
      Promise.reject({ graphQLErrors: [{ message: 'key in use by active sessions' }] }),
    )
    setKeys([KEY_ACTIVE])
    mountView()
    await flushPromises()

    await openDelete(0)
    await flushPromises()
    confirmBackdrop()!
      .querySelector<HTMLElement>('cds-button[status="danger"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('key in use by active sessions')
    expect(toastMessages()).not.toContain(
      locale.t('virtualKey.toast.deleted').replace('{count}', '1'),
    )
  })
})

describe('VirtualKeyView — filtering + refresh', () => {
  it('the status filter narrows the visible rows to enabled keys', async () => {
    setKeys([KEY_ACTIVE, KEY_DISABLED, KEY_REVOKED])
    mountView()
    await flushPromises()
    expect(rows()).toHaveLength(3)

    // Filter buttons in column order: NAME[0], AGENT[1], STATUS[2], ...
    const filterButtons = Array.from(
      wrapper!.element.querySelectorAll<HTMLElement>('cds-button-action[shape="filter"]'),
    )
    filterButtons[2].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const enabledOption = Array.from(
      wrapper!.element.querySelectorAll<HTMLElement>('.filter-option'),
    ).find((b) => b.textContent?.includes(locale.t('virtualKey.filter.status.ENABLED')))!
    enabledOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // Only the single active key remains.
    expect(rows()).toHaveLength(1)
    expect(rows()[0].textContent).toContain('Alpha Key')
  })

  it('the name filter narrows rows by alias substring', async () => {
    setKeys([KEY_ACTIVE, KEY_DISABLED])
    mountView()
    await flushPromises()
    expect(rows()).toHaveLength(2)

    const filterButtons = Array.from(
      wrapper!.element.querySelectorAll<HTMLElement>('cds-button-action[shape="filter"]'),
    )
    filterButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const nameInput = wrapper!.element.querySelector<HTMLInputElement>('.filter-input')!
    nameInput.value = 'Beta'
    nameInput.dispatchEvent(new Event('input'))
    await flushPromises()

    expect(rows()).toHaveLength(1)
    expect(rows()[0].textContent).toContain('Beta Key')
  })

  it('refresh refetches and toasts on success', async () => {
    setKeys([KEY_ACTIVE])
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.refresh-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(keysSlot.refetch).toHaveBeenCalled()
    expect(toastMessages()).toContain(locale.t('virtualKey.toast.refreshed'))
  })

  it('refresh surfaces an error toast when refetch rejects', async () => {
    setKeys([KEY_ACTIVE])
    keysSlot.refetch.mockRejectedValueOnce(new Error('network down'))
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.refresh-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('network down')
    expect(toastMessages()).not.toContain(locale.t('virtualKey.toast.refreshed'))
  })
})
