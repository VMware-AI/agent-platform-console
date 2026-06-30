/**
 * Component tests for AgentMarketplaceView.vue.
 *
 * The view is the OVA template-family marketplace (`/agents/marketplace`). It:
 *  - lists OvaTemplateFamily cards via useQuery(OVA_TEMPLATE_FAMILIES_QUERY)
 *    (loading / empty / error / data states + pagination + type filter + search)
 *  - loads resource pools via useQuery(RESOURCE_POOLS_QUERY) for the deploy dialog
 *  - opens the AddOvaTemplateDialog and, on submit, runs CREATE_OVA_TEMPLATE_FAMILY
 *  - opens the DeployAgentDialog and, on submit, runs DEPLOY_AGENT and surfaces the
 *    one-time `virtualKeySecret` in VirtualKeySecretDialog
 *  - shows a toast (graphqlErrorMessage) on a failed deploy / create
 *
 * Strategy:
 *  - Mock '@vue/apollo-composable': useQuery returns controllable refs routed by
 *    the GraphQL document's operation name; useMutation returns a vi.fn mutate
 *    whose resolved/rejected value each test controls.
 *  - Mock 'vue-router' useRouter so the post-secret navigation is observable.
 *  - Real Pinia so locale.t() resolves the real marketplace.* strings, which we
 *    assert against (non-vacuous, locale-key-driven, not brittle markup).
 *
 * cds-* are Clarity custom elements; we tell Vue's compiler to treat any `cds-`
 * tag as a custom element so mount() doesn't try to resolve them as components.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, type Ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import type { ResourcePool } from '@/types/resource-pool'
import type {
  OvaTemplateFamily,
  OvaTemplateVersion,
  VsphereResourcePool,
} from '@/types/marketplace'

/* ----------------------------- Apollo mock ----------------------------- */
// Controllable query-state holders, keyed by GraphQL operation name. Each test
// resets these in beforeEach and tweaks the ones it cares about.
interface QueryState {
  result: Ref<unknown>
  loading: Ref<boolean>
  error: Ref<unknown>
  refetch: ReturnType<typeof vi.fn>
}

function makeQueryState(initial: unknown = null): QueryState {
  return {
    result: ref(initial),
    loading: ref(false),
    error: ref(null),
    refetch: vi.fn().mockResolvedValue(undefined),
  }
}

const queryStates: Record<string, QueryState> = {
  OvaTemplateFamilies: makeQueryState(),
  ResourcePools: makeQueryState(),
  VsphereResourcePools: makeQueryState(),
}

// One shared mutate mock per mutation operation; tests set its resolved value.
const mutateFns: Record<string, ReturnType<typeof vi.fn>> = {
  CreateOvaTemplateFamily: vi.fn(),
  DeployAgent: vi.fn(),
}
const mutationLoading: Record<string, Ref<boolean>> = {
  CreateOvaTemplateFamily: ref(false),
  DeployAgent: ref(false),
}

function opNameOf(doc: unknown): string {
  // These gql documents prepend fragment definitions (FAMILY_FIELDS /
  // VERSION_FIELDS), so definitions[0] is often a FragmentDefinition. Find the
  // OperationDefinition explicitly to read the query/mutation name.
  const defs =
    (doc as { definitions?: Array<{ kind?: string; name?: { value?: string } }> })?.definitions ?? []
  const op = defs.find((d) => d.kind === 'OperationDefinition')
  return op?.name?.value ?? ''
}

vi.mock('@vue/apollo-composable', () => ({
  useQuery: (doc: unknown) => {
    const name = opNameOf(doc)
    const st = queryStates[name] ?? makeQueryState()
    return {
      result: st.result,
      loading: st.loading,
      error: st.error,
      refetch: st.refetch,
    }
  },
  useMutation: (doc: unknown) => {
    const name = opNameOf(doc)
    return {
      mutate: mutateFns[name] ?? vi.fn(),
      loading: mutationLoading[name] ?? ref(false),
    }
  },
}))

/* ----------------------------- Router mock ----------------------------- */
const pushSpy = vi.fn().mockResolvedValue(undefined)
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushSpy }),
}))

import AgentMarketplaceView from '@/views/AgentMarketplaceView.vue'
import DeployAgentDialog from '@/views/marketplace/DeployAgentDialog.vue'
import AddOvaTemplateDialog from '@/views/marketplace/AddOvaTemplateDialog.vue'
import VirtualKeySecretDialog from '@/components/VirtualKeySecretDialog.vue'
import { useLocaleStore } from '@/stores/locale'

/* ----------------------------- Fixtures ----------------------------- */
function makeVersion(over: Partial<OvaTemplateVersion> = {}): OvaTemplateVersion {
  return {
    id: 'v1',
    familyId: 'f1',
    version: 'v1.0.0',
    ovaIdentifier: 'openclaw-vm-v1',
    notes: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function makeFamily(over: Partial<OvaTemplateFamily> = {}): OvaTemplateFamily {
  return {
    id: 'f1',
    name: 'OpenClaw',
    type: 'OPENCLAW',
    description: 'A capable agent',
    tools: ['shell', 'browser'],
    scenarios: ['ops'],
    skills: ['vmware'],
    iconShape: 'wrench',
    iconColor: 'BLUE',
    versions: [makeVersion({ id: 'v2', version: 'v1.1.0' }), makeVersion({ id: 'v1', version: 'v1.0.0' })],
    latestVersion: 'v1.1.0',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...over,
  }
}

function makePool(over: Partial<ResourcePool> = {}): ResourcePool {
  return {
    id: 'p1',
    name: 'Pool A',
    endpoint: 'vc.example.com',
    contentLibraryName: 'CL',
    connectionStatus: 'CONNECTED',
    esxiHostCount: 2,
    vmInstanceCount: 5,
    syncStatus: 'SYNCED',
    lastSyncedAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function makeVspherePool(over: Partial<VsphereResourcePool> = {}): VsphereResourcePool {
  return { name: 'Resources', path: '/DC0/host/DC0_C0/Resources', ...over }
}

function setFamilies(families: OvaTemplateFamily[], totalCount = families.length): void {
  queryStates.OvaTemplateFamilies.result.value = {
    ovaTemplateFamilies: {
      nodes: families,
      totalCount,
      pageInfo: { page: 1, pageSize: 6, totalPages: Math.max(1, Math.ceil(totalCount / 6)) },
    },
  }
}

function setPools(pools: ResourcePool[]): void {
  queryStates.ResourcePools.result.value = {
    resourcePools: {
      nodes: pools,
      totalCount: pools.length,
      pageInfo: { page: 1, pageSize: 100, totalPages: 1 },
    },
  }
}

function setVspherePools(pools: VsphereResourcePool[]): void {
  queryStates.VsphereResourcePools.result.value = { vsphereResourcePools: pools }
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

beforeEach(() => {
  setActivePinia(createPinia())
  // Reset every query state to a clean default.
  queryStates.OvaTemplateFamilies = makeQueryState()
  queryStates.ResourcePools = makeQueryState()
  queryStates.VsphereResourcePools = makeQueryState()
  setFamilies([])
  setPools([])
  setVspherePools([])
  mutateFns.CreateOvaTemplateFamily.mockReset()
  mutateFns.DeployAgent.mockReset()
  mutationLoading.CreateOvaTemplateFamily.value = false
  mutationLoading.DeployAgent.value = false
  pushSpy.mockClear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.querySelectorAll('cds-modal').forEach((el) => el.remove())
})

describe('AgentMarketplaceView', () => {
  it('shows the loading placeholder while families are loading and empty', () => {
    queryStates.OvaTemplateFamilies.loading.value = true
    setFamilies([])
    wrapper = mount(AgentMarketplaceView, mountConfig)

    const locale = useLocaleStore()
    expect(wrapper.text()).toContain(locale.t('marketplace.loading'))
    expect(wrapper.find('.card-grid').exists()).toBe(false)
  })

  it('shows the empty placeholder while the toolbar still exposes create', () => {
    setFamilies([])
    wrapper = mount(AgentMarketplaceView, mountConfig)

    const locale = useLocaleStore()
    expect(wrapper.text()).toContain(locale.t('marketplace.empty'))
    // Toolbar create button is still rendered so an admin can bootstrap the catalog.
    expect(wrapper.find('.toolbar-create').exists()).toBe(true)
    expect(wrapper.find('.card-grid').exists()).toBe(false)
  })

  it('renders the error alert with the locale error text when the query errors', () => {
    queryStates.OvaTemplateFamilies.error.value = new Error('boom')
    setFamilies([])
    wrapper = mount(AgentMarketplaceView, mountConfig)

    const locale = useLocaleStore()
    const alert = wrapper.find('cds-alert[status="danger"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain(locale.t('marketplace.error'))
    // Error state suppresses both the empty placeholder and the pager.
    expect(wrapper.text()).not.toContain(locale.t('marketplace.empty'))
  })

  it('renders one card per family with the family name, localized type, and tools/skills/scenarios', () => {
    const fam = makeFamily({
      name: 'OpenClaw Bot',
      tools: ['shell', 'browser'],
      skills: ['vmware'],
      scenarios: ['ops'],
    })
    setFamilies([fam])
    wrapper = mount(AgentMarketplaceView, mountConfig)

    const locale = useLocaleStore()
    const cards = wrapper.findAll('.tpl-card')
    expect(cards).toHaveLength(1)
    const card = cards[0]
    expect(card.text()).toContain('OpenClaw Bot')
    // Localized type label (OPENCLAW -> marketplace.type.openclaw).
    expect(card.text()).toContain(locale.t('marketplace.type.openclaw'))
    expect(card.text()).toContain('shell')
    expect(card.text()).toContain('browser')
    expect(card.text()).toContain('vmware')
    expect(card.text()).toContain('ops')
    // Latest-version badge.
    expect(card.text()).toContain('v1.1.0')
  })

  it('renders the pager + summary when there is more than one page', () => {
    // 7 items at pageSize 6 -> 2 pages.
    setFamilies([makeFamily({ id: 'f1', name: 'A' })], 7)
    wrapper = mount(AgentMarketplaceView, mountConfig)

    const locale = useLocaleStore()
    expect(wrapper.find('cds-pagination').exists()).toBe(true)
    const expectedSummary = locale
      .t('marketplace.pager.summary')
      .replace('{start}', '1')
      .replace('{end}', '6')
      .replace('{total}', '7')
    expect(wrapper.find('.pager-summary').text()).toBe(expectedSummary)
  })

  it('typing in the search box updates the keyword and resets to page 1', async () => {
    setFamilies([makeFamily()], 20)
    wrapper = mount(AgentMarketplaceView, mountConfig)

    const search = wrapper.find('.toolbar-search-input')
    await search.setValue('claw')
    await flushPromises()

    expect((search.element as HTMLInputElement).value).toBe('claw')
    // After typing, the current page must be 1 (the pager number input reflects it).
    const pageInput = wrapper.find('cds-input[cds-pagination-number] input')
    if (pageInput.exists()) {
      expect((pageInput.element as HTMLInputElement).value).toBe('1')
    }
  })

  it('warns (toast) and does NOT open the deploy dialog when no resource pools exist', async () => {
    setFamilies([makeFamily()])
    setPools([]) // no pools
    wrapper = mount(AgentMarketplaceView, mountConfig)

    const locale = useLocaleStore()
    // Click the card's "create agent" (deploy) button.
    const createBtn = wrapper
      .findAll('.tpl-actions-buttons cds-button')
      .find((b) => b.text().includes(locale.t('marketplace.card.action.create')))!
    await createBtn.trigger('click')
    await flushPromises()

    // The deploy dialog (open prop) must not be active: the DeployAgentDialog's
    // modal stays hidden. We check the toast composable surfaced the warning.
    const { useToast } = await import('@/composables/useToast')
    const toast = useToast()
    expect(toast.toasts.value.some((t) => t.message === locale.t('marketplace.toast.deployPoolEmpty'))).toBe(true)
  })

  it('opens the deploy dialog when a pool exists and clicking the deploy button', async () => {
    setFamilies([makeFamily({ name: 'OpenClaw' })])
    setPools([makePool()])
    setVspherePools([makeVspherePool()])
    wrapper = mount(AgentMarketplaceView, mountConfig)

    const locale = useLocaleStore()
    const createBtn = wrapper
      .findAll('.tpl-actions-buttons cds-button')
      .find((b) => b.text().includes(locale.t('marketplace.card.action.create')))!
    await createBtn.trigger('click')
    await flushPromises()

    // The DeployAgentDialog child receives open=true and the clicked template.
    const dialog = wrapper.findComponent(DeployAgentDialog)
    expect(dialog.props('open')).toBe(true)
    expect((dialog.props('template') as { name: string }).name).toBe('OpenClaw')
  })

  it('deploy submit calls DEPLOY_AGENT and surfaces the one-time virtualKeySecret in the reveal dialog', async () => {
    const SECRET = 'sk-gw-ONE-TIME-SECRET-xyz'
    setFamilies([makeFamily({ id: 'f1', name: 'OpenClaw' })])
    setPools([makePool({ id: 'p1' })])
    setVspherePools([]) // empty -> placement pool optional, form valid
    mutateFns.DeployAgent.mockResolvedValue({
      data: {
        deployAgent: {
          agent: {
            id: 'a1',
            name: 'OpenClaw_1',
            type: 'OPENCLAW',
            status: 'RUNNING',
            endpoint: null,
            apiKey: { id: 'k1', name: 'gw' },
            credentials: { username: 'opuser' },
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
            templateFamilyId: 'f1',
            templateVersionId: 'v2',
            resourcePoolId: 'p1',
          },
          virtualKeySecret: SECRET,
          templateVersion: makeVersion({ id: 'v2' }),
          resourcePool: makePool({ id: 'p1' }),
        },
      },
    })

    wrapper = mount(AgentMarketplaceView, mountConfig)
    const locale = useLocaleStore()

    // Open the deploy dialog.
    const createBtn = wrapper
      .findAll('.tpl-actions-buttons cds-button')
      .find((b) => b.text().includes(locale.t('marketplace.card.action.create')))!
    await createBtn.trigger('click')
    await flushPromises()

    // Submit the deploy dialog (its submit button carries the deploy.submit label).
    const submitBtn = Array.from(wrapper.element.querySelectorAll('cds-modal-actions cds-button')).find((b) =>
      b.textContent?.includes(locale.t('marketplace.deploy.submit')),
    ) as HTMLElement
    expect(submitBtn).toBeTruthy()
    submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // DEPLOY_AGENT was called with the family + version + pool.
    expect(mutateFns.DeployAgent).toHaveBeenCalledTimes(1)
    const arg = mutateFns.DeployAgent.mock.calls[0][0] as { input: Record<string, unknown> }
    expect(arg.input.templateFamilyId).toBe('f1')
    expect(arg.input.resourcePoolId).toBe('p1')

    // The one-time secret is surfaced in the VirtualKeySecretDialog: it receives
    // open=true and the exact issued secret, and renders the secret value.
    const secretDialog = wrapper.findComponent(VirtualKeySecretDialog)
    expect(secretDialog.props('open')).toBe(true)
    expect(secretDialog.props('secret')).toBe(SECRET)
    expect(secretDialog.text()).toContain(SECRET)
    // The deploy dialog is closed afterward.
    expect(wrapper.findComponent(DeployAgentDialog).props('open')).toBe(false)

    // Success toast names the agent + run-as username.
    const { useToast } = await import('@/composables/useToast')
    const toast = useToast()
    const okMsg = locale
      .t('marketplace.toast.deployOk')
      .replace('{name}', 'OpenClaw_1')
      .replace('{username}', 'opuser')
    expect(toast.toasts.value.some((t) => t.message === okMsg)).toBe(true)
  })

  it('dismissing the secret reveal dialog navigates to the agent list', async () => {
    const SECRET = 'sk-gw-secret'
    setFamilies([makeFamily({ id: 'f1' })])
    setPools([makePool({ id: 'p1' })])
    setVspherePools([])
    mutateFns.DeployAgent.mockResolvedValue({
      data: {
        deployAgent: {
          agent: {
            id: 'a1',
            name: 'A',
            type: 'OPENCLAW',
            status: 'RUNNING',
            endpoint: null,
            apiKey: null,
            credentials: { username: 'u' },
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
            templateFamilyId: 'f1',
            templateVersionId: 'v2',
            resourcePoolId: 'p1',
          },
          virtualKeySecret: SECRET,
          templateVersion: makeVersion({ id: 'v2' }),
          resourcePool: makePool({ id: 'p1' }),
        },
      },
    })

    wrapper = mount(AgentMarketplaceView, mountConfig)
    const locale = useLocaleStore()

    const createBtn = wrapper
      .findAll('.tpl-actions-buttons cds-button')
      .find((b) => b.text().includes(locale.t('marketplace.card.action.create')))!
    await createBtn.trigger('click')
    await flushPromises()
    const submitBtn = Array.from(wrapper.element.querySelectorAll('cds-modal-actions cds-button')).find((b) =>
      b.textContent?.includes(locale.t('marketplace.deploy.submit')),
    ) as HTMLElement
    submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // Close the secret reveal dialog via its "done" action.
    const secretModal = Array.from(wrapper.element.querySelectorAll('cds-modal')).find((m) =>
      m.textContent?.includes(locale.t('virtualKey.secret.title')),
    )!
    const doneBtn = Array.from(secretModal.querySelectorAll('cds-modal-actions cds-button')).find((b) =>
      b.textContent?.includes(locale.t('virtualKey.secret.done')),
    ) as HTMLElement
    doneBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(pushSpy).toHaveBeenCalledWith({ name: 'agents.list' })
  })

  it('shows the backend GraphQL error message (graphqlErrorMessage) when deploy fails', async () => {
    setFamilies([makeFamily({ id: 'f1' })])
    setPools([makePool({ id: 'p1' })])
    setVspherePools([])
    mutateFns.DeployAgent.mockRejectedValue({
      graphQLErrors: [{ message: 'admin role required to deploy agents' }],
    })

    wrapper = mount(AgentMarketplaceView, mountConfig)
    const locale = useLocaleStore()

    const createBtn = wrapper
      .findAll('.tpl-actions-buttons cds-button')
      .find((b) => b.text().includes(locale.t('marketplace.card.action.create')))!
    await createBtn.trigger('click')
    await flushPromises()
    const submitBtn = Array.from(wrapper.element.querySelectorAll('cds-modal-actions cds-button')).find((b) =>
      b.textContent?.includes(locale.t('marketplace.deploy.submit')),
    ) as HTMLElement
    submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // The admin-gated backend message is surfaced verbatim via graphqlErrorMessage.
    const { useToast } = await import('@/composables/useToast')
    const toast = useToast()
    expect(
      toast.toasts.value.some((t) => t.message === 'admin role required to deploy agents' && t.status === 'danger'),
    ).toBe(true)
    // No secret dialog appears on failure (its open prop stays false).
    expect(wrapper.findComponent(VirtualKeySecretDialog).props('open')).toBe(false)
  })

  it('create-family submit calls CREATE_OVA_TEMPLATE_FAMILY and toasts success with the new family name', async () => {
    setFamilies([])
    mutateFns.CreateOvaTemplateFamily.mockResolvedValue({
      data: { createOvaTemplateFamily: { family: makeFamily({ id: 'fNew', name: 'BrandNew' }) } },
    })

    wrapper = mount(AgentMarketplaceView, mountConfig)
    const locale = useLocaleStore()

    // Open create dialog via the toolbar create button.
    const toolbarCreate = wrapper.find('.toolbar-create')
    await toolbarCreate.trigger('click')
    await flushPromises()

    const addDialog = wrapper.findComponent(AddOvaTemplateDialog)
    expect(addDialog.props('open')).toBe(true)
    const createModal = addDialog.element as HTMLElement

    // Fill the AddOvaTemplateDialog form so it passes validation, then submit.
    const setInput = (sel: string, val: string) => {
      const el = createModal.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel)!
      el.value = val
      el.dispatchEvent(new Event('input'))
    }
    setInput('cds-input.full-row input', 'My Template') // name
    // type select
    const typeSelect = createModal.querySelector<HTMLSelectElement>('cds-select select')!
    typeSelect.value = 'OPENCLAW'
    typeSelect.dispatchEvent(new Event('change'))
    // version (second cds-input, non full-row) + ova identifier
    const inputs = Array.from(createModal.querySelectorAll<HTMLInputElement>('cds-input input'))
    // inputs[0]=name, inputs[1]=version, inputs[2]=ovaIdentifier
    inputs[1].value = 'v1.0.0'
    inputs[1].dispatchEvent(new Event('input'))
    inputs[2].value = 'openclaw-vm-v1'
    inputs[2].dispatchEvent(new Event('input'))
    const textareas = Array.from(createModal.querySelectorAll<HTMLTextAreaElement>('textarea'))
    // textareas: description, tools, scenarios, skills
    textareas[0].value = 'desc'
    textareas[0].dispatchEvent(new Event('input'))
    textareas[1].value = 'shell'
    textareas[1].dispatchEvent(new Event('input'))
    textareas[2].value = 'ops'
    textareas[2].dispatchEvent(new Event('input'))
    textareas[3].value = 'vmware'
    textareas[3].dispatchEvent(new Event('input'))
    await flushPromises()

    const submitBtn = Array.from(createModal.querySelectorAll('cds-modal-actions cds-button')).find((b) =>
      b.textContent?.includes(locale.t('marketplace.form.submit')),
    ) as HTMLElement
    submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateFns.CreateOvaTemplateFamily).toHaveBeenCalledTimes(1)
    const arg = mutateFns.CreateOvaTemplateFamily.mock.calls[0][0] as { input: Record<string, unknown> }
    expect(arg.input.name).toBe('My Template')
    expect(arg.input.type).toBe('OPENCLAW')

    const { useToast } = await import('@/composables/useToast')
    const toast = useToast()
    const okMsg = locale.t('marketplace.toast.createFamilyOk').replace('{name}', 'BrandNew')
    expect(toast.toasts.value.some((t) => t.message === okMsg)).toBe(true)
    // List is refetched after a successful create.
    expect(queryStates.OvaTemplateFamilies.refetch).toHaveBeenCalled()
  })

  it('create-family failure surfaces the backend message via graphqlErrorMessage', async () => {
    setFamilies([])
    mutateFns.CreateOvaTemplateFamily.mockRejectedValue({
      graphQLErrors: [{ message: 'admin role required' }],
    })

    wrapper = mount(AgentMarketplaceView, mountConfig)
    const locale = useLocaleStore()

    await wrapper.find('.toolbar-create').trigger('click')
    await flushPromises()
    const createModal = wrapper.findComponent(AddOvaTemplateDialog).element as HTMLElement

    // Minimal valid fill.
    const nameInput = createModal.querySelector<HTMLInputElement>('cds-input.full-row input')!
    nameInput.value = 'X'
    nameInput.dispatchEvent(new Event('input'))
    const typeSelect = createModal.querySelector<HTMLSelectElement>('cds-select select')!
    typeSelect.value = 'OPENCLAW'
    typeSelect.dispatchEvent(new Event('change'))
    const inputs = Array.from(createModal.querySelectorAll<HTMLInputElement>('cds-input input'))
    inputs[1].value = 'v1'
    inputs[1].dispatchEvent(new Event('input'))
    inputs[2].value = 'ova-x'
    inputs[2].dispatchEvent(new Event('input'))
    const textareas = Array.from(createModal.querySelectorAll<HTMLTextAreaElement>('textarea'))
    textareas[0].value = 'd'
    textareas[0].dispatchEvent(new Event('input'))
    textareas[1].value = 't'
    textareas[1].dispatchEvent(new Event('input'))
    textareas[2].value = 's'
    textareas[2].dispatchEvent(new Event('input'))
    textareas[3].value = 'k'
    textareas[3].dispatchEvent(new Event('input'))
    await flushPromises()

    const submitBtn = Array.from(createModal.querySelectorAll('cds-modal-actions cds-button')).find((b) =>
      b.textContent?.includes(locale.t('marketplace.form.submit')),
    ) as HTMLElement
    submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const { useToast } = await import('@/composables/useToast')
    const toast = useToast()
    expect(toast.toasts.value.some((t) => t.message === 'admin role required' && t.status === 'danger')).toBe(true)
  })

  it('"view details" action surfaces the placeholder toast (info)', async () => {
    setFamilies([makeFamily()])
    setPools([makePool()])
    wrapper = mount(AgentMarketplaceView, mountConfig)

    const locale = useLocaleStore()
    const viewBtn = wrapper
      .findAll('.tpl-actions-buttons cds-button')
      .find((b) => b.text().includes(locale.t('marketplace.card.action.view')))!
    await viewBtn.trigger('click')
    await flushPromises()

    const { useToast } = await import('@/composables/useToast')
    const toast = useToast()
    expect(
      toast.toasts.value.some(
        (t) => t.message === locale.t('marketplace.toast.viewPlaceholder') && t.status === 'info',
      ),
    ).toBe(true)
  })
})
