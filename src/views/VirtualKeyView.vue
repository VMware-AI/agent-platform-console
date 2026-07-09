<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import AppDropdown from '@/components/AppDropdown.vue'
import VirtualKeyFormModal from '@/components/VirtualKeyFormModal.vue'
import VirtualKeySecretDialog from '@/components/VirtualKeySecretDialog.vue'
import VirtualKeyViewModal from '@/components/VirtualKeyViewModal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useLocaleStore } from '@/stores/locale'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useDebouncedRef } from '@/composables/useDebouncedRef'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import type { VirtualKeyOption, VirtualKeyStatus } from '@/types/virtual-key'
import {
  VIRTUAL_KEYS_QUERY,
  GATEWAY_AVAILABLE_MODELS,
  ISSUE_VIRTUAL_KEY,
  SET_VIRTUAL_KEY_ENABLED,
  REVOKE_VIRTUAL_KEY,
  PURGE_REVOKED_VIRTUAL_KEYS,
  type VirtualKeysResult,
  type VirtualKeysVars,
  type VirtualKeyNode,
  type VirtualKeyOrderBy,
  type IssueVirtualKeyResult,
  type IssueVirtualKeyVars,
  type SetVirtualKeyEnabledResult,
  type SetVirtualKeyEnabledVars,
  type RevokeVirtualKeyResult,
  type RevokeVirtualKeyVars,
  type GatewayAvailableModelsResult,
  type GatewayAvailableModelsVars,
  type PurgeRevokedVirtualKeysResult,
  type PurgeRevokedVirtualKeysVars,
} from '@/api/graphql/queries/virtual-keys'
import { virtualKeyToIssueInput, type CloneVirtualKeyInput } from '@/utils/virtualKey'
import { MODEL_GATEWAYS_QUERY } from '@/api/graphql/queries/model-gateways'
import { AGENTS_QUERY } from '@/api/graphql/queries/agents'
import '@/components/icons'

const locale = useLocaleStore()
const auth = useAuthStore()
const toast = useToast()

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
const STATUS_FILTER_OPTIONS = ['ALL', 'ENABLED', 'DISABLED'] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
type BatchAction = 'enable' | 'disable' | 'delete'
type SortDirection = 'ASC' | 'DESC'
type KeyColumn =
  | 'NAME'
  | 'AGENT'
  | 'MODEL_GATEWAY'
  | 'MODELS'
  | 'MASKED_KEY'
  | 'PROGRESS'
  | 'STATUS'
  | 'EXPIRES_AT'
  | 'TIME_INFO'

// Column order mirrors the product spec: identification (name → agent →
// gateway → allowed models) comes first, then the masked key + consumption
// progress + status, then EXPIRES_AT, then the merged TIME_INFO column
// (最近活动 / 创建 / 更新 — three timestamps collapsed into one column
// for horizontal-density; full values live in the per-row detail
// drawer), then the row actions. PROGRESS / TIME_INFO keep their
// position in KeyColumn so the cell-render branch keeps working, but
// the column header strips its sort/filter controls (see template —
// gated on `column.key !== 'PROGRESS' && column.key !== 'TIME_INFO'`).
const COLUMNS: Array<{ key: KeyColumn; label: string; width: string }> = [
  { key: 'NAME', label: 'virtualKey.col.name', width: '10%' },
  // AGENT widened from 7% → 9% — agent names often run long
  // (e.g. `multi-model-proxy`, `summarizer-prod`), and the column
  // used to truncate aggressively at 7%. The 2% comes out of the
  // 操作 column (4 buttons still fit at 16% thanks to icon+label
  // stacking).
  { key: 'AGENT', label: 'virtualKey.col.agent', width: '9%' },
  { key: 'MODEL_GATEWAY', label: 'virtualKey.col.modelGateway', width: '8%' },
  // MODELS gets room to render multiple badges inline — a key may allow
  // many models and the per-model badge padding would overflow the old
  // 10% column. Slightly trimmed from 14% → 13% to free up room for
  // the wider MASKED_KEY + new 操作 (4 buttons: 查看 / 克隆 / 启用|禁用 /
  // 删除) below.
  { key: 'MODELS', label: 'virtualKey.col.models', width: '13%' },
  // MASKED_KEY widened from 6% → 9%. The token (`sk-…aBcD`) used to
  // fit comfortably at 6% but at 11px mono it left the cell looking
  // cramped next to the badge column. 9% holds the full prefix + 4-
  // char suffix without ellipsis on the common LiteLLM format.
  { key: 'MASKED_KEY', label: 'virtualKey.col.maskedKey', width: '9%' },
  // PROGRESS widened from 7% → 9% — the cell hosts a horizontal
  // progress track + `spend / maxBudget` text. At 7% the track was
  // too short to read the ratio at a glance; 9% gives ~115px of
  // track width on a 1280px viewport. The 2% comes out of TIME_INFO.
  { key: 'PROGRESS', label: 'virtualKey.col.progress', width: '9%' },
  { key: 'STATUS', label: 'virtualKey.col.status', width: '6%' },
  { key: 'EXPIRES_AT', label: 'virtualKey.col.expiresAt', width: '9%' },
  // TIME_INFO replaces the three former time columns (LAST_ACTIVE_AT 9%
  // + CREATED_AT 9% + UPDATED_AT 8% = 26%). The cell renders a compact
  // 3-line summary; the detail drawer carries the full timestamps.
  // Trimmed 11% → 9% to fund the PROGRESS widening above. At 9% the
  // three `YYYY-MM-DD HH:mm` lines still fit on a 1280px viewport
  // because the cell uses font-size: 12px + ellipsis on overflow; the
  // detail drawer is the canonical surface for full timestamps.
  { key: 'TIME_INFO', label: 'virtualKey.col.timeInfo', width: '12%' },
]

// Selector data sources. Agents/gateways are paged on the backend; pull a
// large page so the issue form's dropdowns hold the full set.
const SELECTOR_PAGE = { page: 1, pageSize: 1000 }

interface AgentNode {
  id: string
  name: string
}
interface AgentsQueryResult {
  agents: { nodes: AgentNode[] }
}
interface ModelGatewayFieldsLite {
  id: string
  name: string
}
interface ModelGatewaysResult {
  modelGateways: { nodes: ModelGatewayFieldsLite[]; totalCount: number }
}

// selectedIds — Set for O(1) membership checks during select-all toggles.
const selectedIds = ref(new Set<string>())
const pageSize = ref<PageSize>(20)
const currentPage = ref(1)
const formOpen = ref(false)
const saving = ref(false)
// 'create' opens the modal blank (default); 'clone' opens it with
// initialDraft prefilled from a source VirtualKey and the modal title
// switched to 克隆令牌. The formDraft ref is null on create so the
// modal's reset() doesn't run the prefill branch.
const formMode = ref<'create' | 'clone'>('create')
const formDraft = ref<CloneVirtualKeyInput | null>(null)
// Live duplicate-name check fed back to the form modal. `checking`
// reflects the in-flight state of the debounced query (mostly true
// while the user is typing); `duplicate` is the gate the form's
// nameValid uses to block submit. Reset to { checking: false,
// duplicate: false } every time the modal opens so a stale hit from
// a previous open doesn't leak across.
const formNameDuplicate = ref<{ checking: boolean; duplicate: boolean } | null>(null)
// purge-confirm dialog state. `pendingPurgeDays` carries the operator's
// in-progress input (default 90, the common compliance window); null
// means "no dialog open". The ConfirmDialog renders the numeric input
// and on confirm emits the value back to us — we then read it from
// the event payload and call purgeRevokedVirtualKeys. Title/body
// compute off this ref so the dialog reflects the operator's input
// live (e.g. they type "180" → body shows "180 天").
const PURGE_DEFAULT_DAYS = 90
const pendingPurgeDays = ref<number | null>(null)
const pendingDeleteIds = ref<string[]>([])
// Enable / disable confirmation: row + batch both funnel through here.
// `pendingEnabledIds` is empty when no confirm is open; non-empty
// values drive the dialog's `open` flag. `pendingEnabledValue` carries
// the target state (true = enable, false = disable) so the same
// dialog handles both directions — title/body are computed from it.
const pendingEnabledIds = ref<string[]>([])
const pendingEnabledValue = ref<boolean>(true)
const secretValue = ref('')
const secretOpen = ref(false)
// Drawer state for the TIME_INFO cell. `expandedKeyId` holds the id of
// the key whose detail drawer is open; `null` means closed. We deliberately
// store the id (not the full VirtualKeyNode) so refresh / regen /
// revoke can invalidate it: any code that mutates the keys list calls
// `closeDetail()` if `expandedKeyId.value` no longer exists in the new
// data. See the handlers below.
const expandedKeyId = ref<string | null>(null)
// +N models overflow popover. Same id-stored pattern as `expandedKeyId`
// above — the popover reads the current row's full models list off
// `virtualKeys` so refresh / regen / revoke can invalidate it (the
// anchor ref alone would point at a stale DOM node). `popoverAnchor`
// holds the trigger button element so we can compute viewport-fixed
// coords for the Teleported panel (Teleport escapes the grid's
// overflow context — see <Teleport> block below).
const openModelsPopoverId = ref<string | null>(null)
const popoverAnchor = ref<HTMLElement | null>(null)
// Max models rendered inline before the +N overflow button appears.
// Three fits comfortably at the 14% MODELS column width on a 1280px
// viewport; higher numbers would wrap to a second line per row,
// defeating the point of the collapse.
const MODELS_VISIBLE_LIMIT = 3
const sortField = ref<KeyColumn | null>(null)
const sortDirection = ref<SortDirection>('ASC')
// Filter UI state. `nameInput` / `agentInput` / `modelsInput` are the
// immediate v-model targets for the NAME / AGENT / MODELS column text
// inputs; their debounced mirrors (`nameQuery` / `agentQuery` /
// `modelsQuery`) are what the GraphQL query actually watches. `gatewayIdFilter`
// still holds an ID — the MODEL_GATEWAY column keeps a select-style option
// list because the backend's filter there is exact-match on ID. `''` is the
// sentinel for "no filter"; it's resolved to `null` at the useQuery boundary
// so the wire shape stays GraphQL-clean.
const nameInput = ref('')
const agentInput = ref('')
const modelsInput = ref('')
const gatewayIdFilter = ref('')
const statusFilter = ref<'ALL' | 'ENABLED' | 'DISABLED'>('ALL')
// Sort gate note: EXPIRES_AT is the only date column the page exposes
// as a sort axis (operators commonly want to find expiring-soon /
// expired-late keys). The TIME_INFO cell collapses the three former
// timestamp columns (LAST_ACTIVE_AT / CREATED_AT / UPDATED_AT) and
// carries no sort / filter of its own — its full values live in the
// per-row detail drawer instead.
const filterMenuAnchor = ref<HTMLElement | null>(null)
const filterMenuKey = ref<KeyColumn | null>(null)

// Debounced mirrors — 300ms is short enough to feel responsive on a single
// keystroke but long enough to coalesce normal typing into one refetch.
const nameQuery = useDebouncedRef(nameInput, 300)
const agentQuery = useDebouncedRef(agentInput, 300)
const modelsQuery = useDebouncedRef(modelsInput, 300)

// formGateway holds the currently selected modelGateway in the Issue form.
// The available-models sub-query is skipped until the user picks one.
const formGateway = ref('')

// orderBy is derived from the local sort refs and sent to the server on
// every query. NAME and EXPIRES_AT are the only axes the page exposes
// per FILTERABLE_COLUMNS / SORTABLE_COLUMNS below; the backend enum is
// wider (CREATED_AT / UPDATED_AT are also sortable there) but those
// columns are no longer surfaced on the page — they were folded into
// the TIME_INFO cell, which is data-only display.
const orderBy = computed<VirtualKeyOrderBy | null>(() => {
  if (!sortField.value) return null
  if (sortField.value === 'NAME') {
    return sortDirection.value === 'ASC' ? 'NAME_ASC' : 'NAME_DESC'
  }
  if (sortField.value === 'EXPIRES_AT') {
    return sortDirection.value === 'ASC' ? 'EXPIRES_AT_ASC' : 'EXPIRES_AT_DESC'
  }
  return null
})

// Filter vars are derived in a `computed` so each ref change re-evaluates the
// whole vars object and Apollo picks up the new value automatically. The
// backend's `virtualKeys(...)` query takes five flat parameters (no
// structured filter wrapper), so the computed returns those five siblings
// directly. `null` on every field is the canonical GraphQL "no filter" /
// "default order" — we collapse the empty-string UI sentinel to `null`
// here so the wire payload stays clean. The `orderBy` value is sourced
// from the local sort refs (see orderBy computed below) so the server
// handles NAME / EXPIRES_AT sort instead of post-sorting in the client.
const virtualKeysVars = computed<VirtualKeysVars>(() => ({
  agentName: agentQuery.value.trim() || null,
  modelGateway: gatewayIdFilter.value || null,
  nameContains: nameQuery.value.trim() || null,
  modelContains: modelsQuery.value.trim() || null,
  orderBy: orderBy.value,
}))

const {
  result: keysData,
  loading,
  refetch: refetchKeys,
} = useQuery<VirtualKeysResult, VirtualKeysVars>(VIRTUAL_KEYS_QUERY, virtualKeysVars)
const { result: gatewaysData } = useQuery<ModelGatewaysResult>(MODEL_GATEWAYS_QUERY, {
  filter: null,
  page: { limit: 1000, offset: 0 },
  sort: null,
})
const { result: agentsData } = useQuery<AgentsQueryResult>(AGENTS_QUERY, {
  pagination: SELECTOR_PAGE,
})
const { result: formAvailableModelsData, loading: formAvailableModelsLoading } = useQuery<
  GatewayAvailableModelsResult,
  GatewayAvailableModelsVars
>(GATEWAY_AVAILABLE_MODELS, () => ({ gatewayConnectionId: formGateway.value }), () => ({
  enabled: Boolean(formGateway.value),
}))

const gatewayOptions = computed<VirtualKeyOption[]>(() =>
  (gatewaysData.value?.modelGateways?.nodes ?? []).map((gateway) => ({
    id: gateway.id,
    name: gateway.name,
  })),
)
const agentOptions = computed<VirtualKeyOption[]>(() =>
  (agentsData.value?.agents?.nodes ?? []).map((agent) => ({ id: agent.id, name: agent.name })),
)
const formAvailableModels = computed<string[]>(
  () =>
    // Gate on formGateway being non-empty. Without this guard,
    // Apollo's cache for the last-fetched gateway keeps the previous
    // result in `formAvailableModelsData.value` even after closeForm()
    // clears formGateway — so reopening with an empty gateway would
    // still render the previous gateway's model pills in the picker.
    // With this guard, an empty gateway forces an empty picker list,
    // which the modal's empty state already handles (shows the
    // 「先选择网关」 hint).
    formGateway.value
      ? (formAvailableModelsData.value?.gatewayAvailableModels ?? [])
      : [],
)
// TEMP mock fixture — short-circuits the GraphQL result so the
// progress-bar styling can be visually verified across every colour
// band (green / amber / red) without a backend wired up. Ratios
// chosen to exercise each threshold:
//   0%   → green (just-started key)
//   35%  → green (mid-band, healthy)
//   72%  → amber (just past the 70% warning threshold)
//   87%  → amber (deep in warning band)
//   96%  → red   (over the 95% danger threshold)
//   100% → red   (clamped, maxes out the bar)
//   no-budget → "—" centered label + no fill (edge case)
//
// Revert this block (delete `mockKeys` + the override below) once the
// progress styling is signed off.
const mockKeys: VirtualKeyNode[] = [
  {
    id: 'mock-0',
    name: 'mock-progress-0pct',
    maskedKey: 'sk-…aBc0',
    status: 'active',
    modelGateway: { id: 'gw-openai', name: 'OpenAI Gateway' },
    agent: null,
    models: ['gpt-4o-mini'],
    expiresAt: null,
    createdAt: '2026-07-01T08:00:00Z',
    updatedAt: '2026-07-09T08:00:00Z',
    lastActiveAt: '2026-07-10T03:24:00Z',
    spend: 0,
    maxBudget: 1000,
    budgetDuration: '30d',
    maxParallelRequests: null,
    rpmLimit: null,
    tpmLimit: null,
    rpmLimitType: null,
    tpmLimitType: null,
    keyType: 'default',
    autoRotate: false,
    rotationInterval: null,
    allowedRoutes: null,
    tags: null,
  },
  {
    id: 'mock-35',
    name: 'mock-progress-35pct',
    maskedKey: 'sk-…dEf1',
    status: 'active',
    modelGateway: { id: 'gw-azure', name: 'Azure Gateway' },
    agent: { id: 'agent-1', name: 'support-bot' },
    models: ['gpt-4o-mini', 'text-embedding-3-small'],
    expiresAt: '2026-12-31T23:59:59Z',
    createdAt: '2026-06-15T08:00:00Z',
    updatedAt: '2026-07-08T08:00:00Z',
    lastActiveAt: '2026-07-10T01:12:00Z',
    spend: 350,
    maxBudget: 1000,
    budgetDuration: '7d',
    maxParallelRequests: 10,
    rpmLimit: 60,
    tpmLimit: 10000,
    rpmLimitType: null,
    tpmLimitType: null,
    keyType: 'default',
    autoRotate: false,
    rotationInterval: null,
    allowedRoutes: null,
    tags: null,
  },
  {
    id: 'mock-72',
    name: 'mock-progress-72pct',
    maskedKey: 'sk-…gHi2',
    status: 'active',
    modelGateway: { id: 'gw-anthropic', name: 'Anthropic Gateway' },
    agent: { id: 'agent-2', name: 'summarizer' },
    models: ['claude-3-5-sonnet-20240620', 'text-embedding-3-large'],
    expiresAt: null,
    createdAt: '2026-05-20T08:00:00Z',
    updatedAt: '2026-07-05T08:00:00Z',
    lastActiveAt: '2026-07-10T02:33:00Z',
    spend: 720,
    maxBudget: 1000,
    budgetDuration: '30d',
    maxParallelRequests: 20,
    rpmLimit: 120,
    tpmLimit: 50000,
    rpmLimitType: null,
    tpmLimitType: null,
    keyType: 'default',
    autoRotate: true,
    rotationInterval: '7d',
    allowedRoutes: null,
    tags: null,
  },
  {
    id: 'mock-87',
    name: 'mock-progress-87pct',
    maskedKey: 'sk-…jKl3',
    status: 'active',
    modelGateway: { id: 'gw-vertex', name: 'Vertex Gateway' },
    agent: { id: 'agent-3', name: 'router' },
    models: ['gemini-1.5-pro', 'gemini-1.5-flash'],
    expiresAt: '2026-09-30T23:59:59Z',
    createdAt: '2026-04-10T08:00:00Z',
    updatedAt: '2026-07-09T08:00:00Z',
    lastActiveAt: '2026-07-10T05:48:00Z',
    spend: 870,
    maxBudget: 1000,
    budgetDuration: '30d',
    maxParallelRequests: 20,
    rpmLimit: 120,
    tpmLimit: 50000,
    rpmLimitType: null,
    tpmLimitType: null,
    keyType: 'default',
    autoRotate: true,
    rotationInterval: '7d',
    allowedRoutes: null,
    tags: null,
  },
  {
    id: 'mock-96',
    name: 'mock-progress-96pct',
    maskedKey: 'sk-…mNo4',
    status: 'disabled',
    modelGateway: { id: 'gw-bedrock', name: 'Bedrock Gateway' },
    agent: { id: 'agent-4', name: 'multi-model-proxy' },
    models: ['claude-3-haiku-20240307'],
    expiresAt: '2027-01-15T23:59:59Z',
    createdAt: '2026-03-01T08:00:00Z',
    updatedAt: '2026-07-09T08:00:00Z',
    lastActiveAt: '2026-07-10T06:11:00Z',
    spend: 960,
    maxBudget: 1000,
    budgetDuration: '30d',
    maxParallelRequests: 30,
    rpmLimit: 240,
    tpmLimit: 100000,
    rpmLimitType: null,
    tpmLimitType: null,
    keyType: 'default',
    autoRotate: false,
    rotationInterval: null,
    allowedRoutes: null,
    tags: null,
  },
  {
    id: 'mock-100',
    name: 'mock-progress-100pct-clamped',
    maskedKey: 'sk-…pQr5',
    status: 'active',
    modelGateway: { id: 'gw-openai', name: 'OpenAI Gateway' },
    agent: null,
    models: ['gpt-4-turbo-2024-04-09', 'gpt-3.5-turbo-0125'],
    expiresAt: null,
    createdAt: '2026-02-15T08:00:00Z',
    updatedAt: '2026-07-09T08:00:00Z',
    lastActiveAt: '2026-07-10T07:02:00Z',
    spend: 1223,
    maxBudget: 1000,
    budgetDuration: '30d',
    maxParallelRequests: 50,
    rpmLimit: 500,
    tpmLimit: 200000,
    rpmLimitType: null,
    tpmLimitType: null,
    keyType: 'default',
    autoRotate: false,
    rotationInterval: null,
    allowedRoutes: null,
    tags: null,
  },
  {
    id: 'mock-no-budget',
    name: 'mock-no-budget-set',
    maskedKey: 'sk-…sTu6',
    status: 'active',
    modelGateway: { id: 'gw-azure', name: 'Azure Gateway' },
    agent: null,
    models: ['gpt-4o-mini'],
    expiresAt: null,
    createdAt: '2026-07-05T08:00:00Z',
    updatedAt: '2026-07-09T08:00:00Z',
    lastActiveAt: '2026-07-10T04:18:00Z',
    spend: 12.4,
    maxBudget: null,
    budgetDuration: null,
    maxParallelRequests: null,
    rpmLimit: null,
    tpmLimit: null,
    rpmLimitType: null,
    tpmLimitType: null,
    keyType: 'default',
    autoRotate: false,
    rotationInterval: null,
    allowedRoutes: null,
    tags: null,
  },
]
const virtualKeys = computed<VirtualKeyNode[]>(() => mockKeys)

function displayName(key: VirtualKeyNode): string {
  return key.name || '—'
}

function agentName(key: VirtualKeyNode): string {
  if (!key.agent) return '—'
  return key.agent.name
}

function consumptionProgress(key: VirtualKeyNode): { ratio: number; color: string } | null {
  if (key.maxBudget == null || key.maxBudget <= 0) return null
  const ratio = Math.min(1, Math.max(0, key.spend / key.maxBudget))
  let color = '#48960c'
  if (ratio >= 0.95) color = '#c92100'
  else if (ratio >= 0.7) color = '#e8a32a'
  return { ratio, color }
}

function progressStyle(key: VirtualKeyNode) {
  const progress = consumptionProgress(key)
  if (!progress) return { width: '0%', background: 'transparent' }
  return {
    width: `${(progress.ratio * 100).toFixed(1)}%`,
    background: progress.color,
  }
}

function progressText(key: VirtualKeyNode): string {
  if (key.maxBudget == null || key.maxBudget <= 0) return '—'
  return `${key.spend} / ${key.maxBudget}`
}

// progressPercent renders the centered "50%" label on top of the
// track. `Intl.NumberFormat` rounds to a whole percent for the
// centered display (the tooltip still uses the .1% precision). For
// keys without a budget, render an em-dash so the centered label
// stays a single character and the track collapses cleanly.
function progressPercent(key: VirtualKeyNode): string {
  if (key.maxBudget == null || key.maxBudget <= 0) return '—'
  const ratio = key.spend / key.maxBudget
  const pct = Math.min(100, Math.max(0, Math.round(ratio * 100)))
  return `${pct}%`
}

function progressTooltip(key: VirtualKeyNode): string {
  if (key.maxBudget == null || key.maxBudget <= 0) return locale.t('virtualKey.col.progress') as string
  return `${((key.spend / key.maxBudget) * 100).toFixed(1)}%`
}

const filteredKeys = computed<VirtualKeyNode[]>(() => {
  // The four backend-filterable dimensions (name / agent / gateway / models)
  // are narrowed on the server — the page only sees keys that already match.
  // Sort is also server-driven via the `orderBy` query parameter, so the
  // result order is what the resolver returned. Status has no backend
  // filter yet, so it stays a client-side post-filter.
  //
  // `revoked` is the soft-delete / audit state — litellm has hard-deleted
  // the underlying key but the backend mirrors a `revoked` row for
  // history. Drop it from the default list so users don't see "already
  // deleted" rows alongside live ones. The detail drawer / status badge
  // keep the full picture visible when needed.
  const base =
    statusFilter.value === 'ALL'
      ? virtualKeys.value
      : virtualKeys.value.filter(
          (key) => key.status === (statusFilter.value === 'ENABLED' ? 'active' : 'disabled'),
        )
  return base.filter((key) => key.status !== 'revoked')
})

const totalCount = computed(() => filteredKeys.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const visibleKeys = computed<VirtualKeyNode[]>(() =>
  filteredKeys.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value),
)
const selectedCount = computed(() => selectedIds.value.size)
const allVisibleSelected = computed(() => {
  const selectable = visibleKeys.value.filter((key) => key.status !== 'revoked')
  if (selectable.length === 0) return false
  return selectable.every((key) => selectedIds.value.has(key.id))
})

const summaryText = computed(() => {
  if (totalCount.value === 0) return locale.t('virtualKey.pagination.summary.empty') as string
  const start = (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(currentPage.value * pageSize.value, totalCount.value)
  return locale
    .t('virtualKey.pagination.summary')
    .replace('{start}', String(start))
    .replace('{end}', String(end))
    .replace('{total}', String(totalCount.value))
})

// Enable / disable confirmation dialog — mirrors the delete flow's
// structure (single vs batch wording) but branches on `pendingEnabledValue`
// so the same dialog handles both directions. Single-row wording names
// the key by `displayName`; batch wording names the count.
const enabledDialogTitle = computed(() => {
  const action = pendingEnabledValue.value ? 'enable' : 'disable'
  if (pendingEnabledIds.value.length > 1) {
    return locale.t(`virtualKey.confirm.batch${action === 'enable' ? 'Enable' : 'Disable'}Title`) as string
  }
  const target = virtualKeys.value.find((key) => key.id === pendingEnabledIds.value[0])
  return locale
    .t(`virtualKey.confirm.${action === 'enable' ? 'enable' : 'disable'}Title`)
    .replace('{name}', target ? displayName(target) : '')
})

const enabledDialogBody = computed(() => {
  const action = pendingEnabledValue.value ? 'enable' : 'disable'
  if (pendingEnabledIds.value.length > 1) {
    return locale
      .t(`virtualKey.confirm.batch${action === 'enable' ? 'Enable' : 'Disable'}Body`)
      .replace('{count}', String(pendingEnabledIds.value.length))
  }
  const target = virtualKeys.value.find((key) => key.id === pendingEnabledIds.value[0])
  return locale
    .t(`virtualKey.confirm.${action === 'enable' ? 'enable' : 'disable'}Body`)
    .replace('{name}', target ? displayName(target) : '')
})

// Purge dialog text. Both title and body are deliberately day-
// agnostic — the operator can edit the cutoff in the dialog's
// numeric input before confirming, so we don't bake a value into
// either line. Baking "90 天前" into the title would mislead the
// operator if they later typed 180 — the title would still say 90.
// The number input is the visible source of truth for the cutoff
// at confirm time.
const purgeDialogTitle = computed(() =>
  locale.t('virtualKey.confirm.purgeTitle') as string,
)
const purgeDialogBody = computed(() =>
  locale.t('virtualKey.confirm.purgeBody') as string,
)
// Numeric-input config for the purge confirm dialog. Default seeded
// from `pendingPurgeDays` (which was set to PURGE_DEFAULT_DAYS when
// the dialog opened) so the input renders with the suggested value
// pre-filled. Min 1 prevents the operator typing 0 and clearing the
// resv nothing — the resolver would also reject this with 422, but
// failing fast in the UI is the better user experience. Max 3650
// (~10 years) is large enough to be effectively unbounded without
// inviting the typo "1000000" silently deleting decades of state.
const numericInputProps = computed(() => ({
  label: locale.t('virtualKey.confirm.purgeDaysLabel') as string,
  placeholder: locale.t('virtualKey.confirm.purgeDaysPlaceholder') as string,
  default: pendingPurgeDays.value ?? PURGE_DEFAULT_DAYS,
  min: 1,
  max: 3650,
}))

const deleteDialogTitle = computed(() => {
  if (pendingDeleteIds.value.length > 1) return locale.t('virtualKey.confirm.batchDeleteTitle') as string
  const target = virtualKeys.value.find((key) => key.id === pendingDeleteIds.value[0])
  return locale.t('virtualKey.confirm.deleteTitle').replace('{name}', target ? displayName(target) : '')
})

const deleteDialogBody = computed(() => {
  if (pendingDeleteIds.value.length > 1)
    return locale
      .t('virtualKey.confirm.batchDeleteBody')
      .replace('{count}', String(pendingDeleteIds.value.length))
  const target = virtualKeys.value.find((key) => key.id === pendingDeleteIds.value[0])
  return locale.t('virtualKey.confirm.deleteBody').replace('{name}', target ? displayName(target) : '')
})

// Type-to-confirm token for the delete dialog.
//
//   - Single-row mode: the operator must type the key's `displayName`
//     exactly. Convenient because the name is already on the row
//     above the dialog and can be copy/pasted.
//
//   - Batch mode: there's no single label to type, so we fall back to
//     a fixed `DELETE` sentinel. The sentinel is rendered as
//     locale.t('virtualKey.confirm.batchDeleteSentinel') on both sides
//     so the label and the typed token stay in sync across locales.
//     The locale string is plain ASCII (`DELETE`) in both zh and en,
//     so the typed-value matching is also locale-agnostic at the
//     ConfirmDialog layer (the comparison uses exact string match).
const deleteDialogExpectedInput = computed(() => {
  if (pendingDeleteIds.value.length === 1) {
    const target = virtualKeys.value.find((key) => key.id === pendingDeleteIds.value[0])
    return target ? displayName(target) : ''
  }
  if (pendingDeleteIds.value.length > 1) {
    return locale.t('virtualKey.confirm.batchDeleteSentinel') as string
  }
  return ''
})
const deleteDialogInputLabel = computed(() => {
  if (pendingDeleteIds.value.length > 1) {
    return locale.t('virtualKey.confirm.batchDeleteInputLabel') as string
  }
  return locale.t('virtualKey.confirm.deleteInputLabel') as string
})
const deleteDialogInputPlaceholder = computed(() => {
  if (pendingDeleteIds.value.length > 1) {
    return locale.t('virtualKey.confirm.batchDeleteInputPlaceholder') as string
  }
  return locale.t('virtualKey.confirm.deleteInputPlaceholder') as string
})

function statusVariant(status: VirtualKeyStatus): 'success' | 'neutral' | 'danger' {
  return status === 'active' ? 'success' : status === 'disabled' ? 'neutral' : 'danger'
}

function statusIcon(status: VirtualKeyStatus): string {
  return status === 'active' ? 'check-circle' : status === 'disabled' ? 'ban' : 'times-circle'
}

function statusLabel(status: VirtualKeyStatus): string {
  if (status === 'active') return locale.t('virtualKey.status.enabled') as string
  if (status === 'disabled') return locale.t('virtualKey.status.disabled') as string
  return locale.t('virtualKey.status.revoked') as string
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toggleSelect(id: string, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedIds.value = next
}

function toggleSelectAll(checked: boolean) {
  const next = new Set(selectedIds.value)
  for (const key of visibleKeys.value) {
    if (key.status === 'revoked') continue
    if (checked) next.add(key.id)
    else next.delete(key.id)
  }
  selectedIds.value = next
}

function sortStateFor(field: KeyColumn): 'idle' | 'ascending' | 'descending' {
  if (sortField.value !== field) return 'idle'
  return sortDirection.value === 'ASC' ? 'ascending' : 'descending'
}

function toggleSort(field: KeyColumn) {
  if (sortField.value !== field) {
    sortField.value = field
    sortDirection.value = 'ASC'
  } else if (sortDirection.value === 'ASC') {
    sortDirection.value = 'DESC'
  } else {
    sortField.value = null
    sortDirection.value = 'ASC'
  }
  currentPage.value = 1
}

function openFilterMenu(key: KeyColumn, event: MouseEvent) {
  filterMenuKey.value = key
  filterMenuAnchor.value = event.currentTarget as HTMLElement
}

function closeFilterMenu() {
  filterMenuKey.value = null
  filterMenuAnchor.value = null
}

function hasFilter(key: KeyColumn | null): boolean {
  if (key === 'NAME') return Boolean(nameInput.value.trim())
  if (key === 'AGENT') return Boolean(agentInput.value.trim())
  if (key === 'MODEL_GATEWAY') return Boolean(gatewayIdFilter.value)
  if (key === 'MODELS') return Boolean(modelsInput.value.trim())
  if (key === 'STATUS') return statusFilter.value !== 'ALL'
  return false
}

function textFilterValue(key: KeyColumn): string {
  if (key === 'NAME') return nameInput.value
  if (key === 'AGENT') return agentInput.value
  if (key === 'MODELS') return modelsInput.value
  return ''
}

function setTextFilter(key: KeyColumn, value: string) {
  if (key === 'NAME') nameInput.value = value
  else if (key === 'AGENT') agentInput.value = value
  else if (key === 'MODELS') modelsInput.value = value
  currentPage.value = 1
}

function setGatewayFilter(id: string) {
  gatewayIdFilter.value = id
  currentPage.value = 1
  closeFilterMenu()
}

// Date columns are sortable but no longer filterable. The UI gates the
// filter button on this set so hasFilter()/textFilterValue() never see
// them — but listing them here makes the gate auditable in one place.
const FILTERABLE_COLUMNS = new Set<KeyColumn>([
  'NAME',
  'AGENT',
  'MODEL_GATEWAY',
  'MODELS',
  'STATUS',
])

function isColumnFilterable(key: KeyColumn): boolean {
  return FILTERABLE_COLUMNS.has(key)
}

// Sort gate. EXPIRES_AT is the only date column retained as a sort axis
// (operators commonly want to find expiring-soon / expired-late keys).
// PROGRESS / TIME_INFO have no sort (data-only display). All other
// KeyColumn members remain in the union so the cell-render branches
// keep working.
const SORTABLE_COLUMNS = new Set<KeyColumn>([
  'NAME',
  'EXPIRES_AT',
])

function isColumnSortable(key: KeyColumn): boolean {
  return SORTABLE_COLUMNS.has(key)
}

function setStatusFilter(value: (typeof STATUS_FILTER_OPTIONS)[number]) {
  statusFilter.value = value
  currentPage.value = 1
  closeFilterMenu()
}

function clearActiveFilter() {
  if (!filterMenuKey.value) return
  if (filterMenuKey.value === 'NAME') nameInput.value = ''
  else if (filterMenuKey.value === 'AGENT') agentInput.value = ''
  else if (filterMenuKey.value === 'MODEL_GATEWAY') gatewayIdFilter.value = ''
  else if (filterMenuKey.value === 'MODELS') modelsInput.value = ''
  else if (filterMenuKey.value === 'STATUS') statusFilter.value = 'ALL'
  currentPage.value = 1
  closeFilterMenu()
}

function openCreate() {
  formDraft.value = null
  formMode.value = 'create'
  // Reset the duplicate-check state so a stale hit from a previous
  // open doesn't pollute the next create attempt.
  formNameDuplicate.value = null
  formOpen.value = true
}

// openClone — re-open the same modal in clone mode, prefilling every
// governance field from the source row. The helper clears `name` and
// `duration` so the modal forces a fresh name + lifetime. Revoked rows
// are rejected at the caller (the row action is hidden by the outer
// v-if on status !== 'revoked'), but we re-check here as a belt-and-
// braces guard so future refactors of the action button can't
// accidentally issue a clone off a terminal-state source.
function openClone(keyItem: VirtualKeyNode) {
  if (keyItem.status === 'revoked') return
  formDraft.value = virtualKeyToIssueInput(keyItem)
  formMode.value = 'clone'
  formOpen.value = true
}

// Live duplicate-name check. The modal emits the trimmed name on every
// keystroke; we debounce here (300ms) so each character doesn't fire a
// network roundtrip. The query is exact-match (`nameEquals`, case-
// sensitive — mirrors the backend partial unique index) and we treat
// any non-revoked hit as a clash. Revoked rows don't occupy the name
// (see backend resolver comment on the partial-unique index), so we
// can re-use a previously-revoked name.
//
// A bare `apolloClient.query` is used instead of `useQuery` because we
// don't want the result composable's lifecycle tied to a Vue component
// — the modal can close mid-query, and refetch on re-open. Imperative
// calls + a manual ref is the simpler shape here.
let nameCheckSeq = 0
async function onNameChange(trimmed: string) {
  if (!trimmed) {
    formNameDuplicate.value = { checking: false, duplicate: false }
    return
  }
  formNameDuplicate.value = { checking: true, duplicate: false }
  const seq = ++nameCheckSeq
  try {
    const { data } = await apolloClient.query<
      VirtualKeysResult,
      VirtualKeysVars
    >({
      query: VIRTUAL_KEYS_QUERY,
      variables: { nameEquals: trimmed },
      fetchPolicy: 'network-only',
    })
    // A newer keystroke may have arrived while the request was in flight;
    // discard this stale result so the modal doesn't flicker between
    // duplicate / not-duplicate as the queue drains.
    if (seq !== nameCheckSeq) return
    const hit = (data?.virtualKeys ?? []).find(
      (k) => k.status !== 'revoked',
    )
    formNameDuplicate.value = {
      checking: false,
      duplicate: Boolean(hit),
    }
  } catch {
    // Network blip — flip the indicator to a neutral state so the user
    // isn't left staring at a permanent "checking…" message. The
    // backend still re-validates on save (the partial-unique index is
    // the source of truth) so this is purely UX.
    if (seq === nameCheckSeq) {
      formNameDuplicate.value = { checking: false, duplicate: false }
    }
  }
}

// purgeRevokedVirtualKeys — admin-only entrypoint. Opens a confirm
// dialog with the cutoff expressed as "N days ago" so the operator
// never has to type an ISO timestamp by hand. The resolver rejects
// future beforeTime as 422; we clamp to "now" defensively to avoid
// ever sending a future timestamp.
// openPurge — toolbar button lands here. No days parameter: the
// dialog's numeric input starts at PURGE_DEFAULT_DAYS and the operator
// can edit before confirming. The dialog is the canonical source of
// truth for the cutoff once open.
function openPurge() {
  pendingPurgeDays.value = PURGE_DEFAULT_DAYS
}
function cancelPurge() {
  pendingPurgeDays.value = null
}
async function confirmPurge(days?: number) {
  // The dialog confirms with the parsed integer from the numeric input.
  // Guard against `undefined` (shouldn't happen — the dialog's
  // confirmDisabled blocks submits until the input is valid — but
  // belt-and-braces in case the prop wiring changes) and against
  // out-of-range values. We fall back to the dialog's pending value
  // when the event payload is empty so a same-tick cancel + open
  // doesn't crash.
  const effective = days ?? pendingPurgeDays.value
  if (effective == null || auth.role !== 'admin') {
    pendingPurgeDays.value = null
    return
  }
  // Mirror the value back to the ref so the title/body computation
  // reflects what we're actually about to send (the dialog's input
  // already shows it, but this guarantees the post-confirm toast is
  // consistent if the user closes the dialog via backdrop).
  pendingPurgeDays.value = effective
  const beforeTime = new Date(Date.now() - effective * 86_400_000).toISOString()
  pendingPurgeDays.value = null
  try {
    const { data } = await apolloClient.mutate<
      PurgeRevokedVirtualKeysResult,
      PurgeRevokedVirtualKeysVars
    >({
      mutation: PURGE_REVOKED_VIRTUAL_KEYS,
      variables: { beforeTime },
    })
    const deletedCount = data?.purgeRevokedVirtualKeys?.deletedCount ?? 0
    toast.success(
      locale
        .t('virtualKey.toast.purged')
        .replace('{count}', String(deletedCount)),
    )
    await refetchKeys()?.catch(() => {})
  } catch (error) {
    toast.error(
      graphqlErrorMessage(
        error,
        locale.t('virtualKey.toast.purgeFailed') as string,
      ),
    )
  }
}

function closeForm() {
  if (saving.value) return
  formOpen.value = false
  // Clear formGateway so reopen doesn't restore the previously-picked
  // gateway. bb84882 made formGateway a persistent ref (so the model
  // list survives a reopen), but never paired that persistence with
  // a clear-on-close — so cancel / submit-success both left the next
  // open pre-filled with the old gateway + its (possibly stale) model
  // list. Reset to '' so reset() in the modal falls back to its empty
  // placeholder (initialModelGateway is read inside reset() and already
  // handles '' by leaving modelGateway blank).
  formGateway.value = ''
  // Reset the duplicate-check state too — same rationale: a stale hit
  // from a closed open shouldn't bleed into the next.
  formNameDuplicate.value = null
}

function revealSecret(secret: string) {
  secretValue.value = secret
  secretOpen.value = true
}

function closeSecret() {
  secretValue.value = ''
  secretOpen.value = false
}

// View modal (read-only). Mirrors the id-stored + computed-resolved
// pattern used by `expandedKey` above. Available to every operator —
// auditing a key's configuration shouldn't require edit / delete
// permission, and there's no destructive surface inside the modal.
function openView(id: string) {
  viewingKeyId.value = id
}
function closeView() {
  viewingKeyId.value = null
}
// View modal state (read-only). Same id-stored + computed-resolved
// pattern as `expandedKey` above — store the id, resolve the live
// VirtualKeyNode on read so refresh / regen / revoke can't leave the
// modal pointing at a stale row. The modal is purely read-only so
// there's no need to mirror the node locally; the computed handles
// invalidation for free.
const viewingKeyId = ref<string | null>(null)
const viewingKey = computed<VirtualKeyNode | null>(() => {
  if (!viewingKeyId.value) return null
  return virtualKeys.value.find((key) => key.id === viewingKeyId.value) ?? null
})

// Detail drawer (TIME_INFO cell). `openDetail` flips the id; the
// `expandedKey` computed re-resolves from `virtualKeys` so the drawer
// always reflects the current server state (e.g. status flips to
// revoked, updatedAt bumps after regen, etc) without a local mirror.
// ESC + mask click + close-button paths funnel through `closeDetail`.
function openDetail(id: string) {
  expandedKeyId.value = id
}
function closeDetail() {
  expandedKeyId.value = null
}
const expandedKey = computed<VirtualKeyNode | null>(() => {
  if (!expandedKeyId.value) return null
  return virtualKeys.value.find((key) => key.id === expandedKeyId.value) ?? null
})

// Models +N popover. Same pattern as the detail drawer — store only
// the key id + anchor element, resolve the live VirtualKeyNode and
// its full models list on read so refresh / regen / revoke can't leave
// the popover pointing at stale data. `popoverStyle` derives fixed
// coords from the anchor's getBoundingClientRect(); re-evaluates on
// scroll/resize because the grid rows shift vertically with viewport.
function toggleModelsPopover(id: string, anchor: HTMLElement) {
  if (openModelsPopoverId.value === id) {
    closeModelsPopover()
  } else {
    openModelsPopoverId.value = id
    popoverAnchor.value = anchor
  }
}
function closeModelsPopover() {
  openModelsPopoverId.value = null
  popoverAnchor.value = null
}
// Resolve the open popover's current VirtualKeyNode. If refetch /
// regen / revoke invalidated the id (row gone, or status flipped to
// revoked and filtered out), the find returns null and the panel
// won't render — but the popover state itself stays set so a stale
// trigger can be cleaned up explicitly by the watcher below. Storing
// only the id (not the node) means list mutations can't leave the
// popover dangling on a deleted entry.
const overflowKey = computed<VirtualKeyNode | null>(() => {
  if (!openModelsPopoverId.value) return null
  return virtualKeys.value.find((key) => key.id === openModelsPopoverId.value) ?? null
})
// Watch for the popover's target row going missing (deleted, filtered
// out by status, etc.) and close the popover so the state stays
// consistent with the rendered list. Without this watcher the panel
// would silently stop rendering while the trigger button's "open"
// state stayed set — re-clicking the trigger would have to fight
// stale state to toggle correctly.
watch(overflowKey, (next) => {
  if (openModelsPopoverId.value !== null && next === null) {
    closeModelsPopover()
  }
})
// `viewportTick` is bumped on scroll/resize to force `popoverStyle` to
// re-read the anchor's getBoundingClientRect. Vue's plain `ref.set`
// only triggers reactivity when the value changes, so we can't just
// reassign `popoverAnchor.value` to itself — bumping a dedicated tick
// counter is the cleanest way to force a downstream computed to
// re-evaluate without a separate re-render strategy.
const viewportTick = ref(0)
const popoverStyle = computed(() => {
  // Touch viewportTick so the computed subscribes to it; the value
  // itself is unused — only the ref's identity matters for reactivity.
  void viewportTick.value
  if (!popoverAnchor.value) return { display: 'none' } as Record<string, string>
  const rect = popoverAnchor.value.getBoundingClientRect()
  // Anchor below-left aligned to the +N button so it visually grows
  // downward, mirroring a dropdown. `min-width: 220px` on the panel
  // means the popover is always wider than the trigger; left-alignment
  // keeps it on the same side as the badge column instead of
  // overshooting the row edge on long lists.
  return {
    top: `${Math.round(rect.bottom + 4)}px`,
    left: `${Math.round(rect.left)}px`,
  } as Record<string, string>
})

// ESC closes the detail drawer AND the models popover. The listener
// stays attached for the page's lifetime (added on mount, removed on
// unmount); the handler early-returns when no popup is open so the
// keymap surface stays inert. Carbon's <cds-dropdown> for the filter
// menu handles its own ESC, and the form modal has its own backdrop-
// close affordance — we don't conflict because the drawer / modal /
// filter / popover are mutually exclusive in practice (only one
// popup-style UI is open at a time).
function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (openModelsPopoverId.value !== null) {
    event.preventDefault()
    closeModelsPopover()
    return
  }
  if (expandedKeyId.value === null) return
  event.preventDefault()
  closeDetail()
}
// Click-outside dismissal for the models popover. The handler stays
// attached for the page's lifetime; early-returns when no popover is
// open. Targets inside `.models-popover` (the panel) or `.model-overflow`
// (the trigger button) don't count as outside — otherwise the click
// that *opened* the popover would immediately close it, and clicks on
// panel rows wouldn't navigate within it.
function onDocumentClick(event: MouseEvent) {
  if (openModelsPopoverId.value === null) return
  const target = event.target as HTMLElement | null
  if (!target) return
  if (target.closest('.models-popover, .model-overflow')) return
  closeModelsPopover()
}
// Recompute popover coords on scroll/resize so the panel stays glued
// to its anchor even when the user scrolls the grid body or resizes
// the window. Cheap (single getBoundingClientRect); runs only while
// a popover is open thanks to the early-return.
function onViewportChange() {
  if (openModelsPopoverId.value === null) return
  viewportTick.value++
}
onMounted(() => {
  document.addEventListener('keydown', onGlobalKeydown)
  document.addEventListener('mousedown', onDocumentClick)
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onGlobalKeydown)
  document.removeEventListener('mousedown', onDocumentClick)
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
})

function onFormGatewayChanged(gatewayId: string) {
  formGateway.value = gatewayId
}

async function submitKey(draft: {
  name: string
  modelGateway: string
  duration?: string
  models?: string[]
  maxBudget?: number
  budgetDuration?: string
  maxParallelRequests?: number
  tpmLimit?: number
  rpmLimit?: number
  rpmLimitType?: string
  tpmLimitType?: string
  allowedRoutes?: string[]
  metadata?: Record<string, any>
  // Optional — the modal's VirtualKeyFormDraft declared keyType as
  // optional and only the clone path populates it (the create path
  // doesn't carry a UI control). Fall through to 'default' so the
  // create behaviour is byte-identical to the pre-clone state.
  keyType?: string
  autoRotate?: boolean
  rotationInterval?: string
}) {
  if (saving.value) return
  saving.value = true
  try {
    const { data } = await apolloClient.mutate<IssueVirtualKeyResult, IssueVirtualKeyVars>({
      mutation: ISSUE_VIRTUAL_KEY,
      variables: {
        input: {
          name: draft.name.trim(),
          modelGateway: draft.modelGateway,
          // TODO(auth): backend currently requires `userId` on
          // IssueVirtualKeyInput; hardcoded to 'admin' until auth.user.id
          // is wired through. Replace with `useAuthStore().user?.id` once
          // the auth store exposes a stable id (currently exposes email
          // only on the login mutation result).
          userId: 'admin',
          duration: draft.duration?.trim() || null,
          models: draft.models?.length ? draft.models : null,
          maxBudget: draft.maxBudget ?? null,
          budgetDuration: draft.budgetDuration?.trim() || null,
          maxParallelRequests: draft.maxParallelRequests ?? null,
          rpmLimit: draft.rpmLimit ?? null,
          tpmLimit: draft.tpmLimit ?? null,
          rpmLimitType: draft.rpmLimitType?.trim() || null,
          tpmLimitType: draft.tpmLimitType?.trim() || null,
          allowedRoutes: draft.allowedRoutes,
          // IssueVirtualKeyInput now ships tags under `metadata.tags`.
          // The form modal OMITS `metadata` entirely when the input is
          // empty, so we pass through `?? null` rather than coercing an
          // empty object — matches the omit-when-unset style of the
          // other optional fields above.
          metadata: draft.metadata ?? null,
          // `keyType` is a fixed default on the create path — there is
          // no UI control to vary it; the modal's draft intentionally
          // omits keyType in that case. The clone path plumbs the
          // source's value through, so we honour it when present and
          // fall back to 'default' otherwise.
          keyType: draft.keyType ?? 'default',
          autoRotate: draft.autoRotate ?? null,
          rotationInterval: draft.rotationInterval?.trim() || null,
        },
      },
    })
    formOpen.value = false
    // Reveal secret BEFORE refetch — the secret is shown exactly once.
    const secret = data?.issueVirtualKey?.secret
    if (secret) revealSecret(secret)
    toast.success(locale.t('virtualKey.toast.created') as string)
    currentPage.value = 1
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('virtualKey.toast.issueFailed') as string))
    return
  } finally {
    saving.value = false
  }
  await refetchKeys()?.catch(() => {})
}

async function setEnabled(ids: string[], enabled: boolean) {
  const targets = ids.filter(
    (id) => virtualKeys.value.find((key) => key.id === id)?.status !== 'revoked',
  )
  if (targets.length === 0) return
  const outcomes = await Promise.allSettled(
    targets.map((id) =>
      apolloClient.mutate<SetVirtualKeyEnabledResult, SetVirtualKeyEnabledVars>({
        mutation: SET_VIRTUAL_KEY_ENABLED,
        variables: { id, enabled },
      }),
    ),
  )
  const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled').length
  const rejected = outcomes.find(
    (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
  ) as PromiseRejectedResult | undefined
  const key = enabled ? 'virtualKey.toast.enabled' : 'virtualKey.toast.disabled'
  toast.success((locale.t(key) as string).replace('{count}', String(fulfilled)))
  if (rejected) {
    toast.error(graphqlErrorMessage(rejected.reason, locale.t('virtualKey.toast.saveFailed') as string))
  }
  await refetchKeys()
}

function requestToggleEnabled(keyNode: VirtualKeyNode) {
  // Mirror the row's current state into a pending confirm — clicking
  // the row action opens the dialog rather than mutating immediately,
  // matching the delete flow's two-step pattern.
  pendingEnabledIds.value = [keyNode.id]
  pendingEnabledValue.value = keyNode.status !== 'active'
}

function requestSetEnabled(ids: string[], enabled: boolean) {
  pendingEnabledIds.value = ids
  pendingEnabledValue.value = enabled
}

function closeEnabled() {
  pendingEnabledIds.value = []
}

async function confirmEnabled() {
  const ids = pendingEnabledIds.value
  const enabled = pendingEnabledValue.value
  // Clear pending state up front so a slow network call doesn't leave
  // the dialog open if the user clicks again.
  pendingEnabledIds.value = []
  if (ids.length === 0) return
  await setEnabled(ids, enabled)
}

function performBatch(action: BatchAction, close: () => void) {
  close()
  const ids = Array.from(selectedIds.value)
  if (ids.length === 0) return
  if (action === 'enable') requestSetEnabled(ids, true)
  else if (action === 'disable') requestSetEnabled(ids, false)
  else if (action === 'delete') pendingDeleteIds.value = ids
}

function requestDelete(keyNode: VirtualKeyNode) {
  pendingDeleteIds.value = [keyNode.id]
}

function closeDelete() {
  pendingDeleteIds.value = []
}

async function confirmDelete() {
  const ids = pendingDeleteIds.value
  if (ids.length === 0) return
  const targets = ids.filter(
    (id) => virtualKeys.value.find((key) => key.id === id)?.status !== 'revoked',
  )
  const outcomes = await Promise.allSettled(
    targets.map((id) =>
      apolloClient.mutate<RevokeVirtualKeyResult, RevokeVirtualKeyVars>({
        mutation: REVOKE_VIRTUAL_KEY,
        variables: { id },
      }),
    ),
  )
  const revokedIds = targets.filter((_, index) => outcomes[index].status === 'fulfilled')
  toast.success((locale.t('virtualKey.toast.deleted') as string).replace('{count}', String(revokedIds.length)))
  const firstRejection = outcomes.find(
    (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
  ) as PromiseRejectedResult | undefined
  if (firstRejection) {
    toast.error(graphqlErrorMessage(firstRejection.reason, locale.t('virtualKey.toast.saveFailed') as string))
  }
  // Selection cleanup — revoked keys are no longer actionable.
  const next = new Set(selectedIds.value)
  for (const id of revokedIds) next.delete(id)
  selectedIds.value = next
  pendingDeleteIds.value = []
  await refetchKeys()
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
}

function copyWithFallback(value: string) {
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(textarea)
  return ok
}

async function copyValue(value: string | null, successKey: string) {
  if (value == null) return
  let ok = false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      ok = true
    } else {
      ok = copyWithFallback(value)
    }
  } catch {
    ok = copyWithFallback(value)
  }
  if (ok) {
    toast.success(locale.t(successKey) as string)
  } else {
    toast.error(locale.t('virtualKey.toast.copyFailed') as string)
  }
}

async function refreshKeys() {
  if (loading.value) return
  try {
    await refetchKeys()
    toast.success(locale.t('virtualKey.toast.refreshed') as string)
  } catch (error) {
    toast.error(graphqlErrorMessage(error, locale.t('virtualKey.toast.refreshFailed') as string))
  }
}

function onPageSizeChange(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value)
  if (PAGE_SIZE_OPTIONS.includes(value as PageSize)) {
    pageSize.value = value as PageSize
    currentPage.value = 1
  }
}

function goToPage(page: number) {
  if (Number.isNaN(page)) return
  const clamped = Math.min(Math.max(1, page), totalPages.value)
  currentPage.value = clamped
}
</script>

<template>
  <section class="virtual-key-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('virtualKey.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('virtualKey.description') }}</p>
    </header>

    <div class="toolbar">
      <cds-button action="outline" status="primary" @click="openCreate">
        <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
        {{ locale.t('virtualKey.action.create') }}
      </cds-button>

      <AppDropdown align="start" :disabled="selectedCount === 0">
        <template #trigger>
          <cds-button
            action="outline"
            :disabled="selectedCount === 0"
            :title="selectedCount === 0 ? (locale.t('virtualKey.batch.disabled') as string) : undefined"
          >
            <cds-icon shape="cog" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('virtualKey.action.batch') }}
            <cds-icon shape="angle" direction="down" size="sm" aria-hidden="true"></cds-icon>
          </cds-button>
        </template>
        <template #default="{ close }">
          <button class="menu-option" type="button" @click="performBatch('enable', close)">
            <cds-icon shape="check-circle" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('virtualKey.batch.enable') }}
          </button>
          <button class="menu-option" type="button" @click="performBatch('disable', close)">
            <cds-icon shape="ban" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('virtualKey.batch.disable') }}
          </button>
          <button class="menu-option danger" type="button" @click="performBatch('delete', close)">
            <cds-icon shape="trash" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('virtualKey.batch.delete') }}
          </button>
        </template>
      </AppDropdown>

      <!-- Admin-only ops shortcut: bulk-purge revoked keys. Placed
           to the right of the 「批量操作」 dropdown so the secondary
           cleanup action doesn't sit between the primary create
           button and the per-selection dropdown — that gap was
           visually confusing because both buttons read as "row-level
           action" affordances. The button just opens the confirm
           dialog — the days cutoff is supplied by the operator
           through the dialog's numeric input (default 90 days, the
           most common compliance window). The button itself carries
           no days param so future changes to the default don't need
           a toolbar edit. -->
      <cds-button
        v-if="auth.role === 'admin'"
        action="outline"
        status="warning"
        @click="openPurge"
      >
        <cds-icon shape="trash" size="sm" aria-hidden="true"></cds-icon>
        {{ locale.t('virtualKey.action.purge') }}
      </cds-button>

      <button
        type="button"
        class="refresh-button"
        :disabled="loading"
        :aria-label="locale.t('virtualKey.action.refresh')"
        :title="locale.t('virtualKey.action.refresh')"
        @click="refreshKeys"
      >
        <cds-icon shape="refresh" size="md" :class="{ spinning: loading }" aria-hidden="true"></cds-icon>
      </button>
    </div>

    <cds-grid
      border="row"
      column-layout="flex"
      role="grid"
      scroll-lock
      :aria-label="locale.t('virtualKey.table.label')"
    >
      <cds-grid-column type="action" :resizable="false">
        <input
          type="checkbox"
          class="app-checkbox"
          :checked="allVisibleSelected"
          :aria-label="locale.t('virtualKey.col.selectAll')"
          @change="toggleSelectAll(($event.target as HTMLInputElement).checked)"
        />
      </cds-grid-column>

      <cds-grid-column v-for="column in COLUMNS" :key="column.key" :width="column.width">
        <div class="column-head">
          <span>{{ locale.t(column.label) }}</span>
          <!--
            Per product feedback, the header chrome is intentionally
            minimal on a few columns:
              - PROGRESS: shows spend/maxBudget only — no sort, no filter.
              - TIME_INFO: collapsed summary cell — no sort, no filter.
                The full timestamps live in the per-row detail drawer.
              - EXPIRES_AT: keeps sort (common operational axis) but no
                filter (date filtering removed alongside the others).
            `sortField` and `filterMenuKey` are never set to a column
            outside its respective allowed set, so the comparator and
            filter-menu branches below stay branch-free for the gated
            columns. We keep those KeyColumn union members so the cell
            render branch in the v-for keeps working unchanged.
          -->
          <span class="column-head-actions">
            <cds-button-action
              v-if="isColumnSortable(column.key)"
              :aria-label="locale.t('virtualKey.sort').replace('{column}', locale.t(column.label))"
              @click="toggleSort(column.key)"
            >
              <cds-icon
                v-if="sortStateFor(column.key) === 'ascending'"
                shape="angle"
                direction="up"
                size="sm"
              ></cds-icon>
              <cds-icon
                v-else-if="sortStateFor(column.key) === 'descending'"
                shape="angle"
                direction="down"
                size="sm"
              ></cds-icon>
              <cds-icon v-else shape="two-way-arrows" class="sort-idle" size="sm"></cds-icon>
            </cds-button-action>
            <cds-button-action
              v-if="isColumnFilterable(column.key)"
              shape="filter"
              :expanded="hasFilter(column.key)"
              :aria-label="locale.t('virtualKey.filter').replace('{column}', locale.t(column.label))"
              @click="(event: MouseEvent) => openFilterMenu(column.key, event)"
            ></cds-button-action>
          </span>
        </div>
      </cds-grid-column>
      <!--
        Actions column trimmed from 16% → 13% to fund the wider
        TIME_INFO column above. The 4 inline buttons (查看 / 克隆 /
        启用|禁用 / 删除) stay usable at 13% — each button has
        `min-width: 40px` and the labels are 2-3 chars, so 4 of them
        add up to ~155-165px; 13% of a 1280px viewport gives ~167px
        of cell width with padding overhead, just above that minimum.
        On narrower viewports the row gains a slightly tighter feel
        (intentional — the 4-button stack is already visually busy)
        but doesn't break.
      -->
      <cds-grid-column width="13%">{{ locale.t('virtualKey.col.actions') }}</cds-grid-column>

      <cds-grid-row v-for="keyItem in visibleKeys" :key="keyItem.id">
        <cds-grid-cell>
          <input
            type="checkbox"
            class="app-checkbox"
            :checked="selectedIds.has(keyItem.id)"
            :disabled="keyItem.status === 'revoked'"
            :aria-label="locale.t('virtualKey.col.selectKey').replace('{name}', displayName(keyItem))"
            @change="toggleSelect(keyItem.id, ($event.target as HTMLInputElement).checked)"
          />
        </cds-grid-cell>

        <cds-grid-cell v-for="column in COLUMNS" :key="column.key">
          <div v-if="column.key === 'NAME'" class="name-cell">
            <strong class="key-name" :title="displayName(keyItem)">
              {{ displayName(keyItem) }}
            </strong>
          </div>
          <div v-else-if="column.key === 'AGENT'" class="agent-cell">
            <span :title="agentName(keyItem)">{{ agentName(keyItem) }}</span>
            <button
              v-if="keyItem.agent?.id"
              type="button"
              class="icon-action"
              :title="locale.t('virtualKey.action.copyAgent')"
              @click="copyValue(keyItem.agent!.id, 'virtualKey.toast.agentCopied')"
            >
              <cds-icon shape="copy" size="sm"></cds-icon>
            </button>
          </div>
          <span
            v-else-if="column.key === 'MODEL_GATEWAY'"
            class="truncate-cell"
            :title="keyItem.modelGateway?.name ?? ''"
          >{{ keyItem.modelGateway?.name ?? '—' }}</span>
          <div v-else-if="column.key === 'MODELS'" class="models-cell" :title="(keyItem.models ?? []).join(', ')">
            <cds-badge
              v-for="model in (keyItem.models ?? []).slice(0, MODELS_VISIBLE_LIMIT)"
              :key="model"
              status="neutral"
              class="model-badge"
            >
              {{ model }}
            </cds-badge>
            <!--
              +N overflow affordance: rendered when more than
              MODELS_VISIBLE_LIMIT (3) models are allowed. Clicking opens
              a Teleported popover (see <Teleport> block below) listing
              the full set, with click-outside + ESC dismissal. Hover
              also surfaces the full list via the parent cell's
              `:title` attribute above, so users get a quick read
              without committing to the popover.
            -->
            <button
              v-if="(keyItem.models?.length ?? 0) > MODELS_VISIBLE_LIMIT"
              type="button"
              class="model-overflow"
              :title="(keyItem.models ?? []).join(', ')"
              :aria-label="
                (locale.t('virtualKey.col.modelsMoreAria') as string).replace(
                  '{count}',
                  String((keyItem.models?.length ?? 0) - MODELS_VISIBLE_LIMIT),
                )
              "
              @click="(event) => toggleModelsPopover(keyItem.id, event.currentTarget as HTMLElement)"
            >
              +{{ (keyItem.models?.length ?? 0) - MODELS_VISIBLE_LIMIT }}
            </button>
            <span v-if="!keyItem.models?.length" class="muted">—</span>
          </div>
          <span
            v-else-if="column.key === 'MASKED_KEY'"
            class="truncate-cell masked-key"
            :title="keyItem.maskedKey ?? ''"
          >{{ keyItem.maskedKey ?? '—' }}</span>
          <cds-badge
            v-else-if="column.key === 'STATUS'"
            :status="statusVariant(keyItem.status)"
            class="status-badge"
          >
            <cds-icon :shape="statusIcon(keyItem.status)" size="sm"></cds-icon>
            {{ statusLabel(keyItem.status) }}
          </cds-badge>
          <span v-else-if="column.key === 'EXPIRES_AT'" class="date-cell">
            {{ formatDateTime(keyItem.expiresAt) }}
          </span>
          <!--
            TIME_INFO collapses the former LAST_ACTIVE_AT / CREATED_AT /
            UPDATED_AT columns. The cell shows only the last-active
            timestamp plus an inline "更多" affordance on the same
            line; the affordance opens the per-key detail drawer with
            all three full timestamps. The cell container is a
            non-interactive <div> — only the inner button has keyboard
            / click semantics, so we don't violate HTML nesting rules
            by stacking clickables. A chevron caret on the affordance
            gives an unambiguous "opens detail" affordance, matching
            the same pattern used in supplier-model's row actions.
          -->
          <div
            v-else-if="column.key === 'TIME_INFO'"
            class="time-info-cell"
            :title="`${locale.t('virtualKey.col.lastActiveAt')}: ${formatDateTime(keyItem.lastActiveAt)} · ${locale.t('virtualKey.col.createdAt')}: ${formatDateTime(keyItem.createdAt)} · ${locale.t('virtualKey.col.updatedAt')}: ${formatDateTime(keyItem.updatedAt)}`"
          >
            <span class="time-info-row">
              <span class="time-info-value" :title="formatDateTime(keyItem.lastActiveAt)">
                {{ formatDateTime(keyItem.lastActiveAt) }}
              </span>
              <button
                type="button"
                class="time-info-more"
                :aria-label="`${locale.t('virtualKey.col.timeInfo')} — ${displayName(keyItem)}`"
                @click="openDetail(keyItem.id)"
              >
                <span class="time-info-more-label">{{ locale.t('virtualKey.col.timeInfoMore') }}</span>
                <cds-icon shape="angle" direction="right" size="sm"></cds-icon>
              </button>
            </span>
          </div>
          <div
            v-else-if="column.key === 'PROGRESS'"
            class="progress-cell"
            :title="progressTooltip(keyItem)"
          >
            <!--
              Two-line layout: a track + center percentage on top, then
              the spend/cap text beneath. Track is taller than the
              previous 8px so the centered percentage label reads
              comfortably at 11-12px; the centered label uses a small
              text-shadow halo so it stays legible whether the cell
              sits over the filled (dark) or unfilled (light) portion
              of the track. The track width is `flex: 1` so it eats
              the available cell width — at 9% column width on a
              1280px viewport that's ~115px, enough to host both the
              fill and the centered label.
            -->
            <div class="progress-track">
              <div
                class="progress-fill"
                :style="progressStyle(keyItem)"
              ></div>
              <span class="progress-percent">{{ progressPercent(keyItem) }}</span>
            </div>
            <span class="progress-text">{{ progressText(keyItem) }}</span>
          </div>
        </cds-grid-cell>

        <cds-grid-cell>
          <!--
            Actions are rendered inline (no AppDropdown) to match the
            supplier-model "操作" column pattern. Revoked keys collapse to
            a single status note — the per-row mutations don't apply to a
            terminal state. Delete stays admin-only; view / clone /
            enable / disable are available to any operator so the common
            audit / toggle flow doesn't require admin elevation.

            Order rationale:
              1. 查看 (view) — read-only, always available, opens an
                 audit modal. Placed first because it's the safest
                 action and the one an operator reaches for first.
              2. 克隆 (clone) — non-destructive; re-opens the issue
                 form pre-populated from this row. Placed before the
                 toggle so the non-destructive options cluster at the
                 left and the state-changing ones sit at the right.
              3. 启用 / 禁用 (toggle) — flips the active flag. State-
                 changing but non-destructive; sits in the middle.
              4. 删除 (delete) — admin-only, destructive; placed at
                 the right edge so it stays physically farthest from
                 the safe "查看" affordance.
          -->
          <div v-if="keyItem.status !== 'revoked'" class="row-actions">
            <button
              type="button"
              class="row-action"
              :title="locale.t('virtualKey.action.view')"
              @click="openView(keyItem.id)"
            >
              <cds-icon shape="eye" size="sm"></cds-icon>
              <span>{{ locale.t('virtualKey.action.view') }}</span>
            </button>
            <button
              type="button"
              class="row-action"
              :title="locale.t('virtualKey.action.clone')"
              @click="openClone(keyItem)"
            >
              <cds-icon shape="copy" size="sm"></cds-icon>
              <span>{{ locale.t('virtualKey.action.clone') }}</span>
            </button>
            <button
              type="button"
              class="row-action"
              :title="locale.t(keyItem.status === 'active' ? 'virtualKey.action.disable' : 'virtualKey.action.enable')"
              @click="requestToggleEnabled(keyItem)"
            >
              <cds-icon :shape="keyItem.status === 'active' ? 'ban' : 'check-circle'" size="sm"></cds-icon>
              <span>{{ locale.t(keyItem.status === 'active' ? 'virtualKey.action.disable' : 'virtualKey.action.enable') }}</span>
            </button>
            <button
              v-if="auth.role === 'admin'"
              type="button"
              class="row-action danger"
              :title="locale.t('virtualKey.action.delete')"
              @click="requestDelete(keyItem)"
            >
              <cds-icon shape="trash" size="sm"></cds-icon>
              <span>{{ locale.t('virtualKey.action.delete') }}</span>
            </button>
          </div>
          <span v-else class="revoked-note">{{ locale.t('virtualKey.status.revoked') }}</span>
        </cds-grid-cell>
      </cds-grid-row>

      <cds-grid-placeholder v-if="visibleKeys.length === 0">
        <cds-icon shape="key" size="xl"></cds-icon>
        <p cds-text="subsection">{{ locale.t('virtualKey.empty') }}</p>
      </cds-grid-placeholder>

      <cds-grid-footer v-if="totalCount > 0">
        <span v-if="selectedCount > 0" class="selected-summary">
          {{ locale.t('virtualKey.selected').replace('{count}', String(selectedCount)) }}
        </span>
        <div class="pager">
          <label for="virtual-key-page-size">{{ locale.t('virtualKey.pagination.pageSize') }}</label>
          <cds-select control-width="shrink">
            <select
              id="virtual-key-page-size"
              :value="pageSize"
              :aria-label="locale.t('virtualKey.pagination.pageSize')"
              @change="onPageSizeChange"
            >
              <option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
          </cds-select>
          <span class="pager-summary">{{ summaryText }}</span>
          <cds-pagination :aria-label="locale.t('virtualKey.pagination.label')">
            <cds-pagination-button
              action="first"
              :disabled="currentPage <= 1"
              :aria-label="locale.t('agents.pager.first')"
              @click="goToPage(1)"
            ></cds-pagination-button>
            <cds-pagination-button
              action="prev"
              :disabled="currentPage <= 1"
              :aria-label="locale.t('agents.pager.prev')"
              @click="goToPage(currentPage - 1)"
            ></cds-pagination-button>
            <cds-input cds-pagination-number>
              <input
                type="number"
                :value="currentPage"
                :min="1"
                :max="totalPages"
                :aria-label="locale.t('agents.pager.page')"
                @change="goToPage(Number(($event.target as HTMLInputElement).value))"
              />
            </cds-input>
            <cds-pagination-button
              action="next"
              :disabled="currentPage >= totalPages"
              :aria-label="locale.t('agents.pager.next')"
              @click="goToPage(currentPage + 1)"
            ></cds-pagination-button>
            <cds-pagination-button
              action="last"
              :disabled="currentPage >= totalPages"
              :aria-label="locale.t('agents.pager.last')"
              @click="goToPage(totalPages)"
            ></cds-pagination-button>
          </cds-pagination>
        </div>
      </cds-grid-footer>
    </cds-grid>

    <cds-dropdown
      v-if="filterMenuAnchor && filterMenuKey"
      :hidden="false"
      :anchor="filterMenuAnchor"
      closable
      @closeChange="closeFilterMenu"
    >
      <div class="filter-panel">
        <cds-input v-if="filterMenuKey === 'NAME'">
          <input
            type="text"
            :value="textFilterValue('NAME')"
            :placeholder="locale.t('virtualKey.filter.namePlaceholder')"
            :aria-label="locale.t('virtualKey.filter.namePlaceholder')"
            @input="setTextFilter('NAME', ($event.target as HTMLInputElement).value)"
          />
        </cds-input>
        <cds-input v-else-if="filterMenuKey === 'AGENT'">
          <input
            type="text"
            :value="textFilterValue('AGENT')"
            :placeholder="locale.t('virtualKey.filter.agentPlaceholder')"
            :aria-label="locale.t('virtualKey.filter.agentPlaceholder')"
            @input="setTextFilter('AGENT', ($event.target as HTMLInputElement).value)"
          />
        </cds-input>
        <div v-else-if="filterMenuKey === 'MODEL_GATEWAY'" class="filter-options">
          <button
            type="button"
            class="filter-option"
            :class="{ active: gatewayIdFilter === '' }"
            @click="setGatewayFilter('')"
          >
            <span>{{ locale.t('virtualKey.filter.all') }}</span>
            <cds-icon v-if="gatewayIdFilter === ''" shape="check" size="sm"></cds-icon>
          </button>
          <button
            v-for="gateway in gatewayOptions"
            :key="gateway.id"
            type="button"
            class="filter-option"
            :class="{ active: gatewayIdFilter === gateway.id }"
            @click="setGatewayFilter(gateway.id)"
          >
            <span>{{ gateway.name }}</span>
            <cds-icon v-if="gatewayIdFilter === gateway.id" shape="check" size="sm"></cds-icon>
          </button>
        </div>
        <cds-input v-else-if="filterMenuKey === 'MODELS'">
          <input
            type="text"
            :value="textFilterValue('MODELS')"
            :placeholder="locale.t('virtualKey.filter.modelsPlaceholder')"
            :aria-label="locale.t('virtualKey.filter.modelsPlaceholder')"
            @input="setTextFilter('MODELS', ($event.target as HTMLInputElement).value)"
          />
        </cds-input>
        <div v-else-if="filterMenuKey === 'STATUS'" class="filter-options">
          <button
            v-for="status in STATUS_FILTER_OPTIONS"
            :key="status"
            type="button"
            class="filter-option"
            :class="{ active: statusFilter === status }"
            @click="setStatusFilter(status)"
          >
            <span>{{ locale.t(`virtualKey.filter.status.${status}`) }}</span>
            <cds-icon v-if="statusFilter === status" shape="check" size="sm"></cds-icon>
          </button>
        </div>

        <div v-if="hasFilter(filterMenuKey)" class="filter-footer">
          <cds-button action="outline" size="sm" @click="clearActiveFilter">
            {{ locale.t('virtualKey.filter.clear') }}
          </cds-button>
        </div>
      </div>
    </cds-dropdown>

    <!--
      Per-key detail drawer, opened by clicking a row's TIME_INFO cell.
      Slots are deliberately minimal in this PR — only the three time
      fields get their full timestamps; other per-row detail fields
      (masked key, models, expires, etc.) stay in the row for now and
      will move into this drawer in a follow-up PR once we know the
      full shape. Keeping the slice narrow matches CLAUDE.md's
      "one thing per PR" rule.
    -->
    <Teleport to="body">
      <div v-if="expandedKey" class="vk-detail-mask" @click.self="closeDetail">
        <aside
          class="vk-detail"
          role="dialog"
          aria-modal="true"
          :aria-label="`${locale.t('virtualKey.col.timeInfo')}: ${displayName(expandedKey)}`"
        >
          <header class="vk-detail-head">
            <h2 class="vk-detail-title">
              {{ locale.t('virtualKey.col.timeInfo') }}
              <span class="vk-detail-name">· {{ displayName(expandedKey) }}</span>
            </h2>
            <button
              type="button"
              class="vk-detail-close"
              :aria-label="locale.t('virtualKey.detail.close')"
              @click="closeDetail"
            >
              <cds-icon shape="close" size="sm"></cds-icon>
            </button>
          </header>
          <dl class="vk-detail-list">
            <div class="vk-detail-item">
              <dt>{{ locale.t('virtualKey.col.lastActiveAt') }}</dt>
              <dd>
                <span class="vk-detail-value">
                  {{ formatDateTime(expandedKey.lastActiveAt) }}
                </span>
                <span v-if="!expandedKey.lastActiveAt" class="vk-detail-empty">
                  {{ locale.t('virtualKey.detail.neverActive') }}
                </span>
              </dd>
            </div>
            <div class="vk-detail-item">
              <dt>{{ locale.t('virtualKey.col.createdAt') }}</dt>
              <dd>
                <span class="vk-detail-value">{{ formatDateTime(expandedKey.createdAt) }}</span>
              </dd>
            </div>
            <div class="vk-detail-item">
              <dt>{{ locale.t('virtualKey.col.updatedAt') }}</dt>
              <dd>
                <span class="vk-detail-value">{{ formatDateTime(expandedKey.updatedAt) }}</span>
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </Teleport>

    <!--
      +N models overflow popover. Teleported to <body> for the same
      reason as the detail drawer above — the grid's overflow / stacking
      contexts can clip fixed-position panels. The panel reads its
      anchor coords from `popoverStyle` (computed off the +N button's
      getBoundingClientRect); mousedown on document outside the panel
      or its trigger closes it, as does ESC. The panel lists the FULL
      models array for the row (not just the overflow tail) so the
      user always sees an authoritative list inside the popover,
      matching the cell's hover tooltip.
    -->
    <Teleport to="body">
      <div
        v-if="openModelsPopoverId && popoverAnchor && overflowKey"
        class="models-popover"
        role="dialog"
        :aria-label="`${locale.t('virtualKey.col.models')}: ${displayName(overflowKey)}`"
        :style="popoverStyle"
      >
        <ul class="models-popover-list">
          <li v-for="model in overflowKey.models ?? []" :key="model" :title="model">
            {{ model }}
          </li>
        </ul>
      </div>
    </Teleport>

    <VirtualKeyFormModal
      v-if="formOpen"
      :open="formOpen"
      :gateways="gatewayOptions"
      :initial-model-gateway="formGateway"
      :available-models="formAvailableModels"
      :available-models-loading="formAvailableModelsLoading"
      :saving="saving"
      :mode="formMode"
      :initial-draft="formDraft"
      :name-duplicate="formNameDuplicate"
      @gateway-changed="onFormGatewayChanged"
      @close="closeForm"
      @submit="submitKey"
      @name-change="onNameChange"
    />

    <VirtualKeySecretDialog
      v-if="secretOpen"
      :open="secretOpen"
      :secret="secretValue"
      @close="closeSecret"
    />

    <!--
      Read-only "查看" modal. Opened from the row's view action and
      closed via either the modal's own close button or backdrop
      click. The component reads the live VirtualKeyNode via the
      `viewingKey` computed (resolved off `viewingKeyId`), so any
      refetch / regen / revoke invalidates the modal cleanly. We don't
      gate this modal on `keyItem.status !== 'revoked'` — revoked
      keys are still useful to inspect (e.g. for audit), and the
      modal is purely read-only.
    -->
    <VirtualKeyViewModal
      v-if="viewingKeyId !== null"
      :open="viewingKeyId !== null"
      :key-item="viewingKey"
      @close="closeView"
    />

    <ConfirmDialog
      :open="pendingDeleteIds.length > 0"
      :title="deleteDialogTitle"
      :body="deleteDialogBody"
      :expected-input="deleteDialogExpectedInput"
      :input-label="deleteDialogInputLabel"
      :input-placeholder="deleteDialogInputPlaceholder"
      danger
      @close="closeDelete"
      @confirm="confirmDelete"
    />

    <!--
      Enable / disable confirm. Reuses the same ConfirmDialog as the
      delete flow; the `danger` style is intentionally off because
      toggling a key's state isn't destructive (the key itself is
      preserved, just the active/inactive flag flips). Mounted in the
      same dialog slot so ESC / backdrop click / cancel all share the
      delete dialog's existing behavior.
    -->
    <ConfirmDialog
      :open="pendingEnabledIds.length > 0"
      :title="enabledDialogTitle"
      :body="enabledDialogBody"
      @close="closeEnabled"
      @confirm="confirmEnabled"
    />

    <!-- Purge confirm. Shares the ConfirmDialog component for ESC /
         backdrop semantics; the body is dynamic on `pendingPurgeDays`
         (the dialog only carries the admin-relevant number of days
         and never asks for a typed confirm phrase — bulk DB deletes
         are precise enough at the mutation site that the typed-
         confirm extra step isn't necessary). -->
    <ConfirmDialog
      :open="pendingPurgeDays !== null"
      :title="purgeDialogTitle"
      :body="purgeDialogBody"
      :numeric-input="numericInputProps"
      danger
      @close="cancelPurge"
      @confirm="confirmPurge"
    />
  </section>
</template>

<style scoped>
.virtual-key-page {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.page-head {
  flex: 0 0 auto;
}
.heading {
  margin: 0;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font-size: 28px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.desc {
  margin: 12px 0 0;
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 14px;
  line-height: 1.5;
  max-width: 720px;
}
.toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
}
.refresh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  padding: 6px 8px;
  margin: 0;
  cursor: pointer;
  color: inherit;
  flex-shrink: 0;
  border-radius: 0;
}
.refresh-button:hover:not(:disabled) {
  color: var(--cds-alias-object-app-blue, #0072a3);
}
.refresh-button:focus-visible {
  outline: 2px solid var(--cds-alias-object-app-blue, #0072a3);
  outline-offset: 2px;
}
.refresh-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.virtual-key-page cds-grid {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  width: 100%;
  /* scroll-lock on <cds-grid> disables the shadow-DOM scroll container's
     scrollbars; combined with min-width: 0 + max-width: 100% on the host
     this prevents the table from ever overflowing the viewport. */
  overflow: hidden;
}
/* Force cds-grid columns + cells to clip instead of expanding past their
   intrinsic content width (which would re-introduce the inner scrollbar
   even with scroll-lock applied). */
.virtual-key-page cds-grid-column,
.virtual-key-page cds-grid-cell {
  min-width: 0;
  overflow: hidden;
}
.column-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  width: 100%;
  min-width: 0;
}
.column-head > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.column-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  flex: 0 0 auto;
}
.sort-idle {
  transform: rotate(90deg);
}
.app-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--cds-alias-object-interaction-color, #0072a3);
}
.key-name,
.date-cell {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.truncate-cell {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.masked-key {
  font-family: var(--cds-alias-typography-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
}
.key-name {
  font-weight: 600;
}
.date-cell {
  font-variant-numeric: tabular-nums;
}
.progress-cell {
  /* Stacked layout: track on its own line, spend/cap text below it.

     `width: 100%` is the key — <cds-grid-cell>'s private-host lays
     out its slotted child as a flex item with `align-items: center`,
     so without an explicit width the cell collapses to its child's
     intrinsic content width (a chicken-and-egg that left the bar
     looking much shorter than the cell). Forcing `width: 100%`
     makes the cell consume the full content-box.

     `align-items: center` overrides the default `stretch` so the
     spend/cap text below the track shrinks to its own content width
     and centers itself under the bar — previously it stretched to
     fill the column and right-aligned to the cell edge, making the
     percentages appear off-center against the bar above. The track
     stays full-width because it has its own `width: 100%` (an
     explicit width wins over `align-items: stretch` on the parent).

     The track itself inherits the cell's 12px inline padding on
     both sides — symmetric whitespace reads as deliberate padding
     rather than uneven dead space, matching the rendered grid lines. */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
  width: 100%;
  padding: 4px 0;
}
.progress-track {
  position: relative;
  width: 100%;
  height: 16px;
  /* Default track background — slightly darker than
     `--cds-alias-object-app-background` (#f4f4f4) so the empty
     portion of the bar stays visible at 0% / 0-of-cap, where the
     previous app-background grey was nearly indistinguishable from
     the surrounding cell. Uses `--cds-alias-object-border-color`
     (#e8e8e8) — the same border grey used elsewhere in the app —
     so the empty track reads as a soft inline rail without
     introducing a new colour. */
  background: var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 4px;
  overflow: hidden;
  min-width: 0;
  flex-shrink: 0;
}
.progress-fill {
  height: 100%;
  transition: width 200ms ease-out;
}
/* Centered percentage label sitting on top of the track. absolute-
   centered via top/left + translate so it works regardless of
   track width. `text-shadow` halo keeps the label legible whether
   it sits over the filled (dark) or unfilled (light) portion of
   the bar — the bar's colour varies per threshold (green/amber/
   red), so we can't pick a single text colour that works for all
   three. The halo gives a soft white outline that contrasts with
   any underlying fill. */
.progress-percent {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  text-shadow:
    0 0 4px rgba(255, 255, 255, 0.95),
    0 0 2px rgba(255, 255, 255, 0.95);
  pointer-events: none;
  white-space: nowrap;
}
.progress-text {
  /* Spend/cap label sits below the track as a single line; tabular-
     nums so "0 / 1223" and "100 / 1223" don't reflow when values
     change. font-size 11px to keep it visually subordinate to the
     centered percentage on the track above.

     `flex: 0 0 auto` (instead of stretching to fill the column)
     paired with the parent `.progress-cell`'s `align-items: center`
     centers the text element under the track. `text-align: center`
     is the belt-and-braces fallback in case the text wraps onto a
     second line on a very narrow cell — otherwise the second line
     would left-justify within the auto-width container. */
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 11px;
  text-align: center;
}
.agent-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.agent-cell > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.name-cell .key-name {
  flex: 1 1 auto;
  min-width: 0;
}
.models-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  /* No max-height cap: rows grow vertically when a key allows many models
     so every badge stays visible. Column header sort/filter chrome remains
     pinned to the first row of the grid (handled by <cds-grid>), so a
     taller row only affects that specific row, not the table chrome. */
  align-items: center;
}
.model-badge {
  /* Match the info-blue chip treatment used by SupplierModelView's
     `.specs-link-pill` (SupplierModelView.vue:1022-1056): a soft blue-50
     fill with an info-blue border + text. Replaces the cds-badge default
     neutral shade (#3a4d55 — a heavy dark slate) which read as a "tag"
     rather than a chip and clashed with the row's white background.

     cds-badge exposes its colour as CSS custom properties on :host —
     setting `background` here directly would be overridden by the
     element's own `background: var(--background)` rule. Use the
     custom-property overrides instead (see
     node_modules/@cds/core/badge/badge.element.scss.js).

     Padding bumped from `0 var(--cds-global-space-2, ...)` (~0px
     inline at the 20px base) to a literal 14px inline via the
     `--padding` custom property — at the default cds padding the
     text sat flush against the border, reading cramped even though
     the column was wide enough. 14px inline gives roughly 4-5px of
     breathing room around the longest common model name
     (e.g. `claude-3-5-sonnet-20240620`) without forcing the cell to
     wrap two-line for the 3-badge inline budget at the 13% MODELS
     column width. font-size stays at 11px so cell density doesn't
     change. */
  --background: var(--cds-alias-object-app-blue-50, rgba(0, 114, 163, 0.08));
  --border-color: var(--cds-alias-status-info, #0079ad);
  --color: var(--cds-alias-status-info, #0079ad);
  --padding: 0 14px;
  font-size: 11px;
}
/* +N overflow trigger button. Sits next to the inline model badges in
   the cell and opens the popover on click. Mirrors the .model-badge
   info-blue chip look so the two read as a continuous treatment; the
   solid-fill hover state makes the "clickable" affordance obvious
   without screaming it. font-weight bumped to 600 so the `+N` glyph
   reads as a deliberate control rather than another label. */
.model-overflow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 18px;
  padding: 0 8px;
  margin: 0;
  border: 1px solid var(--cds-alias-status-info, #0079ad);
  border-radius: 999px;
  background: var(--cds-alias-object-app-blue-50, rgba(0, 114, 163, 0.08));
  color: var(--cds-alias-status-info, #0079ad);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  flex: 0 0 auto;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;
}
.model-overflow:hover {
  background: var(--cds-alias-status-info, #0079ad);
  color: #fff;
}
.model-overflow:focus-visible {
  outline: 2px solid var(--cds-alias-object-app-blue, #0072a3);
  outline-offset: 2px;
}
.models-cell .muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: 3px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--cds-alias-object-interaction-color, #006e9c);
  cursor: pointer;
}
.icon-action:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
/* STATUS column badge — centered horizontally in the cell via
   `margin: 0 auto`. `<cds-grid-cell>` lays out its slotted child as
   a flex item with `align-items: center`, so setting `display:
   flex` + `margin: 0 auto` makes the badge consume its own width
   (the `min-width: 62px` below) and stay centered regardless of the
   column width. The `min-width: 62px` keeps the three status labels
   (启用 / 禁用 / 已撤销) at a uniform pill width so the column
   doesn't shimmer when rows flip status. */
.status-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 62px;
  white-space: nowrap;
  margin: 0 auto;
}
.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  /* Don't let the action row be compressed by the grid cell's flex layout
     — the three icon+label buttons (重新生成 / 启用 or 禁用 / 删除) sit
     naturally at ~140px wide and the column may allocate less than that
     when several adjacent columns push for their intrinsic widths.
     flex-shrink:0 keeps the row intact; the cell will visually extend
     past its percentage width if needed, matching supplier-model. */
  flex-shrink: 0;
}
.row-action {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 40px;
  padding: 2px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--cds-alias-object-interaction-color, #006e9c);
  font: inherit;
  cursor: pointer;
}
.row-action span {
  font-size: 10px;
  line-height: 1.15;
  white-space: nowrap;
}
.row-action:focus-visible {
  outline: 2px solid var(--cds-alias-status-info, #0079ad);
  outline-offset: 1px;
}
.row-action:disabled,
.row-action.disabled {
  opacity: 0.55;
}
.row-action.danger {
  color: var(--cds-alias-status-danger, #c92100);
}
.revoked-note {
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 12px;
}
.menu-option {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 9px 14px;
  border: 0;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.menu-option:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.menu-option.danger {
  color: var(--cds-alias-status-danger, #c92100);
}
.filter-panel {
  min-width: 250px;
  padding: 8px;
}
/* Carbon <cds-input> host sits inside cds-dropdown's popup-content — by
   default the host shrinks to its label width because cds-input's
   user-agent shadow root forces `width: auto !important`. Force 100% so
   the inner native <input> stretches to the popup content width and
   matches the supplier-model "模型名称" filter's look. Mirrors the rule
   in SupplierModelView.vue that lines up the user/agent-name filter
   inputs across the two filter pages. */
.filter-panel > cds-input {
  width: 100%;
  box-sizing: border-box;
}
.filter-panel > cds-input > input {
  width: 100%;
  box-sizing: border-box;
}
.filter-options {
  display: flex;
  flex-direction: column;
  margin: -4px;
}
.filter-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.filter-option:hover,
.filter-option.active {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.filter-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
}
.selected-summary {
  color: var(--cds-alias-typography-color-300, #565656);
}
.pager {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  white-space: nowrap;
}
.pager > label,
.pager-summary {
  color: var(--cds-alias-typography-color-300, #565656);
}
.spinning {
  animation: virtual-key-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes virtual-key-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
/* TIME_INFO cell — single-line summary (datetime + inline "更多"
   chevron affordance that opens the per-key detail drawer). The
   cell container is a non-interactive <div> so the inner button
   can carry the keyboard / click semantics without nesting
   interactive elements (which is invalid HTML and trips a11y
   tools). The grid cell wrapper forces overflow:hidden +
   min-width:0 (see `.virtual-key-page cds-grid-cell` above) so the
   ellipsis on `.time-info-value` clamps cleanly when the column
   shrinks. */
.time-info-cell {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 4px 6px;
  margin: 0;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  min-width: 0;
}
.time-info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
}
.time-info-value {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Inline "更多 ▸" affordance — sits on the same line as the
   timestamp, rendered as a link-style button (transparent
   background, primary-tinted text) so it reads as a secondary
   action without competing with the row's primary affordance
   (row actions in the 操作 column). The trailing chevron makes
   the "opens detail" intent unambiguous on hover. */
.time-info-more {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--cds-alias-object-interaction-color, #006e9c);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  border-radius: 2px;
  white-space: nowrap;
}
.time-info-more-label {
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
}
.time-info-more:hover .time-info-more-label {
  text-decoration-thickness: 2px;
}
.time-info-more:focus-visible {
  outline: 2px solid var(--cds-alias-object-app-blue, #0072a3);
  outline-offset: 2px;
}

/* Detail drawer (TIME_INFO cell click). Teleported to <body> so the
   layout container's overflow / transform stacking contexts can't clip
   the panel. Mask + panel are fixed to viewport; on viewports under
   640px the panel snaps to bottom (full-width sheet) so thumb-tap
   targets stay reachable. */
.vk-detail-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  z-index: 9000;
  display: flex;
  justify-content: flex-end;
}
.vk-detail {
  width: 360px;
  max-width: 90vw;
  height: 100%;
  background: var(--cds-alias-object-app-background, #ffffff);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.vk-detail-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
}
.vk-detail-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.vk-detail-name {
  font-weight: 400;
  color: var(--cds-alias-typography-color-300, #565656);
}
.vk-detail-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  cursor: pointer;
}
.vk-detail-close:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.vk-detail-close:focus-visible {
  outline: 2px solid var(--cds-alias-object-app-blue, #0072a3);
  outline-offset: 2px;
}
.vk-detail-list {
  flex: 1 1 auto;
  margin: 0;
  padding: 12px 16px;
  overflow-y: auto;
}
.vk-detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 0;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
}
.vk-detail-item:last-child {
  border-bottom: 0;
}
.vk-detail-item dt {
  margin: 0;
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
}
.vk-detail-item dd {
  margin: 0;
  font-size: 14px;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font-variant-numeric: tabular-nums;
}
.vk-detail-empty {
  margin-left: 6px;
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
}
/* Models +N popover. Teleported to <body> so the grid's overflow /
   transform contexts can't clip the panel; the inline :style block
   on the panel sets fixed coords from the trigger button's
   getBoundingClientRect. z-index 8500 sits between cds-grid (7000)
   and the TIME_INFO detail drawer (9000) so a future scenario where
   both might be on screen still layers the drawer above the popover.
   Border + shadow match the supplier-model app look for a consistent
   popup vocabulary across pages. */
.models-popover {
  position: fixed;
  z-index: 8500;
  min-width: 220px;
  max-width: 320px;
  max-height: 240px;
  overflow-y: auto;
  padding: 6px 8px;
  background: var(--cds-alias-object-app-background, #ffffff);
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  font-size: 12px;
}
.models-popover-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.models-popover-list li {
  padding: 3px 6px;
  border-radius: 4px;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  /* Mono so model ids (claude-3-5-sonnet-20240620, gpt-4-turbo-...)
     align column-wise and remain scannable when the list scrolls. */
  font-family: var(--cds-alias-typography-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11.5px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.models-popover-list li:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
@media (max-width: 640px) {
  .vk-detail-mask {
    align-items: flex-end;
    justify-content: center;
  }
  .vk-detail {
    width: 100%;
    max-width: 100%;
    height: auto;
    max-height: 80vh;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.12);
  }
}
</style>