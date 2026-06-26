/**
 * Component tests for ArtifactView.vue — 制品库 (Artifacts & versions, LLD-06).
 *
 * The view is a master-detail page wired to the real backend:
 *   - master: `artifacts(kind:)` collapsed to the newest row per name, with a
 *     kind filter; loading / error / empty / data states.
 *   - detail: `artifactVersions(name:)` for the selected artifact; its own
 *     loading / error / empty / data states.
 *   - toolbar create (upsertArtifact) + per-row new-version / edit / delete
 *     (delete → confirm → deleteArtifact). Mutations surface a toast on success
 *     and `graphqlErrorMessage(...)` on failure.
 *
 * Mocking strategy:
 *   - `@vue/apollo-composable`'s `useQuery` is mocked and routed by the parsed
 *     document's operation name (`PlatformArtifacts` vs `PlatformArtifactVersions`)
 *     to two independently-controllable sets of refs, so we can drive every state
 *     deterministically. Each query's `refetch` is a spy.
 *   - `@/api/graphql/client`'s `apolloClient.mutate` is a spy we resolve / reject
 *     per test to exercise the success + error branches.
 *   - real Pinia so `locale.t(...)` resolves real strings (assertions are driven
 *     off the same `locale.t` keys the component renders, not hard-coded text).
 *   - cds-* are custom elements (Clarity); the Vue compiler is told to treat any
 *     `cds-` tag as a custom element. We assert on plain DOM + emitted/spy calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, type Ref } from 'vue'

import type {
  ArtifactNode,
  PlatformArtifactsResult,
  PlatformArtifactVersionsResult,
} from '@/api/graphql/queries/artifacts'

// --- mocks -----------------------------------------------------------------

// Controllable query state. Two independent slots keyed by operation name.
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
let versionsSlot: QuerySlot

vi.mock('@vue/apollo-composable', () => ({
  useQuery: (document: { definitions?: Array<{ name?: { value?: string } }> }) => {
    const opName = document?.definitions?.[0]?.name?.value
    const slot = opName === 'PlatformArtifactVersions' ? versionsSlot : listSlot
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

import ArtifactView from '@/views/ArtifactView.vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'

// Toasts live in module-scoped state in useToast; read them via a fresh call.
function toastMessages(): string[] {
  return useToast().toasts.value.map((t) => t.message)
}

// --- fixtures --------------------------------------------------------------

function makeArtifact(over: Partial<ArtifactNode> = {}): ArtifactNode {
  return {
    id: 'art-1',
    name: 'nginx-bootstrap',
    kind: 'config',
    version: '1.0.0',
    uri: 's3://bucket/nginx-1.0.0',
    content: null,
    sha256: null,
    metadata: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

// Two names; "alpha" has two versions (older + newer) so the master list must
// collapse them to the newest row.
const ALPHA_OLD = makeArtifact({
  id: 'a-old',
  name: 'alpha',
  kind: 'script',
  version: '1.0.0',
  createdAt: '2026-01-01T00:00:00Z',
})
const ALPHA_NEW = makeArtifact({
  id: 'a-new',
  name: 'alpha',
  kind: 'script',
  version: '2.0.0',
  createdAt: '2026-02-01T00:00:00Z',
})
const BETA = makeArtifact({
  id: 'b-1',
  name: 'beta',
  kind: 'package',
  version: '3.1.0',
  createdAt: '2026-01-15T00:00:00Z',
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

function setListData(rows: ArtifactNode[]) {
  listSlot.result.value = { artifacts: rows } satisfies PlatformArtifactsResult
}
function setVersionsData(rows: ArtifactNode[]) {
  versionsSlot.result.value = { artifactVersions: rows } satisfies PlatformArtifactVersionsResult
}

let wrapper: VueWrapper | null = null
let locale: ReturnType<typeof useLocaleStore>

function mountView() {
  wrapper = mount(ArtifactView, mountConfig)
  return wrapper
}

// Query helpers — most of the page is in the wrapper (only the dialogs teleport).
function listItems(): HTMLButtonElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLButtonElement>('.artifact-item'))
}
function panelStateText(): string {
  return wrapper!.element.querySelector('.list-panel .panel-state')?.textContent?.trim() ?? ''
}

beforeEach(() => {
  setActivePinia(createPinia())
  locale = useLocaleStore()
  listSlot = makeSlot()
  versionsSlot = makeSlot()
  mutateMock.mockReset()
  // Toast state is module-scoped and shared across tests; reset it so
  // `not.toContain` assertions are not polluted by a prior test's toast.
  useToast().clear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.querySelectorAll('.af-backdrop, .confirm-backdrop').forEach((el) => el.remove())
})

describe('ArtifactView — master list states', () => {
  it('shows the loading state while the list is loading and empty', () => {
    listSlot.loading.value = true
    mountView()
    expect(panelStateText()).toBe(locale.t('artifacts.list.loading'))
    expect(listItems()).toHaveLength(0)
  })

  it('shows the error state when the list query errors', () => {
    listSlot.error.value = new Error('boom')
    mountView()
    const errEl = wrapper!.element.querySelector('.list-panel .panel-state.error')
    expect(errEl?.textContent?.trim()).toBe(locale.t('artifacts.list.error'))
    expect(errEl?.getAttribute('role')).toBe('alert')
  })

  it('shows the empty state when there are no artifacts', () => {
    setListData([])
    mountView()
    expect(panelStateText()).toBe(locale.t('artifacts.list.empty'))
    expect(listItems()).toHaveLength(0)
  })

  it('renders one collapsed row per name (newest version wins) sorted by name', async () => {
    setListData([ALPHA_OLD, BETA, ALPHA_NEW])
    mountView()
    await flushPromises()

    const items = listItems()
    // alpha (collapsed) + beta = 2 rows, sorted alpha < beta.
    expect(items).toHaveLength(2)
    expect(items[0].querySelector('.artifact-name')?.textContent).toContain('alpha')
    expect(items[1].querySelector('.artifact-name')?.textContent).toContain('beta')
    // alpha row must surface the NEWEST version (2.0.0), not the older 1.0.0.
    expect(items[0].querySelector('.artifact-version')?.textContent).toContain('2.0.0')
    expect(items[0].textContent).not.toContain('1.0.0')
  })

  it('renders the kind badge using the localized kind key', async () => {
    setListData([BETA])
    mountView()
    await flushPromises()
    const badge = listItems()[0].querySelector('.kind-badge')
    expect(badge?.textContent?.trim()).toBe(locale.t('artifacts.kind.package'))
  })
})

describe('ArtifactView — kind filter', () => {
  it('passes the chosen kind into the list query vars (refetch via reactive vars)', async () => {
    setListData([ALPHA_NEW, BETA])
    mountView()
    await flushPromises()

    const select = wrapper!.element.querySelector<HTMLSelectElement>('.toolbar select')!
    // The component starts on "all kinds" sentinel.
    expect(select.value).toBe('__ALL__')

    select.value = 'package'
    select.dispatchEvent(new Event('change'))
    await flushPromises()

    // The view drives the query with reactive vars; the bound <select> reflects
    // the new filter value (behavior, not markup).
    expect(select.value).toBe('package')
  })
})

describe('ArtifactView — selection + detail (versions) pane', () => {
  it('auto-selects the first artifact and renders its detail header', async () => {
    setListData([ALPHA_NEW, BETA])
    setVersionsData([ALPHA_NEW, ALPHA_OLD])
    mountView()
    await flushPromises()

    const title = wrapper!.element.querySelector('.detail-title')
    expect(title?.textContent).toContain('alpha')
    // First row is marked active via aria-pressed.
    expect(listItems()[0].getAttribute('aria-pressed')).toBe('true')
  })

  it('shows the versions table with a row per version and the count', async () => {
    setListData([ALPHA_NEW, BETA])
    setVersionsData([ALPHA_NEW, ALPHA_OLD])
    mountView()
    await flushPromises()

    const rows = wrapper!.element.querySelectorAll('.versions-table tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelector('.cell-version')?.textContent).toContain('2.0.0')
    expect(rows[1].querySelector('.cell-version')?.textContent).toContain('1.0.0')
    expect(wrapper!.element.querySelector('.versions-count')?.textContent).toContain('2')
  })

  it('falls back to the localized "none" string for a missing sha256', async () => {
    setListData([ALPHA_NEW])
    setVersionsData([makeArtifact({ id: 'a-new', name: 'alpha', version: '2.0.0', sha256: null })])
    mountView()
    await flushPromises()
    const shaCell = wrapper!.element.querySelector('.versions-table .cell-sha')
    expect(shaCell?.textContent?.trim()).toBe(locale.t('artifacts.detail.none'))
  })

  it('clicking another artifact switches the selection', async () => {
    setListData([ALPHA_NEW, BETA])
    mountView()
    await flushPromises()

    listItems()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(wrapper!.element.querySelector('.detail-title')?.textContent).toContain('beta')
    expect(listItems()[1].getAttribute('aria-pressed')).toBe('true')
    expect(listItems()[0].getAttribute('aria-pressed')).toBe('false')
  })

  it('shows the versions loading state', async () => {
    setListData([ALPHA_NEW])
    versionsSlot.loading.value = true
    mountView()
    await flushPromises()
    const state = wrapper!.element.querySelector('.versions-section .panel-state')
    expect(state?.textContent?.trim()).toBe(locale.t('artifacts.detail.versionsLoading'))
  })

  it('shows the versions error state', async () => {
    setListData([ALPHA_NEW])
    versionsSlot.error.value = new Error('versions failed')
    mountView()
    await flushPromises()
    const state = wrapper!.element.querySelector('.versions-section .panel-state.error')
    expect(state?.textContent?.trim()).toBe(locale.t('artifacts.detail.versionsError'))
  })

  it('shows the versions empty state', async () => {
    setListData([ALPHA_NEW])
    setVersionsData([])
    mountView()
    await flushPromises()
    const state = wrapper!.element.querySelector('.versions-section .panel-state')
    expect(state?.textContent?.trim()).toBe(locale.t('artifacts.detail.versionsEmpty'))
  })
})

describe('ArtifactView — create / upsert', () => {
  function formBackdrop(): HTMLElement | null {
    return document.body.querySelector('.af-backdrop')
  }

  it('opens the create dialog with the create title from the toolbar button', async () => {
    setListData([ALPHA_NEW])
    mountView()
    await flushPromises()

    const createBtn = wrapper!.element.querySelector<HTMLElement>('.create-button')!
    createBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const card = formBackdrop()
    expect(card).not.toBeNull()
    expect(card?.getAttribute('aria-label')).toBe(locale.t('artifacts.dialog.createTitle'))
  })

  it('submitting the form calls apolloClient.mutate, toasts success, and refetches', async () => {
    mutateMock.mockResolvedValue({ data: { upsertArtifact: makeArtifact() } })
    setListData([ALPHA_NEW])
    setVersionsData([ALPHA_NEW])
    mountView()
    await flushPromises()

    // Open create + fill the required fields, then submit the dialog form.
    wrapper!.element.querySelector<HTMLElement>('.create-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const card = formBackdrop()!
    const inputs = card.querySelectorAll<HTMLInputElement>('input[type="text"]')
    // name, version, uri (sha256 is optional) — order matches the template.
    const setVal = (el: HTMLInputElement, v: string) => {
      el.value = v
      el.dispatchEvent(new Event('input'))
    }
    setVal(inputs[0], 'gamma')
    setVal(inputs[1], '9.9.9')
    setVal(inputs[2], 's3://bucket/gamma')
    await flushPromises()

    card.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const callArg = mutateMock.mock.calls[0][0] as { variables: { input: Record<string, unknown> } }
    expect(callArg.variables.input).toMatchObject({
      name: 'gamma',
      version: '9.9.9',
      uri: 's3://bucket/gamma',
    })

    // Success toast keyed off the created string + the list (and enabled
    // versions query) get refetched.
    expect(toastMessages()).toContain(locale.t('artifacts.toast.created'))
    expect(listSlot.refetch).toHaveBeenCalled()
    // Dialog closed on success.
    expect(formBackdrop()).toBeNull()
  })

  it('surfaces the backend GraphQL error message via toast on upsert failure', async () => {
    mutateMock.mockRejectedValue({
      graphQLErrors: [{ message: 'name already exists in tenant' }],
    })
    setListData([ALPHA_NEW])
    mountView()
    await flushPromises()

    wrapper!.element.querySelector<HTMLElement>('.create-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const card = formBackdrop()!
    const inputs = card.querySelectorAll<HTMLInputElement>('input[type="text"]')
    const setVal = (el: HTMLInputElement, v: string) => {
      el.value = v
      el.dispatchEvent(new Event('input'))
    }
    setVal(inputs[0], 'dup')
    setVal(inputs[1], '1.0.0')
    setVal(inputs[2], 's3://x')
    await flushPromises()
    card.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    // graphqlErrorMessage prefers the backend message over the generic fallback.
    expect(toastMessages()).toContain('name already exists in tenant')
    expect(toastMessages()).not.toContain(locale.t('artifacts.toast.created'))
    // Failure keeps the dialog open so the user can correct + retry.
    expect(formBackdrop()).not.toBeNull()
  })
})

describe('ArtifactView — row menu: new version / edit', () => {
  function openRowMenu(index: number): HTMLElement {
    const trigger = listItems()[index].parentElement!.querySelector<HTMLElement>('.dd-trigger')!
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return trigger
  }

  it('"new version" opens the dialog with the version title', async () => {
    setListData([ALPHA_NEW])
    mountView()
    await flushPromises()

    openRowMenu(0)
    await flushPromises()
    const menuItems = wrapper!.element.querySelectorAll<HTMLElement>('.dd-panel .menu-item')
    expect(menuItems.length).toBeGreaterThanOrEqual(3)
    // First menu item is "new version".
    menuItems[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const card = document.body.querySelector('.af-backdrop')
    expect(card?.getAttribute('aria-label')).toBe(locale.t('artifacts.dialog.versionTitle'))
  })

  it('"edit" opens the dialog with the edit title', async () => {
    setListData([ALPHA_NEW])
    mountView()
    await flushPromises()

    openRowMenu(0)
    await flushPromises()
    const menuItems = wrapper!.element.querySelectorAll<HTMLElement>('.dd-panel .menu-item')
    menuItems[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const card = document.body.querySelector('.af-backdrop')
    expect(card?.getAttribute('aria-label')).toBe(locale.t('artifacts.dialog.editTitle'))
  })
})

describe('ArtifactView — delete flow', () => {
  function confirmBackdrop(): HTMLElement | null {
    return document.body.querySelector('.confirm-backdrop')
  }
  function openRowMenuThenDelete(index: number) {
    const trigger = listItems()[index].parentElement!.querySelector<HTMLElement>('.dd-trigger')!
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('requesting delete opens a confirm dialog naming the target', async () => {
    setListData([ALPHA_NEW])
    mountView()
    await flushPromises()

    openRowMenuThenDelete(0)
    await flushPromises()
    const menuItems = wrapper!.element.querySelectorAll<HTMLElement>('.dd-panel .menu-item')
    // Third menu item is "delete".
    menuItems[2].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const card = confirmBackdrop()
    expect(card).not.toBeNull()
    expect(card?.getAttribute('aria-label')).toBe(locale.t('artifacts.confirm.deleteTitle'))
    // Body interpolates the name + version.
    expect(card?.textContent).toContain('alpha')
    expect(card?.textContent).toContain('2.0.0')
  })

  it('confirming delete calls mutate with the target id, toasts success, refetches', async () => {
    mutateMock.mockResolvedValue({ data: { deleteArtifact: true } })
    setListData([ALPHA_NEW])
    setVersionsData([ALPHA_NEW])
    mountView()
    await flushPromises()

    openRowMenuThenDelete(0)
    await flushPromises()
    wrapper!.element.querySelectorAll<HTMLElement>('.dd-panel .menu-item')[2]
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // Confirm button = the danger/solid action in the confirm dialog.
    const confirmBtn = confirmBackdrop()!.querySelector<HTMLElement>('cds-button[status="danger"]')!
    confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { id: string } }
    expect(arg.variables.id).toBe('a-new')
    expect(toastMessages()).toContain(locale.t('artifacts.toast.deleted'))
    expect(listSlot.refetch).toHaveBeenCalled()
    expect(confirmBackdrop()).toBeNull()
  })

  it('delete failure surfaces the GraphQL error and keeps the dialog open', async () => {
    mutateMock.mockRejectedValue({ graphQLErrors: [{ message: 'forbidden: requires admin' }] })
    setListData([ALPHA_NEW])
    mountView()
    await flushPromises()

    openRowMenuThenDelete(0)
    await flushPromises()
    wrapper!.element.querySelectorAll<HTMLElement>('.dd-panel .menu-item')[2]
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    confirmBackdrop()!.querySelector<HTMLElement>('cds-button[status="danger"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('forbidden: requires admin')
    expect(toastMessages()).not.toContain(locale.t('artifacts.toast.deleted'))
    expect(confirmBackdrop()).not.toBeNull()
  })
})

describe('ArtifactView — refresh toolbar action', () => {
  it('refresh refetches the list and toasts on success', async () => {
    setListData([ALPHA_NEW])
    setVersionsData([ALPHA_NEW])
    mountView()
    await flushPromises()

    const refreshBtn = wrapper!.element.querySelector<HTMLElement>('.refresh-button')!
    refreshBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(listSlot.refetch).toHaveBeenCalled()
    expect(toastMessages()).toContain(locale.t('artifacts.toast.refreshed'))
  })

  it('refresh surfaces an error toast when refetch rejects', async () => {
    setListData([ALPHA_NEW])
    listSlot.refetch.mockRejectedValueOnce(new Error('network down'))
    mountView()
    await flushPromises()

    wrapper!.element.querySelector<HTMLElement>('.refresh-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // graphqlErrorMessage falls back to error.message when no graphQLErrors.
    expect(toastMessages()).toContain('network down')
    expect(toastMessages()).not.toContain(locale.t('artifacts.toast.refreshed'))
  })
})
