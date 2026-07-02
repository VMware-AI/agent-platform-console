<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { CONTENT_LIBRARIES_QUERY, CONTENT_LIBRARY_ITEMS_QUERY } from '@/api/graphql/queries/vsphere'
import type { AgentType } from '@/types/agents'
import type { ResourcePool } from '@/types/resource-pool'
import type {
  ContentLibraryItem,
  ContentLibrariesQueryVars,
  ContentLibrariesQueryResult,
  ContentLibraryItemsQueryVars,
  ContentLibraryItemsQueryResult,
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
const contentLibraryName = ref('')
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
      contentLibraryName.value = ''
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

/* ---- Content libraries (keyed off selected resource pool) ---- */
const libsVars = computed<ContentLibrariesQueryVars>(() => ({
  resourcePoolId: resourcePoolId.value,
}))
const libsEnabled = computed(() => props.open && !!resourcePoolId.value)
const { result: libsResult, loading: libsLoading, error: libsError } = useQuery<
  ContentLibrariesQueryResult,
  ContentLibrariesQueryVars
>(CONTENT_LIBRARIES_QUERY, libsVars, () => ({
  enabled: libsEnabled.value,
  fetchPolicy: 'cache-and-network',
}))
const contentLibraries = computed<string[]>(() => libsResult.value?.contentLibraries ?? [])

// Clear library + OVA when the pool changes; auto-select when only one library.
watch(resourcePoolId, () => {
  contentLibraryName.value = ''
  ovaIdentifier.value = ''
})
watch(contentLibraries, (libs) => {
  if (!contentLibraryName.value && libs.length === 1) {
    contentLibraryName.value = libs[0]
  }
})

/* ---- Content library items (keyed off selected library) ---- */
const itemsVars = computed<ContentLibraryItemsQueryVars>(() => ({
  resourcePoolId: resourcePoolId.value,
  libraryName: contentLibraryName.value,
}))
const itemsEnabled = computed(() => props.open && !!resourcePoolId.value && !!contentLibraryName.value)
const { result: itemsResult, loading: itemsLoading, error: itemsError } = useQuery<
  ContentLibraryItemsQueryResult,
  ContentLibraryItemsQueryVars
>(CONTENT_LIBRARY_ITEMS_QUERY, itemsVars, () => ({
  enabled: itemsEnabled.value,
  fetchPolicy: 'cache-and-network',
}))
const libraryItems = computed<ContentLibraryItem[]>(
  () => itemsResult.value?.contentLibraryItems ?? [],
)

// Clear OVA when the library changes; auto-select when only one item.
watch(contentLibraryName, () => {
  ovaIdentifier.value = ''
})
watch(libraryItems, (items) => {
  if (!ovaIdentifier.value && items.length === 1) {
    ovaIdentifier.value = items[0].name
  }
})

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
const libraryValid = computed(() => !customMode.value || !!libsError.value || !!contentLibraryName.value)
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
          <label>{{ locale.t('marketplace.form.name') }}</label>
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
          <label>{{ locale.t('marketplace.form.type') }}</label>
          <select
            :value="type"
            @change="(e: Event) => (type = (e.target as HTMLSelectElement).value as AgentType)"
          >
            <option value="" disabled>--</option>
            <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">
              {{ locale.t(`marketplace.type.${opt.key}`) }}
            </option>
          </select>
<cds-control-message
            v-if="attempted && !typeValid"
            status="error"
          >
            {{ locale.t('marketplace.form.error.type') }}
          </cds-control-message>
        </cds-select>

        <!-- 初始版本号 -->
        <cds-input :status="attempted && !versionValid ? 'error' : 'neutral'">
          <label>{{ locale.t('marketplace.form.initialVersion') }}</label>
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
          <label>{{ locale.t('marketplace.form.resourcePool') }}</label>
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
          <button type="button" class="mode-btn" @click="customMode = !customMode">
            {{ customMode ? locale.t('marketplace.form.switchToDefault') : locale.t('marketplace.form.switchToCustom') }}
          </button>
        </div>

        <!-- 默认模式：直接手动输入 OVA 标识符 -->
        <cds-input
          v-if="!customMode"
          class="full-row"
          :status="attempted && !ovaIdValid ? 'error' : 'neutral'"
        >
          <label>{{ locale.t('marketplace.form.ovaIdentifier') }}</label>
          <input
            :value="ovaIdentifier"
            :placeholder="locale.t('marketplace.form.ovaIdentifierPlaceholder')"
            @input="(e: Event) => (ovaIdentifier = (e.target as HTMLInputElement).value)"
          />
          <cds-control-message v-if="attempted && !ovaIdValid" status="error">
            {{ locale.t('marketplace.form.error.ovaIdentifier') }}
          </cds-control-message>
        </cds-input>

        <!-- 自定义模式：内容库 + OVA 下拉 -->
        <template v-if="customMode">
          <!-- 内容库 -->
          <cds-select :status="libsError ? 'error' : attempted && !libraryValid ? 'error' : 'neutral'">
            <label>{{ locale.t('marketplace.form.contentLibrary') }}</label>
            <select
              :value="contentLibraryName"
              :disabled="!resourcePoolId || libsLoading || !!libsError || contentLibraries.length === 0"
              @change="(e: Event) => (contentLibraryName = (e.target as HTMLSelectElement).value)"
            >
              <option value="">
                {{
                  !resourcePoolId
                    ? locale.t('marketplace.form.contentLibrarySelectPool')
                    : libsLoading
                      ? locale.t('marketplace.form.contentLibraryLoading')
                      : libsError
                        ? locale.t('marketplace.form.contentLibraryError')
                        : contentLibraries.length === 0
                          ? locale.t('marketplace.form.contentLibraryEmpty')
                          : locale.t('marketplace.form.contentLibraryPlaceholder')
                }}
              </option>
              <option v-for="lib in contentLibraries" :key="lib" :value="lib">{{ lib }}</option>
            </select>
            <cds-control-message v-if="libsError" status="error">
              {{ locale.t('marketplace.form.contentLibraryError') }}
            </cds-control-message>
            <cds-control-message v-else-if="attempted && !libraryValid" status="error">
              {{ locale.t('marketplace.form.error.contentLibrary') }}
            </cds-control-message>
          </cds-select>

          <!-- OVA 模板（从内容库选择；vCenter 不可达时退回手动输入） -->
          <cds-select
            v-if="!itemsError && !libsError"
            class="full-row"
            :status="attempted && !ovaIdValid ? 'error' : 'neutral'"
          >
            <label>{{ locale.t('marketplace.form.ovaTemplate') }}</label>
            <select
              :value="ovaIdentifier"
              :disabled="!contentLibraryName || itemsLoading || libraryItems.length === 0"
              @change="(e: Event) => (ovaIdentifier = (e.target as HTMLSelectElement).value)"
            >
              <option value="">
                {{
                  !resourcePoolId
                    ? locale.t('marketplace.form.ovaTemplateSelectPool')
                    : !contentLibraryName
                      ? locale.t('marketplace.form.ovaTemplateSelectLibrary')
                      : itemsLoading
                        ? locale.t('marketplace.form.ovaTemplateLoading')
                        : libraryItems.length === 0
                          ? locale.t('marketplace.form.ovaTemplateEmpty')
                          : locale.t('marketplace.form.ovaTemplatePlaceholder')
                }}
              </option>
              <option
                v-for="item in libraryItems"
                :key="item.name"
                :value="item.name"
              >{{ item.name }}</option>
            </select>
            <cds-control-message v-if="attempted && !ovaIdValid" status="error">
              {{ locale.t('marketplace.form.error.ovaTemplate') }}
            </cds-control-message>
          </cds-select>
          <!-- 退回手动输入（vCenter 不可达时）-->
          <cds-input
            v-else
            class="full-row"
            :status="attempted && !ovaIdValid ? 'error' : 'neutral'"
          >
            <label>{{ locale.t('marketplace.form.ovaTemplate') }}</label>
            <input
              :value="ovaIdentifier"
              :placeholder="locale.t('marketplace.form.ovaTemplatePlaceholder')"
              @input="(e: Event) => (ovaIdentifier = (e.target as HTMLInputElement).value)"
            />
            <cds-control-message status="warning">
              {{ locale.t('marketplace.form.contentLibraryError') }}
            </cds-control-message>
            <cds-control-message v-if="attempted && !ovaIdValid" status="error">
              {{ locale.t('marketplace.form.error.ovaTemplate') }}
            </cds-control-message>
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
<cds-control-message
            v-if="attempted && !descValid"
            status="error"
          >
            {{ locale.t('marketplace.form.error.description') }}
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
          ></textarea>
<cds-control-message
            v-if="attempted && !toolsValid"
            status="error"
          >
            {{ locale.t('marketplace.form.error.tools') }}
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
          ></textarea>
<cds-control-message
            v-if="attempted && !scenariosValid"
            status="error"
          >
            {{ locale.t('marketplace.form.error.scenarios') }}
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
            :placeholder="locale.t('marketplace.form.skillsPlaceholder')"
            @input="(e: Event) => (skillsText = (e.target as HTMLTextAreaElement).value)"
          ></textarea>
<cds-control-message
            v-if="attempted && !skillsValid"
            status="error"
          >
            {{ locale.t('marketplace.form.error.skills') }}
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
</style>
