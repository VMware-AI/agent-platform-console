/**
 * Component tests for DashboardView.vue — 控制台首页 / overview.
 *
 * The view is a read-only page wired to a SINGLE backend query
 * (`DashboardOverview`). From its `result` it derives:
 *   - KPI metric cards (active agents running/total, monthly calls/tokens/cost),
 *   - a status-distribution donut + legend (running/stopped/exception with %),
 *   - a "recent agents" table (name / agentName / createdAt / status),
 *   - a system-notices list (text + status dot + timestamp).
 * On a query `error` it surfaces `graphqlErrorMessage(...)` via a danger toast.
 *
 * Because the component destructures only `{ result, error }` from `useQuery`
 * (no `loading`), there is no dedicated loading template branch: before data
 * arrives every numeric KPI falls back to 0 and the table / list render empty.
 *
 * Mocking strategy (mirrors the other view tests in this dir):
 *   - `@vue/apollo-composable`'s `useQuery` is mocked, returning controllable
 *     `result` / `error` refs so each state (empty, error, data) is deterministic.
 *   - real Pinia so `locale.t(...)` resolves real strings; assertions are driven
 *     off the same locale keys / data the component renders, never brittle markup.
 *   - cds-* are Clarity custom elements; the Vue compiler is told to treat any
 *     `cds-` tag as a custom element. We assert on plain DOM + data + toasts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, type Ref } from 'vue'

import type {
  DashboardNotice,
  DashboardOverviewResult,
  DashboardRecentAgent,
  DashboardStats,
} from '@/api/graphql/queries/dashboard'

// --- mocks -----------------------------------------------------------------

// Single controllable query slot (the page issues exactly one query).
const result: Ref<DashboardOverviewResult | undefined> = ref<DashboardOverviewResult | undefined>(
  undefined,
)
const error: Ref<unknown> = ref<unknown>(null)

vi.mock('@vue/apollo-composable', () => ({
  useQuery: () => ({ result, error }),
}))

import DashboardView from '@/views/DashboardView.vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'

// Toasts live in module-scoped state in useToast; read them via a fresh call.
function toastMessages(): string[] {
  return useToast().toasts.value.map((t) => t.message)
}

// --- fixtures --------------------------------------------------------------

function makeStats(over: Partial<DashboardStats> = {}): DashboardStats {
  return {
    totalAgents: 20,
    runningAgents: 12,
    stoppedAgents: 5,
    exceptionAgents: 3,
    totalVirtualKeys: 7,
    totalGateways: 2,
    totalResourcePools: 4,
    totalUsers: 9,
    monthlyCalls: 52143,
    monthlyTokens: 1230000,
    monthlyCost: 88.5,
    ...over,
  }
}

function makeAgent(over: Partial<DashboardRecentAgent> = {}): DashboardRecentAgent {
  return {
    id: 'ag-1',
    name: 'OpenClaw_Robot_Prod',
    agentName: 'OpenClaw',
    status: 'running',
    createdAt: '2026-01-15T08:30:00Z',
    ...over,
  }
}

function makeNotice(over: Partial<DashboardNotice> = {}): DashboardNotice {
  return {
    id: 'nt-1',
    text: 'Gateway sync completed',
    status: 'success',
    occurredAt: '2026-01-16T09:00:00Z',
    ...over,
  }
}

function setData(
  over: {
    stats?: Partial<DashboardStats>
    recentAgents?: DashboardRecentAgent[]
    notices?: DashboardNotice[]
  } = {},
) {
  result.value = {
    dashboardOverview: {
      stats: makeStats(over.stats),
      recentAgents: over.recentAgents ?? [],
      notices: over.notices ?? [],
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
let locale: ReturnType<typeof useLocaleStore>

function mountView() {
  wrapper = mount(DashboardView, mountConfig)
  return wrapper
}

function rows(): HTMLTableRowElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLTableRowElement>('.recent-table tbody tr'))
}
function noticeItems(): HTMLLIElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLLIElement>('.notice-list li'))
}

beforeEach(() => {
  setActivePinia(createPinia())
  locale = useLocaleStore()
  result.value = undefined
  error.value = null
  // Toast state is module-scoped and shared across tests; reset it so
  // `not.toContain` assertions are not polluted by a prior test's toast.
  useToast().clear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('DashboardView — header + empty (no data yet)', () => {
  it('renders the localized overview title', () => {
    mountView()
    expect(wrapper!.element.querySelector('.heading')?.textContent?.trim()).toBe(
      locale.t('dashboard.overview.title'),
    )
  })

  it('falls back to zeroed KPIs and empty tables before data arrives', () => {
    mountView()
    // running / total both fall back to 0.
    expect(wrapper!.element.querySelector('.metric-number')?.textContent?.trim()).toBe('0')
    expect(wrapper!.element.querySelector('.metric-denominator')?.textContent).toContain('0')
    // No rows / notices.
    expect(rows()).toHaveLength(0)
    expect(noticeItems()).toHaveLength(0)
    // No error toast on the happy/empty path.
    expect(toastMessages()).toHaveLength(0)
  })

  it('renders empty recent-agents and notices when the query returns empty arrays', async () => {
    setData({ recentAgents: [], notices: [] })
    mountView()
    await flushPromises()
    expect(rows()).toHaveLength(0)
    expect(noticeItems()).toHaveLength(0)
    // Distribution percentages are 0/0/0 with no division-by-zero blowups.
    const legend = wrapper!.element.querySelector('.distribution-legend')?.textContent ?? ''
    expect(legend).toContain('0')
  })
})

describe('DashboardView — KPI metric cards from data', () => {
  it('shows runningAgents / totalAgents in the active-agents card', async () => {
    setData({ stats: { runningAgents: 12, totalAgents: 20 } })
    mountView()
    await flushPromises()

    const card = wrapper!.element.querySelector('.metric-card')!
    expect(card.querySelector('.metric-number')?.textContent?.trim()).toBe('12')
    expect(card.querySelector('.metric-denominator')?.textContent).toContain('20')
    // The card title is locale-key driven.
    expect(card.querySelector('.metric-title')?.textContent?.trim()).toBe(
      locale.t('dashboard.metric.activeAgents'),
    )
  })

  it('renders the exact monthly-calls count somewhere in the metric grid', async () => {
    setData({ stats: { monthlyCalls: 52143 } })
    mountView()
    await flushPromises()
    // Exact count is formatted via Intl.NumberFormat (en → "52,143").
    const expected = new Intl.NumberFormat(locale.locale).format(52143)
    const gridText = wrapper!.element.querySelector('.metric-grid')?.textContent ?? ''
    expect(gridText).toContain(expected)
  })

  it('renders the monthly cost as a USD currency string in the token card', async () => {
    setData({ stats: { monthlyCost: 88.5, monthlyTokens: 1230000 } })
    mountView()
    await flushPromises()
    const expectedCost = new Intl.NumberFormat(locale.locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(88.5)
    const tokenCardText = wrapper!.element.querySelectorAll('.metric-card')[2]?.textContent ?? ''
    expect(tokenCardText).toContain(expectedCost)
  })
})

describe('DashboardView — status distribution donut + legend', () => {
  it('computes running/stopped/exception percentages of the total', async () => {
    // total 20: running 12 (60%), stopped 5 (25%), exception 3 (15%).
    setData({
      stats: { totalAgents: 20, runningAgents: 12, stoppedAgents: 5, exceptionAgents: 3 },
    })
    mountView()
    await flushPromises()

    const legendText = wrapper!.element.querySelector('.distribution-legend')?.textContent ?? ''
    expect(legendText).toContain('60%')
    expect(legendText).toContain('25%')
    expect(legendText).toContain('15%')
    // Counts surface too.
    expect(legendText).toContain('12')
    expect(legendText).toContain('5')
    expect(legendText).toContain('3')
  })

  it('uses locale-key labels for each status in the legend', async () => {
    setData({ stats: { totalAgents: 4, runningAgents: 2, stoppedAgents: 1, exceptionAgents: 1 } })
    mountView()
    await flushPromises()
    const legendText = wrapper!.element.querySelector('.distribution-legend')?.textContent ?? ''
    expect(legendText).toContain(locale.t('dashboard.status.running'))
    expect(legendText).toContain(locale.t('dashboard.status.stopped'))
    expect(legendText).toContain(locale.t('dashboard.status.exception'))
  })

  it('avoids division-by-zero when totalAgents is 0 (percent → 0)', async () => {
    setData({ stats: { totalAgents: 0, runningAgents: 0, stoppedAgents: 0, exceptionAgents: 0 } })
    mountView()
    await flushPromises()
    const legendText = wrapper!.element.querySelector('.distribution-legend')?.textContent ?? ''
    expect(legendText).toContain('0%')
    expect(legendText).not.toContain('NaN')
  })
})

describe('DashboardView — recent agents table', () => {
  it('renders one row per recent agent with name, agentName and localized status', async () => {
    const agents = [
      makeAgent({ id: 'a1', name: 'Alpha_Inst', agentName: 'OpenClaw', status: 'running' }),
      makeAgent({ id: 'a2', name: 'Beta_Inst', agentName: 'Hermes', status: 'stopped' }),
      makeAgent({ id: 'a3', name: 'Gamma_Inst', agentName: 'XiaoGuai', status: 'exception' }),
    ]
    setData({ recentAgents: agents })
    mountView()
    await flushPromises()

    const r = rows()
    expect(r).toHaveLength(3)
    expect(r[0].querySelector('.instance-name')?.textContent).toContain('Alpha_Inst')
    expect(r[0].textContent).toContain('OpenClaw')
    // Status cell renders the localized status label, not the raw enum.
    expect(r[1].querySelector('.status-label')?.textContent?.trim()).toContain(
      locale.t('dashboard.status.stopped'),
    )
    expect(r[2].querySelector('.status-label')?.textContent?.trim()).toContain(
      locale.t('dashboard.status.exception'),
    )
  })

  it('applies the status enum as a class on the status label (drives the colored dot)', async () => {
    setData({ recentAgents: [makeAgent({ status: 'exception' })] })
    mountView()
    await flushPromises()
    const label = rows()[0].querySelector('.status-label')
    expect(label?.classList.contains('exception')).toBe(true)
  })

  it('formats the createdAt timestamp (not the raw ISO string)', async () => {
    setData({ recentAgents: [makeAgent({ createdAt: '2026-01-15T08:30:00Z' })] })
    mountView()
    await flushPromises()
    const dateCell = rows()[0].querySelector('.date-cell')?.textContent?.trim() ?? ''
    // The view runs the ISO value through Intl.DateTimeFormat, so the raw ISO
    // string must not appear verbatim, and a 4-digit year should.
    expect(dateCell).not.toBe('2026-01-15T08:30:00Z')
    expect(dateCell).toMatch(/2026/)
  })

  it('falls back to the raw value when createdAt is not a parseable date', async () => {
    setData({ recentAgents: [makeAgent({ createdAt: 'not-a-date' })] })
    mountView()
    await flushPromises()
    expect(rows()[0].querySelector('.date-cell')?.textContent?.trim()).toBe('not-a-date')
  })
})

describe('DashboardView — system notices list', () => {
  it('renders one item per notice with its text, status class and a <time>', async () => {
    const notices = [
      makeNotice({ id: 'n1', text: 'Gateway sync completed', status: 'success' }),
      makeNotice({ id: 'n2', text: 'Pool nearing capacity', status: 'warning' }),
      makeNotice({ id: 'n3', text: 'Agent crashed', status: 'danger' }),
    ]
    setData({ notices })
    mountView()
    await flushPromises()

    const items = noticeItems()
    expect(items).toHaveLength(3)
    expect(items[0].querySelector('.notice-text')?.textContent).toContain('Gateway sync completed')
    // Status drives the dot class.
    expect(items[0].querySelector('.notice-dot')?.classList.contains('success')).toBe(true)
    expect(items[1].querySelector('.notice-dot')?.classList.contains('warning')).toBe(true)
    expect(items[2].querySelector('.notice-dot')?.classList.contains('danger')).toBe(true)
    // <time> carries the machine-readable datetime attribute.
    expect(items[0].querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-01-16T09:00:00Z',
    )
  })

  it('renders the localized notices title', async () => {
    setData({ notices: [makeNotice()] })
    mountView()
    await flushPromises()
    expect(wrapper!.element.querySelector('.notice-title')?.textContent?.trim()).toBe(
      locale.t('dashboard.notices.title'),
    )
  })
})

describe('DashboardView — error state', () => {
  it('surfaces a toast using the GraphQL error message when the query errors', async () => {
    mountView()
    // The watcher fires when `error` transitions to a truthy value.
    error.value = { graphQLErrors: [{ message: 'backend exploded' }] }
    await flushPromises()
    expect(toastMessages()).toContain('backend exploded')
  })

  it('falls back to the localized generic message when the error has no message', async () => {
    mountView()
    error.value = {}
    await flushPromises()
    expect(toastMessages()).toContain(locale.t('agents.error'))
  })

  it('does not toast while there is no error', async () => {
    setData()
    mountView()
    await flushPromises()
    expect(toastMessages()).toHaveLength(0)
  })
})
