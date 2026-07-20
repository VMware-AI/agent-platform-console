<script setup lang="ts">
/* eslint-disable */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, ref, watch } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { useQuery } from '@vue/apollo-composable'
import type { Agent } from '@/types/agents'
import { STATUS_FROM_GQL } from '@/types/agents'

import { VSPHERE_NETWORKS_QUERY } from '@/api/graphql/queries/vsphere'
import { AGENT_VM_INFO_QUERY, RECONFIG_AGENT_VM_MUTATION } from '@/api/graphql/queries/agents'
import { apolloClient } from '@/api/graphql/client'

import ConfirmDiffDialog from '@/components/ConfirmDiffDialog.vue'
import ConfigureBasicInfo from '@/components/ConfigureBasicInfo.vue'
import ConfigureVmResources from '@/components/ConfigureVmResources.vue'
import ConfigureNetwork from '@/components/ConfigureNetwork.vue'
import ConfigureVAppProperties from '@/components/ConfigureVAppProperties.vue'
import ConfigureAccessPreview from '@/components/ConfigureAccessPreview.vue'
import ConfigureQuickActions from '@/components/ConfigureQuickActions.vue'

const props = defineProps<{ open: boolean; agent: Agent | null }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'rotateKey', agent: Agent): void
  (e: 'restart', agent: Agent): void
  (e: 'openAccessInfo', agent: Agent): void
}>()

const toast = useToast()
const locale = useLocaleStore()

/* ---------- Accordion state ---------- */
const basicX = ref(true)
const resX = ref(true)
const netX = ref(false)
const vappX = ref(false)
const accX = ref(true)
const actX = ref(true)

function tx(k: string) {
  const m: Record<string, { value: boolean }> = { basic: basicX, res: resX, net: netX, vapp: vappX, acc: accX, act: actX }
  const t = m[k]; if (t) t.value = !t.value
}

/* ---------- Agent status ---------- */
const isRunning = computed(() => props.agent?.status === 'running')
const isException = computed(() => props.agent?.status === 'exception')
const resDisabled = computed(() => isException.value)
const netDisabled = computed(() => isException.value)

/* ---------- VM Resources (stub — TODO: fetch from backend) ---------- */
const vmCpu = ref(2)
const vmMemory = ref(4)
const vmDisk = ref(20)
const vmNetworkLabel = ref('')

watch(() => props.open, (v) => {
  if (v && props.agent) {
    apolloClient.query({ query: AGENT_VM_INFO_QUERY, variables: { id: props.agent.id }, fetchPolicy: 'network-only' })
      .then(({ data }: any) => {
        if (data?.agentVmResources) {
          const r = data.agentVmResources
          vmCpu.value = r.cpu; vmMemory.value = r.memory; vmDisk.value = r.disk
          vmNetworkLabel.value = r.networkLabel || ''
          dirtyCpu.value = 0; dirtyMemory.value = 0; dirtyDisk.value = 0
          dirtyPortGroup.value = ''; dirtyRunAs.value = ''; dirtyVApp.value = []
        }
      })
      .catch((err: any) => console.warn('[configure] fetch vm resources failed', err))
  }
})

/* ---------- Editable state (dirty tracking) ---------- */
const dirtyCpu = ref(0)
const dirtyMemory = ref(0)
const dirtyDisk = ref(0)
const dirtyPortGroup = ref('')
const dirtyRunAs = ref('')
const dirtyVApp: ReturnType<typeof ref<Array<{ key: string; value: string }>>> = ref([])

/* ---------- Networks ---------- */
const resourcePoolId = computed(() => props.agent?.resourcePoolId)
const { result: netResult, loading: netLoading } = useQuery(VSPHERE_NETWORKS_QUERY,
  () => ({ resourcePoolId: resourcePoolId.value! }),
  () => ({ enabled: !!resourcePoolId.value && props.open })
)
const networks = computed(() => (netResult.value as any)?.vsphereNetworks ?? [])

/* ---------- Diff computation ---------- */
const hasChanges = computed(() =>
  dirtyCpu.value !== 0 || dirtyMemory.value !== 0 || dirtyDisk.value !== 0 ||
  !!dirtyPortGroup.value || !!dirtyRunAs.value || (dirtyVApp.value?.length ?? 0) > 0
)

const diffs = computed(() => {
  const d: Array<{ label: string; before: string; after: string }> = []
  const num = (key: string, n: number) => locale.t(key).replace('{n}', String(n))
  if (dirtyCpu.value) d.push({ label: locale.t('configure.diff.cpu'), before: num('configure.diff.value.cpu', vmCpu.value), after: num('configure.diff.value.cpu', dirtyCpu.value) })
  if (dirtyMemory.value) d.push({ label: locale.t('configure.diff.memory'), before: num('configure.diff.value.memGb', vmMemory.value), after: num('configure.diff.value.memGb', dirtyMemory.value) })
  if (dirtyDisk.value) d.push({ label: locale.t('configure.diff.disk'), before: num('configure.diff.value.diskGb', vmDisk.value), after: num('configure.diff.value.diskGb', dirtyDisk.value) })
  if (dirtyPortGroup.value) d.push({ label: locale.t('configure.diff.portGroup'), before: vmNetworkLabel.value || '—', after: dirtyPortGroup.value })
  if (dirtyRunAs.value) d.push({ label: locale.t('configure.diff.runAs'), before: props.agent?.credentials?.username || '—', after: dirtyRunAs.value })
  dirtyVApp.value?.forEach(p => d.push({ label: `vApp:${p.key}`, before: '—', after: p.value }))
  return d
})

/* ---------- Save flow ---------- */
const saving = ref(false)
const diffOpen = ref(false)
const saveError = ref<string | null>(null)

function onSave() {
  if (!hasChanges.value) return
  diffOpen.value = true; saveError.value = null
}
async function onConfirmSave() {
  saving.value = true; saveError.value = null
  try {
    const vars: any = { agentId: props.agent!.id }
    if (dirtyCpu.value || dirtyMemory.value || dirtyDisk.value) {
      vars.resource = {} as any
      if (dirtyCpu.value) vars.resource.cpu = dirtyCpu.value
      if (dirtyMemory.value) vars.resource.memory = dirtyMemory.value
      if (dirtyDisk.value) vars.resource.disk = dirtyDisk.value
    }
    if (dirtyPortGroup.value) vars.network = { portGroup: dirtyPortGroup.value }
    if (dirtyVApp.value?.length ?? 0) vars.vAppProperties = dirtyVApp.value
    await apolloClient.mutate({ mutation: RECONFIG_AGENT_VM_MUTATION, variables: vars })
    toast.success(locale.t('configure.savedToast'))
    diffOpen.value = false; emit('close')
  } catch (err: unknown) {
    saveError.value = err instanceof Error ? err.message : locale.t('configure.saveFail')
    toast.error(saveError.value!)
  } finally { saving.value = false }
}

/* ---------- Delegates ---------- */
function onOpenAccessInfo() { if (props.agent) emit('openAccessInfo', props.agent) }
function onRotateKey() { if (props.agent) emit('rotateKey', props.agent) }
function onRestart() { if (props.agent) emit('restart', props.agent) }
</script>

<template>
  <cds-modal :hidden="!props.open" size="lg" @closeChange="emit('close')">
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">{{ locale.t('configure.title').replace('{name}', props.agent?.name || '') }}</h2>
      <p class="modal-subtitle">{{ locale.t('configure.subtitle') }}</p>
    </cds-modal-header>

    <cds-modal-content>
      <div class="config-content">
        <!-- 1. 基础信息 -->
        <div class="accordion-section">
          <button type="button" class="accordion-trigger" :aria-expanded="basicX" @click="tx('basic')">
            <cds-icon :shape="basicX ? 'angle' : 'angle'" :direction="basicX ? 'down' : 'right'" size="sm" class="accordion-arrow"></cds-icon>
            <span class="accordion-label">{{ locale.t('configure.section.basic') }}</span>
          </button>
          <div v-show="basicX" class="accordion-body">
            <ConfigureBasicInfo :agent="props.agent" />
            <cds-alert v-if="props.agent?.endpoint" status="info" class="ic-info-alert">
              <cds-alert-content>
                {{ locale.t('configure.vmIndependenceHint') }}
              </cds-alert-content>
            </cds-alert>
          </div>
        </div>

        <!-- 2. 虚拟机资源配置 -->
        <div class="accordion-section">
          <button type="button" class="accordion-trigger" :aria-expanded="resX" @click="tx('res')">
            <cds-icon :shape="resX ? 'angle' : 'angle'" :direction="resX ? 'down' : 'right'" size="sm" class="accordion-arrow"></cds-icon>
            <span class="accordion-label">{{ locale.t('configure.section.vmResources') }}</span>
          </button>
          <div v-show="resX" class="accordion-body">
            <ConfigureVmResources
              :current-cpu="vmCpu" :current-memory="vmMemory" :current-disk="vmDisk"
              :is-running="isRunning" :disabled="resDisabled"
              @update:cpu="(v) => dirtyCpu = v" @update:memory="(v) => dirtyMemory = v" @update:disk="(v) => dirtyDisk = v"
            />
          </div>
        </div>

        <!-- 3. 网络配置 -->
        <div class="accordion-section">
          <button type="button" class="accordion-trigger" :aria-expanded="netX" @click="tx('net')">
            <cds-icon :shape="netX ? 'angle' : 'angle'" :direction="netX ? 'down' : 'right'" size="sm" class="accordion-arrow"></cds-icon>
            <span class="accordion-label">{{ locale.t('configure.section.network') }}</span>
          </button>
          <div v-show="netX" class="accordion-body">
            <ConfigureNetwork
              :networks="networks" :current-port-group="vmNetworkLabel"
              :disabled="netDisabled" :loading="netLoading"
              @update:port-group="(v) => dirtyPortGroup = v"
            />
          </div>
        </div>

        <!-- 4. vApp 部署参数 -->
        <div class="accordion-section">
          <button type="button" class="accordion-trigger" :aria-expanded="vappX" @click="tx('vapp')">
            <cds-icon :shape="vappX ? 'angle' : 'angle'" :direction="vappX ? 'down' : 'right'" size="sm" class="accordion-arrow"></cds-icon>
            <span class="accordion-label">{{ locale.t('configure.section.vapp') }}</span>
          </button>
          <div v-show="vappX" class="accordion-body">
            <ConfigureVAppProperties
              :template-family-id="props.agent?.templateFamilyId ?? null"
              :template-version-id="props.agent?.templateVersionId ?? null"
              :resource-pool-id="props.agent?.resourcePoolId ?? null"
              :run-as-user="props.agent?.credentials?.username ?? ''"
              :v-app-properties="[]"
              :disabled="resDisabled"
              @update:run-as-user="(v) => dirtyRunAs = v"
              @update:v-app-properties="(v) => dirtyVApp = v"
            />
          </div>
        </div>

        <!-- 5. 网络访问信息 -->
        <div class="accordion-section">
          <button type="button" class="accordion-trigger" :aria-expanded="accX" @click="tx('acc')">
            <cds-icon :shape="accX ? 'angle' : 'angle'" :direction="accX ? 'down' : 'right'" size="sm" class="accordion-arrow"></cds-icon>
            <span class="accordion-label">{{ locale.t('configure.section.access') }}</span>
          </button>
          <div v-show="accX" class="accordion-body">
            <ConfigureAccessPreview
              :endpoint="props.agent?.endpoint ?? null"
              :ip="props.agent?.credentials?.ip ?? ''"
              :ssh-command="props.agent?.credentials?.sshCommand ?? ''"
              @open-access-info="onOpenAccessInfo"
            />
          </div>
        </div>

        <!-- 6. 快捷运维操作 -->
        <div class="accordion-section">
          <button type="button" class="accordion-trigger" :aria-expanded="actX" @click="tx('act')">
            <cds-icon :shape="actX ? 'angle' : 'angle'" :direction="actX ? 'down' : 'right'" size="sm" class="accordion-arrow"></cds-icon>
            <span class="accordion-label">{{ locale.t('configure.section.quickActions') }}</span>
          </button>
          <div v-show="actX" class="accordion-body">
            <ConfigureQuickActions
              :has-changes="hasChanges" :saving="saving"
              :agent-status="props.agent?.status ?? ''"
              @rotate-key="onRotateKey" @restart="onRestart"
              @stop="() => {}" @save="onSave"
            />
          </div>
        </div>
      </div>
    </cds-modal-content>

    <cds-modal-actions>
      <cds-button action="outline" @click="emit('close')">{{ locale.t('common.close') }}</cds-button>
    </cds-modal-actions>
  </cds-modal>

  <!-- Diff confirmation sub-dialog -->
  <ConfirmDiffDialog
    :open="diffOpen" :title="locale.t('configure.diff.title')"
    :diffs="diffs" :loading="saving"
    @close="diffOpen = false" @confirm="onConfirmSave"
  />
</template>

<style scoped>
.modal-title { margin: 0; font-size: 18px; font-weight: 600; }
.modal-subtitle { margin: 8px 0 0; font-size: 13px; color: var(--cds-global-typography-color-300, #86909c); }
.config-content { display: flex; flex-direction: column; }
.accordion-section { border: 1px solid var(--cds-alias-object-border-color, #e5e6eb); border-radius: 6px; margin-bottom: 12px; overflow: hidden; }
.accordion-trigger { display: flex; align-items: center; gap: 8px; width: 100%; padding: 12px 16px; background: var(--cds-alias-object-app-background, #f7f8fa); border: none; cursor: pointer; font: inherit; text-align: left; transition: background 0.15s; }
.accordion-trigger:hover { background: var(--cds-alias-object-app-background, #eef0f4); }
.accordion-arrow { flex-shrink: 0; color: var(--cds-global-typography-color-300, #86909c); }
.accordion-label { font-size: 14px; font-weight: 600; color: var(--cds-global-typography-color-500, #1d2129); }
.accordion-body { padding: 4px 16px 12px; }
.ic-info-alert { margin-top: 12px; }
</style>
