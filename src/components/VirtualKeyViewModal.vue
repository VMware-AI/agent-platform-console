<script setup lang="ts">
/**
 * Read-only "查看" modal for a single VirtualKey. Opened from the
 * table's row actions; mirrors the section layout of the issue / clone
 * form (基本信息 / 治理参数 / 速率限制 / 路由与标签) but renders every
 * field as a static key→value row. No inputs, no submit, no escape
 * hatch into edit — purely an audit surface so an operator can confirm
 * a key's full configuration without edit permission.
 *
 * Reuses the same `<cds-modal>` chrome as VirtualKeyFormModal so the
 * view, create and clone flows all sit in one visual family.
 */
import { computed } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type { VirtualKeyNode } from '@/api/graphql/queries/virtual-keys'

const props = defineProps<{
  open: boolean
  /** The key to render. Null closes the modal via parent state. */
  keyItem: VirtualKeyNode | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const locale = useLocaleStore()

function close() {
  emit('close')
}

// Re-use the page's display helpers via inline functions so this
// component stays self-contained (the page already imports the same
// helpers; we duplicate the date-formatting logic here rather than
// lifting it into a shared util for one consumer).
function formatDateTime(value: string | null | undefined): string {
  if (!value) return locale.t('virtualKey.view.emptyValue') as string
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function displayName(key: VirtualKeyNode | null): string {
  if (!key) return ''
  return key.name || (locale.t('virtualKey.view.emptyValue') as string)
}

// Status badge variant — mirrors the page's `statusVariant` mapping so
// the modal's status pill matches the row's status badge one-for-one.
function statusVariant(status: VirtualKeyNode['status']): 'success' | 'neutral' | 'danger' {
  return status === 'active' ? 'success' : status === 'disabled' ? 'neutral' : 'danger'
}
function statusIcon(status: VirtualKeyNode['status']): string {
  return status === 'active' ? 'check-circle' : status === 'disabled' ? 'ban' : 'times-circle'
}
function statusLabel(status: VirtualKeyNode['status']): string {
  if (status === 'active') return locale.t('virtualKey.status.enabled') as string
  if (status === 'disabled') return locale.t('virtualKey.status.disabled') as string
  return locale.t('virtualKey.status.revoked') as string
}

// `fmtBudget` turns spend / maxBudget / budgetDuration into a single
// human-readable "12.4 / 50 (7d)" string. If budgetDuration is missing
// we drop the suffix rather than show "undefined".
const budgetLine = computed(() => {
  const k = props.keyItem
  if (!k) return ''
  if (k.maxBudget == null || k.maxBudget <= 0) return locale.t('virtualKey.view.emptyValue') as string
  const parts = [`${k.spend} / ${k.maxBudget}`]
  if (k.budgetDuration) parts.push(`(${k.budgetDuration})`)
  return parts.join(' ')
})

function fmtOptionalText(value: string | null | undefined): string {
  if (value == null || value === '') return locale.t('virtualKey.view.emptyValue') as string
  return value
}
function fmtOptionalNumber(value: number | null | undefined): string {
  if (value == null) return locale.t('virtualKey.view.emptyValue') as string
  return String(value)
}
function fmtBoolean(value: boolean): string {
  return value
    ? (locale.t('virtualKey.view.boolean.enabled') as string)
    : (locale.t('virtualKey.view.boolean.disabled') as string)
}

// `hasItems` returns true for non-empty arrays — used in the template
// to switch between the "全部" pill and an inline chip list for
// list-valued fields (allowedRoutes, tags). Kept as a free function
// rather than a computed because it depends on `keyItem` only at
// template-render time and would re-evaluate needlessly otherwise.
function listItems(values: string[] | null | undefined): string[] {
  if (!values || values.length === 0) return []
  return values
}
</script>

<template>
  <cds-modal :hidden="!open" size="default" closable @closeChange="close">
    <cds-modal-header>
      <div class="view-modal-head">
        <div class="view-modal-head-text">
          <h2 cds-text="title" class="view-modal-title">
            {{ locale.t('virtualKey.view.title') }}
            <span class="view-modal-name">· {{ displayName(keyItem) }}</span>
          </h2>
          <p v-if="keyItem" class="view-modal-subtitle">
            {{ locale.t('virtualKey.view.subtitle') }}
          </p>
        </div>
        <div v-if="keyItem" class="view-modal-head-status">
          <cds-badge :status="statusVariant(keyItem.status)" class="status-badge">
            <cds-icon :shape="statusIcon(keyItem.status)" size="sm"></cds-icon>
            {{ statusLabel(keyItem.status) }}
          </cds-badge>
        </div>
      </div>
    </cds-modal-header>

    <cds-modal-content>
      <div v-if="keyItem" class="view-grid">
        <!--
          Section: 基本信息 (basic identity + masked key + agent
          binding). Status badge intentionally promoted to the modal
          header so it's readable without scrolling — operators opening
          the modal usually want to confirm status first.
        -->
        <section class="view-section section-basic">
          <h3 class="view-section-title">
            <cds-icon shape="info-standard" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('virtualKey.view.section.basic') }}
          </h3>
          <dl class="view-list">
            <!--
              密钥 ID 字段已移除 — id 是数据库主键而非运维配置，对
              只读 audit 流程没价值。隐藏它也让「名称」作为第一行更
              显眼，跟 header 标题里的「· 名称」重复但强调作用。
            -->
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.name') }}</dt>
              <dd class="value-strong">{{ displayName(keyItem) }}</dd>
            </div>
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.keyType') }}</dt>
              <dd>
                <span v-if="keyItem.keyType" class="kind-pill">{{ keyItem.keyType }}</span>
                <span v-else class="value-empty">{{ locale.t('virtualKey.view.emptyValue') }}</span>
              </dd>
            </div>
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.maskedKey') }}</dt>
              <dd class="mono masked-key">{{ fmtOptionalText(keyItem.maskedKey) }}</dd>
            </div>
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.agent') }}</dt>
              <dd>{{ fmtOptionalText(keyItem.agent?.name) }}</dd>
            </div>
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.modelGateway') }}</dt>
              <dd>{{ fmtOptionalText(keyItem.modelGateway?.name) }}</dd>
            </div>
          </dl>
        </section>

        <!--
          Section: 治理参数 (expiry + budget + auto-rotate). Budget
          surfaces the spent/cap ratio as a single line because the
          values are tightly coupled; rotationInterval is shown only
          when autoRotate is on (the server pair: enabling autoRotate
          without an interval would render an invalid config).
        -->
        <section class="view-section section-governance">
          <h3 class="view-section-title">
            <cds-icon shape="cog" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('virtualKey.view.section.governance') }}
          </h3>
          <dl class="view-list">
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.expiresAt') }}</dt>
              <dd class="mono">{{ formatDateTime(keyItem.expiresAt) }}</dd>
            </div>
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.maxBudget') }}</dt>
              <dd>{{ budgetLine }}</dd>
            </div>
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.autoRotate') }}</dt>
              <dd>
                <span class="bool-pill" :class="{ 'bool-on': keyItem.autoRotate }">
                  {{ fmtBoolean(keyItem.autoRotate) }}
                </span>
              </dd>
            </div>
            <div v-if="keyItem.autoRotate" class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.rotationInterval') }}</dt>
              <dd>{{ fmtOptionalText(keyItem.rotationInterval) }}</dd>
            </div>
          </dl>
        </section>

        <!--
          Section: 速率限制 (RPM / TPM + their limit types + max
          parallel). All four numbers are nullable; render the empty
          sentinel rather than "0" so the operator can tell at a glance
          which knobs weren't set on this key.
        -->
        <section class="view-section section-rate">
          <h3 class="view-section-title">
            <cds-icon shape="bolt" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('virtualKey.view.section.rateLimit') }}
          </h3>
          <dl class="view-list">
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.maxParallelRequests') }}</dt>
              <dd>{{ fmtOptionalNumber(keyItem.maxParallelRequests) }}</dd>
            </div>
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.rpmLimit') }}</dt>
              <dd>{{ fmtOptionalNumber(keyItem.rpmLimit) }}</dd>
            </div>
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.rpmLimitType') }}</dt>
              <dd>{{ fmtOptionalText(keyItem.rpmLimitType) }}</dd>
            </div>
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.tpmLimit') }}</dt>
              <dd>{{ fmtOptionalNumber(keyItem.tpmLimit) }}</dd>
            </div>
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.tpmLimitType') }}</dt>
              <dd>{{ fmtOptionalText(keyItem.tpmLimitType) }}</dd>
            </div>
          </dl>
        </section>

        <!--
          Section: 路由与标签 (allowed routes + tags). Allowed models
          is intentionally NOT here — it lives in the row's MODELS
          cell with its own overflow popover, so duplicating it would
          make the modal feel like a copy of the table. Timestamps
          live here too because they're cheap metadata; if the operator
          wants the full drawer experience they can still click the
          row's TIME_INFO affordance.

          allowedRoutes uses `fmtUnrestricted` — empty / null renders
          as a primary-tinted "全部" pill (not "—"), because "no
          allowlist" semantically means the key is unrestricted, not
          that the field is missing. tags still use `fmtList` since an
          empty tag list is genuinely "no tags".
        -->
        <section class="view-section section-routing">
          <h3 class="view-section-title">
            <cds-icon shape="router" size="sm" aria-hidden="true"></cds-icon>
            {{ locale.t('virtualKey.view.section.routing') }}
          </h3>
          <dl class="view-list">
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.allowedRoutes') }}</dt>
              <dd>
                <span
                  v-if="listItems(keyItem.allowedRoutes).length === 0"
                  class="all-pill"
                  :title="locale.t('virtualKey.view.unrestricted')"
                >
                  <cds-icon shape="world" size="sm" aria-hidden="true"></cds-icon>
                  {{ locale.t('virtualKey.view.unrestricted') }}
                </span>
                <span v-else class="route-chips">
                  <span
                    v-for="route in listItems(keyItem.allowedRoutes)"
                    :key="route"
                    class="route-chip"
                    :title="route"
                  >{{ route }}</span>
                </span>
              </dd>
            </div>
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.tags') }}</dt>
              <dd>
                <span
                  v-if="listItems(keyItem.tags).length === 0"
                  class="value-empty"
                >{{ locale.t('virtualKey.view.emptyValue') }}</span>
                <span v-else class="tag-chips">
                  <span
                    v-for="tag in listItems(keyItem.tags)"
                    :key="tag"
                    class="tag-chip"
                  >#{{ tag }}</span>
                </span>
              </dd>
            </div>
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.lastActiveAt') }}</dt>
              <dd class="mono">{{ formatDateTime(keyItem.lastActiveAt) }}</dd>
            </div>
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.createdAt') }}</dt>
              <dd class="mono">{{ formatDateTime(keyItem.createdAt) }}</dd>
            </div>
            <div class="view-row">
              <dt>{{ locale.t('virtualKey.view.field.updatedAt') }}</dt>
              <dd class="mono">{{ formatDateTime(keyItem.updatedAt) }}</dd>
            </div>
          </dl>
        </section>
      </div>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button action="solid" @click="close">
        {{ locale.t('virtualKey.view.close') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
/* Header layout — flex the title block + status badge on the same row
   so the status is glanceable without scrolling below the divider. */
.view-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}
.view-modal-head-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.view-modal-title {
  margin: 0;
  /* Trim the default heading weight slightly for a softer first read;
     the section-card titles below carry the visual weight instead. */
  font-weight: 600;
  font-size: 17px;
}
.view-modal-name {
  font-weight: 400;
  color: var(--cds-alias-typography-color-300, #565656);
  margin-left: 6px;
}
.view-modal-subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
}
.view-modal-head-status {
  flex: 0 0 auto;
}

/* Section grid — 1 column at narrow widths, 2 columns above ~640px so
   the 4 sections pair up (basic | governance, rate | routing). The
   grid is intentionally a `max-content` centered layout, not full-
   bleed, because <cds-modal size="default"> is ~460px wide and full-
   bleed rows would feel stretched; centring the grid makes every row
   hug the natural width of its content. */
.view-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
  max-width: 560px;
  margin: 0 auto;
}
@media (min-width: 760px) {
  .view-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
}

/* Section card — soft tinted background + 4px left accent border so the
   4 sections read as a sequence rather than a wall of text. Each section
   gets its own accent colour via .section-* to give the eye an anchor
   along the vertical scroll. */
.view-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 12px 14px;
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-left-width: 3px;
  border-radius: 6px;
  background: var(--cds-alias-object-app-background, #fafbfc);
}
.section-basic {
  border-left-color: var(--cds-alias-status-info, #0079ad);
}
.section-governance {
  border-left-color: var(--cds-alias-status-warning, #e8a32a);
}
.section-rate {
  border-left-color: var(--cds-alias-status-success, #48960c);
}
.section-routing {
  border-left-color: var(--cds-alias-object-interaction-color, #6e58d8);
}

.view-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 2px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--cds-alias-typography-color-300, #565656);
}
.view-section-title cds-icon {
  color: inherit;
  display: inline-flex;
}

.view-list {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* Each row uses a tight label/value layout — dt anchors at a fixed
   width so values align vertically across rows. baseline alignment
   keeps multi-line values flush with the label's first line. */
.view-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 12px;
  align-items: baseline;
  padding: 4px 0;
  border-bottom: 1px dashed var(--cds-alias-object-border-color, #e8e8e8);
}
.view-row:last-child {
  border-bottom: 0;
}
.view-row dt {
  margin: 0;
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
}
.view-row dd {
  margin: 0;
  font-size: 13px;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  word-break: break-word;
  line-height: 1.5;
}
.view-row .mono,
.view-row .masked-key {
  font-family: var(--cds-alias-typography-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  color: var(--cds-alias-typography-color-300, #565656);
}
.view-row .value-strong {
  font-weight: 600;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.view-row .value-empty {
  color: var(--cds-alias-typography-color-300, #565656);
  font-style: italic;
}

/* Pill primitives — reused across multiple fields. kind-pill is the
   neutral keyType label, all-pill is the "unrestricted" allowlist
   sentinel, bool-pill renders autoRotate status as a coloured chip. */
.kind-pill,
.all-pill,
.bool-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
}
.kind-pill {
  background: var(--cds-alias-object-app-background, #f4f4f4);
  border: 1px solid var(--cds-alias-object-border-color, #e0e0e0);
  color: var(--cds-alias-typography-color-300, #565656);
  font-family: var(--cds-alias-typography-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  text-transform: lowercase;
}
.all-pill {
  background: var(--cds-alias-object-app-blue-50, rgba(0, 114, 163, 0.08));
  border: 1px solid var(--cds-alias-status-info, #0079ad);
  color: var(--cds-alias-status-info, #0079ad);
}
.bool-pill {
  background: var(--cds-alias-object-app-background, #f4f4f4);
  border: 1px solid var(--cds-alias-object-border-color, #e0e0e0);
  color: var(--cds-alias-typography-color-300, #565656);
}
.bool-pill.bool-on {
  background: rgba(72, 150, 12, 0.12);
  border-color: var(--cds-alias-status-success, #48960c);
  color: var(--cds-alias-status-success, #366a0c);
}

/* Chip rows for list-valued fields (allowedRoutes, tags). Each chip
   is a small inline-flex pill with the soft info-blue treatment
   matching .specs-link-pill / .model-badge — see SupplierModelView
   and VirtualKeyView for the source-of-truth colours. ellipsis on
   individual chips so a long route / tag doesn't blow out the row. */
.route-chips,
.tag-chips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.route-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--cds-alias-status-info, #0079ad);
  background: var(--cds-alias-object-app-blue-50, rgba(0, 114, 163, 0.08));
  color: var(--cds-alias-status-info, #0079ad);
  font-family: var(--cds-alias-typography-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  font-weight: 500;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--cds-alias-object-app-background, #f4f4f4);
  color: var(--cds-alias-typography-color-300, #565656);
  font-size: 11.5px;
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
}

/* Status badge in the modal header — matches the row's status badge
   so the visual treatment is consistent across the page. */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 62px;
  white-space: nowrap;
}
</style>