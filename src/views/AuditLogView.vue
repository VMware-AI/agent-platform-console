<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import AppDropdown from '@/components/AppDropdown.vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import {
  AUDIT_LOGS_QUERY,
  type AuditLogNode,
  type AuditLogsResult,
  type AuditLogsVars,
} from '@/api/graphql/queries/audit-logs'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

// Action categories the backend records (dotted prefixes — see `r.audit(ctx, ...)`
// call sites in agent-platform-backend/internal/graph). Sourced by grepping the
// resolvers for the leading category of every audited action. `ALL` is a UI-only
// sentinel that clears the actionPrefix filter.
const ACTION_PREFIXES = [
  'user.',
  'role.',
  'key.',
  'rate_limit.',
  'model_gateway.',
  'gateway.',
  'model_route.',
  'upstream.',
  'router.',
  'agent.',
  'agent_config.',
  'agent_template.',
  'resource_pool.',
  'ova_template_family.',
  'ova_template_version.',
  'department.',
  'membership.',
  'artifact.',
  'skill.',
  'image.',
] as const
type ActionPrefix = (typeof ACTION_PREFIXES)[number]

const pageSize = ref<PageSize>(20)
const currentPage = ref(1)
const actionPrefix = ref<ActionPrefix | null>(null)
const search = ref('')
const actorUserId = ref('')
// `expandedId` tracks the single row whose detail panel is open.
const expandedId = ref<string | null>(null)

// `useQuery` reacts to this computed: changing any filter or the page re-runs the
// server query with fresh offset/limit. Empty strings become null so the backend
// treats them as "no filter" rather than matching the empty string.
const queryVars = computed<AuditLogsVars>(() => ({
  filter: {
    actionPrefix: actionPrefix.value,
    search: search.value.trim() || null,
    actorUserId: actorUserId.value.trim() || null,
  },
  page: {
    limit: pageSize.value,
    offset: (currentPage.value - 1) * pageSize.value,
  },
}))

const { result, loading, error, refetch } = useQuery<AuditLogsResult, AuditLogsVars>(
  AUDIT_LOGS_QUERY,
  queryVars,
  () => ({ fetchPolicy: 'cache-and-network' }),
)

const logs = computed<AuditLogNode[]>(() => result.value?.auditLogs.items ?? [])
const totalCount = computed(() => result.value?.auditLogs.total ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))

const summaryText = computed(() => {
  const start = totalCount.value === 0 ? 0 : (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(currentPage.value * pageSize.value, totalCount.value)
  return locale
    .t('auditLog.pagination.summary')
    .replace('{start}', String(start))
    .replace('{end}', String(end))
    .replace('{total}', String(totalCount.value))
})

const hasActiveFilters = computed(
  () =>
    actionPrefix.value !== null ||
    Boolean(search.value.trim()) ||
    Boolean(actorUserId.value.trim()),
)

// A failed page (e.g. server out of range after a filter narrowed the result)
// should snap back to the last valid page rather than show an empty grid.
watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})

const errorMessage = computed(() =>
  error.value ? graphqlErrorMessage(error.value, locale.t('auditLog.error.load')) : null,
)

// Backend timestamps are ISO strings; render a compact local date-time, falling
// back to the raw value if it is not parseable.
function formatDateTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(locale.locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(parsed)
}

// The backend stores result as a free string; "success" is the success marker
// (see audit() helper). Anything else renders as a failure badge.
function isSuccess(value: string): boolean {
  return value.toLowerCase() === 'success' || value.toLowerCase() === 'true'
}

function actionPrefixLabel(prefix: ActionPrefix): string {
  // Reuse a generic label keyed by the raw prefix; unknown prefixes fall back to
  // the prefix text itself.
  const key = `auditLog.category.${prefix.replace(/\.$/, '')}`
  const label = locale.t(key)
  return label === key ? prefix : label
}

function setActionPrefix(value: ActionPrefix | null, close: () => void) {
  actionPrefix.value = value
  currentPage.value = 1
  close()
}

function setSearch(value: string) {
  search.value = value
  currentPage.value = 1
}

function setActorUserId(value: string) {
  actorUserId.value = value
  currentPage.value = 1
}

function clearFilters() {
  actionPrefix.value = null
  search.value = ''
  actorUserId.value = ''
  currentPage.value = 1
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

async function refresh() {
  if (loading.value) return
  try {
    await refetch()
    toast.success(locale.t('auditLog.toast.refreshed'))
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('auditLog.toast.refreshFailed')))
  }
}

function onPageSizeChange(event: Event) {
  const next = Number((event.target as HTMLSelectElement).value)
  if (!PAGE_SIZE_OPTIONS.includes(next as PageSize)) return
  pageSize.value = next as PageSize
  currentPage.value = 1
}

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
}
</script>

<template>
  <section class="audit-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('auditLog.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('auditLog.description') }}</p>
    </header>

    <div class="content-card">
      <div class="toolbar">
        <AppDropdown align="start">
          <template #trigger>
            <cds-button action="outline">
              <cds-icon shape="filter" size="sm" aria-hidden="true"></cds-icon>
              {{
                actionPrefix
                  ? actionPrefixLabel(actionPrefix)
                  : locale.t('auditLog.filter.category')
              }}
              <cds-icon shape="angle" direction="down" size="sm" aria-hidden="true"></cds-icon>
            </cds-button>
          </template>
          <template #default="{ close }">
            <button
              class="menu-option"
              type="button"
              :class="{ active: actionPrefix === null }"
              @click="setActionPrefix(null, close)"
            >
              <span>{{ locale.t('auditLog.filter.allCategories') }}</span>
              <cds-icon v-if="actionPrefix === null" shape="check" size="sm"></cds-icon>
            </button>
            <button
              v-for="prefix in ACTION_PREFIXES"
              :key="prefix"
              class="menu-option"
              type="button"
              :class="{ active: actionPrefix === prefix }"
              @click="setActionPrefix(prefix, close)"
            >
              <span>{{ actionPrefixLabel(prefix) }}</span>
              <cds-icon v-if="actionPrefix === prefix" shape="check" size="sm"></cds-icon>
            </button>
          </template>
        </AppDropdown>

        <cds-input control-width="shrink" class="filter-field">
          <input
            type="search"
            :value="search"
            :placeholder="locale.t('auditLog.filter.searchPlaceholder')"
            :aria-label="locale.t('auditLog.filter.searchPlaceholder')"
            @input="setSearch(($event.target as HTMLInputElement).value)"
          />
        </cds-input>

        <cds-input control-width="shrink" class="filter-field">
          <input
            type="text"
            :value="actorUserId"
            :placeholder="locale.t('auditLog.filter.actorPlaceholder')"
            :aria-label="locale.t('auditLog.filter.actorPlaceholder')"
            @input="setActorUserId(($event.target as HTMLInputElement).value)"
          />
        </cds-input>

        <cds-button
          v-if="hasActiveFilters"
          action="ghost"
          size="sm"
          @click="clearFilters"
        >
          {{ locale.t('auditLog.filter.clear') }}
        </cds-button>

        <cds-button
          action="ghost"
          class="refresh-button"
          :disabled="loading"
          :aria-label="locale.t('auditLog.action.refresh')"
          :title="locale.t('auditLog.action.refresh')"
          @click="refresh"
        >
          <cds-icon shape="refresh" size="md" :class="{ spinning: loading }"></cds-icon>
          <span>{{ locale.t('auditLog.action.refresh') }}</span>
        </cds-button>
      </div>

      <div v-if="errorMessage" class="error-banner" role="alert">
        <cds-icon shape="error-standard" size="sm"></cds-icon>
        <span>{{ errorMessage }}</span>
      </div>

      <div class="grid-card">
        <cds-grid
          border="row"
          column-layout="flex"
          role="grid"
          :aria-label="locale.t('auditLog.table.label')"
        >
          <cds-grid-column width="180px">{{ locale.t('auditLog.col.time') }}</cds-grid-column>
          <cds-grid-column width="14%">{{ locale.t('auditLog.col.actor') }}</cds-grid-column>
          <cds-grid-column width="18%">{{ locale.t('auditLog.col.action') }}</cds-grid-column>
          <cds-grid-column width="22%">{{ locale.t('auditLog.col.resource') }}</cds-grid-column>
          <cds-grid-column width="100px">{{ locale.t('auditLog.col.result') }}</cds-grid-column>
          <cds-grid-column width="120px">{{ locale.t('auditLog.col.ip') }}</cds-grid-column>
          <cds-grid-column width="80px" :resizable="false">
            {{ locale.t('auditLog.col.detail') }}
          </cds-grid-column>

          <template v-for="log in logs" :key="log.id">
            <cds-grid-row>
              <cds-grid-cell>
                <span class="time-cell">{{ formatDateTime(log.createdAt) }}</span>
              </cds-grid-cell>
              <cds-grid-cell>
                <span class="ellipsis" :title="log.actorUserId ?? ''">
                  {{ log.actorUserId ?? locale.t('auditLog.value.system') }}
                </span>
              </cds-grid-cell>
              <cds-grid-cell>
                <code class="action-code" :title="log.action">{{ log.action }}</code>
              </cds-grid-cell>
              <cds-grid-cell>
                <span class="ellipsis" :title="`${log.resourceType ?? ''} ${log.resourceId ?? ''}`">
                  <span v-if="log.resourceType" class="resource-type">{{ log.resourceType }}</span>
                  <span v-if="log.resourceId" class="resource-id">{{ log.resourceId }}</span>
                  <span v-if="!log.resourceType && !log.resourceId" class="muted">—</span>
                </span>
              </cds-grid-cell>
              <cds-grid-cell>
                <cds-badge :status="isSuccess(log.result) ? 'success' : 'danger'" class="status-badge">
                  <cds-icon
                    :shape="isSuccess(log.result) ? 'check-circle' : 'times-circle'"
                    size="sm"
                  ></cds-icon>
                  {{
                    locale.t(
                      isSuccess(log.result) ? 'auditLog.result.success' : 'auditLog.result.fail',
                    )
                  }}
                </cds-badge>
              </cds-grid-cell>
              <cds-grid-cell>
                <span class="ellipsis muted" :title="log.ip ?? ''">{{ log.ip ?? '—' }}</span>
              </cds-grid-cell>
              <cds-grid-cell>
                <button
                  v-if="log.detail"
                  type="button"
                  class="detail-toggle"
                  :aria-expanded="expandedId === log.id"
                  :aria-label="locale.t('auditLog.action.toggleDetail')"
                  @click="toggleExpand(log.id)"
                >
                  <cds-icon
                    shape="angle"
                    :direction="expandedId === log.id ? 'up' : 'down'"
                    size="sm"
                  ></cds-icon>
                </button>
                <span v-else class="muted">—</span>
              </cds-grid-cell>
            </cds-grid-row>

            <cds-grid-row v-if="expandedId === log.id && log.detail" :key="`${log.id}-detail`">
              <cds-grid-cell class="detail-cell">
                <pre class="detail-panel">{{ log.detail }}</pre>
              </cds-grid-cell>
            </cds-grid-row>
          </template>

          <cds-grid-placeholder v-if="logs.length === 0 && loading">
            <cds-icon shape="history" size="xl"></cds-icon>
            <p cds-text="subsection">{{ locale.t('auditLog.loading') }}</p>
          </cds-grid-placeholder>

          <cds-grid-placeholder v-else-if="logs.length === 0">
            <cds-icon shape="list" size="xl"></cds-icon>
            <p cds-text="subsection">
              {{ hasActiveFilters ? locale.t('auditLog.emptyFiltered') : locale.t('auditLog.empty') }}
            </p>
            <cds-button v-if="hasActiveFilters" action="outline" size="sm" @click="clearFilters">
              {{ locale.t('auditLog.filter.clear') }}
            </cds-button>
          </cds-grid-placeholder>

          <cds-grid-footer v-if="totalCount > 0">
            <div class="pager">
              <label for="audit-page-size">{{ locale.t('auditLog.pagination.pageSize') }}</label>
              <cds-select control-width="shrink">
                <select
                  id="audit-page-size"
                  :value="pageSize"
                  :aria-label="locale.t('auditLog.pagination.pageSize')"
                  @change="onPageSizeChange"
                >
                  <option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
              </cds-select>
              <span class="pager-summary">{{ summaryText }}</span>
              <cds-pagination :aria-label="locale.t('auditLog.pagination.label')">
                <cds-pagination-button
                  action="first"
                  :disabled="currentPage <= 1"
                  :aria-label="locale.t('auditLog.pager.first')"
                  @click="goToPage(1)"
                ></cds-pagination-button>
                <cds-pagination-button
                  action="prev"
                  :disabled="currentPage <= 1"
                  :aria-label="locale.t('auditLog.pager.prev')"
                  @click="goToPage(currentPage - 1)"
                ></cds-pagination-button>
                <cds-input cds-pagination-number>
                  <input
                    type="number"
                    :value="currentPage"
                    :min="1"
                    :max="totalPages"
                    :aria-label="locale.t('auditLog.pager.page')"
                    @change="goToPage(Number(($event.target as HTMLInputElement).value))"
                  />
                </cds-input>
                <cds-pagination-button
                  action="next"
                  :disabled="currentPage >= totalPages"
                  :aria-label="locale.t('auditLog.pager.next')"
                  @click="goToPage(currentPage + 1)"
                ></cds-pagination-button>
                <cds-pagination-button
                  action="last"
                  :disabled="currentPage >= totalPages"
                  :aria-label="locale.t('auditLog.pager.last')"
                  @click="goToPage(totalPages)"
                ></cds-pagination-button>
              </cds-pagination>
            </div>
          </cds-grid-footer>
        </cds-grid>
      </div>
    </div>
  </section>
</template>

<style scoped>
.audit-page {
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
.content-card {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 6px;
  background: var(--cds-alias-object-container-background, #fff);
  margin-top: 20px;
}
.toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.filter-field {
  min-width: 200px;
}
.refresh-button {
  margin-left: auto;
}
.error-banner {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--cds-alias-status-danger, #c92100);
  border-radius: 4px;
  color: var(--cds-alias-status-danger, #c92100);
  background: color-mix(in srgb, var(--cds-alias-status-danger, #c92100) 8%, transparent);
  font-size: 13px;
}
.grid-card {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 4px;
}
.audit-page cds-grid {
  display: block;
  width: 100%;
  min-width: 920px;
  min-height: 100%;
}
.time-cell {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.action-code {
  font-family:
    ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.resource-type {
  color: var(--cds-alias-typography-color-300, #565656);
  margin-right: 6px;
}
.resource-id {
  font-family:
    ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.detail-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--cds-alias-object-interaction-color, #006e9c);
  cursor: pointer;
}
.detail-toggle:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
/* Expanded detail spans every column track (Clarity's cds-grid-cell ignores
   colspan; grid-column 1/-1 is the supported full-width pattern). */
.detail-cell {
  grid-column: 1 / -1;
}
.detail-panel {
  margin: 0;
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family:
    ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  background: var(--cds-alias-object-app-background, #f4f4f4);
  border-radius: 3px;
}
.menu-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 9px 14px;
  border: 0;
  background: transparent;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.menu-option:hover,
.menu-option.active {
  background: var(--cds-alias-object-app-background, #f4f4f4);
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
  animation: audit-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes audit-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 900px) {
  .refresh-button span {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>
