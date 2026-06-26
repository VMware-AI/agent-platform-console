/**
 * Component tests for DeployAgentDialog.vue — 从模板部署智能体 (Deploy Agent from OVA).
 *
 * The dialog creates a NEW agent from an OVA template version. It does NOT run a
 * mutation itself — submit EMITS a `submit` event carrying a DeployAgentInput; the
 * parent runs the deploy. The only live GraphQL it issues is the vSphere placement
 * pool enumeration (VSPHERE_RESOURCE_POOLS_QUERY) via useQuery, keyed off the
 * selected platform resource pool.
 *
 * Mocking strategy (mirrors GatewayConnectionView.test.ts):
 *   - `@vue/apollo-composable`'s `useQuery` is mocked with a single controllable
 *     slot (result / loading) so the vSphere-pool states (loading / empty / data)
 *     are driven deterministically. The query options getter is invoked so the
 *     `enabled` branch is exercised but otherwise inert.
 *   - real Pinia so `locale.t(...)` resolves real strings; assertions are keyed off
 *     the same `locale.t` keys the component renders, not hard-coded text.
 *   - props (open / template / pools / deploying) are supplied directly.
 *   - cds-* are custom elements (Clarity); we assert on plain DOM + emitted events.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, type Ref } from 'vue'

import type {
  DeployAgentInput,
  OvaTemplateFamily,
  OvaTemplateVersion,
  ResourcePool,
  VsphereResourcePool,
} from '@/api/graphql/types'

// --- mocks -----------------------------------------------------------------

interface QuerySlot {
  result: Ref<unknown>
  loading: Ref<boolean>
}

let vsphereSlot: QuerySlot
// Capture the options getter so we can assert the query's `enabled` gating.
let lastOptionsGetter: (() => { enabled: boolean; fetchPolicy: string }) | undefined

vi.mock('@vue/apollo-composable', () => ({
  useQuery: (
    _document: unknown,
    _vars: unknown,
    options?: () => { enabled: boolean; fetchPolicy: string },
  ) => {
    lastOptionsGetter = typeof options === 'function' ? options : undefined
    return {
      result: vsphereSlot.result,
      loading: vsphereSlot.loading,
    }
  },
}))

import DeployAgentDialog from '@/views/marketplace/DeployAgentDialog.vue'
import { useLocaleStore } from '@/stores/locale'

// --- fixtures --------------------------------------------------------------

function makeVersion(over: Partial<OvaTemplateVersion> = {}): OvaTemplateVersion {
  return {
    id: 'ver-1',
    familyId: 'fam-1',
    version: '1.0.0',
    ovaIdentifier: 'ova://fam/1.0.0',
    notes: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

// Backend returns versions NEWEST-first; index 0 is the latest.
const VER_LATEST = makeVersion({ id: 'ver-new', version: '2.1.0' })
const VER_OLD = makeVersion({ id: 'ver-old', version: '1.0.0' })

function makeFamily(over: Partial<OvaTemplateFamily> = {}): OvaTemplateFamily {
  return {
    id: 'fam-1',
    name: 'OpenClaw',
    type: 'GENERAL' as OvaTemplateFamily['type'],
    description: 'desc',
    tools: [],
    scenarios: [],
    skills: [],
    iconShape: 'robot',
    iconColor: 'BLUE',
    versions: [VER_LATEST, VER_OLD],
    latestVersion: '2.1.0',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function makePool(over: Partial<ResourcePool> = {}): ResourcePool {
  return {
    id: 'pool-1',
    name: 'Primary Pool',
    endpoint: 'vcenter.example.com',
    contentLibraryName: 'lib',
    connectionStatus: 'CONNECTED' as ResourcePool['connectionStatus'],
    esxiHostCount: 3,
    vmInstanceCount: 10,
    syncStatus: 'SYNCED' as ResourcePool['syncStatus'],
    lastSyncedAt: '2026-02-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

const POOL_A = makePool({ id: 'pool-a', name: 'Alpha', endpoint: 'vc-a.example.com' })
const POOL_B = makePool({ id: 'pool-b', name: 'Beta', endpoint: 'vc-b.example.com' })

const VPOOL_1: VsphereResourcePool = { name: 'Resources', path: '/DC0/host/DC0_C0/Resources' }
const VPOOL_2: VsphereResourcePool = { name: 'Prod', path: '/DC0/host/DC0_C0/Resources/Prod' }

const mountConfig = {
  global: {
    config: {
      compilerOptions: {
        isCustomElement: (tag: string) => tag.startsWith('cds-'),
      },
    },
  },
}

function setVspherePools(pools: VsphereResourcePool[]) {
  vsphereSlot.result.value = { vsphereResourcePools: pools }
}

let wrapper: VueWrapper | null = null
let locale: ReturnType<typeof useLocaleStore>

interface MountProps {
  open?: boolean
  template?: OvaTemplateFamily | null
  pools?: ResourcePool[]
  deploying?: boolean
}

function mountDialog(props: MountProps = {}) {
  wrapper = mount(DeployAgentDialog, {
    ...mountConfig,
    props: {
      open: props.open ?? true,
      template: props.template ?? makeFamily(),
      pools: props.pools ?? [POOL_A, POOL_B],
      deploying: props.deploying ?? false,
    },
  })
  return wrapper
}

// --- DOM helpers -----------------------------------------------------------

function selects(): HTMLSelectElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLSelectElement>('select'))
}
// The three selects in DOM order: [0] version, [1] platform pool, [2] vSphere pool.
function versionSelect(): HTMLSelectElement {
  return selects()[0]
}
function poolSelect(): HTMLSelectElement {
  return selects()[1]
}
function targetPoolSelect(): HTMLSelectElement {
  return selects()[2]
}
function inputs(): HTMLInputElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLInputElement>('input'))
}
// Inputs in DOM order: [0] name, [1] hostname, [2] maxBudget(number).
function nameInput(): HTMLInputElement {
  return inputs()[0]
}
function hostnameInput(): HTMLInputElement {
  return inputs()[1]
}
function budgetInput(): HTMLInputElement {
  return inputs()[2]
}
function setValue(el: HTMLInputElement | HTMLSelectElement, v: string) {
  el.value = v
  // <select> v-model binds on `change`; text inputs bind on `input`. Dispatch
  // both so this helper works for either control.
  el.dispatchEvent(new Event('input'))
  el.dispatchEvent(new Event('change'))
}
function clickSubmit() {
  // Last action button is the Deploy/submit button.
  const buttons = Array.from(wrapper!.element.querySelectorAll<HTMLElement>('cds-modal-actions cds-button'))
  buttons[buttons.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
}
function clickCancel() {
  const buttons = Array.from(wrapper!.element.querySelectorAll<HTMLElement>('cds-modal-actions cds-button'))
  buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
}
function submitEvents(): DeployAgentInput[] {
  return (wrapper!.emitted('submit') ?? []).map((e) => e[0] as DeployAgentInput)
}
function controlMessages(): string[] {
  return Array.from(
    wrapper!.element.querySelectorAll<HTMLElement>('cds-control-message'),
  ).map((m) => m.textContent?.trim() ?? '')
}

beforeEach(() => {
  setActivePinia(createPinia())
  locale = useLocaleStore()
  vsphereSlot = { result: ref<unknown>(undefined), loading: ref(false) }
  lastOptionsGetter = undefined
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

// ---------------------------------------------------------------------------

describe('DeployAgentDialog — open + prefill', () => {
  it('renders the localized title and the template info banner with version count', async () => {
    mountDialog({ template: makeFamily() })
    await flushPromises()

    expect(wrapper!.element.textContent).toContain(locale.t('marketplace.deploy.title'))
    const info = wrapper!.element.querySelector('.deploy-info')
    expect(info).not.toBeNull()
    // Banner names the family and shows how many versions are selectable.
    expect(info?.textContent).toContain('OpenClaw')
    expect(info?.textContent).toContain('2') // versions.length
  })

  it('preselects the NEWEST OVA version (index 0) and lists every version', async () => {
    mountDialog({ template: makeFamily() })
    await flushPromises()

    const opts = Array.from(versionSelect().querySelectorAll('option'))
    expect(opts.map((o) => o.value)).toEqual(['ver-new', 'ver-old'])
    // Newest (index 0) is the bound value.
    expect(versionSelect().value).toBe('ver-new')
    // The latest row is tagged with the localized "latest" suffix.
    const latestOpt = opts.find((o) => o.value === 'ver-new')!
    expect(latestOpt.textContent).toContain(locale.t('marketplace.deploy.versionLatest'))
  })

  it('preselects the first platform resource pool and lists name + endpoint', async () => {
    mountDialog({ pools: [POOL_A, POOL_B] })
    await flushPromises()

    expect(poolSelect().value).toBe('pool-a')
    const opts = Array.from(poolSelect().querySelectorAll('option'))
    expect(opts.map((o) => o.value)).toEqual(['pool-a', 'pool-b'])
    expect(opts[0].textContent).toContain('Alpha')
    expect(opts[0].textContent).toContain('vc-a.example.com')
  })

  it('prefills a non-empty default agent name derived from the family name', async () => {
    mountDialog({ template: makeFamily({ name: 'OpenClaw' }) })
    await flushPromises()
    expect(nameInput().value).toMatch(/^OpenClaw_/)
  })

  it('re-runs prefill when the dialog transitions closed → open with a new template', async () => {
    mountDialog({ open: false, template: makeFamily({ name: 'OpenClaw' }) })
    await flushPromises()

    await wrapper!.setProps({ open: true, template: makeFamily({ name: 'Goose', id: 'fam-2' }) })
    await flushPromises()

    expect(nameInput().value).toMatch(/^Goose_/)
  })
})

describe('DeployAgentDialog — vSphere placement-pool dropdown', () => {
  it('shows the loading placeholder and disables the dropdown while pools load', async () => {
    vsphereSlot.loading.value = true
    mountDialog()
    await flushPromises()

    const placeholder = targetPoolSelect().querySelector('option[value=""]')
    expect(placeholder?.textContent?.trim()).toBe(locale.t('marketplace.deploy.targetPoolLoading'))
    expect(targetPoolSelect().disabled).toBe(true)
  })

  it('shows the empty placeholder and disables the dropdown when vCenter offers no pools', async () => {
    setVspherePools([])
    mountDialog()
    await flushPromises()

    const placeholder = targetPoolSelect().querySelector('option[value=""]')
    expect(placeholder?.textContent?.trim()).toBe(locale.t('marketplace.deploy.targetPoolEmpty'))
    expect(targetPoolSelect().disabled).toBe(true)
  })

  it('lists one option per live vSphere pool (name — path) and enables selection', async () => {
    setVspherePools([VPOOL_1, VPOOL_2])
    mountDialog()
    await flushPromises()

    expect(targetPoolSelect().disabled).toBe(false)
    const opts = Array.from(targetPoolSelect().querySelectorAll('option'))
    // first option is the placeholder, then one per pool keyed by path.
    expect(opts[0].textContent?.trim()).toBe(locale.t('marketplace.deploy.targetPoolPlaceholder'))
    expect(opts.slice(1).map((o) => o.value)).toEqual([VPOOL_1.path, VPOOL_2.path])
    expect(opts[1].textContent).toContain('Resources')
    expect(opts[1].textContent).toContain(VPOOL_1.path)
  })

  it('only enables the vSphere query while open with a selected platform pool', async () => {
    setVspherePools([VPOOL_1])
    mountDialog({ open: true })
    await flushPromises()
    expect(lastOptionsGetter?.().enabled).toBe(true)

    await wrapper!.setProps({ open: false })
    await flushPromises()
    expect(lastOptionsGetter?.().enabled).toBe(false)
  })

  it('clears a stale target-pool selection when the offered pools no longer include it', async () => {
    setVspherePools([VPOOL_1, VPOOL_2])
    mountDialog()
    await flushPromises()

    setValue(targetPoolSelect(), VPOOL_2.path)
    await flushPromises()
    expect(targetPoolSelect().value).toBe(VPOOL_2.path)

    // Pool list changes (platform pool switched) and no longer offers VPOOL_2.
    setVspherePools([VPOOL_1])
    await flushPromises()
    expect(targetPoolSelect().value).toBe('')
  })
})

describe('DeployAgentDialog — submit emits deploy input', () => {
  it('emits submit with the chosen inputs (no vSphere pools → targetResourcePool null)', async () => {
    // Empty vSphere list → placement pool optional, submit allowed.
    setVspherePools([])
    mountDialog({ template: makeFamily(), pools: [POOL_A, POOL_B] })
    await flushPromises()

    setValue(versionSelect(), 'ver-old')
    setValue(poolSelect(), 'pool-b')
    setValue(nameInput(), '  My Agent  ')
    setValue(hostnameInput(), '  agent-vm-01  ')
    // budget left blank here → maxBudget null; the typed-numeric budget path is
    // covered by the dedicated budget tests below.
    await flushPromises()

    clickSubmit()
    await flushPromises()

    expect(submitEvents()).toHaveLength(1)
    expect(submitEvents()[0]).toEqual({
      name: 'My Agent', // trimmed
      templateFamilyId: 'fam-1',
      templateVersionId: 'ver-old',
      resourcePoolId: 'pool-b',
      targetResourcePool: null, // empty selection → null (inherit source pool)
      hostname: 'agent-vm-01', // trimmed
      maxBudget: null, // blank budget → null
    })
  })

  it('emits the chosen vSphere placement pool path as targetResourcePool', async () => {
    setVspherePools([VPOOL_1, VPOOL_2])
    mountDialog()
    await flushPromises()

    setValue(nameInput(), 'Agent X')
    setValue(targetPoolSelect(), VPOOL_2.path)
    await flushPromises()

    clickSubmit()
    await flushPromises()

    expect(submitEvents()).toHaveLength(1)
    expect(submitEvents()[0].targetResourcePool).toBe(VPOOL_2.path)
  })

  it('sends null hostname and null maxBudget when those optional fields are blank', async () => {
    setVspherePools([])
    mountDialog()
    await flushPromises()

    setValue(nameInput(), 'Minimal Agent')
    // leave hostname + budget empty
    await flushPromises()

    clickSubmit()
    await flushPromises()

    expect(submitEvents()[0].hostname).toBeNull()
    expect(submitEvents()[0].maxBudget).toBeNull()
  })

  it('emits maxBudget as a number when a valid budget is typed', async () => {
    setVspherePools([])
    mountDialog({ template: makeFamily(), pools: [POOL_A, POOL_B] })
    await flushPromises()

    setValue(nameInput(), 'Budgeted Agent')
    // Vue coerces a type="number" v-model to a JS number on input; the component
    // normalizes via String(...) before trim, so submit carries the numeric value.
    setValue(budgetInput(), '100')
    await flushPromises()

    clickSubmit()
    await flushPromises()

    expect(submitEvents()).toHaveLength(1)
    expect(submitEvents()[0].maxBudget).toBe(100)
  })
})

describe('DeployAgentDialog — validation', () => {
  it('blocks submit and shows the name error when the name is blank', async () => {
    setVspherePools([])
    mountDialog()
    await flushPromises()

    setValue(nameInput(), '   ') // whitespace only
    await flushPromises()

    clickSubmit()
    await flushPromises()

    expect(submitEvents()).toHaveLength(0)
    expect(controlMessages()).toContain(locale.t('marketplace.deploy.error.name'))
  })

  it('requires a vSphere placement pool when vCenter offers any', async () => {
    setVspherePools([VPOOL_1, VPOOL_2])
    mountDialog()
    await flushPromises()

    setValue(nameInput(), 'Needs Pool')
    // leave targetResourcePool unselected
    await flushPromises()

    clickSubmit()
    await flushPromises()

    expect(submitEvents()).toHaveLength(0)
    expect(controlMessages()).toContain(locale.t('marketplace.deploy.error.targetPool'))
  })

  it('does not show any validation error before the first submit attempt', async () => {
    setVspherePools([VPOOL_1])
    mountDialog()
    await flushPromises()

    // Required target pool unselected, but no attempt yet → no error shown.
    expect(controlMessages()).not.toContain(locale.t('marketplace.deploy.error.targetPool'))
    expect(controlMessages().filter((m) => m.length > 0)).toHaveLength(0)
  })

  it('blocks submit and shows the budget error when a negative budget is typed', async () => {
    setVspherePools([])
    mountDialog()
    await flushPromises()

    setValue(nameInput(), 'Neg Budget')
    // The v-model coerces this to the number -5; budgetValid() (n >= 0) rejects it,
    // so submit is blocked and the budget error is shown.
    setValue(budgetInput(), '-5')
    await flushPromises()

    clickSubmit()
    await flushPromises()

    expect(submitEvents()).toHaveLength(0)
    expect(controlMessages()).toContain(locale.t('marketplace.deploy.error.maxBudget'))
  })

  it('renders the budget input as an optional, non-negative number field', async () => {
    // A blank budget is valid (optional); the typed-value paths (numeric + negative)
    // are covered by the tests above.
    setVspherePools([])
    mountDialog()
    await flushPromises()

    const budget = budgetInput()
    expect(budget.type).toBe('number')
    expect(budget.min).toBe('0')
    expect(budget.value).toBe('') // optional → empty by default after prefill
  })
})

describe('DeployAgentDialog — saving state + close', () => {
  it('disables both action buttons while deploying', async () => {
    mountDialog({ deploying: true })
    await flushPromises()

    const buttons = Array.from(
      wrapper!.element.querySelectorAll<HTMLElement>('cds-modal-actions cds-button'),
    )
    // cancel + submit both disabled.
    expect(buttons[0].hasAttribute('disabled')).toBe(true)
    expect(buttons[buttons.length - 1].hasAttribute('disabled')).toBe(true)
    // submit shows the loading state.
    expect(buttons[buttons.length - 1].getAttribute('loading-state')).toBe('loading')
  })

  it('emits close when the cancel button is clicked', async () => {
    mountDialog()
    await flushPromises()

    clickCancel()
    await flushPromises()

    expect(wrapper!.emitted('close')).toHaveLength(1)
    // Cancel must not deploy.
    expect(wrapper!.emitted('submit')).toBeUndefined()
  })
})
