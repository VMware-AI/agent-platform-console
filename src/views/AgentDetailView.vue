<script setup lang="ts">
/**
 * Agent Detail view (`/agents/:id`).
 *
 * Loads a single agent by route param `:id` via the `agent(id:)` GraphQL query.
 * Visibility follows the same three-track scope as the agents list (admin → all,
 * tenant-admin → their tenant, user → own agents only). Non-owner, non-admin
 * callers see a not-found state.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { AGENT_QUERY } from '@/api/graphql/queries/agents'
import { STATUS_FROM_GQL, TYPE_FROM_GQL } from '@/types/agents'
import type { AgentQueryResult, AgentQueryVars } from '@/types/agents'
import '@/components/icons'

const locale = useLocaleStore()
const route = useRoute()
const router = useRouter()

const id = computed(() => route.params.id as string)

const { result, loading, error } = useQuery<AgentQueryResult, AgentQueryVars>(
  AGENT_QUERY,
  () => ({ id: id.value }),
  () => ({ fetchPolicy: 'cache-and-network' }),
)

const agent = computed(() => result.value?.agent ?? null)

const statusLabel = computed(() => {
  if (!agent.value) return ''
  const key = STATUS_FROM_GQL[agent.value.status]
  return locale.t(`agents.status.${key}`)
})

const typeLabel = computed(() => {
  if (!agent.value) return ''
  const key = TYPE_FROM_GQL[agent.value.type]
  return key ? locale.t(`agents.type.${key}`) : agent.value.type
})

function backToList() {
  router.push({ name: 'agents.list' })
}

function fmtTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString()
}
</script>

<template>
  <section class="agent-detail" cds-layout="vertical gap:lg p:lg">
    <!-- Breadcrumb / header -->
    <header class="detail-header">
      <cds-button action="flat" @click="backToList">
        <cds-icon shape="arrow" direction="left" size="sm" aria-hidden="true"></cds-icon>
        {{ locale.t('agentDetail.backToList') }}
      </cds-button>
      <h1 cds-text="title" class="heading">
        {{ agent?.name ?? locale.t('agentDetail.title') }}
      </h1>
    </header>

    <!-- Loading -->
    <div
      v-if="loading"
      cds-layout="vertical p:xl gap:sm align:horizontal-center"
      class="placeholder"
    >
      <cds-progress-circle size="xl" status="info"></cds-progress-circle>
      <p cds-text="subsection" class="muted">{{ locale.t('agentDetail.loading') }}</p>
    </div>

    <!-- Error -->
    <cds-alert
      v-else-if="error"
      status="danger"
      class="page-alert"
    >
      <cds-alert-content>{{ locale.t('agentDetail.error') }}</cds-alert-content>
    </cds-alert>

    <!-- Empty / not-found -->
    <div
      v-else-if="!agent"
      cds-layout="vertical p:xl gap:sm align:horizontal-center"
      class="placeholder"
    >
      <cds-icon shape="error-standard" size="xxl" class="placeholder-icon"></cds-icon>
      <p cds-text="subsection" class="muted">{{ locale.t('agentDetail.notFound') }}</p>
    </div>

    <!-- Detail grid -->
    <div v-else class="detail-content">
      <dl class="detail-grid">
        <div class="detail-row">
          <dt>{{ locale.t('agentDetail.name') }}</dt>
          <dd>{{ agent.name }}</dd>
        </div>
        <div class="detail-row">
          <dt>{{ locale.t('agentDetail.type') }}</dt>
          <dd>{{ typeLabel }}</dd>
        </div>
        <div class="detail-row">
          <dt>{{ locale.t('agentDetail.status') }}</dt>
          <dd>
            <cds-badge
              :status="agent.status === 'RUNNING' ? 'success' : agent.status === 'STOPPED' ? 'neutral' : 'danger'"
            >
              {{ statusLabel }}
            </cds-badge>
          </dd>
        </div>
        <div class="detail-row">
          <dt>{{ locale.t('agentDetail.endpoint') }}</dt>
          <dd>{{ agent.endpoint || '—' }}</dd>
        </div>
        <div class="detail-row">
          <dt>{{ locale.t('agentDetail.credentials') }}</dt>
          <dd>{{ agent.credentials?.username ?? '—' }}</dd>
        </div>
        <div class="detail-row">
          <dt>{{ locale.t('agentDetail.apiKey') }}</dt>
          <dd>{{ agent.apiKey?.name ?? '—' }}</dd>
        </div>
        <div class="detail-row">
          <dt>{{ locale.t('agentDetail.template') }}</dt>
          <dd>
            <template v-if="agent.templateFamilyId">
              {{ agent.templateFamilyId }}
              <span v-if="agent.templateVersionId" class="muted">· v{{ agent.templateVersionId }}</span>
            </template>
            <span v-else>—</span>
          </dd>
        </div>
        <div class="detail-row">
          <dt>{{ locale.t('agentDetail.resourcePoolId') }}</dt>
          <dd>{{ agent.resourcePoolId ?? '—' }}</dd>
        </div>
        <div class="detail-row">
          <dt>{{ locale.t('agentDetail.createdAt') }}</dt>
          <dd>{{ fmtTime(agent.createdAt) }}</dd>
        </div>
        <div class="detail-row">
          <dt>{{ locale.t('agentDetail.updatedAt') }}</dt>
          <dd>{{ fmtTime(agent.updatedAt) }}</dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<style scoped>
.agent-detail {
  max-width: 720px;
  margin: 0 auto;
}

.detail-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.heading {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.detail-content {
  background: var(--cds-alias-object-app-background, #ffffff);
  border: 1px solid var(--cds-alias-object-border-color, #e0e0e0);
  border-radius: 6px;
  padding: 24px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 24px;
  margin: 0;
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-row dt {
  font-size: 11px;
  font-weight: 600;
  color: var(--cds-alias-typography-color-400, #888);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.detail-row dd {
  margin: 0;
  font-size: 14px;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  line-height: 1.4;
}

.placeholder {
  min-height: 200px;
}
.placeholder-icon {
  color: var(--cds-alias-typography-color-300, #888);
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.page-alert {
  margin-bottom: 12px;
}
</style>
