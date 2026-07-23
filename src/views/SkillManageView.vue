<script setup lang="ts">
/* eslint-disable */
import { computed, reactive, ref } from 'vue'
import { useQuery, useMutation } from '@vue/apollo-composable'
import gql from 'graphql-tag'
import { useToast } from '@/composables/useToast'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const toast = useToast()

type SkillStatus = 'enabled' | 'disabled'
interface SkillView { id: string; name: string; version: string; description: string; uri: string; installMethod: string; packageUrl: string; status: SkillStatus; createdAt: string; category: string }

const SL: Record<SkillStatus, string> = { enabled: '已启用', disabled: '已停用' }
const CATS = ['开发','运维','办公','安全','数据','AI']
const IL: Record<string, string> = { pip: 'Python 包', 'pip-requirements': 'requirements.txt', npm: 'NPM 包', binary: '二进制程序' }

const Q = gql`query Skills { skills { id name version description uri installMethod packageUrl mcpConfig createdAt category } }`
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
    createdAt: s.createdAt ?? '',
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
const dBody = computed(() => dt.value ? `确定要删除 Skill「${dt.value.name}」吗？此操作不可恢复。` : '')
async function execDel() {
  if (!dt.value) return
  try { await del({ id: dt.value.id }); toast.success(`已删除「${dt.value.name}」`); doOpen.value = false; dt.value = null; await refetch() }
  catch (e: any) { toast.error(`删除失败: ${e?.message || e}`) }
}

const dw = ref(false)
const dm = ref<'create' | 'edit'>('create')
const ed = ref<SkillView | null>(null)
const f = reactive({ name: '', dname: '', desc: '', ver: '1.0.0', uri: '', im: 'pip', pkg: '', cfg: '', st: 'enabled' as SkillStatus, cat: '' })
const fe = ref('')
const se = ref('')
const sv = ref(false)

function reset() { f.name = ''; f.dname = ''; f.desc = ''; f.ver = '1.0.0'; f.uri = ''; f.im = 'pip'; f.pkg = ''; f.cfg = ''; f.st = 'enabled'; f.cat = ''; fe.value = ''; se.value = ''; ed.value = null }
function openNew() { reset(); dm.value = 'create'; dw.value = true }
function openEdit(s: SkillView) { reset(); dm.value = 'edit'; ed.value = s; f.name = s.name; f.dname = s.name; f.desc = s.description; f.ver = s.version; f.uri = s.uri; f.im = s.installMethod || 'pip'; f.pkg = s.packageUrl; f.st = s.status; f.cat = (s as any).category || ''; dw.value = true }

function vld(): boolean {
  fe.value = ''
  if (!f.name.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.name.trim())) { fe.value = '标识仅支持小写字母、数字和短横线'; return false }
  if (!f.dname.trim()) { fe.value = '请输入名称'; return false }
  if (!f.desc.trim()) { fe.value = '请输入描述'; return false }
  if (!f.uri.trim()) { fe.value = '请输入源包 URL'; return false }
  if (f.cfg.trim()) { try { JSON.parse(f.cfg) } catch { fe.value = 'MCP 配置 JSON 不合法'; return false } }
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
    await upsert({ input: inp })
    dw.value = false; toast.success(dm.value === 'create' ? `「${f.name}」已创建` : `「${f.name}」已更新`); await refetch()
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
    toast.success('离线包已同步到跳板机')
    await refetch()
  } catch (e: any) { toast.error(`同步失败: ${e.message}`) }
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
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(installIP.value.trim())) { toast.error('请输入有效的 IP 地址'); return }
  installing.value = true
  try {
    const resp = await fetch(`/v1/skills/install/${installIP.value.trim()}/${installSkill.value.id}`, { method: 'POST' })
    if (!resp.ok) throw new Error(await resp.text())
    toast.success(`已在 ${installIP.value} 安装 ${installSkill.value.name}`)
    installOpen.value = false
  } catch (e: any) { toast.error(`安装失败: ${e.message}`) }
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
    toast.success('离线包已上传到跳板机')
    await refetch()
  } catch (e: any) { toast.error(`上传失败: ${e.message}`) }
  finally { uploading.value = false }
}

function em(e: unknown): string {
  const a = e as any
  if (Array.isArray(a?.graphQLErrors) && a.graphQLErrors.length) return a.graphQLErrors.map((g: any) => g.message).join('；')
  if (a?.networkError?.message) return `网络错误：${a.networkError.message}`
  return a?.message || String(e || '未知错误')
}
</script>

<template>
  <div class="sp">
    <div class="sp-h">
      <div>
        <h1 class="sp-tt">Skills 管理</h1>
        <p class="sp-sub">统一管理 OpenClaw、OpenCode、Hermes 等智能体可使用的技能与能力扩展。</p>
      </div>
      <button class="btn btn-p" @click="openNew">+ 新增 Skill</button>
    </div>

    <div class="sp-meta" aria-label="技能统计">
      <div class="meta-card">
        <span class="meta-num">{{ totalCount }}</span>
        <span class="meta-label">总技能</span>
      </div>
      <div class="meta-card">
        <span class="meta-num">{{ filteredCount }}</span>
        <span class="meta-label">当前显示</span>
      </div>
      <div class="meta-card">
        <span class="meta-num">{{ selectedCount }}</span>
        <span class="meta-label">已选中</span>
      </div>
    </div>

    <div class="sp-tb">
      <div class="tb-search">
        <svg class="tb-si" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input v-model="search" placeholder="搜索 Skill 名称、标识或描述" class="tb-sin" />
        <button v-if="search" class="tb-sc" @click="search = ''">&times;</button>
      </div>
      <select v-model="cf" class="tb-sel">
        <option value="all">全部分类</option>
        <option v-for="c in CATS" :key="c" :value="c">{{ c }}</option>
      </select>
      <select v-model="sf" class="tb-sel">
        <option value="all">全部状态</option>
        <option value="enabled">已启用</option>
        <option value="disabled">已停用</option>
      </select>
      <button class="btn btn-g" @click="refetch()">刷新</button>
    </div>

    <div v-if="loading" class="sp-sk">
      <div class="sk-row" v-for="i in 5" :key="i"><span class="sk-c" v-for="j in 5" :key="j" :style="{width: [100,180,70,80,60][j-1]+'px'}"/></div>
    </div>

    <div v-else-if="qe" class="sp-em">
      <div class="em-icon">!</div>
      <h3>Skills 列表加载失败</h3>
      <p>{{ em(qe) }}</p>
      <button class="btn btn-p" @click="refetch()">重新加载</button>
    </div>

    <div v-else-if="skills.length === 0" class="sp-em">
      <div class="em-icon em-icn--info">i</div>
      <h3>暂无 Skills</h3>
      <p>创建 Skills，为 OpenClaw、OpenCode、Hermes 等智能体扩展企业级能力。</p>
      <button class="btn btn-p" @click="openNew">新增第一个 Skill</button>
    </div>

    <div v-else-if="filtered.length === 0" class="sp-em">
      <div class="em-icon em-icn--info">i</div>
      <h3>未找到符合条件的 Skills</h3>
      <p>{{ search ? `没有匹配「${search}」的 Skills` : '当前筛选条件下没有符合条件的 Skills' }}</p>
      <button class="btn btn-g" @click="search = ''; sf = 'all'; cf = 'all'">清除筛选条件</button>
    </div>

    <div v-else class="sp-tbl">
      <table>
        <thead>
          <tr>
            <th class="th-cb"><input type="checkbox" :checked="allCk" @change="toggleAll" /></th>
            <th>Skill</th>
            <th>描述</th>
            <th>分类</th>
            <th class="th-r">版本</th>
            <th class="th-r">安装方式</th>
            <th class="th-r">状态</th>
            <th class="th-act">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in filtered" :key="s.id" :class="{ 'tr-sel': sel.has(s.id) }">
            <td class="th-cb"><input type="checkbox" :checked="sel.has(s.id)" @change="sel.has(s.id) ? sel.delete(s.id) : sel.add(s.id)" /></td>
            <td>
              <div class="td-name">{{ s.name }}</div>
            </td>
            <td><div class="td-desc">{{ s.description || '—' }}</div></td>
            <td><span v-if="s.category" class="tag tag-blue">{{ s.category }}</span></td>
            <td class="th-r"><span class="tag tag-gray">v{{ s.version || '—' }}</span></td>
            <td class="th-r"><span v-if="s.installMethod" class="tag tag-blue">{{ IL[s.installMethod] || s.installMethod }}</span></td>
            <td class="th-r"><span class="tag" :class="s.status === 'enabled' ? 'tag-green' : 'tag-gray'">{{ SL[s.status] }}</span></td>
            <td class="th-act">
              <div class="td-act">
                <button class="icon-btn" title="编辑" aria-label="编辑" @click="openEdit(s)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" />
                  </svg>
                </button>
                <button
                  v-if="s.packageUrl && isOfflineReady(s.packageUrl)"
                  class="icon-btn"
                  title="安装到 Agent"
                  aria-label="安装到 Agent"
                  @click="openInstall(s)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 3v12" />
                    <path d="m7 10 5 5 5-5" />
                    <path d="M5 21h14" />
                  </svg>
                </button>
                <button class="icon-btn icon-btn--danger" title="删除" aria-label="删除" @click="dt = s; doOpen = true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M6 6l1 14h10l1-14" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Teleport to="body">
      <div v-if="dw" class="dr-bd" @click.self="!sv && (dw = false)" />
      <div v-if="dw" class="dr">
        <div class="dr-h">
          <h2>{{ dm === 'create' ? '新增 Skill' : '编辑 Skill' }}</h2>
          <button class="dr-close" @click="!sv && (dw = false)" :disabled="sv">&times;</button>
        </div>
        <div class="dr-b">
          <div v-if="se" class="dr-err">{{ se }}</div>
          <div v-if="fe" class="dr-err">{{ fe }}</div>
          <div class="fg">
            <div class="fg-tt">基础信息</div>
            <div class="fg-row">
              <label class="fl">Skill 标识 <span class="fl-req">*</span></label>
              <input v-model="f.name" :disabled="dm === 'edit'" class="fi" placeholder="vmware-aiops" />
              <p class="fh">仅支持小写字母、数字和短横线，创建后不可修改</p>
            </div>
            <div class="fg-row">
              <label class="fl">Skill 名称 <span class="fl-req">*</span></label>
              <input v-model="f.dname" class="fi" placeholder="VMware 智能运维" />
            </div>
            <div class="fg-row">
              <label class="fl">描述 <span class="fl-req">*</span></label>
              <textarea v-model="f.desc" class="fi ft" rows="3" maxlength="500" placeholder="描述该 Skill 能为智能体提供什么能力" />
              <p class="fh">{{ f.desc.length }}/500</p>
            </div>
          </div>
          <div class="fg">
            <div class="fg-tt">安装信息</div>
            <div class="fg-row">
              <label class="fl">分类</label>
              <select v-model="f.cat" class="fi">
                <option value="">无</option>
                <option v-for="c in CATS" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
            <div class="fg-row">
              <label class="fl">安装方式</label>
              <select v-model="f.im" class="fi">
                <option value="pip">Python 包 (pip)</option>
                <option value="pip-requirements">requirements.txt</option>
                <option value="npm">NPM 包</option>
                <option value="binary">二进制程序</option>
              </select>
            </div>
            <div class="fg-row">
              <label class="fl">源包 URL <span class="fl-req">*</span></label>
              <input v-model="f.uri" class="fi" placeholder="https://pypi.org/project/example/" />
            </div>
            <div class="fg-row">
              <label class="fl">版本</label>
              <input v-model="f.ver" class="fi" placeholder="1.0.0" />
            </div>
          </div>
          <div class="fg">
            <div class="fg-tt">离线包部署</div>
            <div class="fg-row">
              <label class="fl">离线仓库地址</label>
              <input v-model="repoBase" class="fi" placeholder="http://172.16.85.230:8081" />
              <p class="fh">Agent VM 通过此地址下载离线包。同步/上传后 Skills 包会存到此仓库。</p>
            </div>
            <div class="fg-row">
              <label class="fl">离线包 URL</label>
              <div class="fi-row">
                <input v-model="f.pkg" class="fi" placeholder="https://github.com/.../main.tar.gz" />
                <button class="btn btn-sm btn-p" @click="syncPackage" :disabled="syncing || !f.pkg" style="white-space:nowrap">
                  <span v-if="syncing" class="btn-spin"/> {{ syncing ? '同步中...' : '在线下载' }}
                </button>
              </div>
              <p class="fh">输入 URL 后点击「在线下载」→ 后端下载并推送到跳板机离线库</p>
            </div>
            <div class="fg-row">
              <label class="fl">本地上传</label>
              <div class="fi-row">
                <input type="file" ref="fileInput" accept=".tar.gz,.tgz,.tar" class="fi" @change="onFileSelected" />
                <button class="btn btn-sm btn-g" @click="uploadFile" :disabled="uploading || !selectedFile" style="white-space:nowrap">
                  <span v-if="uploading" class="btn-spin"/> {{ uploading ? '上传中...' : '上传到离线库' }}
                </button>
              </div>
              <p class="fh">选择本地 .tar.gz 文件上传到跳板机</p>
            </div>
            <div v-if="f.pkg && isExternalURL(f.pkg)" class="dr-warn">
              ⚠ 离线包尚未同步到跳板机，部署时无法安装
            </div>
            <div v-else-if="f.pkg && isOfflineReady(f.pkg)" class="dr-ok">
              ✓ 离线包已就绪：{{ f.pkg }}
            </div>
          </div>
          <div class="fg">
            <div class="fg-tt">MCP 配置（可选）</div>
            <div class="fg-row">
              <textarea v-model="f.cfg" class="fi ft ft--code" rows="6" placeholder='{"command":"example","args":["--stdio"]}' />
            </div>
          </div>
        </div>
        <div class="dr-f">
          <button class="btn btn-g" @click="!sv && (dw = false)" :disabled="sv">取消</button>
          <button class="btn btn-p" @click="submit" :disabled="sv">
            <span v-if="sv" class="btn-spin" /> {{ dm === 'edit' ? '保存修改' : '创建 Skill' }}
          </button>
        </div>
      </div>
    </Teleport>

    <ConfirmDialog :open="doOpen" title="删除 Skill" :body="dBody" danger @confirm="execDel" @close="doOpen = false; dt = null" />

    <!-- Install to Agent dialog -->
    <Teleport to="body">
      <div v-if="installOpen" class="dr-bd" @click.self="installOpen = false" />
      <div v-if="installOpen" class="dr" style="width:400px">
        <div class="dr-h"><h2>安装 {{ installSkill?.name }} 到 Agent</h2><button class="dr-close" @click="installOpen = false">&times;</button></div>
        <div class="dr-b">
          <div class="fg-row">
            <label class="fl">Agent IP 地址</label>
            <input v-model="installIP" class="fi" placeholder="172.16.85.100" />
          <p class="fh">输入已运行 Agent 的 IP，将自动 SSH 安装离线包。</p>
        </div>
      </div>
      <div class="dr-f">
        <button class="btn btn-g" @click="installOpen = false">取消</button>
        <button class="btn btn-p" @click="doInstall" :disabled="installing || !installIP.trim()">
            <span v-if="installing" class="btn-spin"/> 安装
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; margin: 0; padding: 0; }
 .sp { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 24px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; background: linear-gradient(180deg, #f7f8fc 0%, #f4f6fb 100%); }
 .sp-h { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; flex-shrink: 0; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
 .sp-tt { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
 .sp-sub { font-size: 13px; color: #6b7280; }
 .sp-meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
 .meta-card { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
 .meta-num { font-size: 20px; font-weight: 700; color: #111827; line-height: 1.1; }
 .meta-label { font-size: 12px; color: #6b7280; }
 .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 16px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all .15s; background: #fff; color: #374151; white-space: nowrap; }
.btn:hover { background: #f9fafb; border-color: #9ca3af; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-p { background: #2563EB; color: #fff; border-color: #2563EB; }
.btn-p:hover { background: #1d4ed8; }
.btn-g { background: #fff; color: #374151; border-color: #d1d5db; }
.btn-g:hover { background: #f3f4f6; }
.btn-sm { padding: 4px 10px; font-size: 12px; border-radius: 6px; border: 1px solid #e5e7eb; background: #fff; color: #374151; cursor: pointer; transition: all .12s; }
.btn-sm:hover { background: #f3f4f6; border-color: #d1d5db; }
.btn-sm--danger { color: #dc2626; border-color: #fecaca; }
.btn-sm--danger:hover { background: #fef2f2; }
.btn-spin { display: inline-block; width: 14px; height: 14px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin .6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
 .sp-tb { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-shrink: 0; flex-wrap: wrap; padding: 12px 14px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
.tb-search { position: relative; flex: 1; min-width: 200px; }
.tb-si { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: #9ca3af; pointer-events: none; }
.tb-sin { width: 100%; padding: 8px 32px 8px 34px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; outline: none; transition: border-color .15s; }
.tb-sin:focus { border-color: #2563EB; box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
.tb-sc { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: none; border: none; font-size: 18px; color: #9ca3af; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
.tb-sc:hover { color: #374151; background: #f3f4f6; }
.tb-sel { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; background: #fff; outline: none; cursor: pointer; min-width: 100px; }
.tb-sel:focus { border-color: #2563EB; }
.sp-sk { display: flex; flex-direction: column; gap: 12px; padding: 16px 0; }
.sk-row { display: flex; gap: 8px; padding: 12px 16px; }
.sk-c { height: 14px; background: #e5e7eb; border-radius: 4px; animation: sk-pulse 1.5s ease-in-out infinite; }
.sk-c:nth-child(2n) { animation-delay: .2s; }
.sk-c:nth-child(3n) { animation-delay: .4s; }
@keyframes sk-pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
.sp-em { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 64px 24px; text-align: center; gap: 12px; }
.em-icon { width: 48px; height: 48px; border-radius: 50%; background: #fef2f2; color: #dc2626; font-size: 22px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.em-icn--info { background: #eff6ff; color: #2563EB; }
.sp-em h3 { font-size: 16px; font-weight: 600; }
.sp-em p { font-size: 13px; color: #6b7280; max-width: 480px; line-height: 1.5; }
 .sp-tbl { overflow-x: auto; flex: 1; min-height: 0; background: #fff; border-radius: 10px; border: 1px solid #e5e7eb; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
table { width: 100%; border-collapse: collapse; min-width: 600px; }
thead { position: sticky; top: 0; z-index: 1; }
th { padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; background: #f9fafb; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
.th-cb { width: 40px; text-align: center; }
.th-r { text-align: right; }
.th-act { text-align: right; width: 108px; }
td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr:hover { background: #fafbfc; }
.tr-sel { background: #eff6ff; }
.tr-sel:hover { background: #dbeafe; }
.td-name { font-weight: 600; }
.td-desc { font-size: 12px; color: #6b7280; margin-top: 2px; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-act {
  display: grid;
  grid-template-columns: repeat(3, 28px);
  gap: 6px;
  justify-content: end;
  align-items: center;
}
.icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #4b5563;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all .12s;
}
.icon-btn svg {
  width: 14px;
  height: 14px;
}
.icon-btn:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
  color: #111827;
}
.icon-btn--danger {
  color: #dc2626;
}
.icon-btn--danger:hover {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}
.tag { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; border: 1px solid #e5e7eb; white-space: nowrap; }
.tag-green { background: #ecfdf5; color: #059669; border-color: #a7f3d0; }
.tag-gray { background: #f3f4f6; color: #6b7280; border-color: #e5e7eb; }
.tag-blue { background: #eff6ff; color: #2563EB; border-color: #bfdbfe; }
 .dr-bd { position: fixed; inset: 0; background: rgba(15,23,42,.35); z-index: 1000; animation: fadeIn .15s ease; backdrop-filter: blur(2px); }
@keyframes fadeIn { from { opacity: 0; } }
.dr { position: fixed; top: 0; right: 0; bottom: 0; width: 640px; max-width: 100vw; background: #fff; z-index: 1001; display: flex; flex-direction: column; box-shadow: -4px 0 24px rgba(0,0,0,.1); animation: slideIn .2s ease; }
@keyframes slideIn { from { transform: translateX(40px); opacity: 0; } }
.dr-h { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.dr-h h2 { font-size: 17px; font-weight: 700; }
.dr-close { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e5e7eb; background: #fff; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #6b7280; transition: all .12s; }
.dr-close:hover { background: #f3f4f6; color: #374151; }
.dr-b { flex: 1; overflow-y: auto; padding: 20px 24px; }
.dr-err { padding: 10px 14px; margin-bottom: 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; }
.dr-f { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid #e5e7eb; flex-shrink: 0; background: #f9fafb; }
.fg { margin-bottom: 20px; }
.fg-tt { font-size: 14px; font-weight: 700; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
.fg-row { margin-bottom: 14px; }
.fl { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; color: #374151; }
.fl-req { color: #dc2626; }
.fi { width: 100%; padding: 8px 11px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; outline: none; transition: border-color .15s; font-family: inherit; }
.fi:focus { border-color: #2563EB; box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
.fi:disabled { background: #f9fafb; color: #9ca3af; cursor: not-allowed; }
.ft { resize: vertical; min-height: 72px; }
.ft--code { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; }
.fh { font-size: 12px; color: #9ca3af; margin-top: 4px; }
.fi-row { display: flex; gap: 8px; align-items: center; }
.fi-row .fi { flex: 1; }
.dr-warn { padding: 8px 12px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; color: #c2410c; font-size: 12px; }
.dr-ok { padding: 8px 12px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; color: #059669; font-size: 12px; }
.fg-desc { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
@media (max-width: 768px) {
  .sp { padding: 12px; }
  .sp-meta { grid-template-columns: 1fr; }
  .sp-h { flex-direction: column; }
  .sp-tb { padding: 10px 12px; }
  .dr { width: 100vw; }
}
</style>
