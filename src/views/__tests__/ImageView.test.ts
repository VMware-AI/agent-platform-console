/**
 * Component tests for ImageView.vue — 镜像管理 (Harbor images, LLD-06).
 *
 * The view is a single-list page wired to the real backend:
 *   - list: `images` (HarborImages query) → cds-grid rows; loading / error /
 *     empty / data placeholders.
 *   - toolbar create (opens ImageFormDialog) + per-row edit / delete.
 *   - create / edit go through `upsertImage` (apolloClient.mutate); editing
 *     LOCKS repository+tag (identity) since the backend keys upsert on that pair.
 *   - delete → ConfirmDialog → `deleteImage`. Mutations toast on success and
 *     surface `graphqlErrorMessage(...)` on failure, then `refetch()`.
 *
 * Mocking strategy (mirrors ArtifactView.test.ts):
 *   - `@vue/apollo-composable`'s `useQuery` is mocked, returning one controllable
 *     set of refs (result/loading/error/refetch) so every state is deterministic.
 *   - `@/api/graphql/client`'s `apolloClient.mutate` is a spy we resolve / reject
 *     per test to drive the success + error branches.
 *   - real Pinia so `locale.t(...)` resolves real strings; assertions are keyed
 *     off the same `locale.t(...)` the component renders, not hard-coded text.
 *   - cds-* are custom elements (Clarity); the Vue compiler is told to treat any
 *     `cds-` tag as a custom element. We assert on plain DOM + spy/emitted calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, type Ref } from 'vue'

import type { ImageNode, ImagesResult } from '@/api/graphql/queries/images'

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

import ImageView from '@/views/ImageView.vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'

// Toasts live in module-scoped state in useToast; read them via a fresh call.
function toastMessages(): string[] {
  return useToast().toasts.value.map((t) => t.message)
}

// --- fixtures --------------------------------------------------------------

function makeImage(over: Partial<ImageNode> = {}): ImageNode {
  return {
    id: 'img-1',
    repository: 'library/agent-runtime',
    tag: 'v1.2.0',
    digest: 'sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    signed: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

const NGINX = makeImage({
  id: 'img-nginx',
  repository: 'library/nginx',
  tag: 'stable',
  digest: null,
  signed: false,
})
const RUNTIME = makeImage()

const mountConfig = {
  global: {
    config: {
      compilerOptions: {
        isCustomElement: (tag: string) => tag.startsWith('cds-'),
      },
    },
  },
}

function setListData(rows: ImageNode[]) {
  listSlot.result.value = { images: rows } satisfies ImagesResult
}

let wrapper: VueWrapper | null = null
let locale: ReturnType<typeof useLocaleStore>

function mountView() {
  wrapper = mount(ImageView, mountConfig)
  return wrapper
}

// Grid rows render in the wrapper; the two dialogs teleport to <body>.
function rows(): HTMLElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLElement>('cds-grid-row'))
}
function placeholderText(): string {
  return wrapper!.element.querySelector('cds-grid-placeholder')?.textContent?.trim() ?? ''
}
function formBackdrop(): HTMLElement | null {
  return document.body.querySelector('.img-backdrop')
}
function confirmBackdrop(): HTMLElement | null {
  return document.body.querySelector('.confirm-backdrop')
}
function rowActions(rowEl: HTMLElement): { edit: HTMLElement; del: HTMLElement } {
  const buttons = rowEl.querySelectorAll<HTMLElement>('.row-action')
  return { edit: buttons[0], del: buttons[1] }
}
function setInput(el: HTMLInputElement, v: string) {
  el.value = v
  el.dispatchEvent(new Event('input'))
}

beforeEach(() => {
  setActivePinia(createPinia())
  locale = useLocaleStore()
  listSlot = makeSlot()
  mutateMock.mockReset()
  // Toast state is module-scoped + shared across tests; reset for clean
  // not.toContain assertions.
  useToast().clear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.querySelectorAll('.img-backdrop, .confirm-backdrop').forEach((el) => el.remove())
})

describe('ImageView — list states', () => {
  it('renders the page heading + description from locale keys', () => {
    setListData([])
    mountView()
    expect(wrapper!.element.querySelector('.heading')?.textContent?.trim()).toBe(
      locale.t('image.title'),
    )
    expect(wrapper!.element.querySelector('.desc')?.textContent?.trim()).toBe(
      locale.t('image.description'),
    )
  })

  it('shows the loading placeholder while the query is loading', () => {
    listSlot.loading.value = true
    mountView()
    const ph = wrapper!.element.querySelector('cds-grid-placeholder')
    expect(ph?.getAttribute('role')).toBe('status')
    expect(ph?.textContent).toContain(locale.t('image.loading'))
    expect(rows()).toHaveLength(0)
  })

  it('shows the error placeholder (role=alert) when the query errors', () => {
    listSlot.error.value = new Error('boom')
    mountView()
    const ph = wrapper!.element.querySelector('cds-grid-placeholder')
    expect(ph?.getAttribute('role')).toBe('alert')
    expect(ph?.textContent).toContain(locale.t('image.error'))
  })

  it('shows the empty placeholder when there are no images', () => {
    setListData([])
    mountView()
    expect(placeholderText()).toContain(locale.t('image.empty'))
    expect(rows()).toHaveLength(0)
  })

  it('renders one grid row per image with repository + tag', async () => {
    setListData([RUNTIME, NGINX])
    mountView()
    await flushPromises()

    const r = rows()
    expect(r).toHaveLength(2)
    expect(r[0].querySelector('.repo-name')?.textContent).toContain('library/agent-runtime')
    expect(r[0].querySelector('.tag-name')?.textContent).toContain('v1.2.0')
    expect(r[1].querySelector('.repo-name')?.textContent).toContain('library/nginx')
    // No placeholder is shown once there is data.
    expect(wrapper!.element.querySelector('cds-grid-placeholder')).toBeNull()
  })

  it('shortens a sha256 digest to the algo prefix + 12 hex chars', async () => {
    setListData([RUNTIME])
    mountView()
    await flushPromises()
    const digest = rows()[0].querySelector('.digest')?.textContent?.trim()
    expect(digest).toBe('sha256:abcdef012345')
  })

  it('renders the localized "none" string for a missing digest', async () => {
    setListData([NGINX])
    mountView()
    await flushPromises()
    expect(rows()[0].querySelector('.digest')?.textContent?.trim()).toBe(
      locale.t('image.digest.none'),
    )
  })

  it('renders the signed badge using the localized signed/unsigned keys', async () => {
    setListData([RUNTIME, NGINX])
    mountView()
    await flushPromises()
    expect(rows()[0].querySelector('.status-badge')?.textContent).toContain(
      locale.t('image.signed.yes'),
    )
    expect(rows()[1].querySelector('.status-badge')?.textContent).toContain(
      locale.t('image.signed.no'),
    )
  })
})

describe('ImageView — create flow', () => {
  it('opens the create dialog (create title, empty + editable fields)', async () => {
    setListData([RUNTIME])
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.toolbar cds-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const card = formBackdrop()
    expect(card).not.toBeNull()
    expect(card?.getAttribute('aria-label')).toBe(locale.t('image.dialog.createTitle'))

    // Identity fields are editable in create mode.
    const inputs = card!.querySelectorAll<HTMLInputElement>('input[type="text"]')
    expect(inputs[0].disabled).toBe(false) // repository
    expect(inputs[1].disabled).toBe(false) // tag
    expect(inputs[0].value).toBe('')
    expect(inputs[1].value).toBe('')
  })

  it('submitting create calls mutate with input, sends null digest when blank, toasts + refetches', async () => {
    mutateMock.mockResolvedValue({ data: { upsertImage: makeImage() } })
    setListData([RUNTIME])
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.toolbar cds-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const card = formBackdrop()!
    const inputs = card.querySelectorAll<HTMLInputElement>('input[type="text"]')
    setInput(inputs[0], 'library/new-image') // repository
    setInput(inputs[1], 'v2.0.0') // tag
    // digest (inputs[2]) left blank → should be sent as null
    const checkbox = card.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))
    await flushPromises()

    card.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as {
      variables: { input: Record<string, unknown> }
    }
    expect(arg.variables.input).toMatchObject({
      repository: 'library/new-image',
      tag: 'v2.0.0',
      signed: true,
    })
    // Blank digest is cleared to null (not ""), per the view's comment.
    expect(arg.variables.input.digest).toBeNull()

    expect(toastMessages()).toContain(locale.t('image.toast.created'))
    expect(listSlot.refetch).toHaveBeenCalled()
    expect(formBackdrop()).toBeNull() // closed on success
  })

  it('passes a non-empty digest through to mutate', async () => {
    mutateMock.mockResolvedValue({ data: { upsertImage: makeImage() } })
    setListData([RUNTIME])
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.toolbar cds-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const card = formBackdrop()!
    const inputs = card.querySelectorAll<HTMLInputElement>('input[type="text"]')
    setInput(inputs[0], 'library/img')
    setInput(inputs[1], 'tag1')
    setInput(inputs[2], 'sha256:deadbeef')
    await flushPromises()
    card.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()

    const arg = mutateMock.mock.calls[0][0] as {
      variables: { input: Record<string, unknown> }
    }
    expect(arg.variables.input.digest).toBe('sha256:deadbeef')
  })

  it('surfaces the backend GraphQL error message on create failure and keeps the dialog open', async () => {
    mutateMock.mockRejectedValue({
      graphQLErrors: [{ message: 'forbidden: requires admin' }],
    })
    setListData([RUNTIME])
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.toolbar cds-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const card = formBackdrop()!
    const inputs = card.querySelectorAll<HTMLInputElement>('input[type="text"]')
    setInput(inputs[0], 'library/img')
    setInput(inputs[1], 'tag1')
    await flushPromises()
    card.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    expect(toastMessages()).toContain('forbidden: requires admin')
    expect(toastMessages()).not.toContain(locale.t('image.toast.created'))
    expect(formBackdrop()).not.toBeNull()
  })
})

describe('ImageView — edit flow (identity locked)', () => {
  it('opening edit pre-fills + LOCKS repository and tag, leaves digest editable', async () => {
    setListData([RUNTIME])
    mountView()
    await flushPromises()

    rowActions(rows()[0]).edit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const card = formBackdrop()!
    expect(card.getAttribute('aria-label')).toBe(locale.t('image.dialog.editTitle'))

    const inputs = card.querySelectorAll<HTMLInputElement>('input[type="text"]')
    expect(inputs[0].value).toBe('library/agent-runtime')
    expect(inputs[1].value).toBe('v1.2.0')
    // Identity locked on edit.
    expect(inputs[0].disabled).toBe(true) // repository
    expect(inputs[1].disabled).toBe(true) // tag
    // digest stays editable.
    expect(inputs[2].disabled).toBe(false)
    expect(inputs[2].value).toBe(RUNTIME.digest)
  })

  it('submitting edit sends the (unchanged) identity + updated toast', async () => {
    mutateMock.mockResolvedValue({ data: { upsertImage: RUNTIME } })
    setListData([RUNTIME])
    mountView()
    await flushPromises()

    rowActions(rows()[0]).edit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const card = formBackdrop()!
    // Flip the signed checkbox (editable in edit mode), keep identity as-is.
    const checkbox = card.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    checkbox.checked = false
    checkbox.dispatchEvent(new Event('change'))
    await flushPromises()
    card.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as {
      variables: { input: Record<string, unknown> }
    }
    expect(arg.variables.input).toMatchObject({
      repository: 'library/agent-runtime',
      tag: 'v1.2.0',
      signed: false,
    })
    // Edit path toasts the "updated" key, not "created".
    expect(toastMessages()).toContain(locale.t('image.toast.updated'))
    expect(toastMessages()).not.toContain(locale.t('image.toast.created'))
    expect(listSlot.refetch).toHaveBeenCalled()
  })
})

describe('ImageView — delete flow', () => {
  it('clicking delete opens a confirm dialog naming repository:tag', async () => {
    setListData([RUNTIME])
    mountView()
    await flushPromises()

    rowActions(rows()[0]).del.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const card = confirmBackdrop()
    expect(card).not.toBeNull()
    expect(card?.getAttribute('aria-label')).toBe(locale.t('image.confirm.deleteTitle'))
    // Body interpolates repository:tag.
    expect(card?.textContent).toContain('library/agent-runtime:v1.2.0')
  })

  it('confirming delete calls mutate with the target id, toasts success, refetches', async () => {
    mutateMock.mockResolvedValue({ data: { deleteImage: true } })
    setListData([RUNTIME])
    mountView()
    await flushPromises()

    rowActions(rows()[0]).del.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const confirmBtn = confirmBackdrop()!.querySelector<HTMLElement>('cds-button[status="danger"]')!
    confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { id: string } }
    expect(arg.variables.id).toBe('img-1')
    expect(toastMessages()).toContain(locale.t('image.toast.deleted'))
    expect(listSlot.refetch).toHaveBeenCalled()
    expect(confirmBackdrop()).toBeNull()
  })

  it('cancelling the confirm dialog does not call mutate', async () => {
    setListData([RUNTIME])
    mountView()
    await flushPromises()

    rowActions(rows()[0]).del.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // The outline (non-danger) button is Cancel → emits close.
    const cancelBtn = confirmBackdrop()!.querySelector<HTMLElement>('cds-button[action="outline"]')!
    cancelBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).not.toHaveBeenCalled()
    expect(confirmBackdrop()).toBeNull()
  })

  it('delete failure surfaces the GraphQL error and does not toast success', async () => {
    mutateMock.mockRejectedValue({ graphQLErrors: [{ message: 'image is in use' }] })
    setListData([RUNTIME])
    mountView()
    await flushPromises()

    rowActions(rows()[0]).del.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    confirmBackdrop()!
      .querySelector<HTMLElement>('cds-button[status="danger"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    expect(toastMessages()).toContain('image is in use')
    expect(toastMessages()).not.toContain(locale.t('image.toast.deleted'))
  })
})

describe('ImageView — refresh toolbar action', () => {
  it('refresh refetches the list and toasts on success', async () => {
    setListData([RUNTIME])
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.refresh-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(listSlot.refetch).toHaveBeenCalled()
    expect(toastMessages()).toContain(locale.t('image.toast.refreshed'))
  })

  it('refresh surfaces an error toast when refetch rejects', async () => {
    setListData([RUNTIME])
    listSlot.refetch.mockRejectedValueOnce(new Error('network down'))
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.refresh-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // graphqlErrorMessage falls back to error.message when no graphQLErrors.
    expect(toastMessages()).toContain('network down')
    expect(toastMessages()).not.toContain(locale.t('image.toast.refreshed'))
  })

  it('does not refetch while the list is already loading', async () => {
    setListData([RUNTIME])
    listSlot.loading.value = true
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.refresh-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(listSlot.refetch).not.toHaveBeenCalled()
  })
})
