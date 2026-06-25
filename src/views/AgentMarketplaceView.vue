<script setup lang="ts">
/**
 * Agent Marketplace view (`/agents/marketplace`).
 *
 * Renders the global OvaTemplateFamily directory as a card grid. Each
 * family has multiple versions; selecting "创建智能体" opens a deploy
 * dialog where the user picks a specific version, a target resource
 * pool, a model gateway, an existing or new virtual key, and the
 * run-as username/password.
 */
import { computed, ref } from 'vue'
import { useMutation, useQuery } from '@vue/apollo-composable'
import { useRouter } from 'vue-router'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import {
  OVA_TEMPLATE_FAMILIES_QUERY,
  CREATE_OVA_TEMPLATE_FAMILY_MUTATION,
  DEPLOY_AGENT_MUTATION,
} from '@/api/graphql/queries/ovaTemplates'
import { RESOURCE_POOLS_QUERY } from '@/api/graphql/queries/resourcePools'
import { MODEL_GATEWAYS_QUERY } from '@/api/graphql/queries/model-gateways'
import type {
  AgentType,
  OvaTemplateFamily,
  OvaTemplateFamilyFilter,
  OvaTemplateFamiliesQueryResult,
  OvaTemplateFamiliesQueryVars,
  CreateOvaTemplateFamilyInput,
  CreateOvaTemplateFamilyPayload,
  CreateOvaTemplateFamilyVars,
  DeployAgentInput,
  DeployAgentPayload,
  DeployAgentVars,
  ModelGatewayRef,
  OvaTemplateColor,
  ResourcePool,
  ResourcePoolsQueryResult,
  ResourcePoolsQueryVars,
} from '@/api/graphql/types'
import '@/components/icons'
import AddOvaTemplateDialog from './marketplace/AddOvaTemplateDialog.vue'
import DeployAgentDialog from './marketplace/DeployAgentDialog.vue'

const locale = useLocaleStore()
const toast = useToast()
const router = useRouter()

/* ---- OvaTemplateFamily list state ---- */
const nameKeyword = ref('')
/** 'all' = 不按类型过滤; 其他值为 OvaTemplateFamilyFilter.type 的入参 */
const typeFilter = ref<AgentType | 'all'>('all')
const typeFilterAnchor = ref<HTMLElement | null>(null)
const currentPage = ref(1)
const PAGE_SIZE_OPTIONS = [6, 12, 18, 24] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
const pageSize = ref<PageSize>(6)

const filter = computed<OvaTemplateFamilyFilter | null>(() => {
  const f: OvaTemplateFamilyFilter = {}
  if (nameKeyword.value.trim()) f.nameKeyword = nameKeyword.value.trim()
  if (typeFilter.value !== 'all') f.type = typeFilter.value
  return Object.keys(f).length > 0 ? f : null
})

const variables = computed<OvaTemplateFamiliesQueryVars>(() => ({
  filter: filter.value ?? undefined,
  pagination: { page: currentPage.value, pageSize: pageSize.value },
  sort: undefined,
}))

const { result, loading, error, refetch } = useQuery<OvaTemplateFamiliesQueryResult, OvaTemplateFamiliesQueryVars>(
  OVA_TEMPLATE_FAMILIES_QUERY,
  variables,
  () => ({ fetchPolicy: 'cache-and-network' }),
)

const families = computed<OvaTemplateFamily[]>(
  () => result.value?.ovaTemplateFamilies.nodes ?? [],
)
const totalCount = computed(() => result.value?.ovaTemplateFamilies.totalCount ?? 0)
const totalPages = computed(() => {
  const t = totalCount.value
  if (t === 0) return 1
  return Math.max(1, Math.ceil(t / pageSize.value))
})

/* ---- Resource Pools (for deploy dialog) ---- */
const poolsResult = useQuery<ResourcePoolsQueryResult, ResourcePoolsQueryVars>(
  RESOURCE_POOLS_QUERY,
  () => ({ pagination: { page: 1, pageSize: 100 } }),
  () => ({ fetchPolicy: 'cache-and-network' }),
)
const pools = computed<ResourcePool[]>(() => poolsResult.result.value?.resourcePools.nodes ?? [])

/* ---- Model Gateways (for the deploy dialog dropdown), from the real backend. ---- */
const modelGateways = computed<ModelGatewayRef[]>(() => {
  const result = gatewaysResult.result.value as { modelGateways?: { nodes: ModelGatewayRef[] } } | null
  return result?.modelGateways?.nodes ?? []
})
const gatewaysResult = useQuery<{ modelGateways: { nodes: ModelGatewayRef[] } }>(
  MODEL_GATEWAYS_QUERY,
  () => ({}),
  () => ({ fetchPolicy: 'cache-and-network' }),
)

/* ---- Pager helpers ---- */
function goToPage(p: number) {
  if (p >= 1 && p <= totalPages.value) currentPage.value = p
}
function onPrevPage() {
  goToPage(currentPage.value - 1)
}
function onNextPage() {
  goToPage(currentPage.value + 1)
}
function onPageInput(e: Event) {
  const n = parseInt((e.target as HTMLInputElement).value, 10)
  if (Number.isFinite(n)) goToPage(n)
}
function onNameKeywordInput(e: Event) {
  nameKeyword.value = (e.target as HTMLInputElement).value
  currentPage.value = 1
}

/* ---- Type filter (toolbar dropdown) ----
   Mirrors AgentListView's openFilter / closeFilter / setTypeFilter pattern.
   `closest('cds-button')` lifts the click target to the outer host
   so cds-dropdown can position its popover against the trigger. */
function toggleTypeFilter(target: EventTarget | null) {
  if (typeFilterAnchor.value) {
    typeFilterAnchor.value = null
    return
  }
  const host = (target as HTMLElement | null)?.closest(
    'cds-button',
  ) as HTMLElement | null
  typeFilterAnchor.value = host ?? (target as HTMLElement | null)
}
function closeTypeFilter() {
  typeFilterAnchor.value = null
}
function setTypeFilter(value: AgentType | 'all') {
  typeFilter.value = value
  typeFilterAnchor.value = null
  currentPage.value = 1
}
const summaryText = computed(() => {
  const total = totalCount.value
  if (total === 0) return ''
  const size = pageSize.value
  const start = (currentPage.value - 1) * size + 1
  const end = Math.min(currentPage.value * size, total)
  return locale
    .t('marketplace.pager.summary')
    .replace('{start}', String(start))
    .replace('{end}', String(end))
    .replace('{total}', String(total))
})

/* ---- Create template ---- */
const { mutate: createMutate, loading: creating } = useMutation<CreateOvaTemplateFamilyPayload, CreateOvaTemplateFamilyVars>(
  CREATE_OVA_TEMPLATE_FAMILY_MUTATION,
)
const createDialogOpen = ref(false)
function openCreateDialog() {
  createDialogOpen.value = true
}
function closeCreateDialog() {
  createDialogOpen.value = false
}
async function onSubmitCreate(payload: CreateOvaTemplateFamilyInput) {
  try {
    const r = await createMutate({ input: payload })
    const fam = r?.data?.family
    if (fam) {
      toast.success(
        locale.t('marketplace.toast.createFamilyOk').replace('{name}', fam.name),
      )
      closeCreateDialog()
      currentPage.value = 1
      await refetch()
    }
  } catch (err) {
     
    console.error('[marketplace] create failed', err)
    const code = (err as { graphQLErrors?: Array<{ extensions?: { code?: string } }> })?.graphQLErrors?.[0]?.extensions?.code
    if (code === 'OVA_NAME_TAKEN') {
      toast.error(locale.t('marketplace.form.error.nameTaken'))
    } else if (code === 'OVA_IDENTIFIER_FORMAT') {
      toast.error(locale.t('marketplace.form.error.ovaIdentifierFormat'))
    } else {
      toast.error(locale.t('marketplace.toast.createFamilyFail'))
    }
  }
}

/* ---- Deploy agent ---- */
const { mutate: deployMutate, loading: deploying } = useMutation<DeployAgentPayload, DeployAgentVars>(
  DEPLOY_AGENT_MUTATION,
)
const deployDialogOpen = ref(false)
const deployingTemplate = ref<OvaTemplateFamily | null>(null)

function onViewDetails(_t: OvaTemplateFamily) {
  toast.info(locale.t('marketplace.toast.viewPlaceholder'))
}
function onCreateAgent(t: OvaTemplateFamily) {
  if (pools.value.length === 0) {
    toast.warning(locale.t('marketplace.toast.deployPoolEmpty'))
    return
  }
  if (modelGateways.value.length === 0) {
    toast.warning(locale.t('marketplace.toast.deployGatewayEmpty'))
    return
  }
  deployingTemplate.value = t
  deployDialogOpen.value = true
}
function closeDeployDialog() {
  deployDialogOpen.value = false
  deployingTemplate.value = null
}
async function onSubmitDeploy(payload: DeployAgentInput) {
  try {
    const r = await deployMutate({ input: payload })
    const agent = r?.data?.agent
    if (agent) {
      toast.success(
        locale
          .t('marketplace.toast.deployOk')
          .replace('{name}', agent.name)
          .replace('{username}', agent.credentials.username),
      )
      // 把用户名+密码一次性 toast 出来（vSphere 上跑只能看这一次）
      toast.info(
        locale
          .t('marketplace.toast.credentialsReveal')
          .replace('{name}', agent.name)
          .replace('{username}', agent.credentials.username)
          .replace('{password}', payload.password),
      )
      closeDeployDialog()
      await router.push({ name: 'agents.list' })
    }
  } catch (err) {
     
    console.error('[marketplace] deploy failed', err)
    const code = (err as { graphQLErrors?: Array<{ extensions?: { code?: string } }> })?.graphQLErrors?.[0]?.extensions?.code
    if (code === 'DEPLOY_FAILED') {
      const msg = (err as { graphQLErrors?: Array<{ message?: string }> })?.graphQLErrors?.[0]?.message ?? ''
      if (msg.includes('用户名已被占用')) {
        toast.error(locale.t('marketplace.deploy.error.usernameTaken'))
      } else {
        toast.error(msg || locale.t('marketplace.toast.deployFail'))
      }
    } else {
      toast.error(locale.t('marketplace.toast.deployFail'))
    }
  }
}

/* ---- Card icon styling ---- */
const ICON_COLORS: Record<OvaTemplateColor, { bg: string; fg: string }> = {
  BLUE:   { bg: '#e3f0ff', fg: '#1e6fcc' },
  PURPLE: { bg: '#f0e6ff', fg: '#7c3aed' },
  ORANGE: { bg: '#fff2e0', fg: '#d97706' },
  GREEN:  { bg: '#e6f4ea', fg: '#1a8a4a' },
  RED:    { bg: '#ffeaea', fg: '#c2380f' },
  CYAN:   { bg: '#e0f7fa', fg: '#0891b2' },
}
function iconStyleFor(t: OvaTemplateFamily): Record<string, string> {
  const c = ICON_COLORS[t.iconColor] ?? ICON_COLORS.BLUE
  return { background: c.bg, color: c.fg }
}

const ICON_SHAPE_TO_CLARITY: Record<string, string> = {
  wrench: 'wrench',
  'talk-bubbles': 'talk-bubbles',
  'pop-out': 'pop-out',
  atom: 'atom',
  book: 'book',
  world: 'world',
  'line-chart': 'line-chart',
}

const TYPE_KEY_BY_GQL = {
  GENERAL_CHAT: 'general-chat',
  IMAGE_GENERATION: 'image-generation',
  BASIC_LLM: 'basic-llm',
  OPENCLAW: 'openclaw',
  HERMES: 'hermes',
  CLAUDE_CODE: 'claude-code',
  XIAOGUAI: 'xiaoguai',
  QCODER: 'qcoder',
  OPENCODE: 'opencode',
} as const

/* Options for the toolbar "按类型筛选" dropdown. `value` is the GraphQL
   enum value (or the 'all' sentinel) sent to OvaTemplateFamilyFilter.type. */
const TYPE_OPTIONS: Array<{ value: AgentType | 'all'; labelKey: string }> = [
  { value: 'all',             labelKey: 'marketplace.toolbar.typeFilterAll' },
  { value: 'GENERAL_CHAT',    labelKey: 'marketplace.type.general-chat' },
  { value: 'IMAGE_GENERATION',labelKey: 'marketplace.type.image-generation' },
  { value: 'BASIC_LLM',       labelKey: 'marketplace.type.basic-llm' },
  { value: 'OPENCLAW',        labelKey: 'marketplace.type.openclaw' },
  { value: 'HERMES',          labelKey: 'marketplace.type.hermes' },
  { value: 'CLAUDE_CODE',     labelKey: 'marketplace.type.claude-code' },
  { value: 'XIAOGUAI',        labelKey: 'marketplace.type.xiaoguai' },
  { value: 'QCODER',          labelKey: 'marketplace.type.qcoder' },
  { value: 'OPENCODE',        labelKey: 'marketplace.type.opencode' },
]

const typeFilterLabel = computed(() => {
  const opt = TYPE_OPTIONS.find((o) => o.value === typeFilter.value)
  return opt ? locale.t(opt.labelKey) : ''
})

</script>

<template>
  <section class="marketplace">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('marketplace.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('marketplace.description') }}</p>
    </header>

    <section class="toolbar">
      <div class="toolbar-left">
        <cds-button
          class="toolbar-create"
          action="outline"
          status="primary"
          :disabled="creating"
          @click="openCreateDialog"
        >
          <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
          {{ locale.t('marketplace.toolbar.create') }}
        </cds-button>
        <cds-button
          class="toolbar-type-filter"
          action="flat"
          status="primary"
          :aria-label="locale.t('marketplace.toolbar.typeFilter')"
          @click="(e: MouseEvent) => toggleTypeFilter(e.currentTarget)"
        >
          <cds-icon shape="filter" size="sm" aria-hidden="true"></cds-icon>
          <span class="toolbar-type-filter-label">{{ typeFilterLabel }}</span>
          <cds-icon shape="angle" direction="down" size="sm" aria-hidden="true"></cds-icon>
        </cds-button>
      </div>
      <div class="toolbar-search">
        <cds-icon
          class="toolbar-search-icon"
          shape="search"
          size="sm"
          aria-hidden="true"
        ></cds-icon>
        <input
          type="search"
          class="toolbar-search-input"
          :value="nameKeyword"
          :placeholder="locale.t('marketplace.toolbar.search')"
          :aria-label="locale.t('marketplace.toolbar.search')"
          @input="onNameKeywordInput"
        />
      </div>
    </section>

    <cds-alert
      v-if="error"
      status="danger"
      closable
      @closeChange="error = null"
      class="page-alert"
    >
      <cds-alert-content>{{ locale.t('marketplace.error') }}</cds-alert-content>
    </cds-alert>

    <div
      v-if="loading && families.length === 0"
      cds-layout="vertical p:xl gap:sm align:horizontal-center"
      class="placeholder"
    >
      <cds-progress-circle size="xl" status="info"></cds-progress-circle>
      <p cds-text="subsection" class="muted">{{ locale.t('marketplace.loading') }}</p>
    </div>

    <div
      v-else-if="!error && families.length === 0"
      cds-layout="vertical p:xl gap:sm align:horizontal-center"
      class="placeholder"
    >
      <cds-icon shape="history" size="xxl" class="placeholder-icon"></cds-icon>
      <p cds-text="subsection" class="muted">{{ locale.t('marketplace.empty') }}</p>
      <cds-button action="outline" @click="openCreateDialog">
        {{ locale.t('marketplace.toolbar.create') }}
      </cds-button>
    </div>

    <!-- `.card-scroll` owns the vertical scroll so the grid can be
         arbitrarily tall (e.g. pageSize = 12/18/24) without pushing the
         pager down past the visible area. It sits between the toolbar
         and the pager as a flex child with `flex: 1; min-height: 0`,
         taking whatever vertical space is left over. -->
    <div v-else class="card-scroll">
      <div class="card-grid">
      <cds-card v-for="tpl in families" :key="tpl.id" class="tpl-card">
        <div cds-layout="vertical p:xs gap:xs" class="tpl-card-inner">
          <cds-badge
            v-if="tpl.latestVersion"
            status="info"
            class="tpl-version-badge"
            :aria-label="`latest version ${tpl.latestVersion}`"
          >{{ tpl.latestVersion }}</cds-badge>
          <div class="tpl-head">
            <div class="tpl-head-left">
              <span class="tpl-icon" :style="iconStyleFor(tpl)">
                <cds-icon
                  :shape="ICON_SHAPE_TO_CLARITY[tpl.iconShape] || 'info-standard'"
                  size="md"
                  aria-hidden="true"
                ></cds-icon>
              </span>
              <div class="tpl-title-block">
                <h3 cds-text="section" class="tpl-title">{{ tpl.name }}</h3>
                <span cds-text="body" class="muted tpl-type">
                  {{ locale.t(`marketplace.type.${TYPE_KEY_BY_GQL[tpl.type]}`) }}
                </span>
              </div>
            </div>
          </div>

          <p cds-text="body" class="tpl-desc muted">{{ tpl.description }}</p>

          <div class="tpl-lists">
            <div class="tpl-list">
              <h4 cds-text="subsection" class="tpl-list-title">
                {{ locale.t('marketplace.card.tools') }}
              </h4>
              <ul class="tpl-bullets">
                <li v-for="tool in tpl.tools" :key="tool">{{ tool }}</li>
              </ul>
            </div>
            <div class="tpl-list">
              <h4 cds-text="subsection" class="tpl-list-title">
                {{ locale.t('marketplace.card.skills') }}
              </h4>
              <ul class="tpl-bullets">
                <li v-for="skill in tpl.skills" :key="skill">{{ skill }}</li>
              </ul>
            </div>
            <div class="tpl-list">
              <h4 cds-text="subsection" class="tpl-list-title">
                {{ locale.t('marketplace.card.scenarios') }}
              </h4>
              <ul class="tpl-bullets">
                <li v-for="scenario in tpl.scenarios" :key="scenario">{{ scenario }}</li>
              </ul>
            </div>
          </div>

          <div class="tpl-actions">
            <cds-select
              class="tpl-version-select"
              control-width="shrink"
            >
              <label>{{ locale.t('marketplace.card.versionSelect') }}</label>
              <select>
                <option
                  v-for="v in [...tpl.versions].reverse()"
                  :key="v.id"
                  :value="v.id"
                >{{ v.version }}</option>
              </select>
            </cds-select>
            <div class="tpl-actions-buttons">
              <cds-button action="outline" @click="onViewDetails(tpl)">
                {{ locale.t('marketplace.card.action.view') }}
              </cds-button>
              <cds-button action="outline" status="primary" @click="onCreateAgent(tpl)">
                {{ locale.t('marketplace.card.action.create') }}
              </cds-button>
            </div>
          </div>
        </div>
      </cds-card>
      </div>
    </div>

    <!-- Pager lives in the same flex column as the grid so a `margin-top:
         auto` on it pushes it down to the bottom of `.marketplace`,
         regardless of how many rows the grid holds. When the grid is
         short (e.g. page 2 with only 3 cards), the empty space falls
         between the cards and the pager; when the grid overflows, the
         cards visually overlap that empty space, which is fine because
         the pager is the last child and sits at the container's bottom
         edge either way. -->
    <div
      v-if="!error && totalPages > 1"
      class="pager-wrapper"
    >
      <cds-pagination
        class="pager-row"
        :aria-label="locale.t('marketplace.pager.label')"
      >
        <cds-pagination-button
          action="first"
          :disabled="currentPage <= 1"
          :aria-label="locale.t('marketplace.pager.first')"
          @click="goToPage(1)"
        ></cds-pagination-button>
        <cds-pagination-button
          action="prev"
          :disabled="currentPage <= 1"
          :aria-label="locale.t('marketplace.pager.prev')"
          @click="onPrevPage"
        ></cds-pagination-button>
        <cds-input cds-pagination-number>
          <input
            type="number"
            :value="currentPage"
            :min="1"
            :max="totalPages"
            :aria-label="locale.t('marketplace.pager.label')"
            @input="onPageInput"
          />
        </cds-input>
        <cds-pagination-button
          action="next"
          :disabled="currentPage >= totalPages"
          :aria-label="locale.t('marketplace.pager.next')"
          @click="onNextPage"
        ></cds-pagination-button>
        <cds-pagination-button
          action="last"
          :disabled="currentPage >= totalPages"
          :aria-label="locale.t('marketplace.pager.last')"
          @click="goToPage(totalPages)"
        ></cds-pagination-button>
      </cds-pagination>
      <span cds-text="body" class="muted pager-summary">{{ summaryText }}</span>
    </div>

    <AddOvaTemplateDialog
      :open="createDialogOpen"
      :saving="creating"
      @close="closeCreateDialog"
      @submit="onSubmitCreate"
    />
    <DeployAgentDialog
      :open="deployDialogOpen"
      :template="deployingTemplate"
      :pools="pools"
      :model-gateways="modelGateways"
      :deploying="deploying"
      @close="closeDeployDialog"
      @submit="onSubmitDeploy"
    />

    <!-- Toolbar "按类型筛选" dropdown (anchored to the toolbar button). -->
    <cds-dropdown
      id="marketplace-type-filter"
      closable
      :hidden="!typeFilterAnchor"
      @closeChange="closeTypeFilter"
      :anchor="typeFilterAnchor"
    >
      <div cds-layout="vertical align:stretch p:xs">
        <button
          v-for="opt in TYPE_OPTIONS"
          :key="opt.value"
          type="button"
          class="menu-opt"
          :class="{ active: typeFilter === opt.value }"
          @click="setTypeFilter(opt.value)"
        >
          <span>{{ locale.t(opt.labelKey) }}</span>
          <cds-icon v-if="typeFilter === opt.value" shape="check" size="sm"></cds-icon>
        </button>
      </div>
    </cds-dropdown>
  </section>
</template>

<style scoped>
.marketplace {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  /* Flex column that fills its parent (`AppShell`'s `.content` area) so
     the pager (last child, `margin-top: auto`) is pinned to the bottom
     edge of the visible area — see the comment on `.pager-wrapper`.
     No `overflow-y: auto` here; if we made the whole view scroll, the
     `margin-top: auto` trick wouldn't be able to push the pager below
     the cards. Instead the scrolling is delegated to `.card-scroll`
     below, so the pager stays anchored while only the cards scroll. */
  height: 100%;
  min-height: 0;
  /* Clarity's `[cds-text*='title']` uses Line-Height Eraser (`::before`
     negative margin-top) to collapse the line-height gap above the text.
     When this view becomes a scroll container, that negative margin gets
     clipped at the container's top edge and the title appears sliced.
     A small top padding restores the visible space. */
  padding-top: 8px;
}
.page-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 4px;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
  margin-bottom: 4px;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
}
.toolbar-type-filter {
  /* Trim cds-button's defaults so the trigger visually pairs with the
     cds-input next to it (no uppercase, no min-width, snug padding).
     DO NOT override --border-color or --background here: cds's
     `:host([action='flat'])` rule sets both to `opacity-0` (transparent),
     and a class selector outranks a `:host(...)` attribute selector in
     specificity, so re-declaring them here would bring the border back.
     --box-shadow-color is also re-asserted to fully transparent: cds
     applies an inset 2px shadow on :focus/:active for tactile feedback,
     but this toolbar trigger should look like an inert input when focused. */
  --padding: 0 8px;
  --min-width: 0;
  --box-shadow-color: rgba(0, 0, 0, 0);
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
  /* Clamp the trigger width so a long current label can't push the
     search input off-screen on narrower viewports. */
  max-width: 220px;
}
/* cds-button applies `line-height: 1em !important; color: inherit !important;`
   to all slotted content (see button.element.scss). That collapses our label
   to a sliver and clips Chinese glyphs. Re-assert a readable line-height on
   the label span specifically. */
.toolbar-type-filter-label {
  display: inline-block;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  line-height: 1.4 !important;
}
.toolbar-search {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 320px;
  flex: 0 0 auto;
  padding: 0 8px;
  height: 36px;
  box-sizing: border-box;
  border: 1px solid var(--cds-alias-object-border-color, #cccccc);
  border-radius: 3px;
  background: var(--cds-alias-object-app-background, #ffffff);
}
.toolbar-search-icon {
  flex: 0 0 auto;
  color: var(--cds-alias-typography-color-300, #565656);
}
.toolbar-search-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  padding: 0;
}
.toolbar-search-input::placeholder {
  color: var(--cds-alias-typography-color-200, #888);
}
.toolbar-search-input::-webkit-search-cancel-button {
  /* Keep the native type="search" clear button — it's a standard browser
     affordance users expect on search inputs. */
  cursor: pointer;
}

/* Dropdown menu options (mirrors AgentListView's .menu-opt).
   cds-dropdown mounts its panel to <body>, so scoped styles don't reach it —
   duplicate the rule locally instead of relying on AgentListView's scope. */
.menu-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: transparent;
  border: 0;
  font: inherit;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  text-align: left;
  cursor: pointer;
  width: 100%;
}
.menu-opt:hover {
  background: var(--cds-alias-object-border-color, #f4f4f4);
}
.menu-opt.active {
  font-weight: 600;
}
.card-scroll {
  /* Flex item that takes whatever vertical space remains in
     `.marketplace` after the header, toolbar and pager. Scrolling is
     scoped to the card region so the pager (sibling, `margin-top:
     auto`) can still pin to the bottom of `.marketplace` instead of
     being pushed off-screen when there are many cards. */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  /* Rows size to their content (the cards have a fixed natural height),
     so a partially-filled row (e.g. page 2 with only 3 cards = 1 row)
     stays at card height instead of stretching via 1fr. */
  grid-auto-rows: auto;
  gap: 12px;
}
@media (max-width: 1100px) {
  .card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 720px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}
.tpl-card {
  display: block;
  min-width: 0;
  width: 100%;
  position: relative;
  box-sizing: border-box;
  /* Make the card fill its grid cell width-wise; height stays content-
     driven. Cards across pages are now the same size because the grid
     row height is `auto` (see .card-grid). */
  --height: 100%;
}
.tpl-card-inner {
  height: 100%;
  position: relative;
}
.tpl-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  /* Fixed height so subsequent content (description + 3-column list)
     starts at a consistent y across cards. Matches icon (34) + line
     heights of title (18 * 1.3) + type (11 * 1.3). */
  min-height: 40px;
}
.tpl-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}
.tpl-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 7px;
  flex-shrink: 0;
}
.tpl-title-block {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.tpl-title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
}
.tpl-type {
  font-size: 11px;
  line-height: 1.3;
}
.tpl-version-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  --size: 1.25rem;
  --font-size: 0.65rem;
  --padding: 0 0.4rem;
}
.tpl-desc {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--cds-alias-typography-color-300, #565656);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  /* Fixed 2-line height so the 3-column list below starts at the same y
     across cards regardless of description length. Using `height`
     (not `min-height`) so short descriptions don't compress the box. */
  height: calc(13px * 1.5 * 2);
}
.tpl-lists {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 4px;
  /* Lock the lists width so the column boundaries line up across cards
     regardless of cds-card's intrinsic sizing. */
  width: 100%;
  box-sizing: border-box;
}
.tpl-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  min-height: 0;
}
.tpl-list-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--cds-alias-typography-color-400, #444);
  text-align: left;
  padding-left: 18px;
}
.tpl-bullets {
  margin: 0;
  padding-left: 18px;
  list-style: disc;
  font-size: 11px;
  line-height: 1.45;
  color: var(--cds-alias-typography-color-300, #565656);
  text-align: left;
  /* Card height is content-driven (grid auto-rows), so when a list has
     a lot of items it overflows the natural card. Keep the previous
     behaviour: cap the list and let it scroll inside, instead of
     letting one long list push the card (and its row-mate) taller. */
  overflow-y: auto;
  max-height: 60px;
}
.tpl-actions {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 2px;
}
.tpl-version-select {
  flex: 0 0 auto;
  min-width: 0;
}
.tpl-version-select :deep(select) {
  min-width: 0;
}
.tpl-actions-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
}
.pager-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding: 4px 0;
  /* Push the pager to the bottom of `.marketplace` (a flex column that
     fills the viewport). Combined with the outer flex layout, this
     works regardless of how tall the grid is: if the grid is short
     (page 2 with only 3 cards = 1 row), the auto margin creates the
     empty gap between the cards and the pager; if the grid is tall and
     overflows into `.card-scroll`, the pager still sits at the bottom
     of the visible area. */
  margin-top: auto;
}
.pager-row {
  display: inline-flex;
  align-items: center;
}
.pager-summary {
  font-size: 12px;
}
.placeholder {
  min-height: 240px;
}
.placeholder-icon {
  color: var(--cds-alias-typography-color-300, #888);
}
.page-alert {
  margin-bottom: 12px;
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
</style>
