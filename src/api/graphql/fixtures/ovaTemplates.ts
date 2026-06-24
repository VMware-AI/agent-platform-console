import type {
  OvaTemplateFamily,
  OvaTemplateVersion,
  OvaTemplateFamilyFilter,
  OvaTemplateFamilyConnection,
  OvaTemplateVersionConnection,
  OvaTemplateFamiliesQueryVars,
  CreateOvaTemplateFamilyInput,
  AddOvaTemplateVersionInput,
  AgentType,
} from '../types'

/**
 * OvaTemplate Family + Version fixture.
 *
 * 6 families mirroring the design prototype; OpenClaw and RAG_Expert each
 * have 2 versions, the rest have 1. The `version` string is the user-facing
 * label; `ovaIdentifier` is the opaque key the backend uses to query the
 * vSphere Content Library for the OVF descriptor.
 */
function buildFamily(
  id: string,
  name: string,
  type: AgentType,
  iconShape: string,
  iconColor: OvaTemplateFamily['iconColor'],
  description: string,
  tools: string[],
  scenarios: string[],
  skills: string[],
  versions: Array<{ version: string; ovaIdentifier: string; notes?: string }>,
): OvaTemplateFamily {
  const vs: OvaTemplateVersion[] = versions.map((v, i) => ({
    id: `${id}-v${i + 1}`,
    familyId: id,
    version: v.version,
    ovaIdentifier: v.ovaIdentifier,
    notes: v.notes ?? null,
    createdAt: '2026-04-15T08:00:00Z',
  }))
  return {
    id,
    name,
    type,
    description,
    tools,
    scenarios,
    skills,
    iconShape,
    iconColor,
    versions: vs,
    latestVersion: vs[vs.length - 1]?.version ?? null,
    createdAt: '2026-04-12T08:00:00Z',
    updatedAt: '2026-06-18T02:30:00Z',
  }
}

const INITIAL_FAMILIES: OvaTemplateFamily[] = [
  buildFamily('fam01', 'OpenClaw', 'OPENCLAW', 'wrench', 'BLUE',
    'OpenClaw Python 智能体，支持 OpenClaw 进行执行，以及使用迹进行脚本',
    ['gpt-4o', 'numpy 5c7b', 'pandas-700-instruct', 'Python REPL', 'Shell'],
    ['数据处理', '自动化脚本', '系统运维', '批量执行'],
    ['Github', 'Weather', 'Gog', 'Multi Search Engine'],
    [
      { version: 'v1.4.2', ovaIdentifier: 'openclaw-vm-v1.4.2', notes: '稳定版' },
      { version: 'v1.5.0', ovaIdentifier: 'openclaw-vm-v1.5.0', notes: '新增 OpenClaw CLI' },
    ],
  ),
  buildFamily('fam02', 'Hermes', 'HERMES', 'talk-bubbles', 'PURPLE',
    'Hermes 通用中文文档聊天，适用于兼容进一步的中文资料',
    ['gpt-4o', 'numral 5c7b', 'Web booing'],
    ['数据处理', '自动化脚本', '问答对话', '文档阅读'],
    ['Humanizer', 'Multi Search Engine', 'Obsidian', 'Notion'],
    [{ version: 'v2.1.0', ovaIdentifier: 'hermes-vm-v2.1.0', notes: '稳定版' }],
  ),
  buildFamily('fam03', 'OpenCode', 'OPENCODE', 'pop-out', 'ORANGE',
    'OpenCode 代码解析的智能体，如何执行代码执行、进行代码审查',
    ['gpt-4o', 'numPy 5c7b', 'ilame-3-700-instruct'],
    ['数据处理', '自动化脚本', '代码审查', '单元测试生成'],
    ['Github', 'self-improving agent', 'Skill Vetter', 'Agent Browser'],
    [{ version: 'v1.2.0', ovaIdentifier: 'opencode-vm-v1.2.0', notes: '首个 GA' }],
  ),
  buildFamily('fam04', 'Model_X_Base', 'BASIC_LLM', 'atom', 'CYAN',
    'Model_XX 使用，代替基础 LLM，数据集基础数据的基础 LLM',
    ['gpt-4o', 'numpy', 'pandas'],
    ['数据处理', '自动化脚本', '通用补全'],
    ['Weather', 'Multi Search Engine', 'Humanizer', 'Notion'],
    [{ version: 'v0.9.0', ovaIdentifier: 'model-x-base-vm-v0.9.0', notes: '基础底座' }],
  ),
  buildFamily('fam05', 'RAG_Expert', 'XIAOGUAI', 'book', 'GREEN',
    '从已验证的 OVA 快速创建智能体，支持一般文档检索，可以使用的工具集',
    ['gpt-4o', 'Python', 'Code Interpreter'],
    ['数据处理', '自动化脚本', '企业内部知识库', '合同/制度查询'],
    ['Obsidian', 'Notion', 'Multi Search Engine', 'Humanizer'],
    [
      { version: 'v1.0.0', ovaIdentifier: 'rag-vm-v1.0.0', notes: '首个 GA' },
      { version: 'v1.1.0', ovaIdentifier: 'rag-vm-v1.1.0', notes: '支持多模态' },
    ],
  ),
  buildFamily('fam06', 'Web_Analyzer', 'CLAUDE_CODE', 'world', 'RED',
    'Web Analyzer 通用分析网页分析、网页分析的网页分析',
    ['gpt-4o', 'numpy', 'pandas'],
    ['数据处理', '自动化脚本', '网页抓取', '舆情分析'],
    ['Agent Browser', 'Multi Search Engine', 'Weather', 'Notion'],
    [{ version: 'v1.0.5', ovaIdentifier: 'web-analyzer-vm-v1.0.5', notes: '当前主推' }],
  ),
  buildFamily('fam07', 'DataInsight', 'QCODER', 'bar-chart', 'ORANGE',
    'DataInsight 数据分析智能体，支持 SQL 检索、统计建模与可视化报表生成',
    ['gpt-4o', 'pandas-700-instruct', 'SQL Executor', 'Python REPL'],
    ['业务数据探索', '统计建模', '报表自动化', '归因分析'],
    ['Github', 'Skill Vetter', 'Humanizer', 'Notion'],
    [
      { version: 'v1.0.0', ovaIdentifier: 'datainsight-vm-v1.0.0', notes: '首个 GA' },
      { version: 'v1.1.0', ovaIdentifier: 'datainsight-vm-v1.1.0', notes: '新增自动建模' },
    ],
  ),
  buildFamily('fam08', 'Painter', 'IMAGE_GENERATION', 'image', 'PURPLE',
    'Painter 文生图智能体，支持文生图、图生图、风格迁移与多尺寸输出',
    ['sdxl', 'controlnet', 'image-tools'],
    ['营销素材', '产品图生成', '风格化插画', '海报文案配图'],
    ['Nano Banana Pro', 'Humanizer', 'Agent Browser', 'Skill Vetter'],
    [{ version: 'v0.8.0', ovaIdentifier: 'painter-vm-v0.8.0', notes: '内测版' }],
  ),
  buildFamily('fam09', 'ForecastX', 'GENERAL_CHAT', 'pie-chart', 'CYAN',
    'ForecastX 时序预测智能体，提供 Prophet / ARIMA / LSTM 多模型自动选型与回测',
    ['gpt-4o', 'pandas', 'prophet', 'statsmodels'],
    ['销量预测', '容量规划', '异常检测', '趋势研判'],
    ['Multi Search Engine', 'Weather', 'Skill Vetter', 'Notion'],
    [{ version: 'v2.0.0', ovaIdentifier: 'forecastx-vm-v2.0.0', notes: 'GA' }],
  ),
]

const families = INITIAL_FAMILIES.map((f) => ({
  ...f,
  versions: f.versions.map((v) => ({ ...v })),
}))
let nextFamilyID = 7
let nextVersionSeq = 0

export const familiesStore: OvaTemplateFamily[] = families
export const versionsStore: OvaTemplateVersion[] = families.flatMap((f) => f.versions)

/* ---------- Pure query helpers ---------- */

function applyFilter(arr: OvaTemplateFamily[], f?: OvaTemplateFamilyFilter | null): OvaTemplateFamily[] {
  if (!f) return arr
  return arr.filter((fam) => {
    if (f.nameKeyword && !fam.name.toLowerCase().includes(f.nameKeyword.toLowerCase())) return false
    if (f.type && fam.type !== f.type) return false
    return true
  })
}

export function ovaTemplateFamiliesFixture(vars?: OvaTemplateFamiliesQueryVars): OvaTemplateFamilyConnection {
  const filtered = applyFilter(families, vars?.filter)
  const page = vars?.pagination?.page ?? 1
  const pageSize = vars?.pagination?.pageSize ?? 6
  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = (page - 1) * pageSize
  return {
    nodes: filtered.slice(start, start + pageSize),
    totalCount: total,
    pageInfo: { page, pageSize, totalPages },
  }
}

export function ovaTemplateVersionsFixture(familyId?: string | null): OvaTemplateVersionConnection {
  const nodes = familyId
    ? versionsStore.filter((v) => v.familyId === familyId)
    : versionsStore.slice()
  return {
    nodes,
    totalCount: nodes.length,
    pageInfo: { page: 1, pageSize: nodes.length, totalPages: 1 },
  }
}

export function findOvaTemplateFamily(id: string): OvaTemplateFamily | undefined {
  return families.find((f) => f.id === id)
}
export function findOvaTemplateFamilyByName(name: string): OvaTemplateFamily | undefined {
  return families.find((f) => f.name === name)
}
export function findOvaTemplateVersion(id: string): OvaTemplateVersion | undefined {
  return versionsStore.find((v) => v.id === id)
}

/* ---------- Mutation helpers ---------- */

export function createOvaTemplateFamilyInFixture(input: CreateOvaTemplateFamilyInput, now: string): OvaTemplateFamily {
  const id = `fam${String(nextFamilyID++).padStart(2, '0')}`
  const version: OvaTemplateVersion = {
    id: `${id}-v1`,
    familyId: id,
    version: input.initialVersion.version,
    ovaIdentifier: input.initialVersion.ovaIdentifier,
    notes: input.initialVersion.notes ?? null,
    createdAt: now,
  }
  const fam: OvaTemplateFamily = {
    id,
    name: input.name,
    type: input.type,
    description: input.description,
    tools: input.tools,
    scenarios: input.scenarios,
    skills: input.skills,
    iconShape: input.iconShape,
    iconColor: input.iconColor,
    versions: [version],
    latestVersion: version.version,
    createdAt: now,
    updatedAt: now,
  }
  families.push(fam)
  versionsStore.push(version)
  return fam
}

export function addOvaTemplateVersionInFixture(input: AddOvaTemplateVersionInput, now: string): OvaTemplateVersion {
  const fam = families.find((f) => f.id === input.familyId)
  if (!fam) throw new Error(`Family 不存在: ${input.familyId}`)
  const id = `${input.familyId}-v${++nextVersionSeq}`
  const ver: OvaTemplateVersion = {
    id,
    familyId: input.familyId,
    version: input.version,
    ovaIdentifier: input.ovaIdentifier,
    notes: input.notes ?? null,
    createdAt: now,
  }
  fam.versions.push(ver)
  versionsStore.push(ver)
  fam.updatedAt = now
  fam.latestVersion = ver.version
  return ver
}
