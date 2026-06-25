<script setup lang="ts">
/**
 * 知识包挂载编辑器 (Agent Config knowledge-pack editor).
 *
 * UX: a multi-select of every available kind=knowledge Artifact. The currently
 * mounted set is pre-checked. Submit emits the full chosen id set; the parent
 * calls `setAgentConfigKnowledge(configId, ids)` which replaces the mounted set
 * wholesale (LLD-11 K2). Mirrors the BindRoleDialog backdrop/card pattern.
 */
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type {
  AgentConfigNode,
  KnowledgeArtifactNode,
} from '@/api/graphql/queries/agent-config'
import '@/components/icons'

const props = defineProps<{
  open: boolean
  /** The config being edited (drives title + pre-checked set). */
  config: AgentConfigNode | null
  /** Every available kind=knowledge Artifact. */
  artifacts: KnowledgeArtifactNode[]
  /** True while the parent's setAgentConfigKnowledge mutation is in flight. */
  saving?: boolean
  /** True while the artifact picker list is still loading. */
  artifactsLoading?: boolean
}>()

const locale = useLocaleStore()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', ids: string[]): void
}>()

const selectedIds = ref<Set<string>>(new Set())
const search = ref('')

watch(
  () => [props.open, props.config] as const,
  ([open]) => {
    if (open) {
      selectedIds.value = new Set((props.config?.knowledge ?? []).map((a) => a.id))
      search.value = ''
    }
  },
  { immediate: true },
)

const filteredArtifacts = computed<KnowledgeArtifactNode[]>(() => {
  const keyword = search.value.trim().toLocaleLowerCase()
  if (!keyword) return props.artifacts
  return props.artifacts.filter((artifact) =>
    `${artifact.name} ${artifact.version}`.toLocaleLowerCase().includes(keyword),
  )
})

const selectedCount = computed(() => selectedIds.value.size)

function toggle(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function close() {
  if (!props.saving) emit('close')
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) close()
}

function submit() {
  if (props.saving) return
  emit('submit', [...selectedIds.value])
}
</script>

<template>
  <Teleport to="body">
    <Transition name="kp-fade">
      <div
        v-if="open"
        class="kp-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="locale.t('agentConfig.knowledge.dialogTitle')"
        @click="onBackdropClick"
      >
        <div class="kp-card" @click.stop>
          <h2 cds-text="section" class="kp-title">
            {{ locale.t('agentConfig.knowledge.dialogTitle') }}
            <span v-if="config" class="kp-subtitle muted">{{ config.name }}</span>
          </h2>

          <cds-input class="kp-search">
            <input
              :value="search"
              type="search"
              autocomplete="off"
              :placeholder="locale.t('agentConfig.knowledge.searchPlaceholder')"
              :aria-label="locale.t('agentConfig.knowledge.searchPlaceholder')"
              @input="search = ($event.target as HTMLInputElement).value"
            />
          </cds-input>

          <div class="kp-list">
            <p v-if="artifactsLoading" class="kp-state muted">
              {{ locale.t('agentConfig.knowledge.loading') }}
            </p>
            <p v-else-if="filteredArtifacts.length === 0" class="kp-state muted">
              {{ locale.t('agentConfig.knowledge.emptyArtifacts') }}
            </p>
            <label
              v-for="artifact in filteredArtifacts"
              v-else
              :key="artifact.id"
              class="kp-row"
            >
              <input
                type="checkbox"
                class="app-checkbox"
                :checked="selectedIds.has(artifact.id)"
                @change="toggle(artifact.id)"
              />
              <span class="kp-row-name" :title="artifact.name">{{ artifact.name }}</span>
              <small class="kp-row-meta muted">v{{ artifact.version }}</small>
            </label>
          </div>

          <p class="kp-selected muted">
            {{ locale.t('agentConfig.knowledge.selectedCount').replace('{count}', String(selectedCount)) }}
          </p>

          <div class="kp-actions">
            <cds-button type="button" action="outline" :disabled="saving" @click="close">
              {{ locale.t('agentConfig.knowledge.cancel') }}
            </cds-button>
            <cds-button
              type="button"
              action="solid"
              status="primary"
              :loading-state="saving ? 'loading' : 'default'"
              :disabled="saving"
              @click="submit"
            >
              {{ locale.t('agentConfig.knowledge.save') }}
            </cds-button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.kp-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(11, 18, 32, 0.55);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  z-index: 1100;
  padding: 24px;
}
.kp-card {
  width: min(560px, 100%);
  max-height: min(90vh, 720px);
  display: flex;
  flex-direction: column;
  background: var(--cds-alias-object-container-background, #ffffff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  border-radius: 12px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  padding: 24px;
  gap: 14px;
}
.kp-title {
  margin: 0;
  font-size: 18px;
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.kp-subtitle {
  font-size: 13px;
  font-weight: 400;
}
.kp-search {
  width: 100%;
}
.kp-list {
  border: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
  border-radius: 6px;
  max-height: 360px;
  min-height: 80px;
  overflow: auto;
}
.kp-state {
  margin: 0;
  padding: 24px 12px;
  text-align: center;
  font-size: 13px;
}
.kp-row {
  display: grid;
  grid-template-columns: 16px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  font-size: 13px;
  cursor: pointer;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e8e8e8);
}
.kp-row:last-child {
  border-bottom: 0;
}
.kp-row:hover {
  background: var(--cds-alias-object-app-background, #fafafa);
}
.kp-row-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kp-row-meta {
  white-space: nowrap;
}
.kp-selected {
  margin: 0;
  font-size: 12px;
}
.kp-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.app-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--cds-alias-object-interaction-color, #0072a3);
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
}
.kp-fade-enter-active,
.kp-fade-leave-active {
  transition: opacity 0.18s ease;
}
.kp-fade-enter-from,
.kp-fade-leave-to {
  opacity: 0;
}
</style>
