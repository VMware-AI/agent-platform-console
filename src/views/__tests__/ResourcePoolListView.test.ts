/**
 * Component tests for ResourcePoolListView.vue (+ its CreateOrEditResourcePoolDialog).
 *
 * The view drives a single reactive `useQuery(RESOURCE_POOLS_QUERY, variables)`
 * and four `useMutation`s (create / update / delete / sync). The child dialog
 * runs its own `useMutation(TEST_RESOURCE_POOL_CONNECTION_MUTATION)`.
 *
 * We mock `@vue/apollo-composable` so we control:
 *   - the `result` / `loading` / `error` refs the list reads from useQuery,
 *   - the reactive `variables` the view feeds in (filter / pagination / sort),
 *   - one `mutate` spy per mutation document (matched by the doc the view
 *     registers) so each row action / submit is independently assertable.
 *
 * States covered: loading, empty, error (alert via locale key), data; plus key
 * interactions: open create dialog, submit create, submit edit, sync row,
 * delete confirm, name-column keyword filter, name-column sort cycle, paging,
 * and the dialog's test-connection {ok,message} success + failure paths.
 *
 * Assertions target real data / emitted behavior / locale-key-driven text and
 * the query variables — not brittle exact markup. `cds-*` are custom elements.
 * Real Pinia is used so `locale.t(...)` resolves real strings. The dialog and
 * the confirm dialog Teleport to <body>; submit/delete are driven by emitting
 * the child component events so we exercise the parent wiring deterministically.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, type Ref } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import type {
  ResourcePool,
  ResourcePoolsQueryResult,
  ResourcePoolsQueryVars,
} from '@/api/graphql/types'
import {
  CREATE_RESOURCE_POOL_MUTATION,
  UPDATE_RESOURCE_POOL_MUTATION,
  DELETE_RESOURCE_POOL_MUTATION,
  SYNC_RESOURCE_POOL_MUTATION,
  TEST_RESOURCE_POOL_CONNECTION_MUTATION,
} from '@/api/graphql/queries/resourcePools'

/* ---------- Mock @vue/apollo-composable ---------- */

const queryResult: Ref<ResourcePoolsQueryResult | undefined> = ref(undefined)
const queryLoading = ref(false)
const queryError: Ref<unknown> = ref(null)
const refetchSpy = vi.fn()
let capturedVariables: Ref<ResourcePoolsQueryVars> | undefined

// One mutate spy per mutation document. The view registers each useMutation
// with the document as the first argument, so we route on object identity.
const createMutate = vi.fn()
const updateMutate = vi.fn()
const deleteMutate = vi.fn()
const syncMutate = vi.fn()
const testConnMutate = vi.fn()

const mutateByDoc = new Map<unknown, ReturnType<typeof vi.fn>>([
  [CREATE_RESOURCE_POOL_MUTATION, createMutate],
  [UPDATE_RESOURCE_POOL_MUTATION, updateMutate],
  [DELETE_RESOURCE_POOL_MUTATION, deleteMutate],
  [SYNC_RESOURCE_POOL_MUTATION, syncMutate],
  [TEST_RESOURCE_POOL_CONNECTION_MUTATION, testConnMutate],
])

vi.mock('@vue/apollo-composable', () => ({
  useQuery: (_doc: unknown, variables: Ref<ResourcePoolsQueryVars>) => {
    capturedVariables = variables
    return {
      result: queryResult,
      loading: queryLoading,
      error: queryError,
      refetch: refetchSpy,
    }
  },
  useMutation: (doc: unknown) => {
    const mutate = mutateByDoc.get(doc)
    if (!mutate) throw new Error('useMutation called with an unregistered document')
    return { mutate, loading: ref(false) }
  },
}))

// Imported AFTER the mocks are registered.
import ResourcePoolListView from '@/views/ResourcePoolListView.vue'
import CreateOrEditResourcePoolDialog from '@/views/resource-list/CreateOrEditResourcePoolDialog.vue'
import ConfirmDialog from '@/views/user-role/ConfirmDialog.vue'

/* ---------- Fixtures ---------- */

function makePool(over: Partial<ResourcePool> = {}): ResourcePool {
  return {
    id: 'rp-1',
    name: 'vCenter OC1',
    endpoint: 'https://vc.example.local/sdk',
    contentLibraryName: 'cl-vc-oc1',
    connectionStatus: 'CONNECTED',
    esxiHostCount: 4,
    vmInstanceCount: 12,
    syncStatus: 'SYNCED',
    lastSyncedAt: '2026-06-26T03:00:00Z',
    createdAt: '2026-01-01T08:00:00Z',
    updatedAt: '2026-02-01T08:00:00Z',
    ...over,
  }
}

function makeResult(
  nodes: ResourcePool[],
  totalCount = nodes.length,
  totalPages = 1,
): ResourcePoolsQueryResult {
  return {
    resourcePools: {
      nodes,
      totalCount,
      pageInfo: { page: 1, pageSize: 10, totalPages },
    },
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

let wrapper: VueWrapper | null = null

function rows() {
  return wrapper!.findAll('cds-grid-row')
}

beforeEach(() => {
  setActivePinia(createPinia())
  queryResult.value = undefined
  queryLoading.value = false
  queryError.value = null
  capturedVariables = undefined
  refetchSpy.mockReset()
  createMutate.mockReset()
  updateMutate.mockReset()
  deleteMutate.mockReset()
  syncMutate.mockReset()
  testConnMutate.mockReset()
  // Silence the intentional console.error/console.log in failure / placeholder paths.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  // Clear any teleported dialog markup left on body.
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('ResourcePoolListView — states', () => {
  it('renders the loading placeholder on the initial load (loading + no rows)', () => {
    queryLoading.value = true
    queryResult.value = undefined
    wrapper = mount(ResourcePoolListView, mountConfig)

    const placeholder = wrapper.find('cds-grid-placeholder')
    expect(placeholder.exists()).toBe(true)
    expect(placeholder.text()).toContain('加载中') // resources.loading
    expect(rows()).toHaveLength(0)
    expect(wrapper.find('cds-grid-footer').exists()).toBe(false)
  })

  it('renders the empty placeholder when the query returns no pools', () => {
    queryResult.value = makeResult([])
    wrapper = mount(ResourcePoolListView, mountConfig)

    const placeholder = wrapper.find('cds-grid-placeholder')
    expect(placeholder.exists()).toBe(true)
    expect(placeholder.text()).toContain('暂无资源池') // resources.empty
    expect(rows()).toHaveLength(0)
    // No footer pager when there is no data.
    expect(wrapper.find('cds-grid-footer').exists()).toBe(false)
  })

  it('renders the error alert (locale-key text) when the query errors', () => {
    queryError.value = new Error('boom')
    queryResult.value = makeResult([])
    wrapper = mount(ResourcePoolListView, mountConfig)

    const alert = wrapper.find('cds-alert')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('status')).toBe('danger')
    expect(alert.text()).toContain('加载失败') // resources.error
  })

  it('renders one grid row per pool with name, endpoint link, content library and sync badge', () => {
    const synced = makePool({
      id: 'rp-1',
      name: 'vCenter OC1',
      endpoint: 'https://vc.example.local/sdk',
      contentLibraryName: 'cl-vc-oc1',
      syncStatus: 'SYNCED',
      lastSyncedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    })
    const never = makePool({
      id: 'rp-2',
      name: 'vCenter OC2',
      endpoint: 'vc-internal-no-scheme',
      contentLibraryName: 'cl-vc-oc2',
      syncStatus: 'NEVER',
      lastSyncedAt: null,
    })
    queryResult.value = makeResult([synced, never], 2)
    wrapper = mount(ResourcePoolListView, mountConfig)

    expect(rows()).toHaveLength(2)
    const text = wrapper.text()
    expect(text).toContain('vCenter OC1')
    expect(text).toContain('vCenter OC2')
    expect(text).toContain('cl-vc-oc1')

    // http(s) endpoint renders a real anchor; the plain one renders as text.
    const link = wrapper.find('a.endpoint-link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://vc.example.local/sdk')
    expect(wrapper.text()).toContain('vc-internal-no-scheme')

    // Sync badge text is locale-key driven: synced => "{ago}已同步", never => "未同步".
    expect(text).toContain('已同步') // resources.status.syncedAgo / .synced fragment
    expect(text).toContain('未同步') // resources.status.neverSynced
  })

  it('renders the footer summary "显示 X-Y / N" only when there is data', () => {
    queryResult.value = makeResult([makePool()], 42, 5)
    wrapper = mount(ResourcePoolListView, mountConfig)

    const summary = wrapper.find('.pager-summary')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('42')
    expect(summary.text()).toContain('1')
  })
})

describe('ResourcePoolListView — query variables (filter / sort / paging)', () => {
  it('passes no filter / no sort by default', () => {
    queryResult.value = makeResult([makePool()], 1)
    wrapper = mount(ResourcePoolListView, mountConfig)

    expect(capturedVariables!.value.filter).toBeUndefined()
    expect(capturedVariables!.value.sort).toBeUndefined()
    expect(capturedVariables!.value.pagination).toMatchObject({ page: 1, pageSize: 10 })
  })

  it('feeds the toolbar search keyword into the query filter', async () => {
    queryResult.value = makeResult([makePool()], 1)
    wrapper = mount(ResourcePoolListView, mountConfig)

    const search = wrapper.find('.toolbar-search input')
    await search.setValue('oc1')

    expect(capturedVariables!.value.filter).toMatchObject({ nameKeyword: 'oc1' })
  })

  it('feeds the name column keyword filter and resets to page 1', async () => {
    queryResult.value = makeResult([makePool()], 25, 3)
    wrapper = mount(ResourcePoolListView, mountConfig)

    // Move off page 1 first so we can prove the keyword resets the pager.
    await wrapper.find('cds-pagination-button[action="next"]').trigger('click')
    expect(capturedVariables!.value.pagination).toMatchObject({ page: 2 })

    // Open the name column filter dropdown, then type into its input.
    await wrapper.find('#resources-filter-name-input').trigger('click')
    await flushPromises()
    const input = wrapper.find('cds-dropdown input')
    expect(input.exists()).toBe(true)
    await input.setValue('claw')

    expect(capturedVariables!.value.filter).toMatchObject({ nameKeyword: 'claw' })
    expect(capturedVariables!.value.pagination).toMatchObject({ page: 1 })
  })

  it('cycles the name column sort none -> ASC -> DESC -> none into the query', async () => {
    queryResult.value = makeResult([makePool()], 1)
    wrapper = mount(ResourcePoolListView, mountConfig)

    expect(capturedVariables!.value.sort).toBeUndefined()

    const sortBtn = wrapper.find('#resources-filter-name')
    await sortBtn.trigger('click')
    expect(capturedVariables!.value.sort).toMatchObject({ field: 'NAME', direction: 'ASC' })

    await sortBtn.trigger('click')
    expect(capturedVariables!.value.sort).toMatchObject({ field: 'NAME', direction: 'DESC' })

    await sortBtn.trigger('click')
    expect(capturedVariables!.value.sort).toBeUndefined()
  })

  it('paginates next / prev and clamps at the boundaries', async () => {
    queryResult.value = makeResult([makePool()], 25, 3)
    wrapper = mount(ResourcePoolListView, mountConfig)

    // prev at page 1 is a no-op (clamped).
    await wrapper.find('cds-pagination-button[action="prev"]').trigger('click')
    expect(capturedVariables!.value.pagination).toMatchObject({ page: 1 })

    await wrapper.find('cds-pagination-button[action="next"]').trigger('click')
    expect(capturedVariables!.value.pagination).toMatchObject({ page: 2 })

    // Jump to last; "next" beyond totalPages must clamp.
    await wrapper.find('cds-pagination-button[action="last"]').trigger('click')
    expect(capturedVariables!.value.pagination).toMatchObject({ page: 3 })
    await wrapper.find('cds-pagination-button[action="next"]').trigger('click')
    expect(capturedVariables!.value.pagination).toMatchObject({ page: 3 })
  })

  it('changes the page size through the footer select and resets to page 1', async () => {
    queryResult.value = makeResult([makePool()], 200, 20)
    wrapper = mount(ResourcePoolListView, mountConfig)

    await wrapper.find('cds-pagination-button[action="next"]').trigger('click')
    expect(capturedVariables!.value.pagination).toMatchObject({ page: 2, pageSize: 10 })

    await wrapper.find('#resources-page-size').setValue('50')
    expect(capturedVariables!.value.pagination).toMatchObject({ page: 1, pageSize: 50 })
  })
})

describe('ResourcePoolListView — create / edit dialog wiring', () => {
  it('opens the create dialog (no pool) when "接入资源池" is clicked', async () => {
    queryResult.value = makeResult([makePool()], 1)
    wrapper = mount(ResourcePoolListView, mountConfig)

    const dialog = wrapper.findComponent(CreateOrEditResourcePoolDialog)
    expect(dialog.props('open')).toBe(false)

    await wrapper.find('.toolbar-create').trigger('click')
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('pool')).toBeNull()
  })

  it('opens the edit dialog pre-filled with the row pool when 编辑 is clicked', async () => {
    const pool = makePool({ id: 'rp-7', name: 'Edit Me' })
    queryResult.value = makeResult([pool], 1)
    wrapper = mount(ResourcePoolListView, mountConfig)

    await wrapper.find('cds-button-action[shape="pencil"]').trigger('click')

    const dialog = wrapper.findComponent(CreateOrEditResourcePoolDialog)
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('pool')).toMatchObject({ id: 'rp-7', name: 'Edit Me' })
  })

  it('runs the CREATE mutation on submit(mode=create), toasts and refetches', async () => {
    queryResult.value = makeResult([makePool()], 1)
    createMutate.mockResolvedValue({
      data: { createResourcePool: { pool: makePool({ id: 'rp-new', name: 'Fresh Pool' }) } },
    })
    wrapper = mount(ResourcePoolListView, mountConfig)

    const dialog = wrapper.findComponent(CreateOrEditResourcePoolDialog)
    const input = { name: 'Fresh Pool', endpoint: 'https://vc/sdk', contentLibraryName: 'cl-fresh' }
    dialog.vm.$emit('submit', { mode: 'create', input })
    await flushPromises()

    expect(createMutate).toHaveBeenCalledWith({ input })
    expect(updateMutate).not.toHaveBeenCalled()
    expect(refetchSpy).toHaveBeenCalledTimes(1)
    // editingPool is cleared after a create submit (dialog returns to create mode).
    expect(wrapper.findComponent(CreateOrEditResourcePoolDialog).props('pool')).toBeNull()
  })

  it('runs the UPDATE mutation (with the editing pool id) on submit(mode=update)', async () => {
    const pool = makePool({ id: 'rp-9', name: 'Old Name' })
    queryResult.value = makeResult([pool], 1)
    updateMutate.mockResolvedValue({
      data: { updateResourcePool: { pool: makePool({ id: 'rp-9', name: 'New Name' }) } },
    })
    wrapper = mount(ResourcePoolListView, mountConfig)

    // Open edit so editingPool is set, then emit the update submit.
    await wrapper.find('cds-button-action[shape="pencil"]').trigger('click')
    const dialog = wrapper.findComponent(CreateOrEditResourcePoolDialog)
    const input = { name: 'New Name', endpoint: 'https://vc/sdk', contentLibraryName: 'cl-x' }
    dialog.vm.$emit('submit', { mode: 'update', input })
    await flushPromises()

    expect(updateMutate).toHaveBeenCalledWith({ id: 'rp-9', input })
    expect(createMutate).not.toHaveBeenCalled()
    expect(refetchSpy).toHaveBeenCalledTimes(1)
  })

  it('does NOT refetch when a create mutation rejects (error path)', async () => {
    queryResult.value = makeResult([makePool()], 1)
    createMutate.mockRejectedValue(new Error('server down'))
    wrapper = mount(ResourcePoolListView, mountConfig)

    const dialog = wrapper.findComponent(CreateOrEditResourcePoolDialog)
    dialog.vm.$emit('submit', {
      mode: 'create',
      input: { name: 'X', endpoint: 'https://vc', contentLibraryName: 'cl' },
    })
    await flushPromises()

    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(refetchSpy).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('closes the create dialog when the child emits close', async () => {
    queryResult.value = makeResult([makePool()], 1)
    wrapper = mount(ResourcePoolListView, mountConfig)

    await wrapper.find('.toolbar-create').trigger('click')
    const dialog = wrapper.findComponent(CreateOrEditResourcePoolDialog)
    expect(dialog.props('open')).toBe(true)

    dialog.vm.$emit('close')
    await flushPromises()
    expect(dialog.props('open')).toBe(false)
  })
})

describe('ResourcePoolListView — sync & delete row actions', () => {
  it('runs the SYNC mutation on the row sync icon and refetches on success', async () => {
    const pool = makePool({ id: 'rp-3', name: 'SyncTarget' })
    queryResult.value = makeResult([pool], 1)
    syncMutate.mockResolvedValue({
      data: { syncResourcePool: { pool, syncedAt: '2026-06-26T05:00:00Z' } },
    })
    wrapper = mount(ResourcePoolListView, mountConfig)

    await wrapper.find('cds-button-action[shape="sync"]').trigger('click')
    await flushPromises()

    expect(syncMutate).toHaveBeenCalledWith({ id: 'rp-3' })
    expect(refetchSpy).toHaveBeenCalledTimes(1)
  })

  it('does NOT refetch when sync rejects (error path logs)', async () => {
    const pool = makePool({ id: 'rp-3' })
    queryResult.value = makeResult([pool], 1)
    syncMutate.mockRejectedValue(new Error('sync failed'))
    wrapper = mount(ResourcePoolListView, mountConfig)

    await wrapper.find('cds-button-action[shape="sync"]').trigger('click')
    await flushPromises()

    expect(syncMutate).toHaveBeenCalledTimes(1)
    expect(refetchSpy).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('opens the confirm dialog with the pool name on the trash icon', async () => {
    const pool = makePool({ id: 'rp-4', name: 'DeleteMe' })
    queryResult.value = makeResult([pool], 1)
    wrapper = mount(ResourcePoolListView, mountConfig)

    const confirm = wrapper.findComponent(ConfirmDialog)
    expect(confirm.props('open')).toBe(false)

    await wrapper.find('cds-button-action[shape="trash"]').trigger('click')
    expect(confirm.props('open')).toBe(true)
    // Body interpolates the pool name via the locale template.
    expect(confirm.props('body')).toContain('DeleteMe')
  })

  it('runs the DELETE mutation when the confirm dialog confirms, then refetches', async () => {
    const pool = makePool({ id: 'rp-4', name: 'DeleteMe' })
    queryResult.value = makeResult([pool], 1)
    deleteMutate.mockResolvedValue({
      data: { deleteResourcePool: { id: 'rp-4', deletedName: 'DeleteMe' } },
    })
    wrapper = mount(ResourcePoolListView, mountConfig)

    await wrapper.find('cds-button-action[shape="trash"]').trigger('click')
    const confirm = wrapper.findComponent(ConfirmDialog)
    confirm.vm.$emit('confirm')
    await flushPromises()

    expect(deleteMutate).toHaveBeenCalledWith({ id: 'rp-4' })
    expect(refetchSpy).toHaveBeenCalledTimes(1)
    // Dialog closes after confirm.
    expect(confirm.props('open')).toBe(false)
  })

  it('closes the confirm dialog without deleting on close', async () => {
    const pool = makePool({ id: 'rp-4', name: 'KeepMe' })
    queryResult.value = makeResult([pool], 1)
    wrapper = mount(ResourcePoolListView, mountConfig)

    await wrapper.find('cds-button-action[shape="trash"]').trigger('click')
    const confirm = wrapper.findComponent(ConfirmDialog)
    expect(confirm.props('open')).toBe(true)

    confirm.vm.$emit('close')
    await flushPromises()
    expect(confirm.props('open')).toBe(false)
    expect(deleteMutate).not.toHaveBeenCalled()
  })
})

describe('CreateOrEditResourcePoolDialog — test connection {ok, message}', () => {
  function mountDialog(pool: ResourcePool | null = null) {
    return mount(CreateOrEditResourcePoolDialog, {
      ...mountConfig,
      props: { open: true, pool },
      attachTo: document.body,
    })
  }

  it('renders a success alert with message + detail when testResourcePoolConnection returns ok', async () => {
    testConnMutate.mockResolvedValue({
      data: {
        testResourcePoolConnection: {
          ok: true,
          message: '连接成功',
          detail: { vSphereVersion: '8.0.2', itemCount: 7 },
        },
      },
    })
    const dlg = mountDialog()

    // Fill the three required fields so the test button is enabled.
    const inputs = document.body.querySelectorAll<HTMLInputElement>('.resource-form input')
    inputs[0].value = 'vc-oc1'
    inputs[0].dispatchEvent(new Event('input'))
    inputs[1].value = 'https://vc.example.local/sdk'
    inputs[1].dispatchEvent(new Event('input'))
    inputs[2].value = 'cl-vc-oc1'
    inputs[2].dispatchEvent(new Event('input'))
    await flushPromises()

    // Click the "测试连接" button (the first cds-button in the test block).
    const testBtn = document.body.querySelector('.resource-test cds-button') as HTMLElement
    testBtn.dispatchEvent(new Event('click'))
    await flushPromises()

    expect(testConnMutate).toHaveBeenCalledWith({
      input: { name: 'vc-oc1', endpoint: 'https://vc.example.local/sdk', contentLibraryName: 'cl-vc-oc1' },
    })

    const alert = document.body.querySelector('cds-alert.resource-test-alert')
    expect(alert).not.toBeNull()
    expect(alert!.getAttribute('status')).toBe('success')
    expect(alert!.textContent).toContain('连接成功')
    // Detail line renders only on ok && detail present.
    expect(alert!.textContent).toContain('8.0.2')
    expect(alert!.textContent).toContain('7')
    dlg.unmount()
  })

  it('renders a danger alert with the failure message when ok is false', async () => {
    testConnMutate.mockResolvedValue({
      data: {
        testResourcePoolConnection: {
          ok: false,
          message: '无法连接到 vCenter',
          detail: null,
        },
      },
    })
    const dlg = mountDialog()

    const inputs = document.body.querySelectorAll<HTMLInputElement>('.resource-form input')
    inputs[0].value = 'vc-bad'
    inputs[0].dispatchEvent(new Event('input'))
    inputs[1].value = 'https://bad/sdk'
    inputs[1].dispatchEvent(new Event('input'))
    inputs[2].value = 'cl-bad'
    inputs[2].dispatchEvent(new Event('input'))
    await flushPromises()

    const testBtn = document.body.querySelector('.resource-test cds-button') as HTMLElement
    testBtn.dispatchEvent(new Event('click'))
    await flushPromises()

    const alert = document.body.querySelector('cds-alert.resource-test-alert')
    expect(alert).not.toBeNull()
    expect(alert!.getAttribute('status')).toBe('danger')
    expect(alert!.textContent).toContain('无法连接到 vCenter')
    // No detail line when the test failed.
    expect(alert!.textContent).not.toContain('OVF')
    dlg.unmount()
  })

  it('emits submit(create) with a trimmed normalized input when the form is submitted', async () => {
    const dlg = mountDialog()

    const inputs = document.body.querySelectorAll<HTMLInputElement>('.resource-form input')
    inputs[0].value = '  Trimmed Name  '
    inputs[0].dispatchEvent(new Event('input'))
    inputs[1].value = '  https://vc/sdk  '
    inputs[1].dispatchEvent(new Event('input'))
    inputs[2].value = '  cl-trim  '
    inputs[2].dispatchEvent(new Event('input'))
    await flushPromises()

    const form = document.body.querySelector('.resource-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    const emitted = dlg.emitted('submit')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toMatchObject({
      mode: 'create',
      input: { name: 'Trimmed Name', endpoint: 'https://vc/sdk', contentLibraryName: 'cl-trim' },
    })
    dlg.unmount()
  })
})
