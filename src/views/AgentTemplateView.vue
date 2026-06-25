<script setup lang="ts">
/**
 * 智能体模板 (Agent Templates) — catalog management.
 *
 * CRUD-style list wired to the real backend:
 *   - query  agentTemplates: [AgentTemplate!]!     (any authenticated user)
 *   - mutate upsertAgentTemplate(input)            (@hasRole(any: [admin]))
 *
 * The catalog is keyed by `kind`; create/edit both go through upsertAgentTemplate
 * (kind is the identity, locked on edit). There is NO delete operation in the
 * schema, so this page intentionally exposes none. Non-admin callers can browse
 * but get a backend error (surfaced via toast) if they attempt to save.
 */
import { computed, ref } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { apolloClient } from '@/api/graphql/client'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { graphqlErrorMessage } from '@/api/graphql/errors'
import AgentTemplateFormDialog from '@/views/agent-template/AgentTemplateFormDialog.vue'
import {
  AGENT_TEMPLATES_QUERY,
  UPSERT_AGENT_TEMPLATE,
  type AgentTemplateNode,
  type AgentTemplatesResult,
  type UpsertAgentTemplateInput,
  type UpsertAgentTemplateResult,
  type UpsertAgentTemplateVars,
} from '@/api/graphql/queries/agent-templates'
import '@/components/icons'

const locale = useLocaleStore()
const toast = useToast()

const { result, loading, error, refetch } = useQuery<AgentTemplatesResult>(AGENT_TEMPLATES_QUERY)

// Stable display order: by kind, locale-aware. Spread first so we never sort the
// Apollo cache array in place.
const templates = computed<AgentTemplateNode[]>(() =>
  [...(result.value?.agentTemplates ?? [])].sort((left, right) =>
    left.kind.localeCompare(right.kind, locale.locale),
  ),
)

const dialogOpen = ref(false)
const editingTemplate = ref<AgentTemplateNode | null>(null)
const saving = ref(false)

function openCreate() {
  editingTemplate.value = null
  dialogOpen.value = true
}

function openEdit(template: AgentTemplateNode) {
  editingTemplate.value = template
  dialogOpen.value = true
}

function closeDialog() {
  if (saving.value) return
  dialogOpen.value = false
  editingTemplate.value = null
}

async function submitTemplate(input: UpsertAgentTemplateInput) {
  if (saving.value) return
  const isEditing = Boolean(editingTemplate.value)
  saving.value = true
  try {
    await apolloClient.mutate<UpsertAgentTemplateResult, UpsertAgentTemplateVars>({
      mutation: UPSERT_AGENT_TEMPLATE,
      variables: { input },
    })
    toast.success(locale.t(isEditing ? 'agentTemplate.toast.updated' : 'agentTemplate.toast.created'))
    dialogOpen.value = false
    editingTemplate.value = null
    await refetch()
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('agentTemplate.toast.saveFailed')))
  } finally {
    saving.value = false
  }
}

async function refresh() {
  if (loading.value) return
  try {
    await refetch()
    toast.success(locale.t('agentTemplate.toast.refreshed'))
  } catch (err) {
    toast.error(graphqlErrorMessage(err, locale.t('agentTemplate.toast.refreshFailed')))
  }
}
</script>

<template>
  <section class="agent-template-page">
    <header class="page-head">
      <h1 cds-text="title" class="heading">{{ locale.t('agentTemplate.title') }}</h1>
      <p cds-text="body" class="desc muted">{{ locale.t('agentTemplate.description') }}</p>
    </header>

    <div class="content-card">
      <div class="toolbar">
        <cds-button action="outline" status="primary" @click="openCreate">
          <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
          {{ locale.t('agentTemplate.action.create') }}
        </cds-button>

        <cds-button
          action="ghost"
          class="refresh-button"
          :disabled="loading"
          :aria-label="locale.t('agentTemplate.action.refresh')"
          :title="locale.t('agentTemplate.action.refresh')"
          @click="refresh"
        >
          <cds-icon shape="refresh" size="md" :class="{ spinning: loading }"></cds-icon>
          <span>{{ locale.t('agentTemplate.action.refresh') }}</span>
        </cds-button>
      </div>

      <div class="grid-card">
        <cds-grid
          border="row"
          column-layout="flex"
          role="grid"
          :aria-label="locale.t('agentTemplate.table.label')"
        >
          <cds-grid-column width="16%">{{ locale.t('agentTemplate.col.kind') }}</cds-grid-column>
          <cds-grid-column width="26%">{{ locale.t('agentTemplate.col.display') }}</cds-grid-column>
          <cds-grid-column width="16%">{{ locale.t('agentTemplate.col.installMethod') }}</cds-grid-column>
          <cds-grid-column width="12%">{{ locale.t('agentTemplate.col.version') }}</cds-grid-column>
          <cds-grid-column width="14%">{{ locale.t('agentTemplate.col.status') }}</cds-grid-column>
          <cds-grid-column width="16%">{{ locale.t('agentTemplate.col.actions') }}</cds-grid-column>

          <cds-grid-row v-for="template in templates" :key="template.id">
            <cds-grid-cell>
              <strong class="cell-kind" :title="template.kind">{{ template.kind }}</strong>
            </cds-grid-cell>
            <cds-grid-cell>
              <div class="cell-display">
                <span class="display-name" :title="template.display">{{ template.display }}</span>
                <small v-if="template.description" class="display-desc muted" :title="template.description">
                  {{ template.description }}
                </small>
              </div>
            </cds-grid-cell>
            <cds-grid-cell>
              {{ locale.t(`agentTemplate.installMethod.${template.installMethod}`) }}
            </cds-grid-cell>
            <cds-grid-cell>
              <span class="cell-version">{{ template.version || '—' }}</span>
            </cds-grid-cell>
            <cds-grid-cell>
              <cds-badge
                :status="template.status === 'active' ? 'success' : 'neutral'"
                class="status-badge"
              >
                <cds-icon
                  :shape="template.status === 'active' ? 'check-circle' : 'ban'"
                  size="sm"
                ></cds-icon>
                {{ locale.t(`agentTemplate.status.${template.status}`) }}
              </cds-badge>
            </cds-grid-cell>
            <cds-grid-cell>
              <button type="button" class="row-action" @click="openEdit(template)">
                <cds-icon shape="pencil" size="sm"></cds-icon>
                <span>{{ locale.t('agentTemplate.action.edit') }}</span>
              </button>
            </cds-grid-cell>
          </cds-grid-row>

          <cds-grid-placeholder v-if="!loading && templates.length === 0">
            <cds-icon :shape="error ? 'ban' : 'blocks-group'" size="xl"></cds-icon>
            <p cds-text="subsection">
              {{ error ? locale.t('agentTemplate.loadError') : locale.t('agentTemplate.empty') }}
            </p>
            <cds-button v-if="!error" action="outline" size="sm" @click="openCreate">
              {{ locale.t('agentTemplate.action.create') }}
            </cds-button>
          </cds-grid-placeholder>
        </cds-grid>
      </div>
    </div>

    <AgentTemplateFormDialog
      :open="dialogOpen"
      :template="editingTemplate"
      :saving="saving"
      @close="closeDialog"
      @submit="submitTemplate"
    />
  </section>
</template>

<style scoped>
.agent-template-page {
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
  max-width: 760px;
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
}
.refresh-button {
  margin-left: auto;
}
.grid-card {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  border: 1px solid var(--cds-alias-object-border-color, #d7d7d7);
  border-radius: 4px;
}
.agent-template-page cds-grid {
  display: block;
  width: 100%;
  min-width: 820px;
  min-height: 100%;
}
.cell-kind {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-display {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.display-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.display-desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.cell-version {
  font-variant-numeric: tabular-nums;
}
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 64px;
  white-space: nowrap;
}
.row-action {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 6px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--cds-alias-object-interaction-color, #006e9c);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.row-action:hover {
  background: var(--cds-alias-object-app-background, #f4f4f4);
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.spinning {
  animation: agent-template-spin 1s linear infinite;
  transform-origin: center;
}
@keyframes agent-template-spin {
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
