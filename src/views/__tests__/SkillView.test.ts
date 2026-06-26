/**
 * Component tests for SkillView.vue — 技能管理 (Skill hub CRUD).
 *
 * SkillView lists Skill entities (cds-grid) and runs real mutations via Apollo:
 *   - create + edit (both via upsertSkill) through SkillFormDialog (inline
 *     cds-modal, shown only when `formOpen`; on edit name/version are locked),
 *   - per-row delete + batch delete behind ConfirmDialog (teleported →
 *     `.confirm-backdrop`); batch delete fans out one mutate per id with
 *     Promise.allSettled,
 *   - list sort (name/version/createdAt cycling none→asc→desc), name filter,
 *     and pagination (page size + page navigation).
 *
 * Mocking strategy (mirrors GatewayConnectionView.test.ts):
 *   - `@vue/apollo-composable`'s `useQuery` is mocked → a single controllable
 *     slot (result/loading/refetch) so loading / empty / data render
 *     deterministically. `refetch` is a spy.
 *   - `@/api/graphql/client`'s `apolloClient.mutate` is a spy resolved / rejected
 *     per test to exercise success + error branches of upsert + delete.
 *   - real Pinia so `locale.t(...)` resolves real strings; assertions are keyed
 *     off the same `locale.t` keys the component renders, not hard-coded text.
 *   - cds-* are custom elements (Clarity); the Vue compiler treats any `cds-`
 *     tag as a custom element. We assert on plain DOM + emitted/spy calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, type Ref } from 'vue'

import type { SkillNode } from '@/api/graphql/queries/skills'

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

import SkillView from '@/views/SkillView.vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'

// Toasts live in module-scoped state in useToast; read them via a fresh call.
function toastMessages(): string[] {
  return useToast().toasts.value.map((t) => t.message)
}
function toastStatuses(): string[] {
  return useToast().toasts.value.map((t) => t.status)
}

// `format(key, {...})` in the view replaces `{token}` placeholders in a locale
// string. Mirror that here so assertions stay key-driven, not hard-coded text.
function interpolate(key: string, replacements: Record<string, string>): string {
  return Object.entries(replacements).reduce(
    (text, [token, value]) => text.replace(`{${token}}`, value),
    locale.t(key),
  )
}

// --- fixtures --------------------------------------------------------------

function makeSkill(over: Partial<SkillNode> = {}): SkillNode {
  return {
    id: 'skill-1',
    name: 'Alpha Skill',
    version: '1.0.0',
    description: 'does alpha things',
    uri: 'oci://registry/alpha:1.0.0',
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
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

function setListData(rows: SkillNode[]) {
  listSlot.result.value = { skills: rows }
}

let wrapper: VueWrapper | null = null
let locale: ReturnType<typeof useLocaleStore>

function mountView() {
  wrapper = mount(SkillView, mountConfig)
  return wrapper
}

// --- DOM helpers -----------------------------------------------------------

function rows(): HTMLElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLElement>('cds-grid-row'))
}
function rowNames(): string[] {
  return rows().map((r) => r.querySelector('.skill-name')?.textContent?.trim() ?? '')
}
function confirmBackdrop(): HTMLElement | null {
  return document.body.querySelector('.confirm-backdrop')
}
function formDialog(): HTMLElement | null {
  // SkillFormDialog renders an inline form with class `.skill-form`, mounted
  // only when SkillView's `formOpen` is true (v-if on the dialog).
  return wrapper!.element.querySelector('.skill-form')
}
function toolbarCreateBtn(): HTMLElement {
  return wrapper!.element.querySelector<HTMLElement>('.toolbar cds-button')!
}

beforeEach(() => {
  setActivePinia(createPinia())
  locale = useLocaleStore()
  listSlot = makeSlot()
  mutateMock.mockReset()
  useToast().clear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.querySelectorAll('.confirm-backdrop').forEach((el) => el.remove())
})

// ---------------------------------------------------------------------------

describe('SkillView — list states', () => {
  it('shows the empty placeholder when there are no skills', async () => {
    setListData([])
    mountView()
    await flushPromises()

    const placeholder = wrapper!.element.querySelector('cds-grid-placeholder')
    expect(placeholder?.textContent).toContain(locale.t('skill.empty'))
    expect(rows()).toHaveLength(0)
  })

  it('renders one row per skill with name, version and description', async () => {
    setListData([
      makeSkill({ id: 'a', name: 'Alpha Skill', version: '1.2.3', description: 'alpha desc' }),
      makeSkill({ id: 'b', name: 'Beta Skill', version: '2.0.0', description: null }),
    ])
    mountView()
    await flushPromises()

    expect(rows()).toHaveLength(2)
    const first = rows()[0]
    expect(first.textContent).toContain('Alpha Skill')
    expect(first.textContent).toContain('1.2.3')
    expect(first.textContent).toContain('alpha desc')
    expect(first.textContent).toContain('oci://registry/alpha:1.0.0')

    // Null description falls back to the em dash placeholder.
    expect(rows()[1].textContent).toContain('—')
  })

  it('shows the loading spinner state via the disabled refresh button', async () => {
    listSlot.loading.value = true
    setListData([])
    mountView()
    await flushPromises()

    const refreshBtn = wrapper!.element.querySelector<HTMLElement>('.refresh-button')!
    expect(refreshBtn.hasAttribute('disabled')).toBe(true)
  })
})

describe('SkillView — sort', () => {
  function sortButton(columnIndex: 0 | 1 | 2): HTMLElement {
    // Column heads with a sort control: name (0), version (1), createdAt (2).
    const heads = Array.from(
      wrapper!.element.querySelectorAll<HTMLElement>('.column-head'),
    )
    return heads[columnIndex].querySelector<HTMLElement>('cds-button-action')!
  }

  it('sorts by name ascending then descending on successive clicks', async () => {
    setListData([
      makeSkill({ id: 'c', name: 'Gamma' }),
      makeSkill({ id: 'a', name: 'Alpha' }),
      makeSkill({ id: 'b', name: 'Beta' }),
    ])
    mountView()
    await flushPromises()

    // First click → ascending.
    sortButton(0).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(rowNames()).toEqual(['Alpha', 'Beta', 'Gamma'])

    // Second click → descending.
    sortButton(0).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(rowNames()).toEqual(['Gamma', 'Beta', 'Alpha'])

    // Third click → back to unsorted (original insertion order).
    sortButton(0).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(rowNames()).toEqual(['Gamma', 'Alpha', 'Beta'])
  })
})

describe('SkillView — filter', () => {
  it('filters rows by the name keyword and clears the filter', async () => {
    setListData([
      makeSkill({ id: 'a', name: 'Alpha' }),
      makeSkill({ id: 'b', name: 'Beta' }),
      makeSkill({ id: 'c', name: 'Alphabet' }),
    ])
    mountView()
    await flushPromises()

    // Open the name filter dropdown via the filter button on the name column.
    const filterBtn = wrapper!.element.querySelector<HTMLElement>(
      '.column-head cds-button-action[shape="filter"]',
    )!
    filterBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // The filter panel (cds-dropdown) renders inline within the view, not
    // teleported, so query it from the wrapper element.
    const input = wrapper!.element.querySelector<HTMLInputElement>('.filter-input')!
    expect(input).not.toBeNull()
    input.value = 'alph'
    input.dispatchEvent(new Event('input'))
    await flushPromises()

    expect(rowNames()).toEqual(['Alpha', 'Alphabet'])

    // Clearing the filter restores every row.
    const clearBtn = wrapper!.element.querySelector<HTMLElement>('.filter-footer cds-button')!
    clearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(rowNames()).toEqual(['Alpha', 'Beta', 'Alphabet'])
  })
})

describe('SkillView — pagination', () => {
  function manySkills(count: number): SkillNode[] {
    return Array.from({ length: count }, (_, i) =>
      makeSkill({ id: `s-${i}`, name: `Skill ${String(i).padStart(2, '0')}` }),
    )
  }

  it('shows only one page worth of rows and advances to the next page', async () => {
    setListData(manySkills(15)) // default page size = 10
    mountView()
    await flushPromises()

    expect(rows()).toHaveLength(10)
    // Summary interpolates start/end/total.
    const summary = wrapper!.element.querySelector('.pager-summary')!
    expect(summary.textContent).toBe(
      interpolate('skill.pagination.summary', { start: '1', end: '10', total: '15' }),
    )

    // Next page → remaining 5 rows.
    const nextBtn = wrapper!.element.querySelector<HTMLElement>(
      'cds-pagination-button[action="next"]',
    )!
    nextBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(rows()).toHaveLength(5)
  })
})

describe('SkillView — create flow (upsert)', () => {
  it('opens the create dialog from the toolbar with empty, editable fields', async () => {
    setListData([])
    mountView()
    await flushPromises()
    expect(formDialog()).toBeNull()

    toolbarCreateBtn().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = formDialog()
    expect(form).not.toBeNull()
    const nameInput = form!.querySelector<HTMLInputElement>('#skill-form-name')!
    expect(nameInput.value).toBe('')
    // On create the identity fields are editable.
    expect(nameInput.hasAttribute('disabled')).toBe(false)
  })

  it('submitting the create form calls upsert with the draft, toasts and refetches', async () => {
    mutateMock.mockResolvedValue({ data: { upsertSkill: makeSkill() } })
    setListData([])
    mountView()
    await flushPromises()

    toolbarCreateBtn().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = formDialog()!
    const setVal = (sel: string, v: string) => {
      const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel)!
      el.value = v
      el.dispatchEvent(new Event('input'))
    }
    setVal('#skill-form-name', 'New Skill')
    setVal('#skill-form-version', '3.1.0')
    setVal('#skill-form-uri', 'oci://registry/new:3.1.0')
    setVal('#skill-form-description', 'fresh skill')
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { input: Record<string, unknown> } }
    expect(arg.variables.input).toEqual({
      name: 'New Skill',
      version: '3.1.0',
      uri: 'oci://registry/new:3.1.0',
      description: 'fresh skill',
    })

    expect(toastMessages()).toContain(locale.t('skill.toast.created'))
    expect(listSlot.refetch).toHaveBeenCalled()
    // Dialog closes on success.
    expect(formDialog()).toBeNull()
  })

  it('does not submit when required fields are blank', async () => {
    setListData([])
    mountView()
    await flushPromises()

    toolbarCreateBtn().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // Submit with everything blank → form validation blocks the mutation.
    formDialog()!.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).not.toHaveBeenCalled()
    // Dialog stays open so the user can fix it.
    expect(formDialog()).not.toBeNull()
  })

  it('surfaces the backend GraphQL error and keeps the dialog open on failure', async () => {
    mutateMock.mockRejectedValue({ graphQLErrors: [{ message: 'name already exists' }] })
    setListData([])
    mountView()
    await flushPromises()

    toolbarCreateBtn().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = formDialog()!
    const setVal = (sel: string, v: string) => {
      const el = form.querySelector<HTMLInputElement>(sel)!
      el.value = v
      el.dispatchEvent(new Event('input'))
    }
    setVal('#skill-form-name', 'Dup Skill')
    setVal('#skill-form-version', '1.0.0')
    setVal('#skill-form-uri', 'oci://registry/dup:1.0.0')
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    // graphqlErrorMessage prefers the backend message over the generic fallback.
    expect(toastMessages()).toContain('name already exists')
    expect(toastMessages()).not.toContain(locale.t('skill.toast.created'))
    expect(formDialog()).not.toBeNull()
  })
})

describe('SkillView — edit flow (identity locked)', () => {
  it('opens the edit dialog pre-filled with name/version locked', async () => {
    const skill = makeSkill({ id: 'edit-me', name: 'Editable', version: '9.9.9' })
    setListData([skill])
    mountView()
    await flushPromises()

    const editBtn = rows()[0].querySelector<HTMLElement>('.row-action:not(.danger)')!
    editBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = formDialog()!
    const nameInput = form.querySelector<HTMLInputElement>('#skill-form-name')!
    const versionInput = form.querySelector<HTMLInputElement>('#skill-form-version')!
    const uriInput = form.querySelector<HTMLInputElement>('#skill-form-uri')!

    expect(nameInput.value).toBe('Editable')
    expect(versionInput.value).toBe('9.9.9')
    // Identity is locked on edit.
    expect(nameInput.hasAttribute('disabled')).toBe(true)
    expect(versionInput.hasAttribute('disabled')).toBe(true)
    // URI remains editable.
    expect(uriInput.hasAttribute('disabled')).toBe(false)
  })

  it('saving an edit calls upsert and toasts the updated message', async () => {
    const skill = makeSkill({ id: 'edit-me', name: 'Editable', version: '9.9.9' })
    mutateMock.mockResolvedValue({ data: { upsertSkill: skill } })
    setListData([skill])
    mountView()
    await flushPromises()

    rows()[0]
      .querySelector<HTMLElement>('.row-action:not(.danger)')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = formDialog()!
    const uriInput = form.querySelector<HTMLInputElement>('#skill-form-uri')!
    uriInput.value = 'oci://registry/editable:9.9.9-patched'
    uriInput.dispatchEvent(new Event('input'))
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { input: Record<string, unknown> } }
    expect(arg.variables.input).toMatchObject({
      name: 'Editable',
      version: '9.9.9',
      uri: 'oci://registry/editable:9.9.9-patched',
    })
    // Edit path toasts the "updated" string, not "created".
    expect(toastMessages()).toContain(locale.t('skill.toast.updated'))
    expect(toastMessages()).not.toContain(locale.t('skill.toast.created'))
  })
})

describe('SkillView — per-row delete', () => {
  function openConfirm(index: number) {
    rows()[index]
      .querySelector<HTMLElement>('.row-action.danger')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('requesting delete opens a confirm dialog naming the target', async () => {
    setListData([makeSkill({ id: 'a', name: 'Alpha Skill' })])
    mountView()
    await flushPromises()

    openConfirm(0)
    await flushPromises()

    const card = confirmBackdrop()
    expect(card).not.toBeNull()
    expect(card?.getAttribute('aria-label')).toBe(locale.t('skill.confirm.deleteTitle'))
    expect(card?.textContent).toContain('Alpha Skill')
  })

  it('confirming delete calls mutate with the target id, toasts and refetches', async () => {
    mutateMock.mockResolvedValue({ data: { deleteSkill: true } })
    setListData([makeSkill({ id: 'a', name: 'Alpha Skill' })])
    mountView()
    await flushPromises()

    openConfirm(0)
    await flushPromises()

    confirmBackdrop()!
      .querySelector<HTMLElement>('cds-button[status="danger"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { id: string } }
    expect(arg.variables.id).toBe('a')
    expect(toastMessages()).toContain(interpolate('skill.toast.deleted', { count: '1' }))
    expect(listSlot.refetch).toHaveBeenCalled()
    expect(confirmBackdrop()).toBeNull()
  })

  it('delete failure surfaces the GraphQL error', async () => {
    mutateMock.mockRejectedValue({ graphQLErrors: [{ message: 'forbidden: requires admin' }] })
    setListData([makeSkill({ id: 'a', name: 'Alpha Skill' })])
    mountView()
    await flushPromises()

    openConfirm(0)
    await flushPromises()
    confirmBackdrop()!
      .querySelector<HTMLElement>('cds-button[status="danger"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('forbidden: requires admin')
    expect(toastMessages()).not.toContain(interpolate('skill.toast.deleted', { count: '1' }))
  })

  it('cancelling the confirm closes it without calling mutate', async () => {
    setListData([makeSkill({ id: 'a', name: 'Alpha Skill' })])
    mountView()
    await flushPromises()

    openConfirm(0)
    await flushPromises()
    confirmBackdrop()!
      .querySelector<HTMLElement>('cds-button[action="outline"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(confirmBackdrop()).toBeNull()
    expect(mutateMock).not.toHaveBeenCalled()
  })
})

describe('SkillView — batch delete', () => {
  function selectRow(index: number) {
    const checkbox = rows()[index].querySelector<HTMLInputElement>('input[type="checkbox"]')!
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))
  }

  it('batch deletes every selected skill, one mutate per id, with a batch confirm', async () => {
    mutateMock.mockResolvedValue({ data: { deleteSkill: true } })
    setListData([
      makeSkill({ id: 'a', name: 'Alpha' }),
      makeSkill({ id: 'b', name: 'Beta' }),
      makeSkill({ id: 'c', name: 'Gamma' }),
    ])
    mountView()
    await flushPromises()

    selectRow(0)
    selectRow(2)
    await flushPromises()

    // Open the batch dropdown then click its delete option.
    const batchTrigger = wrapper!.element.querySelectorAll<HTMLElement>('.toolbar cds-button')[1]
    batchTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    const batchDeleteOption = wrapper!.element.querySelector<HTMLElement>('.menu-option.danger')!
    batchDeleteOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // Batch confirm uses the batch title + interpolated count body.
    const card = confirmBackdrop()
    expect(card?.getAttribute('aria-label')).toBe(locale.t('skill.confirm.batchDeleteTitle'))
    expect(card?.textContent).toContain(
      interpolate('skill.confirm.batchDeleteBody', { count: '2' }),
    )

    card!
      .querySelector<HTMLElement>('cds-button[status="danger"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // One mutate per selected id.
    expect(mutateMock).toHaveBeenCalledTimes(2)
    const deletedIds = mutateMock.mock.calls
      .map((c) => (c[0] as { variables: { id: string } }).variables.id)
      .sort()
    expect(deletedIds).toEqual(['a', 'c'])

    expect(toastMessages()).toContain(interpolate('skill.toast.deleted', { count: '2' }))
    expect(listSlot.refetch).toHaveBeenCalled()
  })

  it('reports partial failure: success toast for the deleted plus an error toast', async () => {
    // First id resolves, second rejects.
    mutateMock
      .mockResolvedValueOnce({ data: { deleteSkill: true } })
      .mockRejectedValueOnce({ graphQLErrors: [{ message: 'skill is in use' }] })
    setListData([
      makeSkill({ id: 'a', name: 'Alpha' }),
      makeSkill({ id: 'b', name: 'Beta' }),
    ])
    mountView()
    await flushPromises()

    selectRow(0)
    selectRow(1)
    await flushPromises()

    const batchTrigger = wrapper!.element.querySelectorAll<HTMLElement>('.toolbar cds-button')[1]
    batchTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    wrapper!.element
      .querySelector<HTMLElement>('.menu-option.danger')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    confirmBackdrop()!
      .querySelector<HTMLElement>('cds-button[status="danger"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(2)
    // One success (count = 1) + the backend error message.
    expect(toastMessages()).toContain(interpolate('skill.toast.deleted', { count: '1' }))
    expect(toastMessages()).toContain('skill is in use')
    expect(toastStatuses()).toContain('success')
    expect(toastStatuses()).toContain('danger')
  })
})

describe('SkillView — refresh', () => {
  it('refresh refetches and toasts on success', async () => {
    setListData([makeSkill()])
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.refresh-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(listSlot.refetch).toHaveBeenCalled()
    expect(toastMessages()).toContain(locale.t('skill.toast.refreshed'))
  })

  it('refresh surfaces an error toast when refetch rejects', async () => {
    setListData([makeSkill()])
    listSlot.refetch.mockRejectedValueOnce(new Error('network down'))
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.refresh-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('network down')
    expect(toastMessages()).not.toContain(locale.t('skill.toast.refreshed'))
  })
})
