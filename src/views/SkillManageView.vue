<script setup lang="ts">
/* eslint-disable */
import { computed, reactive, ref } from 'vue'
import { useQuery, useMutation } from '@vue/apollo-composable'
import gql from 'graphql-tag'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const toast = useToast()
const locale = useLocaleStore()

type SkillStatus = 'enabled' | 'disabled'
interface SkillView { id: string; name: string; version: string; description: string; uri: string; installMethod: string; packageUrl: string; status: SkillStatus; createdAt: string; category: string; agentTypes: string[] }

/* CATS are storage identifiers (kept stable across locales); their display
   names go through `localeCategory()` so the dropdown reads in the active
   language. Same goes for the installMethod enum below. */
const CATS = ['开发','运维','办公','安全','数据','AI']
const CATEGORY_KEYS: Record<string, string> = {
  '开发': 'skills.category.开发',
  '运维': 'skills.category.运维',
  '办公': 'skills.category.办公',
  '安全': 'skills.category.安全',
  '数据': 'skills.category.数据',
  'AI':   'skills.category.AI',
}
function localeCategory(c: string): string {
  return locale.t(CATEGORY_KEYS[c] ?? `skills.category.${c}`)
}

const INSTALL_METHOD_KEYS: Record<string, string> = {
  pip: 'skills.installMethod.pip',
  'pip-requirements': 'skills.installMethod.pip-requirements',
  npm: 'skills.installMethod.npm',
  binary: 'skills.installMethod.binary',
  'openclaw-skill': 'skills.installMethod.openclaw-skill',
  'opencode-skill': 'skills.installMethod.opencode-skill',
  'hermes-plugin': 'skills.installMethod.hermes-plugin',
}
function localeInstallMethod(m: string): string {
  return locale.t(INSTALL_METHOD_KEYS[m] ?? `skills.installMethod.${m}`)
}

const SL = computed<Record<SkillStatus, string>>(() => ({
  enabled:  locale.t('skills.status.enabled'),
  disabled: locale.t('skills.status.disabled'),
}))

const Q = gql`query Skills { skills { id name version description uri installMethod packageUrl mcpConfig createdAt category agentTypes } }`
const MU = gql`mutation UpsertSkill($input: UpsertSkillInput!) { upsertSkill(input: $input) { id name } }`
const MD = gql`mutation DeleteSkill($id: ID!) { deleteSkill(id: $id) }`
const { result, loading, error: qe, refetch } = useQuery(Q, null, () => ({ fetchPolicy: 'network-only' }))
const { mutate: upsert } = useMutation(MU)
const { mutate: del } = useMutation(MD)

const skills = computed<SkillView[]>(() =>
  ((result.value as any)?.skills ?? []).map((s: any) => ({
    id: s.id, name: s.name, version: s.version ?? '', description: s.description ?? '',
    uri: s.uri ?? '', installMethod: s.installMethod ?? '', category: (s as any).category ?? '', packageUrl: s.packageUrl ?? '',
    status: (s.name?.includes('deprecated') || s.name?.includes('_v0')) ? 'disabled' : 'enabled',
    createdAt: s.createdAt ?? '', agentTypes: s.agentTypes ?? [],
  })).sort((a: any, b: any) => a.name.localeCompare(b.name))
)

const search = ref('')
const sf = ref<SkillStatus | 'all'>('all')
const cf = ref<string>('all')
const filtered = computed(() => skills.value.filter(s => {
  const q = search.value.trim().toLowerCase()
  return (!q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    && (sf.value === 'all' || s.status === sf.value)
    && (cf.value === 'all' || s.category === cf.value)
}))
const totalCount = computed(() => skills.value.length)
const filteredCount = computed(() => filtered.value.length)
const selectedCount = computed(() => sel.size)

const sel = reactive(new Set<string>())
const allCk = computed(() => sel.size > 0 && sel.size === filtered.value.length)
function toggleAll() { if (allCk.value) sel.clear(); else filtered.value.forEach(s => sel.add(s.id)) }

const dt = ref<SkillView | null>(null)
const doOpen = ref(false)
const dBody = computed(() => dt.value ? locale.t('skills.confirm.deleteBody').replace('{name}', dt.value.name) : '')
async function execDel() {
  if (!dt.value) return
  try { await del({ id: dt.value.id }); toast.success(locale.t('skills.toast.deleted').replace('{name}', dt.value.name)); doOpen.value = false; dt.value = null; await refetch() }
  catch (e: any) { toast.error(locale.t('skills.toast.deletedFail').replace('{message}', e?.message || String(e))) }
}

const dw = ref(false)
const dm = ref<'create' | 'edit'>('create')
const ed = ref<SkillView | null>(null)
const f = reactive({ name: '', dname: '', desc: '', ver: '1.0.0', uri: '', im: 'pip', pkg: '', cfg: '', st: 'enabled' as SkillStatus, cat: '', at: [] as string[] })
const fe = ref('')
const se = ref('')
const sv = ref(false)

function reset() { f.name = ''; f.dname = ''; f.desc = ''; f.ver = '1.0.0'; f.uri = ''; f.im = 'pip'; f.pkg = ''; f.cfg = ''; f.st = 'enabled'; f.cat = ''; f.at = []; fe.value = ''; se.value = ''; ed.value = null }
function openNew() { reset(); dm.value = 'create'; dw.value = true }
function openEdit(s: SkillView) { reset(); dm.value = 'edit'; ed.value = s; f.name = s.name; f.dname = s.name; f.desc = s.description; f.ver = s.version; f.uri = s.uri; f.im = s.installMethod || 'pip'; f.pkg = s.packageUrl; f.st = s.status; f.cat = (s as any).category || ''; dw.value = true }

function vld(): boolean {
  fe.value = ''
  if (!f.name.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.name.trim())) { fe.value = locale.t('skills.dialog.error.invalidId'); return false }
  if (!f.dname.trim()) { fe.value = locale.t('skills.dialog.error.requiredName'); return false }
  if (!f.desc.trim()) { fe.value = locale.t('skills.dialog.error.requiredDesc'); return false }
  if (!f.uri.trim()) { fe.value = locale.t('skills.dialog.error.requiredUri'); return false }
  if (f.cfg.trim()) { try { JSON.parse(f.cfg) } catch { fe.value = locale.t('skills.dialog.error.invalidJson'); return false } }
  return true
}

async function submit() {
  se.value = ''; if (!vld()) return
  sv.value = true
  try {
    const inp: any = { name: f.name.trim(), version: f.ver.trim(), uri: f.uri.trim(), installMethod: f.im }
    if (f.desc.trim()) inp.description = f.desc.trim()
    if (f.pkg.trim()) inp.packageUrl = f.pkg.trim()
    if (f.cat.trim()) { (inp as any).category = f.cat.trim() }
    if (f.cfg.trim()) { try { inp.mcpConfig = JSON.parse(f.cfg) } catch {} }
    // Agent-specific methods auto-force agentTypes.
    if (f.im === 'openclaw-skill') inp.agentTypes = ['OPENCLAW']
    else if (f.im === 'opencode-skill') inp.agentTypes = ['OPENCODE']
    else if (f.im === 'hermes-plugin') inp.agentTypes = ['HERMES']
    else if (f.at.length > 0) inp.agentTypes = f.at
    await upsert({ input: inp })
    dw.value = false; toast.success(locale.t(dm.value === 'create' ? 'skills.toast.created' : 'skills.toast.updated').replace('{name}', f.name)); await refetch()
  } catch (e: any) { se.value = e?.message || String(e) }
  finally { sv.value = false }
}

// ─── Offline package sync / upload ──────────────────────────────────
const syncing = ref(false)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  selectedFile.value = input.files?.[0] || null
}

// Programmatically click the hidden native <input type="file"> so we can
// style the trigger button ourselves — the native browser control's "选择
// 文件 / 未选择任何文件" label is OS-locale-bound and bypasses our i18n.
function pickFile() {
  fileInput.value?.click()
}

const repoBase = ref('http://172.16.85.230:8081')
function isExternalURL(url: string) { return url && !!repoBase.value && !url.startsWith(repoBase.value) }
function isOfflineReady(url: string) { return url && !!repoBase.value && url.startsWith(repoBase.value) }

async function syncPackage() {
  if (!f.pkg || !ed.value) return
  syncing.value = true
  try {
    const resp = await fetch(`/v1/skills/sync/${ed.value.id}`, { method: 'POST' })
    if (!resp.ok) throw new Error(await resp.text())
    f.pkg = `${repoBase.value}/${f.name}-${f.ver}.tar.gz`
    toast.success(locale.t('skills.toast.syncOk'))
    await refetch()
  } catch (e: any) { toast.error(locale.t('skills.toast.syncFail').replace('{message}', e.message)) }
  finally { syncing.value = false }
}

// ─── Install to Agent ───────────────────────────────────────────
const installSkill = ref<SkillView | null>(null)
const installOpen = ref(false)
const installIP = ref('')
const installing = ref(false)

function openInstall(s: SkillView) { installSkill.value = s; installOpen.value = true }

async function doInstall() {
  if (!installSkill.value || !installIP.value.trim()) return
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(installIP.value.trim())) { toast.error(locale.t('skills.dialog.error.invalidIp')); return }
  installing.value = true
  try {
    const resp = await fetch(`/v1/skills/install/${installIP.value.trim()}/${installSkill.value.id}`, { method: 'POST' })
    if (!resp.ok) throw new Error(await resp.text())
    toast.success(locale.t('skills.toast.installOk').replace('{ip}', installIP.value).replace('{name}', installSkill.value.name))
    installOpen.value = false
  } catch (e: any) { toast.error(locale.t('skills.toast.installFail').replace('{message}', e.message)) }
  finally { installing.value = false }
}

async function uploadFile() {
  if (!selectedFile.value || !ed.value) return
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    const resp = await fetch(`/v1/skills/upload/${ed.value.id}`, { method: 'POST', body: formData })
    if (!resp.ok) throw new Error(await resp.text())
    f.pkg = `http://172.16.85.230:8081/${f.name}-${f.ver}.tar.gz`
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
    toast.success(locale.t('skills.toast.uploadOk'))
    await refetch()
  } catch (e: any) { toast.error(locale.t('skills.toast.uploadFail').replace('{message}', e.message)) }
  finally { uploading.value = false }
}

function em(e: unknown): string {
  const a = e as any
  if (Array.isArray(a?.graphQLErrors) && a.graphQLErrors.length) return a.graphQLErrors.map((g: any) => g.message).join('；')
  if (a?.networkError?.message) return locale.t('skills.error.network').replace('{message}', a.networkError.message)
  return a?.message || locale.t('skills.error.unknown')
}
</script>

<template>
  <div class="sp">
    <header class="page-head">
      <div class="page-head-row">
        <div>
          <h1 cds-text="title" class="heading">{{ locale.t('skills.title') }}</h1>
          <p cds-text="body" class="desc muted">{{ locale.t('skills.description') }}</p>
        </div>
        <cds-button
          class="toolbar-create"
          action="outline"
          status="primary"
          @click="openNew"
        >
          <cds-icon shape="plus-circle" size="sm" aria-hidden="true"></cds-icon>
          {{ locale.t('skills.action.create') }}
        </cds-button>
      </div>
    </header>

    <div class="sp-meta" :aria-label="locale.t('skills.meta.aria')">
      <div class="meta-card">
        <span class="meta-num">{{ totalCount }}</span>
        <span class="meta-label">{{ locale.t('skills.meta.total') }}</span>
      </div>
      <div class="meta-card">
        <span class="meta-num">{{ filteredCount }}</span>
        <span class="meta-label">{{ locale.t('skills.meta.filtered') }}</span>
      </div>
      <div class="meta-card">
        <span class="meta-num">{{ selectedCount }}</span>
        <span class="meta-label">{{ locale.t('skills.meta.selected') }}</span>
      </div>
    </div>

    <div class="sp-tb">
      <div class="tb-search">
        <svg class="tb-si" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input v-model="search" :placeholder="locale.t('skills.search.placeholder')" class="tb-sin" />
        <button v-if="search" class="tb-sc" @click="search = ''">&times;</button>
      </div>
      <select v-model="cf" class="tb-sel">
        <option value="all">{{ locale.t('skills.filter.category.all') }}</option>
        <option v-for="c in CATS" :key="c" :value="c">{{ localeCategory(c) }}</option>
      </select>
      <select v-model="sf" class="tb-sel">
        <option value="all">{{ locale.t('skills.filter.status.all') }}</option>
        <option value="enabled">{{ locale.t('skills.status.enabled') }}</option>
        <option value="disabled">{{ locale.t('skills.status.disabled') }}</option>
      </select>
      <button
        type="button"
        class="refresh-button"
        :disabled="loading"
        :aria-label="locale.t('skills.action.refresh')"
        :title="locale.t('skills.action.refresh')"
        @click="refetch()"
      >
        <cds-icon
          shape="refresh"
          size="md"
          :class="{ spinning: loading }"
          aria-hidden="true"
        ></cds-icon>
      </button>
    </div>

    <div v-if="loading" class="sp-sk">
      <div class="sk-row" v-for="i in 5" :key="i"><span class="sk-c" v-for="j in 5" :key="j" :style="{width: [100,180,70,80,60][j-1]+'px'}"/></div>
    </div>

    <div v-else-if="qe" class="sp-em">
      <div class="em-icon">!</div>
      <h3>{{ locale.t('skills.error.loadFailed.title') }}</h3>
      <p>{{ em(qe) }}</p>
      <cds-button type="button" action="outline" status="primary" @click="refetch()">{{ locale.t('skills.action.retry') }}</cds-button>
    </div>

    <div v-else-if="skills.length === 0" class="sp-em">
      <div class="em-icon em-icn--info">i</div>
      <h3>{{ locale.t('skills.empty.title') }}</h3>
      <p>{{ locale.t('skills.empty.description') }}</p>
      <cds-button type="button" action="outline" status="primary" @click="openNew">{{ locale.t('skills.empty.create') }}</cds-button>
    </div>

    <div v-else-if="filtered.length === 0" class="sp-em">
      <div class="em-icon em-icn--info">i</div>
      <h3>{{ locale.t('skills.empty.filteredTitle') }}</h3>
      <p>{{ search ? locale.t('skills.empty.filteredDesc1').replace('{query}', search) : locale.t('skills.empty.filteredDesc2') }}</p>
      <cds-button type="button" action="outline" @click="search = ''; sf = 'all'; cf = 'all'">{{ locale.t('skills.action.clearFilter') }}</cds-button>
    </div>

    <div v-else class="sp-tbl">
      <table>
        <thead>
          <tr>
            <th class="th-cb"><input type="checkbox" :checked="allCk" @change="toggleAll" /></th>
            <th>{{ locale.t('skills.col.name') }}</th>
            <th>{{ locale.t('skills.col.description') }}</th>
            <th>{{ locale.t('skills.col.category') }}</th>
            <th class="th-r">{{ locale.t('skills.col.agent') }}</th>
            <th class="th-r">{{ locale.t('skills.col.version') }}</th>
            <th class="th-r">{{ locale.t('skills.col.installMethod') }}</th>
            <th class="th-r">{{ locale.t('skills.col.status') }}</th>
            <th class="th-act">{{ locale.t('skills.col.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in filtered" :key="s.id" :class="{ 'tr-sel': sel.has(s.id) }">
            <td class="th-cb"><input type="checkbox" :checked="sel.has(s.id)" @change="sel.has(s.id) ? sel.delete(s.id) : sel.add(s.id)" /></td>
            <td>
              <div class="td-name">{{ s.name }}</div>
            </td>
            <td><div class="td-desc">{{ s.description || '—' }}</div></td>
            <td><span v-if="s.category" class="tag tag-blue">{{ localeCategory(s.category) }}</span></td>
            <td class="th-r"><span v-for="at in s.agentTypes" :key="at" class="tag tag-purple" style="margin-right: 2px">{{ at }}</span><span v-if="!s.agentTypes?.length" class="tag tag-gray">{{ locale.t('skills.agentTypes.all') }}</span></td>
            <td class="th-r"><span class="tag tag-gray">v{{ s.version || '—' }}</span></td>
            <td class="th-r"><span v-if="s.installMethod" class="tag tag-blue">{{ localeInstallMethod(s.installMethod) }}</span></td>
            <td class="th-r"><span class="tag" :class="s.status === 'enabled' ? 'tag-green' : 'tag-gray'">{{ SL[s.status] }}</span></td>
            <td class="th-act">
              <span class="row-actions">
                <button class="row-action" :title="locale.t('skills.action.edit')" :aria-label="locale.t('skills.action.edit')" @click="openEdit(s)">
                  <cds-icon shape="pencil" size="sm" aria-hidden="true"></cds-icon>
                  <span>{{ locale.t('skills.action.edit') }}</span>
                </button>
                <button
                  v-if="s.packageUrl && isOfflineReady(s.packageUrl)"
                  class="row-action"
                  :title="locale.t('skills.action.installToAgent')"
                  :aria-label="locale.t('skills.action.installToAgent')"
                  @click="openInstall(s)"
                >
                  <cds-icon shape="download" size="sm" aria-hidden="true"></cds-icon>
                  <span>{{ locale.t('skills.action.install') }}</span>
                </button>
                <button class="row-action danger" :title="locale.t('skills.action.delete')" :aria-label="locale.t('skills.action.delete')" @click="dt = s; doOpen = true">
                  <cds-icon shape="trash" size="sm" aria-hidden="true"></cds-icon>
                  <span>{{ locale.t('skills.action.delete') }}</span>
                </button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Teleport to="body">
      <div v-if="dw" class="dr-bd" @click.self="!sv && (dw = false)" />
      <div v-if="dw" class="dr">
        <div class="dr-h">
          <h2>{{ locale.t(dm === 'create' ? 'skills.dialog.createTitle' : 'skills.dialog.editTitle') }}</h2>
          <button class="dr-close" @click="!sv && (dw = false)" :disabled="sv">&times;</button>
        </div>
        <div class="dr-b">
          <div v-if="se" class="dr-err">{{ se }}</div>
          <div v-if="fe" class="dr-err">{{ fe }}</div>
          <div class="fg">
            <div class="fg-tt">{{ locale.t('skills.dialog.section.basic') }}</div>
            <div class="fg-row">
              <label class="fl">{{ locale.t('skills.dialog.field.id') }} <span class="fl-req">*</span></label>
              <input v-model="f.name" :disabled="dm === 'edit'" class="fi" :placeholder="locale.t('skills.dialog.field.idPlaceholder')" />
              <p class="fh">{{ locale.t('skills.dialog.field.idHelp') }}</p>
            </div>
            <div class="fg-row">
              <label class="fl">{{ locale.t('skills.dialog.field.name') }} <span class="fl-req">*</span></label>
              <input v-model="f.dname" class="fi" :placeholder="locale.t('skills.dialog.field.namePlaceholder')" />
            </div>
            <div class="fg-row">
              <label class="fl">{{ locale.t('skills.dialog.field.description') }} <span class="fl-req">*</span></label>
              <textarea v-model="f.desc" class="fi ft" rows="3" maxlength="500" :placeholder="locale.t('skills.dialog.field.descriptionPlaceholder')" />
              <p class="fh">{{ f.desc.length }}/500</p>
            </div>
          </div>
          <div class="fg">
            <div class="fg-tt">{{ locale.t('skills.dialog.section.install') }}</div>
            <div class="fg-row">
              <label class="fl">{{ locale.t('skills.dialog.field.category') }}</label>
              <select v-model="f.cat" class="fi">
                <option value="">{{ locale.t('skills.dialog.field.none') }}</option>
                <option v-for="c in CATS" :key="c" :value="c">{{ localeCategory(c) }}</option>
              </select>
            </div>
            <div class="fg-row">
              <label class="fl">{{ locale.t('skills.dialog.field.agentTypes') }}</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <label v-for="t in ['OPENCLAW','OPENCODE','HERMES']" :key="t" style="display:flex;align-items:center;gap:4px;font-size:13px" :style="{ opacity: ['openclaw-skill','opencode-skill','hermes-plugin'].includes(f.im) ? 0.5 : 1 }">
                  <input type="checkbox" :value="t" v-model="f.at" :disabled="['openclaw-skill','opencode-skill','hermes-plugin'].includes(f.im)" /> {{ t === 'OPENCLAW' ? 'OpenClaw' : t === 'OPENCODE' ? 'OpenCode' : 'Hermes' }}
                </label>
              </div>
            </div>
            <div class="fg-row">
              <label class="fl">{{ locale.t('skills.dialog.field.installMethod') }}</label>
              <select v-model="f.im" class="fi">
                <option v-for="m in Object.keys(INSTALL_METHOD_KEYS)" :key="m" :value="m">{{ localeInstallMethod(m) }}</option>
              </select>
            </div>
            <div class="fg-row">
              <label class="fl">{{ locale.t('skills.dialog.field.uri') }} <span class="fl-req">*</span></label>
              <input v-model="f.uri" class="fi" :placeholder="locale.t('skills.dialog.field.uriPlaceholder')" />
            </div>
            <div class="fg-row">
              <label class="fl">{{ locale.t('skills.dialog.field.version') }}</label>
              <input v-model="f.ver" class="fi" :placeholder="locale.t('skills.dialog.field.versionPlaceholder')" />
            </div>
          </div>
          <div class="fg">
            <div class="fg-tt">{{ locale.t('skills.dialog.section.offline') }}</div>
            <div class="fg-row">
              <label class="fl">{{ locale.t('skills.dialog.field.repoBase') }}</label>
              <input v-model="repoBase" class="fi" placeholder="http://172.16.85.230:8081" />
              <p class="fh">{{ locale.t('skills.dialog.field.repoBaseHelp') }}</p>
            </div>
            <div class="fg-row">
              <label class="fl">{{ locale.t('skills.dialog.field.pkg') }}</label>
              <div class="fi-row">
                <input v-model="f.pkg" class="fi" placeholder="https://github.com/.../main.tar.gz" />
                <cds-button
                  type="button"
                  action="outline"
                  status="primary"
                  size="sm"
                  :disabled="syncing || !f.pkg"
                  @click="syncPackage"
                >
                  <span v-if="syncing" class="btn-spin" aria-hidden="true" />
                  {{ syncing ? locale.t('skills.action.syncing') : locale.t('skills.action.sync') }}
                </cds-button>
              </div>
              <p class="fh">{{ locale.t('skills.dialog.field.syncHelp') }}</p>
            </div>
            <div class="fg-row">
              <label class="fl">{{ locale.t('skills.dialog.field.upload') }}</label>
              <div class="fi-row">
                <input
                  type="file"
                  ref="fileInput"
                  accept=".tar.gz,.tgz,.tar"
                  class="fi-hidden"
                  @change="onFileSelected"
                />
                <button
                  type="button"
                  class="file-pick"
                  :disabled="uploading"
                  @click="pickFile"
                >
                  {{ locale.t('skills.dialog.upload.choose') }}
                </button>
                <span class="file-pick-name">
                  {{ selectedFile ? selectedFile.name : locale.t('skills.dialog.upload.noFile') }}
                </span>
                <cds-button
                  type="button"
                  action="outline"
                  size="sm"
                  :disabled="uploading || !selectedFile"
                  @click="uploadFile"
                >
                  <span v-if="uploading" class="btn-spin" aria-hidden="true" />
                  {{ uploading ? locale.t('skills.action.uploading') : locale.t('skills.action.upload') }}
                </cds-button>
              </div>
              <p class="fh">{{ locale.t('skills.dialog.field.uploadHelp') }}</p>
            </div>
            <div v-if="f.pkg && isExternalURL(f.pkg)" class="dr-warn">
              {{ locale.t('skills.dialog.warn.packageNotReady') }}
            </div>
            <div v-else-if="f.pkg && isOfflineReady(f.pkg)" class="dr-ok">
              {{ locale.t('skills.dialog.ok.packageReady').replace('{url}', f.pkg) }}
            </div>
          </div>
          <div class="fg">
            <div class="fg-tt">{{ locale.t('skills.dialog.section.mcp') }}</div>
            <div class="fg-row">
              <textarea v-model="f.cfg" class="fi ft ft--code" rows="6" placeholder='{"command":"example","args":["--stdio"]}' />
            </div>
          </div>
        </div>
        <div class="dr-f">
          <cds-button type="button" action="outline" :disabled="sv" @click="dw = false">{{ locale.t('skills.action.cancel') }}</cds-button>
          <cds-button
            type="button"
            action="solid"
            status="primary"
            :disabled="sv"
            @click="submit"
          >
            <span v-if="sv" class="btn-spin" aria-hidden="true" />
            {{ locale.t(dm === 'edit' ? 'skills.action.save' : 'skills.action.submit') }}
          </cds-button>
        </div>
      </div>
    </Teleport>

    <ConfirmDialog :open="doOpen" :title="locale.t('skills.confirm.deleteTitle')" :body="dBody" danger @confirm="execDel" @close="doOpen = false; dt = null" />

    <!-- Install to Agent dialog -->
    <Teleport to="body">
      <div v-if="installOpen" class="dr-bd" @click.self="installOpen = false" />
      <div v-if="installOpen" class="dr" style="width:400px">
        <div class="dr-h"><h2>{{ locale.t('skills.dialog.installTitle').replace('{name}', installSkill?.name || '') }}</h2><button class="dr-close" @click="installOpen = false">&times;</button></div>
        <div class="dr-b">
          <div class="fg-row">
            <label class="fl">{{ locale.t('skills.dialog.field.agentIp') }}</label>
            <input v-model="installIP" class="fi" placeholder="172.16.85.100" />
          <p class="fh">{{ locale.t('skills.dialog.field.agentIpHelp') }}</p>
        </div>
      </div>
      <div class="dr-f">
          <cds-button type="button" action="outline" @click="installOpen = false">{{ locale.t('skills.action.cancel') }}</cds-button>
          <cds-button
            type="button"
            action="solid"
            status="primary"
            :disabled="installing || !installIP.trim()"
            @click="doInstall"
          >
            <span v-if="installing" class="btn-spin" aria-hidden="true" />
            {{ locale.t('skills.action.install') }}
          </cds-button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Colour tokens — every color binds to a `--cds-alias-*` token so the page
   automatically re-skins under [cds-theme~="dark"]. The trailing literal in
   each `var(...)` is the light-mode fallback only; CDS overrides take
   effect as soon as the body gets [cds-theme="dark"]. */
* { box-sizing: border-box; margin: 0; padding: 0; }
.sp {
  display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; gap: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}

/* page head — aligned with AgentListView / RequestLogView / AuditLogView /
   ResourcePoolListView (h1 28px / desc 14px, CDS foreground + 300 tokens) */
.page-head { flex: 0 0 auto; }
.page-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.heading { margin: 0; color: var(--cds-alias-object-app-foreground, #1b1b1b); font-size: 28px; line-height: 1.3; font-weight: 600; letter-spacing: -0.01em; }
.desc { margin: 12px 0 0; color: var(--cds-alias-typography-color-300, #565656); font-size: 14px; line-height: 1.5; max-width: 720px; }
.muted { color: var(--cds-alias-typography-color-300, #565656); }

 .sp-meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
 .meta-card {
  display: flex; flex-direction: column; gap: 4px;
  padding: 14px 16px;
  background: var(--cds-alias-object-app-background, #fff);
  border: 1px solid var(--cds-alias-object-border-color, #e5e7eb);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
 }
 .meta-num { font-size: 20px; font-weight: 700; color: var(--cds-alias-object-app-foreground, #111827); line-height: 1.1; }
 .meta-label { font-size: 12px; color: var(--cds-alias-typography-color-300, #6b7280); }

 /* Toolbar create button (primary, outline) + refresh icon-only button.
   Mirrors ResourcePoolListView's toolbar pattern so 技能管理 / 资源池接入
   read as one design system across the platform view. */
.toolbar-create { flex: 0 0 auto; }
.refresh-button {
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: 0; padding: 6px 8px; margin: 0;
  cursor: pointer; color: inherit; flex-shrink: 0; border-radius: 0;
}
.refresh-button:hover:not(:disabled) {
  color: var(--cds-alias-object-app-blue, #0072a3);
}
.refresh-button:focus-visible {
  outline: 2px solid var(--cds-alias-object-app-blue, #0072a3);
  outline-offset: 2px;
}
.refresh-button:disabled { opacity: 0.55; cursor: not-allowed; }

/* Loading spinner — SkillManageView used a self-contained span spinner
   before the button-style overhaul; kept here (instead of switching to
   cds-icon shape="circle-loader", which isn't shipped in @cds/core/icon)
   so the in-flight indicator stays visually identical to the previous
   revision. */
.btn-spin {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid currentColor; border-top-color: transparent;
  border-radius: 50%; animation: spin 0.6s linear infinite;
}
.spinning { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

 .sp-tb {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0; flex-wrap: wrap;
  padding: 12px 14px;
  background: var(--cds-alias-object-app-background, #fff);
  border: 1px solid var(--cds-alias-object-border-color, #e5e7eb);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
 }
.tb-search { position: relative; flex: 1; min-width: 200px; }
.tb-si { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: var(--cds-alias-typography-color-400, #9ca3af); pointer-events: none; }
.tb-sin {
  width: 100%; padding: 8px 32px 8px 34px;
  border: 1px solid var(--cds-alias-object-border-color, #d1d5db);
  border-radius: 8px;
  font-size: 13px;
  outline: none; transition: border-color .15s;
  background: var(--cds-alias-object-app-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.tb-sin:focus { border-color: var(--cds-alias-object-app-blue, #2563EB); box-shadow: 0 0 0 3px rgba(37, 99, 235, .15); }
.tb-sc {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  background: none; border: none; font-size: 18px;
  color: var(--cds-alias-typography-color-400, #9ca3af);
  cursor: pointer; padding: 2px 6px; border-radius: 4px;
}
.tb-sc:hover { color: var(--cds-alias-object-app-foreground, #374151); background: var(--cds-alias-object-container-background, #f3f4f6); }
.tb-sel {
  padding: 8px 12px;
  border: 1px solid var(--cds-alias-object-border-color, #d1d5db);
  border-radius: 8px; font-size: 13px;
  background: var(--cds-alias-object-app-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  outline: none; cursor: pointer; min-width: 100px;
}
.tb-sel:focus { border-color: var(--cds-alias-object-app-blue, #2563EB); }

.sp-sk { display: flex; flex-direction: column; gap: 12px; padding: 16px 0; }
.sk-row { display: flex; gap: 8px; padding: 12px 16px; }
.sk-c { height: 14px; background: var(--cds-alias-object-border-color, #e5e7eb); border-radius: 4px; animation: sk-pulse 1.5s ease-in-out infinite; }
.sk-c:nth-child(2n) { animation-delay: .2s; }
.sk-c:nth-child(3n) { animation-delay: .4s; }
@keyframes sk-pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }

.sp-em { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 64px 24px; text-align: center; gap: 12px; }
.em-icon { width: 48px; height: 48px; border-radius: 50%; background: var(--cds-alias-status-danger-tint, #fef2f2); color: var(--cds-alias-status-danger, #dc2626); font-size: 22px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.em-icn--info { background: var(--cds-alias-status-info-tint, #eff6ff); color: var(--cds-alias-status-info, #2563EB); }
.sp-em h3 { font-size: 16px; font-weight: 600; color: var(--cds-alias-object-app-foreground, #1b1b1b); }
.sp-em p { font-size: 13px; color: var(--cds-alias-typography-color-300, #6b7280); max-width: 480px; line-height: 1.5; }

 .sp-tbl {
  overflow-x: auto; flex: 1; min-height: 0;
  background: var(--cds-alias-object-app-background, #fff);
  border-radius: 10px;
  border: 1px solid var(--cds-alias-object-border-color, #e5e7eb);
  box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
 }
table { width: 100%; border-collapse: collapse; min-width: 600px; }
thead { position: sticky; top: 0; z-index: 1; }
th {
  padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600;
  color: var(--cds-alias-typography-color-300, #6b7280);
  background: var(--cds-alias-object-container-background, #f9fafb);
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e5e7eb);
  white-space: nowrap;
}
.th-cb { width: 40px; text-align: center; }
.th-r { text-align: right; }
.th-act { text-align: right; width: 108px; }
td {
  padding: 10px 12px; font-size: 13px;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #f3f4f6);
  vertical-align: middle;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
tr:last-child td { border-bottom: none; }
tr:hover { background: var(--cds-alias-object-container-background, #fafbfc); }
.tr-sel { background: var(--cds-alias-status-info-tint, #eff6ff); }
.tr-sel:hover { background: var(--cds-alias-object-interaction-background-shade, #dbeafe); }
.td-name { font-weight: 600; }
.td-desc { font-size: 12px; color: var(--cds-alias-typography-color-300, #6b7280); margin-top: 2px; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Row action buttons — icon-above / label-below native buttons.
   Mirrors ResourcePoolListView / ModelGatewayView's `.row-action` pattern. */
.row-actions { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.row-action {
  display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; min-width: 40px; padding: 2px; border: 0; border-radius: 4px;
  background: transparent;
  color: var(--cds-alias-object-interaction-color, #006e9c);
  font: inherit; cursor: pointer;
}
.row-action span { font-size: 10px; line-height: 1.15; white-space: nowrap; }
.row-action:focus-visible { outline: 2px solid var(--cds-alias-status-info, #0079ad); outline-offset: 1px; }
.row-action:disabled,
.row-action.disabled { opacity: 0.55; cursor: not-allowed; }
.row-action.danger { color: var(--cds-alias-status-danger, #c92100); }

.tag {
  display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px;
  font-size: 11px; font-weight: 500;
  border: 1px solid var(--cds-alias-object-border-color, #e5e7eb);
  white-space: nowrap;
}
.tag-green { background: var(--cds-alias-status-success-tint, #ecfdf5); color: var(--cds-alias-status-success, #059669); border-color: var(--cds-alias-status-success-shade, #a7f3d0); }
.tag-gray  { background: var(--cds-alias-object-container-background, #f3f4f6); color: var(--cds-alias-typography-color-300, #6b7280); border-color: var(--cds-alias-object-border-color, #e5e7eb); }
.tag-blue  { background: var(--cds-alias-status-info-tint, #eff6ff); color: var(--cds-alias-status-info, #2563EB); border-color: var(--cds-alias-status-info-shade, #bfdbfe); }
.tag-purple { background: #f5e8fa; color: #6b3a8b; border-color: #d8b4f0; }
:global([cds-theme~="dark"]) .tag-purple { background: #3b1f4a; color: #d8b4f0; border-color: #6b3a8b; }

 .dr-bd { position: fixed; inset: 0; background: rgba(15, 23, 42, .35); z-index: 1000; animation: fadeIn .15s ease; backdrop-filter: blur(2px); }
@keyframes fadeIn { from { opacity: 0; } }
.dr {
  position: fixed; top: 0; right: 0; bottom: 0; width: 640px; max-width: 100vw;
  background: var(--cds-alias-object-app-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  z-index: 1001; display: flex; flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, .1);
  animation: slideIn .2s ease;
}
@keyframes slideIn { from { transform: translateX(40px); opacity: 0; } }
.dr-h {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e5e7eb);
  flex-shrink: 0;
}
.dr-h h2 { font-size: 17px; font-weight: 700; color: var(--cds-alias-object-app-foreground, #1b1b1b); }
.dr-close {
  width: 32px; height: 32px; border-radius: 8px;
  border: 1px solid var(--cds-alias-object-border-color, #e5e7eb);
  background: var(--cds-alias-object-app-background, #fff);
  font-size: 20px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: var(--cds-alias-typography-color-300, #6b7280);
  transition: all .12s;
}
.dr-close:hover { background: var(--cds-alias-object-container-background, #f3f4f6); color: var(--cds-alias-object-app-foreground, #374151); }
.dr-b { flex: 1; overflow-y: auto; padding: 20px 24px; }
.dr-err {
  padding: 10px 14px; margin-bottom: 12px;
  background: var(--cds-alias-status-danger-tint, #fef2f2);
  border: 1px solid var(--cds-alias-status-danger-shade, #fecaca);
  border-radius: 8px;
  color: var(--cds-alias-status-danger, #dc2626);
  font-size: 13px;
}
.dr-f {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--cds-alias-object-border-color, #e5e7eb);
  flex-shrink: 0;
  background: var(--cds-alias-object-container-background, #f9fafb);
}
.fg { margin-bottom: 20px; }
.fg-tt {
  font-size: 14px; font-weight: 700; margin-bottom: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--cds-alias-object-border-color, #e5e7eb);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.fg-row { margin-bottom: 14px; }
.fl { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; color: var(--cds-alias-object-app-foreground, #374151); }
.fl-req { color: var(--cds-alias-status-danger, #dc2626); }
.fi {
  width: 100%; padding: 8px 11px;
  border: 1px solid var(--cds-alias-object-border-color, #d1d5db);
  border-radius: 8px; font-size: 13px;
  background: var(--cds-alias-object-app-background, #fff);
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
  outline: none; transition: border-color .15s; font-family: inherit;
}
.fi:focus { border-color: var(--cds-alias-object-app-blue, #2563EB); box-shadow: 0 0 0 3px rgba(37, 99, 235, .15); }
.fi:disabled { background: var(--cds-alias-object-container-background, #f9fafb); color: var(--cds-alias-typography-color-400, #9ca3af); cursor: not-allowed; }
.ft { resize: vertical; min-height: 72px; }
.ft--code { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; }
.fh { font-size: 12px; color: var(--cds-alias-typography-color-400, #9ca3af); margin-top: 4px; }
.fi-row { display: flex; gap: 8px; align-items: center; }
.fi-row .fi { flex: 1; }

/* Hidden native <input type="file"> — we render our own button + filename
   label so the browser-locale-bound "选择文件/未选择任何文件" text doesn't
   leak through and break the page-level i18n. The element still receives
   click events via `fileInput.value?.click()` and stays focusable for
   keyboard a11y. */
.fi-hidden {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

/* File picker trigger button — visually aligned with `.fi` (text input). */
.file-pick {
  flex: 0 0 auto;
  padding: 8px 14px;
  border: 1px solid var(--cds-alias-object-border-color, #d1d5db);
  border-radius: 8px;
  background: var(--cds-alias-object-app-background, #fff);
  color: var(--cds-alias-object-app-foreground, #374151);
  font-size: 13px; cursor: pointer; transition: all .15s; white-space: nowrap;
}
.file-pick:hover:not(:disabled) {
  background: var(--cds-alias-object-container-background, #f9fafb);
  border-color: var(--cds-alias-typography-color-400, #9ca3af);
}
.file-pick:disabled { opacity: .5; cursor: not-allowed; }

/* Filename display — turns into the "未选择任何文件" placeholder text when
   nothing has been picked yet. */
.file-pick-name {
  flex: 1; min-width: 0;
  font-size: 13px;
  color: var(--cds-alias-typography-color-300, #6b7280);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.dr-warn {
  padding: 8px 12px;
  background: var(--cds-alias-status-warning-tint, #fff7ed);
  border: 1px solid var(--cds-alias-status-warning-shade, #fed7aa);
  border-radius: 6px;
  color: var(--cds-alias-status-warning, #c2410c);
  font-size: 12px;
}
.dr-ok {
  padding: 8px 12px;
  background: var(--cds-alias-status-success-tint, #ecfdf5);
  border: 1px solid var(--cds-alias-status-success-shade, #a7f3d0);
  border-radius: 6px;
  color: var(--cds-alias-status-success, #059669);
  font-size: 12px;
}
.fg-desc { font-size: 12px; color: var(--cds-alias-typography-color-300, #6b7280); margin-bottom: 8px; }

@media (max-width: 768px) {
  .sp-meta { grid-template-columns: 1fr; }
  .page-head-row { flex-direction: column; }
  .sp-tb { padding: 10px 12px; }
  .dr { width: 100vw; }
}
</style>
