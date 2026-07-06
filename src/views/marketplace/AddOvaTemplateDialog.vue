<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { VM_TEMPLATES_QUERY } from '@/api/graphql/queries/vsphere'
import type { AgentType } from '@/types/agents'
import type { ResourcePool } from '@/types/resource-pool'
import type {
  CreateOvaTemplateFamilyInput,
  OvaTemplateColor,
} from '@/types/marketplace'
import '@/components/icons'

const props = defineProps<{ open: boolean; saving: boolean; pools: ResourcePool[] }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', input: CreateOvaTemplateFamilyInput): void
}>()

const locale = useLocaleStore()

const name = ref('')
const type = ref<AgentType | ''>('')
const version = ref('v1.0.0')
const resourcePoolId = ref('')
const ovaIdentifier = ref('')
const description = ref('')
const toolsText = ref('')
const scenariosText = ref('')
const skillsText = ref('')
const attempted = ref(false)
const customMode = ref(false)

watch(
  () => props.open,
  (o) => {
    if (o) {
      name.value = ''
      type.value = ''
      version.value = 'v1.0.0'
      resourcePoolId.value = props.pools[0]?.id ?? ''
      ovaIdentifier.value = ''
      description.value = ''
      toolsText.value = ''
      scenariosText.value = ''
      skillsText.value = ''
      attempted.value = false
      customMode.value = false
    }
  },
  { immediate: true },
)

// When the pool list arrives after dialog opens, seed the first pool.
watch(
  () => props.pools,
  (pools) => {
    if (props.open && !resourcePoolId.value && pools.length > 0) {
      resourcePoolId.value = pools[0].id
    }
  },
)

/* ---- VM templates from vCenter (custom mode picker) ---- */
const vmtVars = computed(() => ({ resourcePoolId: resourcePoolId.value }))
const vmtEnabled = computed(() => props.open && !!resourcePoolId.value)
const { result: vmtResult, loading: vmtLoading, error: vmtError } = useQuery(
  VM_TEMPLATES_QUERY, vmtVars, () => ({
    enabled: vmtEnabled.value,
    fetchPolicy: 'cache-and-network',
  }))
const vmTemplates = computed(() => vmtResult.value?.vmTemplates ?? [])

// Clear OVA when pool changes.
watch(resourcePoolId, () => { ovaIdentifier.value = '' })

const TYPE_OPTIONS: Array<{ value: AgentType; key: string }> = [
  { value: 'GENERAL_CHAT',     key: 'general-chat' },
  { value: 'IMAGE_GENERATION', key: 'image-generation' },
  { value: 'BASIC_LLM',        key: 'basic-llm' },
  { value: 'OPENCLAW',         key: 'openclaw' },
  { value: 'HERMES',           key: 'hermes' },
  { value: 'CLAUDE_CODE',      key: 'claude-code' },
  { value: 'XIAOGUAI',         key: 'xiaoguai' },
  { value: 'QCODER',           key: 'qcoder' },
  { value: 'OPENCODE',         key: 'opencode' },
]

const ICON_SHAPE_BY_TYPE: Record<AgentType, string> = {
  GENERAL_CHAT: 'talk-bubbles',
  IMAGE_GENERATION: 'image',
  BASIC_LLM: 'atom',
  OPENCLAW: 'wrench',
  HERMES: 'talk-bubbles',
  CLAUDE_CODE: 'world',
  XIAOGUAI: 'book',
  QCODER: 'bar-chart',
  OPENCODE: 'pop-out',
}

const ICON_COLOR_BY_TYPE: Record<AgentType, OvaTemplateColor> = {
  GENERAL_CHAT: 'PURPLE',
  IMAGE_GENERATION: 'PURPLE',
  BASIC_LLM: 'CYAN',
  OPENCLAW: 'BLUE',
  HERMES: 'PURPLE',
  CLAUDE_CODE: 'RED',
  XIAOGUAI: 'GREEN',
  QCODER: 'ORANGE',
  OPENCODE: 'ORANGE',
}

const nameValid = computed(() => name.value.trim().length > 0)
const typeValid = computed(() => !!type.value)
const versionValid = computed(() => version.value.trim().length > 0)
const poolValid = computed(() => !!resourcePoolId.value)
// Library only required in custom mode (and only when vCenter is reachable).
const libraryValid = computed(() => true) // custom mode uses VM templates directly
const ovaIdValid = computed(() => ovaIdentifier.value.trim().length > 0)
const descValid = computed(() => description.value.trim().length > 0)
const toolsValid = computed(
  () => toolsText.value.split('\n').map((s) => s.trim()).filter(Boolean).length > 0,
)
const scenariosValid = computed(
  () => scenariosText.value.split('\n').map((s) => s.trim()).filter(Boolean).length > 0,
)
const skillsValid = computed(
  () => skillsText.value.split('\n').map((s) => s.trim()).filter(Boolean).length > 0,
)

const formValid = computed(
  () =>
    nameValid.value &&
    typeValid.value &&
    versionValid.value &&
    poolValid.value &&
    libraryValid.value &&
    ovaIdValid.value &&
    descValid.value &&
    toolsValid.value &&
    scenariosValid.value &&
    skillsValid.value,
)

function submit() {
  attempted.value = true
  if (!formValid.value || !type.value) return
  const t = type.value
  const tools = toolsText.value.split('\n').map((s) => s.trim()).filter(Boolean)
  const scenarios = scenariosText.value.split('\n').map((s) => s.trim()).filter(Boolean)
  const skills = skillsText.value.split('\n').map((s) => s.trim()).filter(Boolean)
  emit('submit', {
    name: name.value.trim(),
    type: t,
    description: description.value.trim(),
    tools,
    scenarios,
    skills,
    iconShape: ICON_SHAPE_BY_TYPE[t],
    iconColor: ICON_COLOR_BY_TYPE[t],
    initialVersion: {
      version: version.value.trim(),
      ovaIdentifier: ovaIdentifier.value.trim(),
      notes: null,
    },
  })
}

function close() {
  emit('close')
}
</script>

<template>
  <cds-modal
    :hidden="!props.open"
    :closable="!props.saving"
    size="lg"
    @closeChange="close"
  >
    <cds-modal-header>
      <h2 cds-text="title" class="modal-title">
        {{ locale.t('marketplace.form.title.create') }}
      </h2>
    </cds-modal-header>
    <cds-modal-content>
      <form class="tpl-form" @submit.prevent="submit">
        <!-- 模板名称 -->
        <cds-input
          class="full-row"
          :status="attempted && !nameValid ? 'error' : 'neutral'"
        >
          <label class="field-label">{{ locale.t('marketplace.form.name') }} <span class="required">*</span></label>
          <input
            :value="name"
            :placeholder="locale.t('marketplace.form.namePlaceholder')"
            @input="(e: Event) => (name = (e.target as HTMLInputElement).value)"
          />
          <cds-control-message v-if="attempted && !nameValid" status="error">
            {{ locale.t('marketplace.form.error.name') }}
          </cds-control-message>
        </cds-input>

        <!-- 智能体类型 -->
        <cds-select
          class="full-row"
          :status="attempted && !typeValid ? 'error' : 'neutral'"
        >
          <label class="field-label">{{ locale.t('marketplace.form.type') }} <span class="required">*</span></label>
          <select
            :value="type"
            @change="(e: Event) => (type = (e.target as HTMLSelectElement).value as AgentType)"
          >
            <option value="" disabled>请选择智能体类型</option>
            <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">
              {{ locale.t(`marketplace.type.${opt.key}`) }}
            </option>
          </select>
          <cds-control-message v-if="attempted && !typeValid" status="error">
            {{ locale.t('marketplace.form.error.name') }}
          </cds-control-message>
        </cds-select>

        <!-- 初始版本号 -->
        <cds-input :status="attempted && !versionValid ? 'error' : 'neutral'">
          <label class="field-label">{{ locale.t('marketplace.form.initialVersion') }}</label>
          <input
            :value="version"
            :placeholder="locale.t('marketplace.form.versionPlaceholder')"
            @input="(e: Event) => (version = (e.target as HTMLInputElement).value)"
          />
          <cds-control-message v-if="attempted && !versionValid" status="error">
            {{ locale.t('marketplace.form.error.version') }}
          </cds-control-message>
        </cds-input>

        <!-- 资源池 -->
        <cds-select :status="attempted && !poolValid ? 'error' : 'neutral'">
          <label class="field-label">{{ locale.t('marketplace.form.resourcePool') }}</label>
          <select
            :value="resourcePoolId"
            @change="(e: Event) => (resourcePoolId = (e.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>--</option>
            <option v-for="p in props.pools" :key="p.id" :value="p.id">
              {{ p.name }} — {{ p.endpoint }}
            </option>
          </select>
          <cds-control-message v-if="attempted && !poolValid" status="error">
            {{ locale.t('marketplace.form.error.pool') }}
          </cds-control-message>
        </cds-select>

        <!-- 模式切换行 -->
        <div class="mode-toggle full-row">
          <cds-button action="outline" size="sm" @click="customMode = !customMode">
            <cds-icon :shape="customMode ? 'eye' : 'cog'" size="sm"></cds-icon>
            {{ customMode ? '默认模式' : '自定义模式（浏览 vCenter 模板）' }}
          </cds-button>
        </div>

        <!-- 默认模式：直接手动输入 OVA 标识符 -->
        <cds-input
          v-if="!customMode"
          class="full-row"
          :status="attempted && !ovaIdValid ? 'error' : 'neutral'"
        >
          <label class="field-label">{{ locale.t('marketplace.form.ovaIdentifier') }} <span class="required">*</span></label>
          <input
            :value="ovaIdentifier"
            :placeholder="locale.t('marketplace.form.ovaIdentifierPlaceholder')"
            @input="(e: Event) => (ovaIdentifier = (e.target as HTMLInputElement).value)"
          />
          <cds-control-message v-if="attempted && !ovaIdValid" status="error">
            {{ locale.t('marketplace.form.error.ovaIdentifier') }}
          </cds-control-message>
        </cds-input>

        <!-- 自定义模式：浏览 vCenter VM 模板 -->
        <template v-if="customMode">
          <cds-select
            class="full-row"
            :status="vmtError ? 'error' : attempted && !ovaIdValid ? 'error' : 'neutral'"
          >
            <label>vCenter VM 模板</label>
            <cds-control-message v-if="vmtLoading" status="neutral">
              <cds-icon shape="spinner" size="sm" aria-hidden="true"></cds-icon> 正在查询 vCenter 模板列表...
            </cds-control-message>
            <select
              :value="ovaIdentifier"
              :disabled="!resourcePoolId || vmtLoading || !!vmtError || vmTemplates.length === 0"
              @change="(e: Event) => (ovaIdentifier = (e.target as HTMLSelectElement).value)"
            >
              <option value="">
                {{ !resourcePoolId ? '请先选择资源池' : vmtLoading ? '查询中...' : vmtError ? 'vCenter 不可达' : vmTemplates.length === 0 ? '无可用模板' : '选择 VM 模板' }}
              </option>
              <option v-for="tpl in vmTemplates" :key="tpl.name" :value="tpl.name">
                {{ tpl.name }}
              </option>
            </select>
            <cds-control-message v-if="vmtError" status="error">
              vCenter 不可达
            </cds-control-message>
          </cds-select>
          <!-- vCenter 不可达时退回手动输入 -->
          <cds-input
            v-if="vmtError"
            class="full-row"
            :status="attempted && !ovaIdValid ? 'error' : 'neutral'"
          >
            <label>OVA 标识符</label>
            <input
              :value="ovaIdentifier"
              placeholder="手动输入 VM 模板名称（如 dlvmova）"
              @input="(e: Event) => (ovaIdentifier = (e.target as HTMLInputElement).value)"
            />
          </cds-input>
        </template>

        <!-- 描述 -->
        <cds-input
          class="full-row"
          :status="attempted && !descValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.form.description') }}</label>
          <textarea
            :value="description"
            rows="3"
            @input="(e: Event) => (description = (e.target as HTMLTextAreaElement).value)"
          ></textarea>
          <cds-control-message v-if="attempted && !descValid" status="error">
            {{ locale.t('marketplace.form.error.name') }}
          </cds-control-message>
        </cds-input>

        <!-- 工具 -->
        <cds-input
          class="full-row"
          :status="attempted && !toolsValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.form.tools') }}</label>
          <textarea
            :value="toolsText"
            rows="4"
            @input="(e: Event) => (toolsText = (e.target as HTMLTextAreaElement).value)"
            placeholder="每行一条"
          ></textarea>
          <span class="field-hint">每行仅填写一条内容</span>
          <cds-control-message v-if="attempted && !toolsValid" status="error">
            {{ locale.t('marketplace.form.error.name') }}
          </cds-control-message>
        </cds-input>

        <!-- 场景 -->
        <cds-input
          class="full-row"
          :status="attempted && !scenariosValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.form.scenarios') }}</label>
          <textarea
            :value="scenariosText"
            rows="4"
            @input="(e: Event) => (scenariosText = (e.target as HTMLTextAreaElement).value)"
            placeholder="每行一条"
          ></textarea>
          <span class="field-hint">每行仅填写一条内容</span>
          <cds-control-message v-if="attempted && !scenariosValid" status="error">
            {{ locale.t('marketplace.form.error.name') }}
          </cds-control-message>
        </cds-input>

        <!-- 技能 -->
        <cds-input
          class="full-row"
          :status="attempted && !skillsValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.form.skills') }}</label>
          <textarea
            :value="skillsText"
            rows="4"
            @input="(e: Event) => (skillsText = (e.target as HTMLTextAreaElement).value)"
            placeholder="每行一条"
          ></textarea>
          <span class="field-hint">每行仅填写一条内容</span>
          <cds-control-message v-if="attempted && !skillsValid" status="error">
            {{ locale.t('marketplace.form.error.name') }}
          </cds-control-message>
        </cds-input>
      </form>
    </cds-modal-content>
    <cds-modal-actions>
      <cds-button action="outline" :disabled="props.saving" @click="close">
        {{ locale.t('marketplace.form.cancel') }}
      </cds-button>
      <cds-button
        :loading-state="props.saving ? 'loading' : 'default'"
        :disabled="props.saving"
        @click="submit"
      >
        {{ locale.t('marketplace.form.submit') }}
      </cds-button>
    </cds-modal-actions>
  </cds-modal>
</template>

<style scoped>
.tpl-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.tpl-form .full-row {
  grid-column: 1 / -1;
}
.modal-title {
  margin: 0;
}
.mode-toggle {
  display: flex;
  justify-content: flex-end;
  margin-bottom: -4px;
}
.mode-btn {
  background: none;
  border: 1px solid var(--cds-alias-object-border-color, #9999a1);
  border-radius: 4px;
  color: var(--cds-alias-typography-color-200, #4d4d4d);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 2px 10px;
}
.mode-btn:hover {
  background: var(--cds-alias-object-interaction-background-hover, #f0f0f0);
}

.field-label { font-size: 14px; font-weight: 400; color: #333; }
.required { color: #ef4444; }
.field-hint { display: block; font-size: 12px; color: #86909c; margin-top: 4px; line-height: 1.4; }
.modal-title { font-size: 16px !important; font-weight: 600 !important; color: #1d2129 !important; }
.mode-hint { font-size: 12px; color: #86909c; }
.tpl-form { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif; font-size: 14px; color: #333; }

</style>
