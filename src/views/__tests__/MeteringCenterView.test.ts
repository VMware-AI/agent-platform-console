/**
 * Component tests for MeteringCenterView.vue — 计量中心 / metering dashboard.
 *
 * The view is a read-only page wired to a SINGLE backend query
 * (`MeteringOverview`). It exposes a 3-button time-range selector (7d / 30d /
 * month) whose selection maps to the backend `MeteringTimeRange` enum and feeds
 * the REACTIVE `variables` ref handed to `useQuery`. From the query `result` it
 * derives:
 *   - per-agent / per-model / per-day usage tables (each row + a data-driven
 *     status: requests > 0 → normal, else warning),
 *   - two SVG charts (trend line + ranking bars) that render only when there is
 *     data, otherwise an empty-state label,
 *   - cost summary cards (total + monthly, formatted as USD currency).
 * Two client-side `<select>` filters (agent / model) narrow the agent and model
 * tables. On a query `error` it surfaces `graphqlErrorMessage(...)` via a toast.
 *
 * Mocking strategy (mirrors the other view tests in this dir):
 *   - `@vue/apollo-composable`'s `useQuery` is mocked. It captures the reactive
 *     `variables` ref (2nd arg) so we can assert the range selector drives the
 *     query, returns a controllable `result` ref, and an `onError` that stores
 *     the callback so the error branch is exercised deterministically.
 *   - real Pinia so `locale.t(...)` resolves real strings (default locale = zh);
 *     assertions are driven off the same locale keys / data the component
 *     renders, plus computed-from-data values — never SVG geometry or markup.
 *   - cds-* are Clarity custom elements; the Vue compiler is told to treat any
 *     `cds-` tag as a custom element.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { isRef, ref, type Ref } from 'vue'

import type {
  AgentUsageRow,
  DailyUsageRow,
  MeteringCostSummary,
  MeteringOverview,
  MeteringOverviewResult,
  MeteringOverviewVars,
  ModelUsageRow,
} from '@/api/graphql/queries/metering'

// --- mocks -----------------------------------------------------------------

// Single controllable query slot (the page issues exactly one query).
const result: Ref<MeteringOverviewResult | undefined> = ref<MeteringOverviewResult | undefined>(
  undefined,
)

// Captured reactive variables ref the component passes to useQuery — lets us
// assert that toggling the range selector changes the GraphQL variables.
let capturedVariables: Ref<MeteringOverviewVars> | null = null
// Captured onError callback so we can simulate a query error precisely.
let capturedErrorHandler: ((error: unknown) => void) | null = null

vi.mock('@vue/apollo-composable', () => ({
  useQuery: (_query: unknown, variables: unknown) => {
    capturedVariables = (isRef(variables) ? variables : ref(variables)) as Ref<MeteringOverviewVars>
    return {
      result,
      onError: (cb: (error: unknown) => void) => {
        capturedErrorHandler = cb
      },
    }
  },
}))

import MeteringCenterView from '@/views/MeteringCenterView.vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'

// Toasts live in module-scoped state in useToast; read them via a fresh call.
function toastMessages(): string[] {
  return useToast().toasts.value.map((t) => t.message)
}

// --- fixtures --------------------------------------------------------------

function makeAgentRow(over: Partial<AgentUsageRow> = {}): AgentUsageRow {
  return {
    agentId: 'ag-1',
    agentName: 'OpenClaw_Prod',
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
    requests: 42,
    cost: 1.25,
    ...over,
  }
}

function makeModelRow(over: Partial<ModelUsageRow> = {}): ModelUsageRow {
  return {
    model: 'gpt-4o',
    inputTokens: 800,
    outputTokens: 400,
    totalTokens: 1200,
    requests: 30,
    cost: 0.9,
    ...over,
  }
}

function makeDayRow(over: Partial<DailyUsageRow> = {}): DailyUsageRow {
  return {
    date: '2026-06-22',
    inputTokens: 600,
    outputTokens: 300,
    totalTokens: 900,
    requests: 20,
    cost: 0.5,
    ...over,
  }
}

function makeOverview(over: Partial<MeteringOverview> = {}): MeteringOverview {
  const cost: MeteringCostSummary = over.cost ?? { totalCost: 0, monthlyCost: 0 }
  return {
    range: 'LAST_7_DAYS',
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalRequests: 0,
    byAgent: over.byAgent ?? [],
    byModel: over.byModel ?? [],
    byDay: over.byDay ?? [],
    ...over,
    cost,
  }
}

function setData(over: Partial<MeteringOverview> = {}) {
  result.value = { meteringOverview: makeOverview(over) }
}

// --- mount helpers ---------------------------------------------------------

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
  wrapper = mount(MeteringCenterView, mountConfig)
  return wrapper
}

function rangeButtons(): HTMLButtonElement[] {
  return Array.from(wrapper!.element.querySelectorAll<HTMLButtonElement>('.range-button'))
}
// DOMWrapper variants so we can `.trigger('click')` (raw elements have no trigger).
function rangeButtonWrappers() {
  return wrapper!.findAll('.range-button')
}
function agentRows(): HTMLTableRowElement[] {
  return Array.from(
    wrapper!.element.querySelectorAll<HTMLTableRowElement>('.agent-usage-table tbody tr'),
  )
}
// The model + daily tables are plain `.usage-table` (no agent modifier class).
function plainTables(): HTMLTableElement[] {
  return Array.from(
    wrapper!.element.querySelectorAll<HTMLTableElement>('.usage-table'),
  ).filter((t) => !t.classList.contains('agent-usage-table'))
}
function modelRows(): HTMLTableRowElement[] {
  return Array.from(plainTables()[0]?.querySelectorAll<HTMLTableRowElement>('tbody tr') ?? [])
}
function dailyRows(): HTMLTableRowElement[] {
  return Array.from(plainTables()[1]?.querySelectorAll<HTMLTableRowElement>('tbody tr') ?? [])
}
function agentSelect(): HTMLSelectElement {
  return wrapper!.element.querySelector<HTMLSelectElement>(
    'select[aria-label="' + locale.t('metering.filter.agent') + '"]',
  )!
}
function modelSelect(): HTMLSelectElement {
  return wrapper!.element.querySelector<HTMLSelectElement>(
    'select[aria-label="' + locale.t('metering.filter.model') + '"]',
  )!
}
// zh-CN number formatting, matching the component's Intl.NumberFormat usage.
function fmt(n: number): string {
  return new Intl.NumberFormat('zh-CN').format(n)
}

beforeEach(() => {
  setActivePinia(createPinia())
  locale = useLocaleStore()
  result.value = undefined
  capturedVariables = null
  capturedErrorHandler = null
  // Toast state is module-scoped and shared across tests; reset it so
  // `not.toContain` assertions are not polluted by a prior test's toast.
  useToast().clear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('MeteringCenterView — header + range selector', () => {
  it('renders the localized title', () => {
    mountView()
    expect(wrapper!.element.querySelector('.heading')?.textContent?.trim()).toBe(
      locale.t('metering.title'),
    )
  })

  it('renders exactly the three backend-backed range buttons (no custom tab)', () => {
    mountView()
    const labels = rangeButtons().map((b) => b.textContent?.trim())
    expect(rangeButtons()).toHaveLength(3)
    expect(labels[0]).toContain(locale.t('metering.range.7d'))
    expect(labels[1]).toContain(locale.t('metering.range.30d'))
    expect(labels[2]).toContain(locale.t('metering.range.month'))
    // The deliberately-omitted custom range is NOT rendered.
    expect(labels.join('|')).not.toContain(locale.t('metering.range.custom'))
  })

  it('defaults the query variables to LAST_7_DAYS with a null userId', () => {
    mountView()
    expect(capturedVariables).not.toBeNull()
    expect(capturedVariables!.value).toEqual({ range: 'LAST_7_DAYS', userId: null })
  })

  it('marks the active range button via aria-pressed and the active class', async () => {
    mountView()
    expect(rangeButtons()[0].getAttribute('aria-pressed')).toBe('true')
    expect(rangeButtons()[0].classList.contains('active')).toBe(true)

    await rangeButtonWrappers()[1].trigger('click')
    expect(rangeButtons()[0].getAttribute('aria-pressed')).toBe('false')
    expect(rangeButtons()[1].getAttribute('aria-pressed')).toBe('true')
    expect(rangeButtons()[1].classList.contains('active')).toBe(true)
  })
})

describe('MeteringCenterView — range selector drives the query', () => {
  it('updates the reactive variables when 30d is selected', async () => {
    mountView()
    await rangeButtonWrappers()[1].trigger('click')
    await flushPromises()
    expect(capturedVariables!.value).toEqual({ range: 'LAST_30_DAYS', userId: null })
  })

  it('updates the reactive variables when This Month is selected', async () => {
    mountView()
    await rangeButtonWrappers()[2].trigger('click')
    await flushPromises()
    expect(capturedVariables!.value).toEqual({ range: 'THIS_MONTH', userId: null })
  })

  it('maps each range button to its distinct backend enum value', async () => {
    mountView()
    const seen: string[] = []
    for (const btn of rangeButtonWrappers()) {
      await btn.trigger('click')
      await flushPromises()
      seen.push(capturedVariables!.value.range as string)
    }
    expect(seen).toEqual(['LAST_7_DAYS', 'LAST_30_DAYS', 'THIS_MONTH'])
  })
})

describe('MeteringCenterView — empty state (no data yet)', () => {
  it('renders empty tables and a "no data" footer before data arrives', () => {
    mountView()
    expect(agentRows()).toHaveLength(0)
    expect(modelRows()).toHaveLength(0)
    expect(dailyRows()).toHaveLength(0)
    // Footers count 0 rows.
    const footers = wrapper!.element.querySelectorAll('.table-footer')
    footers.forEach((f) => expect(f.textContent).toContain(locale.t('metering.table.showing')))
    // No error toast on the empty path.
    expect(toastMessages()).toHaveLength(0)
  })

  it('shows the chart empty-state label when there is no trend / ranking data', () => {
    mountView()
    const emptyTexts = Array.from(
      wrapper!.element.querySelectorAll('.chart-empty'),
    ).map((t) => t.textContent?.trim())
    // Both charts (trend + ranking) fall back to the shared empty label.
    expect(emptyTexts).toHaveLength(2)
    emptyTexts.forEach((t) => expect(t).toBe(locale.t('agents.empty')))
    // No data polylines / bars are drawn.
    expect(wrapper!.element.querySelector('.trend-line')).toBeNull()
    expect(wrapper!.element.querySelector('.bars rect')).toBeNull()
  })

  it('renders cost cards as $0.00 fallbacks when cost is absent', async () => {
    setData({ cost: undefined as unknown as MeteringCostSummary })
    mountView()
    await flushPromises()
    const costText = wrapper!.element.querySelector('.cost-grid')?.textContent ?? ''
    expect(costText).toContain('$0.00')
  })
})

describe('MeteringCenterView — agent table from data', () => {
  it('renders one row per agent with id, name and formatted token counts', async () => {
    setData({
      byAgent: [
        makeAgentRow({ agentId: 'ag-1', agentName: 'Alpha', totalTokens: 12345, requests: 10 }),
        makeAgentRow({ agentId: 'ag-2', agentName: 'Beta', totalTokens: 6789, requests: 5 }),
      ],
    })
    mountView()
    await flushPromises()

    const rows = agentRows()
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('ag-1')
    expect(rows[0].textContent).toContain('Alpha')
    // Token total is run through Intl.NumberFormat (zh-CN → "12,345").
    expect(rows[0].textContent).toContain(fmt(12345))
    expect(rows[1].textContent).toContain(fmt(6789))
  })

  it('derives a data-driven status: requests > 0 → normal, 0 → warning', async () => {
    setData({
      byAgent: [
        makeAgentRow({ agentId: 'busy', requests: 7 }),
        makeAgentRow({ agentId: 'idle', requests: 0 }),
      ],
    })
    mountView()
    await flushPromises()

    const rows = agentRows()
    const busyStatus = rows[0].querySelector('.usage-status')
    const idleStatus = rows[1].querySelector('.usage-status')
    expect(busyStatus?.classList.contains('normal')).toBe(true)
    expect(busyStatus?.textContent).toContain(locale.t('metering.status.normal'))
    expect(idleStatus?.classList.contains('warning')).toBe(true)
    expect(idleStatus?.textContent).toContain(locale.t('metering.status.warning'))
  })

  it('shows a dash for the (unavailable) OVA template column', async () => {
    setData({ byAgent: [makeAgentRow({ agentId: 'ag-1' })] })
    mountView()
    await flushPromises()
    // 3rd cell is the template column (id, name, template, ...).
    const cells = agentRows()[0].querySelectorAll('td')
    expect(cells[2].textContent?.trim()).toBe('—')
  })

  it('reports the real row count in the agent table footer', async () => {
    setData({ byAgent: [makeAgentRow({ agentId: 'a' }), makeAgentRow({ agentId: 'b' })] })
    mountView()
    await flushPromises()
    // First footer belongs to the agent table card.
    const footer = wrapper!.element.querySelector('.table-footer')?.textContent ?? ''
    expect(footer).toContain(locale.t('metering.table.showing'))
    expect(footer).toContain('2')
  })
})

describe('MeteringCenterView — model + daily tables from data', () => {
  it('renders one row per model with its name and token counts', async () => {
    setData({
      byModel: [
        makeModelRow({ model: 'gpt-4o', totalTokens: 9999 }),
        makeModelRow({ model: 'claude-3', totalTokens: 4242 }),
      ],
    })
    mountView()
    await flushPromises()

    const rows = modelRows()
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('gpt-4o')
    expect(rows[0].textContent).toContain(fmt(9999))
    expect(rows[1].textContent).toContain('claude-3')
  })

  it('renders one row per day with its date and token counts', async () => {
    setData({
      byDay: [
        makeDayRow({ date: '2026-06-20', totalTokens: 3210 }),
        makeDayRow({ date: '2026-06-21', totalTokens: 1110 }),
      ],
    })
    mountView()
    await flushPromises()

    const rows = dailyRows()
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('2026-06-20')
    expect(rows[0].textContent).toContain(fmt(3210))
    expect(rows[1].textContent).toContain('2026-06-21')
  })
})

describe('MeteringCenterView — charts render when there is data', () => {
  it('draws the trend lines (and hides the empty label) when byDay has rows', async () => {
    setData({
      byDay: [
        makeDayRow({ date: '2026-06-20', inputTokens: 100, outputTokens: 50 }),
        makeDayRow({ date: '2026-06-21', inputTokens: 200, outputTokens: 80 }),
      ],
    })
    mountView()
    await flushPromises()

    // Both trend polylines (input + output) are rendered from the data.
    expect(wrapper!.element.querySelectorAll('.trend-line')).toHaveLength(2)
    expect(wrapper!.element.querySelector('.line-chart .chart-empty')).toBeNull()
  })

  it('draws one ranking bar per agent (top-N) when byAgent has rows', async () => {
    setData({
      byAgent: [
        makeAgentRow({ agentId: 'a', totalTokens: 500 }),
        makeAgentRow({ agentId: 'b', totalTokens: 900 }),
        makeAgentRow({ agentId: 'c', totalTokens: 100 }),
      ],
    })
    mountView()
    await flushPromises()

    const bars = wrapper!.element.querySelectorAll('.bars rect')
    expect(bars).toHaveLength(3)
    expect(wrapper!.element.querySelector('.bar-chart .chart-empty')).toBeNull()
  })

  it('caps the ranking bars at the top 5 agents by total tokens', async () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      makeAgentRow({ agentId: `ag-${i}`, agentName: `Agent ${i}`, totalTokens: (i + 1) * 100 }),
    )
    setData({ byAgent: many })
    mountView()
    await flushPromises()
    expect(wrapper!.element.querySelectorAll('.bars rect')).toHaveLength(5)
  })
})

describe('MeteringCenterView — client-side filters', () => {
  beforeEach(() => {
    setData({
      byAgent: [
        makeAgentRow({ agentId: 'ag-1', agentName: 'Alpha' }),
        makeAgentRow({ agentId: 'ag-2', agentName: 'Beta' }),
        makeAgentRow({ agentId: 'ag-3', agentName: 'Gamma' }),
      ],
      byModel: [
        makeModelRow({ model: 'gpt-4o' }),
        makeModelRow({ model: 'claude-3' }),
      ],
    })
  })

  it('offers an "all" option plus one option per agent / model', async () => {
    mountView()
    await flushPromises()
    const agentOpts = Array.from(agentSelect().querySelectorAll('option')).map((o) => o.value)
    expect(agentOpts).toEqual(['ALL', 'ag-1', 'ag-2', 'ag-3'])
    const modelOpts = Array.from(modelSelect().querySelectorAll('option')).map((o) => o.value)
    expect(modelOpts).toEqual(['ALL', 'gpt-4o', 'claude-3'])
  })

  it('filters the agent table to the selected agent', async () => {
    mountView()
    await flushPromises()
    expect(agentRows()).toHaveLength(3)

    const select = agentSelect()
    select.value = 'ag-2'
    await wrapper!.find('select[aria-label="' + locale.t('metering.filter.agent') + '"]').trigger(
      'change',
    )
    await flushPromises()

    const rows = agentRows()
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('ag-2')
    expect(rows[0].textContent).toContain('Beta')
  })

  it('filters the model table to the selected model', async () => {
    mountView()
    await flushPromises()
    expect(modelRows()).toHaveLength(2)

    const select = modelSelect()
    select.value = 'claude-3'
    await wrapper!.find('select[aria-label="' + locale.t('metering.filter.model') + '"]').trigger(
      'change',
    )
    await flushPromises()

    const rows = modelRows()
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('claude-3')
  })

  it('shows all rows again when the filter is reset to "ALL"', async () => {
    mountView()
    await flushPromises()
    const sel = wrapper!.find('select[aria-label="' + locale.t('metering.filter.agent') + '"]')
    agentSelect().value = 'ag-1'
    await sel.trigger('change')
    await flushPromises()
    expect(agentRows()).toHaveLength(1)

    agentSelect().value = 'ALL'
    await sel.trigger('change')
    await flushPromises()
    expect(agentRows()).toHaveLength(3)
  })
})

describe('MeteringCenterView — cost summary cards', () => {
  it('renders total and monthly cost as USD currency from the cost summary', async () => {
    setData({ cost: { totalCost: 123.45, monthlyCost: 67.8 } })
    mountView()
    await flushPromises()

    const costText = wrapper!.element.querySelector('.cost-grid')?.textContent ?? ''
    const totalFmt = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'USD' }).format(
      123.45,
    )
    const monthlyFmt = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'USD' }).format(
      67.8,
    )
    expect(costText).toContain(totalFmt)
    expect(costText).toContain(monthlyFmt)
    // The monthly card appends the localized "month" suffix.
    expect(costText).toContain(locale.t('metering.cost.month'))
  })
})

describe('MeteringCenterView — error state', () => {
  it('surfaces a toast using the GraphQL error message when the query errors', async () => {
    mountView()
    expect(capturedErrorHandler).not.toBeNull()
    capturedErrorHandler!({ graphQLErrors: [{ message: 'metering backend exploded' }] })
    await flushPromises()
    expect(toastMessages()).toContain('metering backend exploded')
  })

  it('falls back to the localized title when the error has no message', async () => {
    mountView()
    capturedErrorHandler!({})
    await flushPromises()
    expect(toastMessages()).toContain(locale.t('metering.title'))
  })

  it('does not toast while there is no error', async () => {
    setData({ byAgent: [makeAgentRow()] })
    mountView()
    await flushPromises()
    expect(toastMessages()).toHaveLength(0)
  })
})
