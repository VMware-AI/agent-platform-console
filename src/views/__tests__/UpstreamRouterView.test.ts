/**
 * Component tests for UpstreamRouterView.vue — 上游与路由分层
 * (Upstreams & Router Tiers).
 *
 * The view is a two-tab page wired to the real backend via Apollo:
 *   - 上游 (Upstreams): CRUD list. upsertUpstream keys by `name` and apiKey is
 *     write-only (sent only when typed); deleteUpstream removes by id behind a
 *     ConfirmDialog (teleported → `.confirm-backdrop`).
 *   - 路由分层 (Router Tiers): maps each difficulty tier to a model alias via the
 *     only write, setRouterTier(tier, modelAlias).
 *   - a shared refresh toolbar action refetches the active tab's query.
 *
 * Mocking strategy (mirrors GatewayConnectionView.test.ts):
 *   - `@vue/apollo-composable`'s `useQuery` is mocked and routed by the parsed
 *     document's operation name (`UpstreamsRouting` vs `RouterTiersRouting`) to
 *     two independently-controllable slots so every state (loading / error /
 *     empty / data) is driven deterministically. Each query's `refetch` is a spy.
 *   - `@/api/graphql/client`'s `apolloClient.mutate` is a spy resolved / rejected
 *     per test to exercise the success + error branches of every mutation.
 *   - real Pinia so `locale.t(...)` resolves real strings; assertions are keyed
 *     off the same `locale.t` keys the component renders, not hard-coded text.
 *   - cds-* are Clarity custom elements; the Vue compiler is told to treat any
 *     `cds-` tag as a custom element. We assert on plain DOM + spy calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, type Ref } from 'vue'

import type {
  UpstreamNode,
  UpstreamsRoutingResult,
  RouterTierNode,
  RouterTiersRoutingResult,
} from '@/api/graphql/queries/gateway-routing'

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

let upstreamsSlot: QuerySlot
let tiersSlot: QuerySlot

vi.mock('@vue/apollo-composable', () => ({
  useQuery: (document: { definitions?: Array<{ name?: { value?: string } }> }) => {
    const opName = document?.definitions?.[0]?.name?.value
    const slot = opName === 'RouterTiersRouting' ? tiersSlot : upstreamsSlot
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

import UpstreamRouterView from '@/views/UpstreamRouterView.vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'

// Toasts live in module-scoped state in useToast; read them via a fresh call.
function toastMessages(): string[] {
  return useToast().toasts.value.map((t) => t.message)
}

// --- fixtures --------------------------------------------------------------

function makeUpstream(over: Partial<UpstreamNode> = {}): UpstreamNode {
  return {
    id: 'up-1',
    name: 'Primary OpenAI',
    provider: 'openai',
    apiBase: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function makeTier(over: Partial<RouterTierNode> = {}): RouterTierNode {
  return {
    id: 'tier-1',
    tier: 'SIMPLE',
    modelAlias: 'fast-alias',
    ...over,
  }
}

const UP_A = makeUpstream({ id: 'a', name: 'Alpha OpenAI', provider: 'openai' })
const UP_B = makeUpstream({
  id: 'b',
  name: 'Beta vLLM',
  provider: 'vllm',
  apiBase: null,
  model: 'qwen2.5-72b',
  enabled: false,
})

const TIER_SIMPLE = makeTier({ id: 't-s', tier: 'SIMPLE', modelAlias: 'fast-model' })
const TIER_NO_ALIAS = makeTier({ id: 't-r', tier: 'REASONING', modelAlias: '' })

const mountConfig = {
  global: {
    config: {
      compilerOptions: {
        isCustomElement: (tag: string) => tag.startsWith('cds-'),
      },
    },
  },
}

function setUpstreams(rows: UpstreamNode[]) {
  upstreamsSlot.result.value = { upstreams: rows } satisfies UpstreamsRoutingResult
}
function setTiers(rows: RouterTierNode[]) {
  tiersSlot.result.value = { routerTiers: rows } satisfies RouterTiersRoutingResult
}

let wrapper: VueWrapper | null = null
let locale: ReturnType<typeof useLocaleStore>

function mountView() {
  wrapper = mount(UpstreamRouterView, mountConfig)
  return wrapper
}

// --- DOM helpers -----------------------------------------------------------

function tabButtons(): HTMLButtonElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLButtonElement>('button[role="tab"]'))
}
function panel(id: string): HTMLElement | null {
  return wrapper!.element.querySelector<HTMLElement>(`#${id}`)
}
function visibleRows(panelId: string): HTMLElement[] {
  return Array.from(panel(panelId)!.querySelectorAll<HTMLElement>('cds-grid-row'))
}
function confirmBackdrop(): HTMLElement | null {
  return document.body.querySelector('.confirm-backdrop')
}
function upstreamForm(): HTMLElement | null {
  return document.body.querySelector('.uf-form')
}
function tierForm(): HTMLElement | null {
  return document.body.querySelector('.rt-form')
}

async function switchToTiers() {
  tabButtons()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  locale = useLocaleStore()
  upstreamsSlot = makeSlot()
  tiersSlot = makeSlot()
  mutateMock.mockReset()
  // Toast state is module-scoped and shared across tests; reset it.
  useToast().clear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.querySelectorAll('.confirm-backdrop, .uf-backdrop, .rt-backdrop').forEach((el) =>
    el.remove(),
  )
})

// ---------------------------------------------------------------------------

describe('UpstreamRouterView — tabs', () => {
  it('renders both tabs with the upstreams tab active by default', async () => {
    setUpstreams([UP_A])
    mountView()
    await flushPromises()

    const tabs = tabButtons()
    expect(tabs).toHaveLength(2)
    expect(tabs[0].textContent).toContain(locale.t('upstreamRouter.tab.upstreams'))
    expect(tabs[1].textContent).toContain(locale.t('upstreamRouter.tab.tiers'))
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
  })

  it('clicking the tiers tab activates it (roving tabindex + aria-selected)', async () => {
    setUpstreams([UP_A])
    setTiers([TIER_SIMPLE])
    mountView()
    await flushPromises()

    await switchToTiers()

    const tabs = tabButtons()
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(tabs[0].getAttribute('aria-selected')).toBe('false')
    // Only the active tab is in the tab order.
    expect(tabs[1].getAttribute('tabindex')).toBe('0')
    expect(tabs[0].getAttribute('tabindex')).toBe('-1')
  })

  it('ArrowRight on the active tab moves selection to the next tab', async () => {
    setUpstreams([UP_A])
    mountView()
    await flushPromises()

    tabButtons()[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    )
    await flushPromises()

    expect(tabButtons()[1].getAttribute('aria-selected')).toBe('true')
  })
})

describe('UpstreamRouterView — upstreams list states', () => {
  it('shows the loading placeholder while loading with no rows yet', () => {
    upstreamsSlot.loading.value = true
    mountView()
    const placeholder = panel('ur-panel-upstreams')!.querySelector('cds-grid-placeholder')
    expect(placeholder?.textContent).toContain(locale.t('upstreamRouter.upstream.loading'))
    expect(visibleRows('ur-panel-upstreams')).toHaveLength(0)
  })

  it('shows the empty placeholder with a create CTA when there are no upstreams', async () => {
    setUpstreams([])
    mountView()
    await flushPromises()
    const placeholder = panel('ur-panel-upstreams')!.querySelector('cds-grid-placeholder')
    expect(placeholder?.textContent).toContain(locale.t('upstreamRouter.upstream.empty'))
    expect(visibleRows('ur-panel-upstreams')).toHaveLength(0)
  })

  it('renders the error placeholder (role=alert) when the list query errors', async () => {
    upstreamsSlot.error.value = new Error('boom')
    mountView()
    await flushPromises()
    const alertPh = panel('ur-panel-upstreams')!.querySelector('cds-grid-placeholder[role="alert"]')
    expect(alertPh?.textContent).toContain(locale.t('upstreamRouter.upstream.error'))
  })

  it('renders one row per upstream with localized provider/status and apiBase fallback', async () => {
    setUpstreams([UP_A, UP_B])
    mountView()
    await flushPromises()

    const rows = visibleRows('ur-panel-upstreams')
    expect(rows).toHaveLength(2)

    expect(rows[0].textContent).toContain('Alpha OpenAI')
    expect(rows[0].textContent).toContain(locale.t('upstreamRouter.provider.openai'))
    expect(rows[0].textContent).toContain('gpt-4o')
    expect(rows[0].textContent).toContain('https://api.openai.com/v1')
    expect(rows[0].textContent).toContain(locale.t('upstreamRouter.status.enabled'))

    // UP_B has no apiBase (null) → shows the "Default" fallback, and is disabled.
    expect(rows[1].textContent).toContain('Beta vLLM')
    expect(rows[1].textContent).toContain(locale.t('upstreamRouter.provider.vllm'))
    expect(rows[1].textContent).toContain(locale.t('upstreamRouter.upstream.apiBaseDefault'))
    expect(rows[1].textContent).toContain(locale.t('upstreamRouter.status.disabled'))
  })
})

describe('UpstreamRouterView — upstream create / edit (apiKey write-only)', () => {
  function fillUpstreamForm(form: HTMLElement, values: { name?: string; model?: string; apiKey?: string }) {
    const setText = (el: HTMLInputElement | null, v: string) => {
      if (!el) return
      el.value = v
      el.dispatchEvent(new Event('input'))
    }
    if (values.name !== undefined) {
      setText(form.querySelector<HTMLInputElement>('input[type="text"]'), values.name)
    }
    if (values.model !== undefined) {
      // The model field is the second text input in the form.
      const texts = form.querySelectorAll<HTMLInputElement>('input[type="text"]')
      setText(texts[1] ?? null, values.model)
    }
    if (values.apiKey !== undefined) {
      setText(form.querySelector<HTMLInputElement>('input[type="password"]'), values.apiKey)
    }
  }

  it('opens the create dialog from the toolbar create button', async () => {
    setUpstreams([UP_A])
    mountView()
    await flushPromises()
    expect(upstreamForm()).toBeNull()

    panel('ur-panel-upstreams')!
      .querySelector<HTMLElement>('.toolbar cds-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(upstreamForm()).not.toBeNull()
  })

  it('submitting create calls mutate with the input incl apiKey, toasts created and refetches', async () => {
    mutateMock.mockResolvedValue({ data: { upsertUpstream: makeUpstream() } })
    setUpstreams([UP_A])
    mountView()
    await flushPromises()

    panel('ur-panel-upstreams')!
      .querySelector<HTMLElement>('.toolbar cds-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = upstreamForm()!
    fillUpstreamForm(form, { name: 'New Upstream', model: 'gpt-4o-mini', apiKey: 'sk-secret' })
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { input: Record<string, unknown> } }
    expect(arg.variables.input).toMatchObject({
      name: 'New Upstream',
      model: 'gpt-4o-mini',
      provider: 'openai',
      enabled: true,
      apiKey: 'sk-secret',
    })

    expect(toastMessages()).toContain(locale.t('upstreamRouter.toast.created'))
    expect(upstreamsSlot.refetch).toHaveBeenCalled()
    expect(upstreamForm()).toBeNull()
  })

  it('edit pre-fills, omits apiKey when left blank, and toasts updated', async () => {
    mutateMock.mockResolvedValue({ data: { upsertUpstream: UP_A } })
    setUpstreams([UP_A])
    mountView()
    await flushPromises()

    // Click the row edit (non-danger) action.
    visibleRows('ur-panel-upstreams')[0]
      .querySelector<HTMLElement>('.row-action:not(.danger)')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = upstreamForm()!
    // Name is pre-filled from the edited upstream.
    const nameInput = form.querySelector<HTMLInputElement>('input[type="text"]')!
    expect(nameInput.value).toBe('Alpha OpenAI')

    // Change only the model, leave apiKey blank (write-only → not sent).
    fillUpstreamForm(form, { model: 'gpt-4o-2024' })
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { input: Record<string, unknown> } }
    expect(arg.variables.input.name).toBe('Alpha OpenAI')
    expect(arg.variables.input.model).toBe('gpt-4o-2024')
    // apiKey omitted because it was never typed.
    expect('apiKey' in arg.variables.input).toBe(false)

    expect(toastMessages()).toContain(locale.t('upstreamRouter.toast.updated'))
  })

  it('surfaces the backend GraphQL error and keeps the dialog open on save failure', async () => {
    mutateMock.mockRejectedValue({ graphQLErrors: [{ message: 'name already exists' }] })
    setUpstreams([UP_A])
    mountView()
    await flushPromises()

    panel('ur-panel-upstreams')!
      .querySelector<HTMLElement>('.toolbar cds-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = upstreamForm()!
    fillUpstreamForm(form, { name: 'Dup', model: 'gpt-4o' })
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    expect(toastMessages()).toContain('name already exists')
    expect(toastMessages()).not.toContain(locale.t('upstreamRouter.toast.created'))
    // Dialog stays open so the operator can correct + retry.
    expect(upstreamForm()).not.toBeNull()
  })
})

describe('UpstreamRouterView — delete upstream', () => {
  function openConfirm(index: number) {
    visibleRows('ur-panel-upstreams')[index]
      .querySelector<HTMLElement>('.row-action.danger')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('requesting delete opens a confirm dialog naming the target', async () => {
    setUpstreams([UP_A, UP_B])
    mountView()
    await flushPromises()

    openConfirm(0)
    await flushPromises()

    const card = confirmBackdrop()
    expect(card).not.toBeNull()
    expect(card?.getAttribute('aria-label')).toBe(locale.t('upstreamRouter.confirm.deleteTitle'))
    // Body interpolates the upstream name.
    expect(card?.textContent).toContain('Alpha OpenAI')
  })

  it('confirming delete calls mutate with the target id, toasts deleted and refetches', async () => {
    mutateMock.mockResolvedValue({ data: { deleteUpstream: true } })
    setUpstreams([UP_A, UP_B])
    mountView()
    await flushPromises()

    openConfirm(1)
    await flushPromises()

    confirmBackdrop()!
      .querySelector<HTMLElement>('cds-button[status="danger"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { id: string } }
    expect(arg.variables.id).toBe('b')
    expect(toastMessages()).toContain(locale.t('upstreamRouter.toast.deleted'))
    expect(upstreamsSlot.refetch).toHaveBeenCalled()
    expect(confirmBackdrop()).toBeNull()
  })

  it('delete failure surfaces the GraphQL error and does not toast deleted', async () => {
    mutateMock.mockRejectedValue({ graphQLErrors: [{ message: 'forbidden: requires admin' }] })
    setUpstreams([UP_A])
    mountView()
    await flushPromises()

    openConfirm(0)
    await flushPromises()
    confirmBackdrop()!
      .querySelector<HTMLElement>('cds-button[status="danger"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('forbidden: requires admin')
    expect(toastMessages()).not.toContain(locale.t('upstreamRouter.toast.deleted'))
  })

  it('cancelling the confirm dialog closes it without calling mutate', async () => {
    setUpstreams([UP_A])
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

describe('UpstreamRouterView — router tiers tab', () => {
  it('shows the loading placeholder for tiers while loading', async () => {
    tiersSlot.loading.value = true
    setUpstreams([UP_A])
    mountView()
    await flushPromises()
    await switchToTiers()

    const placeholder = panel('ur-panel-tiers')!.querySelector('cds-grid-placeholder')
    expect(placeholder?.textContent).toContain(locale.t('upstreamRouter.tier.loading'))
  })

  it('shows the empty placeholder when there are no tier mappings', async () => {
    setUpstreams([UP_A])
    setTiers([])
    mountView()
    await flushPromises()
    await switchToTiers()

    const placeholder = panel('ur-panel-tiers')!.querySelector('cds-grid-placeholder')
    expect(placeholder?.textContent).toContain(locale.t('upstreamRouter.tier.empty'))
  })

  it('renders the error placeholder when the tiers query errors', async () => {
    setUpstreams([UP_A])
    tiersSlot.error.value = new Error('boom')
    mountView()
    await flushPromises()
    await switchToTiers()

    const alertPh = panel('ur-panel-tiers')!.querySelector('cds-grid-placeholder[role="alert"]')
    expect(alertPh?.textContent).toContain(locale.t('upstreamRouter.tier.error'))
  })

  it('renders rows with localized tier labels and the unset alias fallback', async () => {
    setUpstreams([UP_A])
    setTiers([TIER_SIMPLE, TIER_NO_ALIAS])
    mountView()
    await flushPromises()
    await switchToTiers()

    const rows = visibleRows('ur-panel-tiers')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain(locale.t('upstreamRouter.tierLevel.SIMPLE'))
    expect(rows[0].textContent).toContain('fast-model')
    // REASONING tier has no alias → "unset" fallback.
    expect(rows[1].textContent).toContain(locale.t('upstreamRouter.tierLevel.REASONING'))
    expect(rows[1].textContent).toContain(locale.t('upstreamRouter.tier.unset'))
  })

  it('submitting a new tier mapping calls setRouterTier with tier + alias and toasts', async () => {
    mutateMock.mockResolvedValue({ data: { setRouterTier: makeTier() } })
    setUpstreams([UP_A])
    setTiers([]) // no tiers yet → addTier enabled, SIMPLE is the first available
    mountView()
    await flushPromises()
    await switchToTiers()

    panel('ur-panel-tiers')!
      .querySelector<HTMLElement>('.toolbar cds-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = tierForm()!
    const aliasInput = form.querySelector<HTMLInputElement>('input[type="text"]')!
    aliasInput.value = 'gpt-4o-mini'
    aliasInput.dispatchEvent(new Event('input'))
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const arg = mutateMock.mock.calls[0][0] as { variables: { tier: string; modelAlias: string } }
    // First available tier when none are used is SIMPLE.
    expect(arg.variables.tier).toBe('SIMPLE')
    expect(arg.variables.modelAlias).toBe('gpt-4o-mini')

    expect(toastMessages()).toContain(locale.t('upstreamRouter.toast.tierSaved'))
    expect(tiersSlot.refetch).toHaveBeenCalled()
    expect(tierForm()).toBeNull()
  })

  it('editing an existing tier locks the tier and submits with its own tier', async () => {
    mutateMock.mockResolvedValue({ data: { setRouterTier: TIER_SIMPLE } })
    setUpstreams([UP_A])
    setTiers([TIER_SIMPLE])
    mountView()
    await flushPromises()
    await switchToTiers()

    visibleRows('ur-panel-tiers')[0]
      .querySelector<HTMLElement>('.row-action')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = tierForm()!
    // No tier <select> when editing — the tier is locked.
    expect(form.querySelector('select')).toBeNull()
    const aliasInput = form.querySelector<HTMLInputElement>('input[type="text"]')!
    expect(aliasInput.value).toBe('fast-model')
    aliasInput.value = 'fast-model-v2'
    aliasInput.dispatchEvent(new Event('input'))
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    const arg = mutateMock.mock.calls[0][0] as { variables: { tier: string; modelAlias: string } }
    expect(arg.variables.tier).toBe('SIMPLE')
    expect(arg.variables.modelAlias).toBe('fast-model-v2')
    expect(toastMessages()).toContain(locale.t('upstreamRouter.toast.tierSaved'))
  })

  it('surfaces the GraphQL error and keeps the dialog open on tier save failure', async () => {
    mutateMock.mockRejectedValue({ graphQLErrors: [{ message: 'unknown model alias' }] })
    setUpstreams([UP_A])
    setTiers([])
    mountView()
    await flushPromises()
    await switchToTiers()

    panel('ur-panel-tiers')!
      .querySelector<HTMLElement>('.toolbar cds-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const form = tierForm()!
    const aliasInput = form.querySelector<HTMLInputElement>('input[type="text"]')!
    aliasInput.value = 'nope'
    aliasInput.dispatchEvent(new Event('input'))
    await flushPromises()

    form.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(toastMessages()).toContain('unknown model alias')
    expect(toastMessages()).not.toContain(locale.t('upstreamRouter.toast.tierSaved'))
    expect(tierForm()).not.toBeNull()
  })
})

describe('UpstreamRouterView — refresh toolbar action', () => {
  it('refresh refetches the upstreams query and toasts on success', async () => {
    setUpstreams([UP_A])
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.refresh-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(upstreamsSlot.refetch).toHaveBeenCalled()
    expect(toastMessages()).toContain(locale.t('upstreamRouter.toast.refreshed'))
  })

  it('refresh refetches the tiers query when the tiers tab is active', async () => {
    setUpstreams([UP_A])
    setTiers([TIER_SIMPLE])
    mountView()
    await flushPromises()
    await switchToTiers()

    wrapper!.element
      .querySelector<HTMLElement>('.refresh-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(tiersSlot.refetch).toHaveBeenCalled()
    expect(upstreamsSlot.refetch).not.toHaveBeenCalled()
    expect(toastMessages()).toContain(locale.t('upstreamRouter.toast.refreshed'))
  })

  it('refresh surfaces an error toast when refetch rejects', async () => {
    setUpstreams([UP_A])
    upstreamsSlot.refetch.mockRejectedValueOnce(new Error('network down'))
    mountView()
    await flushPromises()

    wrapper!.element
      .querySelector<HTMLElement>('.refresh-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(toastMessages()).toContain('network down')
    expect(toastMessages()).not.toContain(locale.t('upstreamRouter.toast.refreshed'))
  })
})
