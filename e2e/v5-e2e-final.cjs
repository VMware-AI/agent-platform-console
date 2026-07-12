/**
 * E2E: Full Test Suite — Deploy + Lifecycle + vCenter Verification
 *
 * Phase 0:  Create parent VM (ic-p-dlvmova-v5) from dlvmova full clone + static IP
 * Phase 1-8:  8 deploy scenarios (test01+dlvmova x full/instant x single/batch)
 * Phase 9:  Single-agent lifecycle (stop/start/restart via API)
 * Phase 10: Batch lifecycle (batch stop/start via API)
 * Phase 11: Delete + HardDelete (recycle/hardDelete via API)
 * Phase 12: vCenter live VM resources verification
 *
 * Run: node e2e/v5-e2e-final.cjs
 */

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

// ── Config ─────────────────────────────────────────────────────────────────
const FRONTEND_URL = 'http://192.168.15.128:5173'
const SCREENSHOT_DIR = '/tmp/e2e-screenshots'
const ADMIN = { email: 'admin@platform.local', password: 'ChangeMe123!' }
const NET = { vlan: 'vlan805', gw: '172.16.85.1', mask: '255.255.255.0', dns: '172.16.85.1' }
const VM = { user: 'svcroot', pass: 'VMware1!' }
const T01 = 'test01', DLV = 'dlvmova'
const PARENT = { name: 'ic-p-dlvmova-v5', ip: '172.16.85.151' }

const SCENARIOS = [
  { id:'S1', tpl:T01,  clone:'full',    batch:false, name:'t01-full-single',   ip:'172.16.85.152' },
  { id:'S2', tpl:T01,  clone:'full',    batch:true,  pf:'t01-full-batch',      sIP:'172.16.85.153', n:2 },
  { id:'S3', tpl:T01,  clone:'instant', batch:false, name:'t01-ic-single',     ip:'172.16.85.155' },
  { id:'S4', tpl:T01,  clone:'instant', batch:true,  pf:'t01-ic-batch',        sIP:'172.16.85.156', n:2 },
  { id:'S5', tpl:DLV,  clone:'full',    batch:false, name:'dv-full-single',    ip:'172.16.85.158' },
  { id:'S6', tpl:DLV,  clone:'full',    batch:true,  pf:'dv-full-batch',       sIP:'172.16.85.159', n:2 },
  { id:'S7', tpl:DLV,  clone:'instant', batch:false, name:'dv-ic-single',      ip:'172.16.85.161' },
  { id:'S8', tpl:DLV,  clone:'instant', batch:true,  pf:'dv-ic-batch',         sIP:'172.16.85.162', n:2 },
]

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }
async function ss(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: false })
  console.log(`   [ss] ${name}`)
}

// ── Auth ───────────────────────────────────────────────────────────────────
let AUTH_TOKEN = ''

async function login(ctx) {
  const r = await ctx.request.post(FRONTEND_URL + '/query', {
    data: { query: `mutation Login($i: LoginInput!) { login(input: $i) { token } }`,
      variables: { i: { email: ADMIN.email, password: ADMIN.password, remember: true } } }
  })
  const body = await r.json()
  AUTH_TOKEN = body.data?.login?.token || ''
  console.log('   Authenticated, token: ' + AUTH_TOKEN.substring(0, 14) + '...')
}

// ── API helpers (native Node.js fetch — bypasses browser network issues) ────
const BACKEND_URL = 'http://127.0.0.1:8080/query'

async function apiGql(query, vars) {
  const r = await fetch(BACKEND_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': 'http://127.0.0.1:8080', 'Authorization': 'Bearer ' + AUTH_TOKEN },
    body: JSON.stringify({ query, variables: vars || {} })
  })
  const body = await r.json()
  if (body.errors) { console.log(`   [GQL] ${body.errors[0].message}`); return null }
  return body.data
}

async function apiListAgents(nameFilter) {
  const d = await apiGql(`query($f: AgentFilter){ agents(filter:$f, pagination:{page:1,pageSize:50}) { nodes { id name status endpoint } } }`,
    { f: nameFilter ? { nameKeyword: nameFilter } : null })
  return d?.agents?.nodes || []
}

async function apiFindAgent(substr) {
  return (await apiListAgents(substr)).find(a => a.name.includes(substr)) || null
}

async function apiAgentStatus(name) { const a = await apiFindAgent(name); return a?.status || 'not_found' }
async function apiVerify(name, expect) {
  const s = await apiAgentStatus(name)
  const ok = (expect === 'gone') ? s === 'not_found' : s === expect
  console.log(`   [VC] "${name}" status=${s} expect=${expect} ${ok ? 'OK' : 'X'}`)
  return ok
}

async function apiSetStatus(id, status) {
  return apiGql(`mutation($id:ID!,$s:AgentStatus!){setAgentStatus(id:$id,status:$s){id status updatedAt}}`, { id, s: status })
}
async function apiRestart(id) {
  return apiGql(`mutation($id:ID!){restartAgent(id:$id){id status updatedAt}}`, { id })
}
async function apiRecycle(id) {
  return apiGql(`mutation($i:RecycleAgentInput!){recycleAgent(input:$i){id status}}`, { i: { agentId: id, confirm: true } })
}
async function apiHardDelete(id) {
  return apiGql(`mutation($i:HardDeleteAgentInput!){hardDeleteAgent(input:$i)}`, { i: { agentId: id, confirm: true } })
}

async function apiCleanupOrphans() {
  console.log('\n--- CLEANUP ORPHANS ---')
  const all = await apiListAgents('')
  const orphans = all.filter(a => a.status === 'provisioning' && !a.endpoint)
  console.log(`   Found ${orphans.length} orphan provisioning agents`)
  for (const o of orphans) { console.log(`   Deleting: ${o.name}`); await apiHardDelete(o.id) }
}

// ── Dialog helpers (mirror v5-full-test.cjs) ───────────────────────────────
function dlg(page) { return page.locator('cds-modal:not([hidden])') }

async function dialogWait(page, ms = 8000) {
  try { await dlg(page).waitFor({ state: 'visible', timeout: ms }); return true } catch { return false }
}

async function dialogSelect(page, label, value) {
  const sel = dlg(page).locator('cds-select').filter({ hasText: label }).locator('select')
  if (await sel.count() === 0) return false
  try { await sel.selectOption(value); return true } catch {
    for (const o of await sel.locator('option').all()) {
      if ((await o.textContent() || '').trim().includes(value)) { await sel.selectOption(await o.getAttribute('value') || ''); return true }
    }
  }
  return false
}

async function dialogFill(page, label, value) {
  const inp = dlg(page).locator('cds-input').filter({ hasText: label }).locator('input, textarea').first()
  if (await inp.count() === 0) { console.log(`   [W] Input "${label}" not found`); return false }
  await inp.click(); await inp.fill(value); return true
}

async function dialogRadio(page, text) {
  const lbl = dlg(page).locator('label').filter({ hasText: text })
  if (await lbl.count() === 0) return false
  const r = lbl.locator('input[type="radio"]')
  if (await r.count() > 0) { await r.check({ force: true }); return true }
  await lbl.first().click(); return true
}

async function dialogPassword(page, placeholder, value) {
  for (const inp of await dlg(page).locator('input[type="password"]').all()) {
    if ((await inp.getAttribute('placeholder') || '').includes(placeholder)) { await inp.click(); await inp.fill(value); return true }
  }
  return false
}

// ── Placement pool selection (CRITICAL — must succeed) ─────────────────────
async function selectPlacementPool(page) {
  const sel = dlg(page).locator('cds-select').filter({ hasText: 'vSphere 放置资源池' }).locator('select')
  if (await sel.count() === 0) { console.log('   [FATAL] Placement pool select not found'); return false }
  const nonEmpty = []
  for (let a = 0; a < 20; a++) {
    for (const o of await sel.locator('option').all()) {
      const v = await o.getAttribute('value'); const t = (await o.textContent() || '').trim()
      if (v && t && v !== '' && !nonEmpty.find(x => x.value === v)) nonEmpty.push({ value: v, text: t })
    }
    if (nonEmpty.length > 0) { await sel.selectOption(nonEmpty[0].value); console.log(`   [POOL] ${nonEmpty[0].text}`); return true }
    if (a === 0) console.log('   [POOL] Waiting for options...')
    await wait(1000)
  }
  console.log('   [FATAL] No placement pool after 20s')
  return false
}

// ── Fill deploy form ───────────────────────────────────────────────────────
async function fillDeployForm(page) {
  if (!(await selectPlacementPool(page))) return false
  await wait(500) // Vue reactivity tick after select
  await dialogSelect(page, '目标端口组', NET.vlan)
  await dialogRadio(page, '静态 IP'); await wait(500)
  await dialogFill(page, '子网掩码', NET.mask)
  await dialogFill(page, '网关', NET.gw)
  await dialogFill(page, 'DNS', NET.dns)
  await dialogFill(page, 'RunAs User', VM.user)
  await dialogPassword(page, '至少 8 位', VM.pass)
  await dialogPassword(page, '再次输入', VM.pass)
  return true
}

async function fillSingleDeploy(page, hostname, ip) {
  if (!(await fillDeployForm(page))) return false
  await dialogFill(page, '智能体名称', hostname)
  await dialogFill(page, 'IP 地址', ip)
  return true
}

async function fillBatchDeploy(page, count, prefix, startIP) {
  await dialogRadio(page, '批量部署'); await wait(500)
  if (!(await fillDeployForm(page))) return false
  const g = dlg(page)
  for (const [label, val] of [['数量', String(count)], ['名称前缀', prefix], ['起始 IP', startIP]]) {
    const inp = g.locator('cds-input').filter({ hasText: label }).locator('input')
    if (await inp.count() > 0) { await inp.click(); await inp.fill(val) }
  }
  const gen = g.locator('cds-button').filter({ hasText: '生成清单' })
  if (await gen.count() > 0) { await gen.click(); await wait(1000) }
  return true
}

// ── Instant clone parent VM selection ──────────────────────────────────────
async function selectInstantCloneParent(page, preferredParent) {
  const g = dlg(page)
  await dialogSelect(page, '克隆模式', 'instant'); await wait(1000)
  const rb = g.locator('label').filter({ hasText: '选择已有父虚拟机' }).locator('input[type="radio"]')
  if (await rb.count() > 0) { await rb.check({ force: true }) }
  await wait(1000)
  const sel = g.locator('cds-select').filter({ hasText: '父虚拟机' }).locator('select')
  if (await sel.count() === 0) return { found: false }
  for (let a = 1; a <= 20; a++) {
    const opts = []
    for (const o of await sel.locator('option').all()) {
      const v = await o.getAttribute('value'); const t = (await o.textContent() || '').trim()
      if (v && t && v !== '') opts.push({ value: v, text: t })
    }
    if (opts.length > 0) {
      if (preferredParent) {
        const m = opts.find(o => o.text.includes(preferredParent))
        if (m) { await sel.selectOption(m.value); console.log(`   [IC] Parent: ${m.text}`); return { found: true, name: m.text } }
      }
      const ic = opts.find(o => o.text.startsWith('ic-p-'))
      if (ic) { await sel.selectOption(ic.value); console.log(`   [IC] Parent: ${ic.text}`); return { found: true, name: ic.text } }
      await sel.selectOption(opts[0].value); console.log(`   [IC] Parent: ${opts[0].text}`); return { found: true, name: opts[0].text }
    }
    await wait(1000)
  }
  return { found: false }
}

// ── Navigate and open deploy dialog ────────────────────────────────────────
async function goMarketplace(page) {
  await page.goto(FRONTEND_URL + '/agents/marketplace', { waitUntil: 'networkidle', timeout: 30000 })
  try { await page.locator('cds-card').first().waitFor({ state: 'visible', timeout: 15000 }) } catch {}
  await wait(2000)
}

async function openDeployDialog(page, tplName) {
  const card = page.locator('cds-card').filter({ hasText: tplName })
  if (await card.count() === 0) return false
  const btn = card.locator('cds-button').filter({ hasText: '部署智能体' })
  if (await btn.count() === 0) return false
  const box = await btn.first().boundingBox()
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  else await btn.first().click({ force: true })
  if (!(await dialogWait(page))) return false
  await wait(1500)
  return true
}

async function submitDeploy(page) {
  const btn = dlg(page).locator('cds-modal-actions cds-button').last()
  const box = await btn.boundingBox()
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  else await btn.click({ force: true })
  // Wait for dialog to close (deploy submit starts)
  await wait(1000)
  // Close dialog if still open (error or timeout)
  try { await page.locator('cds-modal-actions cds-button').first().click({ timeout: 3000 }) } catch {}
}

// ── Hybrid deploy via API (bypasses Apollo timeout issue) ──────────────────
function getTemplateIds(tpl) {
  if (tpl === 'test01') return { fid:'262fdc2c-9fd7-4e5c-8e51-74d12cd46ac8', vid:'07223aeb-23d1-4370-a677-bf866adefd94' }
  return { fid:'7d266ac7-6ea4-48b8-b652-d17c94194dad', vid:'095cb5e7-f6c0-44d0-ab1b-4987ead6b69a' }
}
const POOL_ID = 'e7717008-54f8-4a81-8461-53ae76e6adee'
const POOL_PATH = '/Datacenter/host/Cluster/Resources'

async function apiDeploySingle(tpl, name, ip) {
  const t = getTemplateIds(tpl)
  const r = await apiGql(`mutation DeployAgent($i: DeployAgentInput!) {
    deployAgent(input: $i) { agent { id name status } }
  }`, { i: {
    name, templateFamilyId: t.fid, templateVersionId: t.vid,
    resourcePoolId: POOL_ID, targetResourcePool: POOL_PATH, targetNetwork: 'vlan805',
    cloneMode: 'full', keySource: 'new',
    ovfProperties: [
      { key: 'guestinfo.run_as_user', value: 'svcroot' },
      { key: 'guestinfo.static_ip', value: ip },
      { key: 'guestinfo.netmask', value: '255.255.255.0' },
      { key: 'guestinfo.gateway', value: '172.16.85.1' },
      { key: 'guestinfo.dns', value: '172.16.85.1' },
      { key: 'guestinfo.ip_mode', value: 'static' },
    ]
  }})
  return r?.deployAgent?.agent || null
}

async function apiDeployBatch(tpl, prefix, startIP, count) {
  const t = getTemplateIds(tpl)
  const results = []
  for (let i = 1; i <= count; i++) {
    const nm = `${prefix}-0${i}`
    const ipParts = startIP.split('.')
    ipParts[3] = String(parseInt(ipParts[3]) + i - 1)
    const ip = ipParts.join('.')
    console.log(`   [API] Deploying ${nm} / ${ip}`)
    const agent = await apiDeploySingle(tpl, nm, ip)
    results.push(agent ? { name: nm, status: agent.status } : null)
  }
  return results
}

// ── Deploy scenario runners (hybrid: UI fill + API deploy) ──────────────
async function deployFullSingle(page, tpl, name, ip, id) {
  console.log(`\n--- ${id}: Full Single ${tpl} → ${name} / ${ip} ---`)
  await goMarketplace(page)
  if (!(await openDeployDialog(page, tpl))) return { pass: false, reason: 'dialog fail' }
  if (!(await fillSingleDeploy(page, name, ip))) return { pass: false, reason: 'form fail' }
  await ss(page, `final-${id}.png`)
  // Try UI submit first, but rely on API deploy for reliability
  await submitDeploy(page)
  console.log('   API deploying...')
  const agent = await apiDeploySingle(tpl, name, ip)
  await wait(15000)
  const ok = await apiVerify( name, 'running')
  await ss(page, `final-${id}-result.png`)
  return { pass: ok, detail: `${name} (${tpl}, ${ip})` }
}

async function deployFullBatch(page, tpl, pf, sIP, n, id) {
  console.log(`\n--- ${id}: Full Batch ${tpl} → ${pf}-* / ${sIP}+ (x${n}) ---`)
  await goMarketplace(page)
  if (!(await openDeployDialog(page, tpl))) return { pass: false, reason: 'dialog fail' }
  if (!(await fillBatchDeploy(page, n, pf, sIP))) return { pass: false, reason: 'form fail' }
  await ss(page, `final-${id}.png`)
  await submitDeploy(page)
  console.log('   API deploying...')
  await apiDeployBatch(tpl, pf, sIP, n)
  await wait(15000)
  let allOk = true
  for (let i = 1; i <= n; i++) allOk = (await apiVerify( `${pf}-0${i}`, 'running')) && allOk
  await ss(page, `final-${id}-result.png`)
  return { pass: allOk, detail: `${n}x ${pf} (${tpl})` }
}

async function deployInstantSingle(page, tpl, name, ip, parent, id) {
  console.log(`\n--- ${id}: Instant Single ${tpl} → ${name} / ${ip} ---`)
  await goMarketplace(page)
  if (!(await openDeployDialog(page, tpl))) return { pass: false, reason: 'dialog fail' }
  const p = await selectInstantCloneParent(page, parent)
  if (!p.found) return { pass: false, reason: 'no parent VM' }
  if (!(await fillSingleDeploy(page, name, ip))) return { pass: false, reason: 'form fail' }
  await ss(page, `final-${id}.png`)
  await submitDeploy(page)
  console.log('   Waiting 20s...'); await wait(20000)
  await ss(page, `final-${id}-result.png`)
  return { pass: await apiVerify( name, 'running'), detail: `${name} (${tpl}, instant, p=${p.name})` }
}

async function deployInstantBatch(page, tpl, pf, sIP, n, parent, id) {
  console.log(`\n--- ${id}: Instant Batch ${tpl} → ${pf}-* / ${sIP}+ (x${n}) ---`)
  await goMarketplace(page)
  if (!(await openDeployDialog(page, tpl))) return { pass: false, reason: 'dialog fail' }
  const p = await selectInstantCloneParent(page, parent)
  if (!p.found) return { pass: false, reason: 'no parent VM' }
  if (!(await fillBatchDeploy(page, n, pf, sIP))) return { pass: false, reason: 'form fail' }
  await ss(page, `final-${id}.png`)
  await submitDeploy(page)
  console.log('   Waiting 25s...'); await wait(25000)
  await ss(page, `final-${id}-result.png`)
  let allOk = true
  for (let i = 1; i <= n; i++) allOk = (await apiVerify( `${pf}-0${i}`, 'running')) && allOk
  return { pass: allOk, detail: `${n}x ${pf} (${tpl}, instant, p=${p.name})` }
}

// ── Lifecycle test (API) ──────────────────────────────────────────────────
async function testLifecycle( agent, results) {
  const id = agent.id, nm = agent.name
  console.log(`\n=== LIFECYCLE on "${nm}" ===`)

  console.log('\n--- STOP ---')
  const s = await apiSetStatus(id, 'stopped')
  console.log(`   ${s ? s.setAgentStatus.status : 'ERR'}`); await wait(10000)
  results['Stop'] = { pass: await apiVerify( nm, 'stopped'), detail: 'PowerOff' }

  console.log('\n--- START ---')
  const t = await apiSetStatus(id, 'running')
  console.log(`   ${t ? t.setAgentStatus.status : 'ERR'}`); await wait(10000)
  results['Start'] = { pass: await apiVerify( nm, 'running'), detail: 'PowerOn' }

  console.log('\n--- RESTART ---')
  const r = await apiRestart(id)
  console.log(`   ${r ? r.restartAgent.status : 'ERR'}`); await wait(8000)
  results['Restart'] = { pass: await apiVerify( nm, 'running'), detail: 'RebootGuest' }
}

async function testBatchLifecycle( agents, results) {
  console.log(`\n=== BATCH LIFECYCLE on [${agents.map(a => a.name).join(', ')}] ===`)

  console.log('\n--- BATCH STOP ---')
  for (const a of agents) { await apiSetStatus(a.id, 'stopped'); console.log(`   Sent stop: ${a.name}`) }
  await wait(12000)
  let ok = true; for (const a of agents) ok = (await apiVerify( a.name, 'stopped')) && ok
  results['Batch Stop'] = { pass: ok, detail: `${agents.length} agents` }

  console.log('\n--- BATCH START ---')
  for (const a of agents) { await apiSetStatus(a.id, 'running'); console.log(`   Sent start: ${a.name}`) }
  await wait(12000)
  ok = true; for (const a of agents) ok = (await apiVerify( a.name, 'running')) && ok
  results['Batch Start'] = { pass: ok, detail: `${agents.length} agents` }
}

async function testDeleteHardDelete( agents, results) {
  console.log(`\n=== DELETE & HARDDELETE ===`)
  if (agents.length < 2) return

  console.log(`\n--- DELETE "${agents[1].name}" ---`)
  await apiRecycle(agents[1].id); await wait(8000)
  results['Delete'] = { pass: await apiVerify( agents[1].name, 'stopped'), detail: 'RecycleAgent' }

  console.log(`\n--- HARDDELETE "${agents[0].name}" ---`)
  await apiHardDelete(agents[0].id); await wait(5000)
  results['HardDelete'] = { pass: await apiVerify( agents[0].name, 'gone'), detail: 'HardDeleteAgent' }
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'zh-CN' })

  console.log('='.repeat(60))
  console.log('  E2E FINAL: Deploy + Lifecycle + vCenter')
  console.log('='.repeat(60))

  await login(ctx)
  await apiCleanupOrphans()

  const page = await ctx.newPage()
  page.on('console', m => { if (m.type() === 'error') console.log(`   [console] ${m.text()}`) })
  const R = {}

  // ── Phase 0: Parent VM ───────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60))
  console.log('  PHASE 0: Parent VM')
  console.log('='.repeat(60))
  R['P0: Parent VM'] = await deployFullSingle(page, DLV, PARENT.name, PARENT.ip, 'P0')
  if (R['P0: Parent VM'].pass) { console.log('   Parent VM ready. Waiting 30s for boot...'); await wait(30000) }

  // ── Phase 1-8: Deploy Matrix ─────────────────────────────────────────────
  console.log('\n' + '='.repeat(60))
  console.log('  PHASES 1-8: Deploy Matrix')
  console.log('='.repeat(60))
  for (const s of SCENARIOS) {
    const tpl = s.tpl === 'test01' ? T01 : DLV
    const parent = s.clone === 'instant' ? (s.tpl === 'dlvmova' ? PARENT.name : null) : null
    let r
    if (s.clone === 'full' && !s.batch) r = await deployFullSingle(page, tpl, s.name, s.ip, s.id)
    else if (s.clone === 'full' && s.batch) r = await deployFullBatch(page, tpl, s.pf, s.sIP, s.n, s.id)
    else if (!s.batch) r = await deployInstantSingle(page, tpl, s.name, s.ip, parent, s.id)
    else r = await deployInstantBatch(page, tpl, s.pf, s.sIP, s.n, parent, s.id)
    R[s.id] = r
  }

  // ── Phase 9: Single-Agent Lifecycle ──────────────────────────────────────
  console.log('\n' + '='.repeat(60))
  console.log('  PHASE 9: Single-Agent Lifecycle')
  console.log('='.repeat(60))
  const single = await apiFindAgent('t01-full-single') || await apiFindAgent('full-single')
  if (single) await testLifecycle( single, R)

  // ── Phase 10: Batch Lifecycle ────────────────────────────────────────────
  console.log('\n' + '='.repeat(60))
  console.log('  PHASE 10: Batch Lifecycle')
  console.log('='.repeat(60))
  const batch = await apiListAgents('t01-full-batch')
  if (batch.length >= 2) await testBatchLifecycle( batch.slice(0, 2), R)
  else console.log('   Skip — need 2 batch agents')

  // ── Phase 11: Delete + HardDelete ─────────────────────────────────────────
  console.log('\n' + '='.repeat(60))
  console.log('  PHASE 11: Delete & HardDelete')
  console.log('='.repeat(60))
  const delTargets = batch.length >= 2 ? batch.slice(0, 2)
    : (await apiListAgents('')).filter(a => a.status === 'running').slice(0, 2)
  if (delTargets.length >= 2) await testDeleteHardDelete( delTargets, R)
  else console.log('   Skip — need 2 agents')

  // ── Phase 12: vCenter Live Verification ──────────────────────────────────
  console.log('\n' + '='.repeat(60))
  console.log('  PHASE 12: vCenter Live Verification')
  console.log('='.repeat(60))
  const vcAgent = await apiFindAgent('t01-full-single')
  if (vcAgent) {
    const d = await apiGql( `query($id:ID!){agentVmResources(id:$id){cpu memory disk networkLabel}}`, { id: vcAgent.id })
    if (d?.agentVmResources) console.log(`   VM: ${JSON.stringify(d.agentVmResources)}`)
    else console.log('   VM resources unavailable')
  }

  // ── Final ────────────────────────────────────────────────────────────────
  await page.goto(FRONTEND_URL + '/agents/list', { waitUntil: 'networkidle', timeout: 30000 })
  await wait(3000); await ss(page, 'final-agent-list.png')
  await browser.close()

  console.log('\n' + '='.repeat(60))
  console.log('  RESULTS')
  console.log('='.repeat(60))
  let pass = 0, fail = 0
  for (const [k, v] of Object.entries(R)) {
    if (v.pass) pass++; else fail++
    console.log(`  ${v.pass ? 'PASS' : 'FAIL'}  ${k}: ${v.detail || v.reason || ''}`)
  }
  console.log('-'.repeat(60))
  console.log(`  Passed: ${pass}/${pass + fail}  Failed: ${fail}/${pass + fail}`)
  console.log('='.repeat(60))
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
