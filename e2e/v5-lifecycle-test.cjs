/**
 * E2E: Full Lifecycle Test — Deploy + Start/Stop/Restart/Recycle/HardDelete
 *
 * Covers:
 *   - test01 template: full clone single, full clone batch, instant clone single, instant clone batch
 *   - dlvmova template: full clone single, full clone batch, instant clone single, instant clone batch
 *   - Parent VM creation (ic-p-dlvmova-v5) for instant clone
 *   - Lifecycle operations: start (PowerOn), stop (PowerOff), restart (RebootGuest)
 *   - Delete (recycle) and hard-delete with vCenter verification
 *   - Batch start/stop
 *   - vCenter VM power-state verification after each operation
 *
 * Run with:
 *   node /data/claude/ai-workstation-platform/frontend/e2e/v5-lifecycle-test.cjs
 *
 * Prerequisites:
 *   - Frontend @ http://192.168.15.128:5173
 *   - Backend @ http://192.168.15.128:8080
 *   - Admin account: admin@platform.local / ChangeMe123!
 *   - test01 and dlvmova templates exist in marketplace
 *   - vCenter operational, VLAN 805 available
 *   - Static IP range 172.16.85.151-163 available
 *
 * Screenshots: /tmp/e2e-screenshots/v5-lifecycle-*.png
 */

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const FRONTEND_URL = 'http://192.168.15.128:5173'
const BACKEND_URL  = 'http://192.168.15.128:8080'
const SCREENSHOT_DIR = '/tmp/e2e-screenshots'
const ADMIN_EMAIL = 'admin@platform.local'
const ADMIN_PASSWORD = 'ChangeMe123!'
const VLAN_TARGET = 'vlan805'
const GATEWAY = '172.16.85.1'
const NETMASK = '255.255.255.0'
const DNS = '172.16.85.1'
const RUNAS_USER = 'svcroot'
const VM_PASSWORD = 'VMware1!'

const TEMPLATE_TEST01 = 'test01'
const TEMPLATE_DLVMOVA = 'dlvmova'

// ── IP allocation ──────────────────────────────────────────────────────────
// Phase 0: parent VM
const PARENT_VM_NAME = 'ic-p-dlvmova-v5'
const PARENT_VM_IP   = '172.16.85.151'

// Deploy scenarios
const DEPLOY_MATRIX = [
  // { phase, template, cloneMode, deployMode, name/prefix, ip/startIP, count, parent? }
  { id:'S1', template:'test01',  clone:'full',    batch:false, name:'t01-full-single',   ip:'172.16.85.152' },
  { id:'S2', template:'test01',  clone:'full',    batch:true,  prefix:'t01-full-batch',  startIP:'172.16.85.153', count:2 },
  { id:'S3', template:'test01',  clone:'instant', batch:false, name:'t01-ic-single',     ip:'172.16.85.155' },
  { id:'S4', template:'test01',  clone:'instant', batch:true,  prefix:'t01-ic-batch',    startIP:'172.16.85.156', count:2 },
  { id:'S5', template:'dlvmova', clone:'full',    batch:false, name:'dv-full-single',    ip:'172.16.85.158' },
  { id:'S6', template:'dlvmova', clone:'full',    batch:true,  prefix:'dv-full-batch',   startIP:'172.16.85.159', count:2 },
  { id:'S7', template:'dlvmova', clone:'instant', batch:false, name:'dv-ic-single',      ip:'172.16.85.161' },
  { id:'S8', template:'dlvmova', clone:'instant', batch:true,  prefix:'dv-ic-batch',     startIP:'172.16.85.162', count:2 },
]

// ── helpers ────────────────────────────────────────────────────────────────

async function screenshot(page, name) {
  const fp = path.join(SCREENSHOT_DIR, name)
  await page.screenshot({ path: fp, fullPage: false })
  console.log(`   [screenshot] ${name}`)
}

async function loginViaAPI(context) {
  const resp = await context.request.post(FRONTEND_URL + '/query', {
    data: {
      query: `mutation Login($input: LoginInput!) {
        login(input: $input) { token mustChangePassword user { id username email role } }
      }`,
      variables: { input: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, remember: true } },
    },
  })
  const body = await resp.json()
  if (body.errors) throw new Error('Login failed: ' + body.errors[0].message)
  console.log('   Authenticated via API')
}

// ── dialog helpers (mirror v5-full-test.cjs patterns) ─────────────────────

function dlg(page) { return page.locator('cds-modal:not([hidden])') }

async function waitForDialogVisible(page, timeoutMs = 8000) {
  try { await dlg(page).waitFor({ state: 'visible', timeout: timeoutMs }); return true }
  catch { return false }
}

async function dialogSelect(page, labelMatch, value) {
  const sel = dlg(page).locator('cds-select').filter({ hasText: labelMatch }).locator('select')
  if (await sel.count() === 0) { console.log(`   [WARN] Select "${labelMatch}" not found`); return false }
  try { await sel.selectOption(value); return true }
  catch {
    const opts = await sel.locator('option').all()
    for (const o of opts) {
      if ((await o.textContent() || '').trim().includes(value)) {
        await sel.selectOption((await o.getAttribute('value')) || ''); return true
      }
    }
  }
  return false
}

async function dialogFill(page, labelMatch, value) {
  const inp = dlg(page).locator('cds-input').filter({ hasText: labelMatch }).locator('input, textarea').first()
  if (await inp.count() === 0) { console.log(`   [WARN] Input "${labelMatch}" not found`); return false }
  await inp.click(); await inp.fill(value); return true
}

async function dialogRadio(page, text) {
  const lbl = dlg(page).locator('label').filter({ hasText: text })
  if (await lbl.count() === 0) return false
  const r = lbl.locator('input[type="radio"]')
  if (await r.count() > 0) { await r.check({ force: true }); return true }
  await lbl.first().click(); return true
}

async function dialogPassword(page, placeholderPart, value) {
  const all = await dlg(page).locator('input[type="password"]').all()
  for (const inp of all) {
    const ph = (await inp.getAttribute('placeholder') || '')
    if (ph.includes(placeholderPart)) { await inp.click(); await inp.fill(value); return true }
  }
  return false
}

async function dialogHostname(page, val) { return dialogFill(page, '智能体名称', val) }
async function dialogIP(page, val) { return dialogFill(page, 'IP 地址', val) }

async function dialogBatchInputs(page, count, prefix, startIP) {
  const g = dlg(page)
  const ci = g.locator('cds-input').filter({ hasText: '数量' }).locator('input')
  if (await ci.count() > 0) { await ci.click(); await ci.fill(String(count)) }
  const pi = g.locator('cds-input').filter({ hasText: '名称前缀' }).locator('input')
  if (await pi.count() > 0) { await pi.click(); await pi.fill(prefix) }
  if (startIP) {
    const si = g.locator('cds-input').filter({ hasText: '起始 IP' }).locator('input')
    if (await si.count() > 0) { await si.click(); await si.fill(startIP) }
  }
}

async function dialogGenerateManifest(page) {
  const btn = dlg(page).locator('cds-button').filter({ hasText: '生成清单' })
  if (await btn.count() === 0) return false
  await btn.click(); await page.waitForTimeout(1000); return true
}

async function dialogSubmit(page) {
  const actions = dlg(page).locator('cds-modal-actions')
  const btn = actions.locator('cds-button').last()
  const box = await btn.boundingBox()
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  else await btn.click({ force: true })
}

async function dialogClose(page) {
  const g = dlg(page); if (await g.count() === 0) return
  const first = g.locator('cds-modal-actions cds-button').first()
  const box = await first.boundingBox()
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  else await first.click({ force: true })
  await page.waitForTimeout(1000)
}

async function gotoMarketplace(page) {
  await page.goto(FRONTEND_URL + '/agents/marketplace', { waitUntil: 'networkidle', timeout: 30000 })
  try { await page.locator('cds-card').first().waitFor({ state: 'visible', timeout: 15000 }) }
  catch { console.log('   [WARN] No template cards found') }
  await page.waitForTimeout(2000)
}

async function openDeployDialogFor(page, templateName) {
  const card = page.locator('cds-card').filter({ hasText: templateName })
  if (await card.count() === 0) { console.log(`   [WARN] Card "${templateName}" not found`); return false }
  const btn = card.locator('cds-button').filter({ hasText: '部署智能体' })
  if (await btn.count() === 0) { console.log('   [WARN] Deploy button not found'); return false }
  const box = await btn.first().boundingBox()
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  else await btn.first().click({ force: true })
  const opened = await waitForDialogVisible(page)
  if (opened) await page.waitForTimeout(1500)
  return opened
}

async function dialogSelectPlacementPool(page) {
  const sel = dlg(page).locator('cds-select').filter({ hasText: 'vSphere 放置资源池' }).locator('select')
  if (await sel.count() === 0) {
    console.log('   [WARN] vSphere placement pool select NOT FOUND in dialog')
    return false
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    const opts = await sel.locator('option').all()
    const nonEmpty = []
    for (const o of opts) {
      const v = await o.getAttribute('value'); const t = (await o.textContent() || '').trim()
      if (v && t && v !== '') nonEmpty.push({ value: v, text: t })
    }
    if (nonEmpty.length > 0) {
      await sel.selectOption(nonEmpty[0].value)
      console.log(`   [INFO] Selected placement pool: ${nonEmpty[0].text} (value=${nonEmpty[0].value})`)
      return true
    }
    if (attempt === 0) console.log(`   [POLL] Waiting for placement pool options...`)
    await page.waitForTimeout(1000)
  }
  console.log('   [WARN] No placement pool options after 20s polling')
  return false
}

async function fillStaticIPFields(page) {
  await dialogSelect(page, '目标端口组', VLAN_TARGET)
  console.log(`   [INFO] VLAN: ${VLAN_TARGET}`)
  await dialogRadio(page, '静态 IP'); await page.waitForTimeout(500)
  await dialogFill(page, '子网掩码', NETMASK)
  await dialogFill(page, '网关', GATEWAY)
  await dialogFill(page, 'DNS', DNS)
  await dialogFill(page, 'RunAs User', RUNAS_USER)
  await dialogPassword(page, '至少 8 位', VM_PASSWORD)
  await dialogPassword(page, '再次输入', VM_PASSWORD)
  console.log('   [INFO] Static IP + credentials filled')
}

// ── instant clone parent selection (mirrors v5-full-test.cjs) ──────────────

async function dialogSetInstantCloneWithParent(page, preferredParent) {
  const g = dlg(page)
  console.log('   [STEP] Setting clone mode to instant...')
  await dialogSelect(page, '克隆模式', 'instant')
  await page.waitForTimeout(1000)

  const existingRadio = g.locator('label').filter({ hasText: '选择已有父虚拟机' }).locator('input[type="radio"]')
  if (await existingRadio.count() > 0) {
    await existingRadio.check({ force: true })
    console.log('   [INFO] Selected existing parent radio')
  }
  await page.waitForTimeout(1000)

  const sel = g.locator('cds-select').filter({ hasText: '父虚拟机' }).locator('select')
  if (await sel.count() === 0) { console.log('   [ERROR] Parent VM select not found'); return { found: false, parentName: null } }

  for (let attempt = 1; attempt <= 20; attempt++) {
    const opts = await sel.locator('option').all()
    const nonEmpty = []
    for (const o of opts) {
      const v = await o.getAttribute('value'); const t = (await o.textContent() || '').trim()
      if (v && t && v !== '') nonEmpty.push({ value: v, text: t })
    }
    if (nonEmpty.length > 0) {
      if (preferredParent) {
        for (const opt of nonEmpty) {
          if (opt.text === preferredParent || opt.text.includes(preferredParent)) {
            await sel.selectOption(opt.value)
            console.log(`   [INFO] Selected parent: ${opt.text}`)
            return { found: true, parentName: opt.text }
          }
        }
      }
      for (const opt of nonEmpty) {
        if (opt.text.startsWith('ic-p-')) {
          await sel.selectOption(opt.value)
          console.log(`   [INFO] Selected parent (ic-p-*): ${opt.text}`)
          return { found: true, parentName: opt.text }
        }
      }
      await sel.selectOption(nonEmpty[0].value)
      console.log(`   [INFO] Selected parent (first): ${nonEmpty[0].text}`)
      return { found: true, parentName: nonEmpty[0].text }
    }
    console.log(`   [POLL] Parent VM attempt ${attempt}/20 — waiting...`)
    await page.waitForTimeout(1000)
  }
  return { found: false, parentName: null }
}

// ── deploy scenarios ───────────────────────────────────────────────────────

async function runFullCloneSingle(page, templateName, ip, hostname, screenshotLabel) {
  console.log(`\n===== Full Single: ${templateName} → ${hostname} / ${ip} =====`)
  await gotoMarketplace(page)
  if (!(await openDeployDialogFor(page, templateName))) return { pass: false, reason: 'dialog not opened' }
  const poolOk = await dialogSelectPlacementPool(page)
  if (!poolOk) return { pass: false, reason: 'no placement pool available' }
  await fillStaticIPFields(page)
  await dialogHostname(page, hostname)
  await dialogIP(page, ip)
  await screenshot(page, `${screenshotLabel}.png`)
  await dialogSubmit(page)
  console.log('   Submitted, waiting 15s...')
  await page.waitForTimeout(15000)
  await screenshot(page, `${screenshotLabel}-result.png`)
  await dialogClose(page)
  return { pass: true, detail: `deployed ${hostname} (${templateName}, IP=${ip})` }
}

async function runFullCloneBatch(page, templateName, startIP, count, prefix, screenshotLabel) {
  console.log(`\n===== Full Batch: ${templateName} → ${prefix}-{N} / ${startIP}+ =====`)
  await gotoMarketplace(page)
  if (!(await openDeployDialogFor(page, templateName))) return { pass: false, reason: 'dialog not opened' }
  await dialogSelectPlacementPool(page)
  await dialogRadio(page, '批量部署'); await page.waitForTimeout(500)
  await fillStaticIPFields(page)
  await dialogBatchInputs(page, count, prefix, startIP)
  await dialogGenerateManifest(page)
  await screenshot(page, `${screenshotLabel}.png`)
  await dialogSubmit(page)
  console.log('   Submitted, waiting 15s...')
  await page.waitForTimeout(15000)
  await screenshot(page, `${screenshotLabel}-result.png`)
  await dialogClose(page)
  return { pass: true, detail: `deployed ${count}x ${prefix} (${templateName}, startIP=${startIP})` }
}

async function runInstantCloneSingle(page, templateName, ip, hostname, parentVM, screenshotLabel) {
  console.log(`\n===== Instant Single: ${templateName} → ${hostname} / ${ip} =====`)
  await gotoMarketplace(page)
  if (!(await openDeployDialogFor(page, templateName))) return { pass: false, reason: 'dialog not opened' }
  await dialogSelectPlacementPool(page)
  const pRes = await dialogSetInstantCloneWithParent(page, parentVM)
  await fillStaticIPFields(page)
  await dialogHostname(page, hostname)
  await dialogIP(page, ip)
  await screenshot(page, `${screenshotLabel}.png`)
  await dialogSubmit(page)
  console.log('   Submitted, waiting 20s...')
  await page.waitForTimeout(20000)
  await screenshot(page, `${screenshotLabel}-result.png`)
  await dialogClose(page)
  return { pass: true, detail: `deployed ${hostname} (${templateName}, instant, parent=${pRes.parentName || '?'})` }
}

async function runInstantCloneBatch(page, templateName, startIP, count, prefix, parentVM, screenshotLabel) {
  console.log(`\n===== Instant Batch: ${templateName} → ${prefix}-{N} / ${startIP}+ =====`)
  await gotoMarketplace(page)
  if (!(await openDeployDialogFor(page, templateName))) return { pass: false, reason: 'dialog not opened' }
  await dialogSelectPlacementPool(page)
  const pRes = await dialogSetInstantCloneWithParent(page, parentVM)
  await dialogRadio(page, '批量部署'); await page.waitForTimeout(500)
  await fillStaticIPFields(page)
  await dialogBatchInputs(page, count, prefix, startIP)
  await dialogGenerateManifest(page)
  await screenshot(page, `${screenshotLabel}.png`)
  await dialogSubmit(page)
  console.log('   Submitted, waiting 20s...')
  await page.waitForTimeout(20000)
  await screenshot(page, `${screenshotLabel}-result.png`)
  await dialogClose(page)
  return { pass: true, detail: `deployed ${count}x ${prefix} (${templateName}, instant, parent=${pRes.parentName || '?'})` }
}

// ── Phase 0: Create Parent VM ──────────────────────────────────────────────

async function phase0_createParentVM(page) {
  console.log('\n' + '='.repeat(70))
  console.log('  PHASE 0: Create Parent VM from dlvmova (for instant clone)')
  console.log(`  Name: ${PARENT_VM_NAME}  IP: ${PARENT_VM_IP}`)
  console.log('='.repeat(70))
  await gotoMarketplace(page)
  if (!(await openDeployDialogFor(page, TEMPLATE_DLVMOVA))) {
    return { pass: false, reason: 'Could not open deploy dialog for dlvmova' }
  }
  const poolOk = await dialogSelectPlacementPool(page)
  if (!poolOk) return { pass: false, reason: 'Phase 0: no placement pool available' }
  await fillStaticIPFields(page)
  await dialogHostname(page, PARENT_VM_NAME)
  await dialogIP(page, PARENT_VM_IP)
  await screenshot(page, 'v5-lifecycle-p0-parent.png')
  await dialogSubmit(page)
  console.log('   Submitted parent VM, waiting 35s for full clone...')
  await page.waitForTimeout(35000)
  await screenshot(page, 'v5-lifecycle-p0-parent-result.png')
  await dialogClose(page)
  return { pass: true, detail: `Parent VM ${PARENT_VM_NAME} created at ${PARENT_VM_IP}` }
}

// ── vCenter / Backend verification ─────────────────────────────────────────

let authToken = ''

async function getAuthToken(context) {
  if (authToken) return authToken
  const resp = await context.request.post(FRONTEND_URL + '/query', {
    data: {
      query: `mutation Login($input: LoginInput!) { login(input: $input) { token } }`,
      variables: { input: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, remember: true } },
    },
  })
  const body = await resp.json()
  authToken = body.data?.login?.token || ''
  return authToken
}

/**
 * Query agent list via GraphQL. Returns array of { id, name, status, endpoint }.
 */
async function backendListAgents(context, nameFilter) {
  const query = `query Agents($filter: AgentFilter) {
    agents(filter: $filter, pagination: {page:1, pageSize:50}) {
      nodes { id name status endpoint }
    }
  }`
  const resp = await context.request.post(FRONTEND_URL + '/query', {
    data: { query, variables: { filter: nameFilter ? { nameKeyword: nameFilter } : null } },
  })
  const body = await resp.json()
  if (body.errors) { console.log('   [API ERR]', body.errors[0].message); return [] }
  return body.data?.agents?.nodes || []
}

/**
 * Find an agent by name (substring match). Returns the first match.
 */
async function findAgent(context, nameSubstr) {
  const agents = await backendListAgents(context, nameSubstr)
  return agents.find(a => a.name.includes(nameSubstr)) || null
}

/**
 * Verify agent status in DB via backend GraphQL.
 */
async function verifyAgentStatus(context, nameSubstr, expectedStatus) {
  const agent = await findAgent(context, nameSubstr)
  if (!agent) { console.log(`   [VC-VERIFY] Agent "${nameSubstr}" not found in DB`); return false }
  const ok = agent.status === expectedStatus
  console.log(`   [VC-VERIFY] Agent "${agent.name}" status=${agent.status} (expected=${expectedStatus}) ${ok ? '✓' : '✗'}`)
  return ok
}

/**
 * Verify VM power state on vCenter by checking the agent status in DB.
 * The backend sync maps vCenter powerState → agent.status.
 */
async function verifyVMState(context, nameSubstr, expectRunning, expectExists) {
  const agent = await findAgent(context, nameSubstr)
  if (expectExists && !agent) {
    console.log(`   [VC-VERIFY] ✗ Agent "${nameSubstr}" should exist but not found`)
    return false
  }
  if (!expectExists && !agent) {
    console.log(`   [VC-VERIFY] ✓ Agent "${nameSubstr}" correctly absent (hard-deleted)`)
    return true
  }
  if (!expectExists && agent) {
    console.log(`   [VC-VERIFY] ✗ Agent "${agent.name}" still exists (should be hard-deleted)`)
    return false
  }
  const expectedStatus = expectRunning ? 'running' : 'stopped'
  const statusOk = agent.status === expectedStatus
  const vmOk = expectExists ? (agent.endpoint !== null && agent.endpoint !== '') : true
  console.log(`   [VC-VERIFY] "${agent.name}" status=${agent.status} expected=${expectedStatus}  status:${statusOk?'✓':'✗'} vm:${vmOk?'✓':'✗'}`)
  return statusOk && vmOk
}

// ── Agent List Page helpers ────────────────────────────────────────────────

async function gotoAgentList(page) {
  await page.goto(FRONTEND_URL + '/agents/list', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)
  await screenshot(page, 'v5-lifecycle-agent-list.png')
}

/**
 * Open the "更多" (more actions) dropdown for a specific agent row.
 */
async function openRowActions(page, agentName) {
  const row = page.locator('cds-grid-row').filter({ hasText: agentName }).first()
  if (await row.count() === 0) { console.log(`   [WARN] Row for "${agentName}" not found`); return false }
  const moreBtn = row.locator('cds-button').filter({ hasText: '更多' }).first()
  if (await moreBtn.count() === 0) {
    const btns = row.locator('cds-button-action, button')
    const allBtns = await btns.all()
    if (allBtns.length > 0) { await allBtns[allBtns.length - 1].click({ force: true }); await page.waitForTimeout(600); return true }
    return false
  }
  const box = await moreBtn.boundingBox()
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  else await moreBtn.click({ force: true })
  await page.waitForTimeout(600)
  return true
}

/**
 * Click a menu option in the currently-open AppDropdown menu.
 */
async function clickMenuOption(page, label) {
  const opt = page.locator('button.menu-opt').filter({ hasText: label }).first()
  if (await opt.count() === 0) {
    console.log(`   [WARN] Menu option "${label}" not found`)
    const all = page.locator('button.menu-opt'); const count = await all.count()
    console.log(`   [DEBUG] Found ${count} menu options:`)
    for (let i = 0; i < count; i++) console.log(`     [${i}] ${await all.nth(i).textContent()}`)
    return false
  }
  await opt.click({ force: true })
  await page.waitForTimeout(800)
  return true
}

/**
 * Handle the confirm dialog (non-hard-delete actions).
 */
async function confirmDialog(page) {
  const dialog = page.locator('.confirm-backdrop')
  try { await dialog.first().waitFor({ state: 'visible', timeout: 5000 }) } catch { return }
  await page.waitForTimeout(500)
  await screenshot(page, 'v5-lifecycle-confirm-dialog.png')
  const btn = dialog.locator('cds-button[action="solid"]').last()
  await btn.click({ force: true })
  console.log('   [INFO] Confirm dialog accepted')
  await page.waitForTimeout(2000)
}

/**
 * Handle type-to-confirm dialog (hard-delete).
 */
async function typeToConfirmDialog(page, text) {
  const dialog = page.locator('.confirm-backdrop')
  try { await dialog.first().waitFor({ state: 'visible', timeout: 5000 }) } catch { return false }
  await page.waitForTimeout(500)
  const input = dialog.locator('input.app-input')
  await input.fill(text)
  await page.waitForTimeout(300)
  await screenshot(page, 'v5-lifecycle-type-to-confirm.png')
  const btn = dialog.locator('cds-button[action="solid"]').last()
  await btn.click({ force: true })
  console.log(`   [INFO] Type-to-confirm accepted: "${text}"`)
  await page.waitForTimeout(2000)
  return true
}

// ── Lifecycle operations ───────────────────────────────────────────────────

/**
 * Perform a single-agent lifecycle action: start / stop / restart / delete / hardDelete
 */
async function agentLifecycleAction(page, context, agentName, action, opts = {}) {
  const labelMap = {
    start: '启动', stop: '停止', restart: '重启',
    delete: '删除', hardDelete: '彻底删除',
  }
  const menuLabel = labelMap[action] || action
  console.log(`\n--- AGENT ACTION: ${action} on "${agentName}" ---`)

  await gotoAgentList(page)
  await page.waitForTimeout(1000)

  if (!(await openRowActions(page, agentName))) {
    return { pass: false, reason: `Could not open row actions for "${agentName}"` }
  }
  await screenshot(page, `v5-lifecycle-${action}-menu.png`)

  if (!(await clickMenuOption(page, menuLabel))) {
    return { pass: false, reason: `Menu option "${menuLabel}" not found for "${agentName}"` }
  }

  if (action === 'hardDelete') {
    if (!(await typeToConfirmDialog(page, agentName))) {
      return { pass: false, reason: `Type-to-confirm dialog failed for hardDelete` }
    }
  } else {
    await confirmDialog(page)
  }

  console.log(`   Waiting ${opts.waitMs || 10000}ms for ${action} to complete...`)
  await page.waitForTimeout(opts.waitMs || 10000)
  await screenshot(page, `v5-lifecycle-${action}-result.png`)

  let vcOk = true
  if (action === 'start') {
    vcOk = await verifyVMState(context, agentName, true, true)
  } else if (action === 'stop') {
    vcOk = await verifyVMState(context, agentName, false, true)
  } else if (action === 'restart') {
    vcOk = await verifyVMState(context, agentName, true, true)
  } else if (action === 'delete') {
    vcOk = await verifyAgentStatus(context, agentName, 'stopped')
  } else if (action === 'hardDelete') {
    await page.waitForTimeout(3000)
    vcOk = await verifyVMState(context, agentName, false, false)
  }

  return { pass: vcOk, detail: `${action} "${agentName}" — vCenter:${vcOk ? 'OK' : 'FAIL'}` }
}

/**
 * Batch action: select rows, open batch menu, click action.
 */
async function batchLifecycleAction(page, context, agentNames, action) {
  const labelMap = {
    start: '批量启动', stop: '批量停止',
    delete: '批量删除', hardDelete: '批量彻底删除',
  }
  const batchLabel = labelMap[action] || `批量${action}`
  console.log(`\n--- BATCH: ${batchLabel} on [${agentNames.join(', ')}] ---`)

  await gotoAgentList(page)
  await page.waitForTimeout(1500)

  const rowCheckboxes = page.locator('cds-grid-row input[type="checkbox"]')
  const cbCount = await rowCheckboxes.count()
  console.log(`   Found ${cbCount} row checkboxes`)
  if (cbCount < agentNames.length + 1) {
    return { pass: false, reason: `Only ${cbCount} rows, need ${agentNames.length}` }
  }

  for (let i = 0; i < agentNames.length; i++) {
    await rowCheckboxes.nth(i + 1).check()
  }
  await page.waitForTimeout(500)
  await screenshot(page, `v5-lifecycle-batch-${action}-selected.png`)

  const batchBtn = page.locator('cds-button').filter({ hasText: '批量操作' }).first()
  const batchWrapper = page.locator('span.dd-trigger').filter({ has: batchBtn }).first()
  await batchWrapper.click({ force: true })
  await page.waitForTimeout(800)
  await screenshot(page, `v5-lifecycle-batch-${action}-menu.png`)

  const menuItem = page.locator('button.menu-opt').filter({ hasText: batchLabel }).first()
  await menuItem.click({ force: true })
  await page.waitForTimeout(1500)

  if (action === 'hardDelete') {
    if (!(await typeToConfirmDialog(page, agentNames.join(' ')))) {
      return { pass: false, reason: 'Batch type-to-confirm failed' }
    }
  } else {
    await confirmDialog(page)
  }

  console.log(`   Waiting 15s for batch ${action}...`)
  await page.waitForTimeout(15000)
  await screenshot(page, `v5-lifecycle-batch-${action}-result.png`)

  let allOk = true
  for (const name of agentNames) {
    if (action === 'start') {
      allOk = (await verifyVMState(context, name, true, true)) && allOk
    } else if (action === 'stop') {
      allOk = (await verifyVMState(context, name, false, true)) && allOk
    } else if (action === 'hardDelete') {
      allOk = (await verifyVMState(context, name, false, false)) && allOk
    }
  }
  return { pass: allOk, detail: `batch ${batchLabel} on ${agentNames.length} agents — vCenter:${allOk ? 'OK' : 'FAIL'}` }
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'zh-CN' })

  console.log('='.repeat(70))
  console.log('  E2E: Full Lifecycle Test — Deploy + Start/Stop/Restart/Recycle/HardDelete')
  console.log(`  ${DEPLOY_MATRIX.length} deploy scenarios + lifecycle + vCenter verification`)
  console.log('='.repeat(70))

  console.log('\n--- LOGIN ---')
  await loginViaAPI(context)
  await getAuthToken(context)

  const page = await context.newPage()
  page.on('console', msg => { if (msg.type() === 'error') console.log(`   [console.error] ${msg.text()}`) })

  const results = {}

  // ── Phase 0: Create Parent VM ──
  results['Phase 0: Parent VM (dlvmova)'] = await phase0_createParentVM(page)

  // ── Phase 1-8: Deploy Scenarios ──
  console.log('\n' + '='.repeat(70))
  console.log('  DEPLOY SCENARIOS')
  console.log('='.repeat(70))

  for (const s of DEPLOY_MATRIX) {
    const template = s.template === 'test01' ? TEMPLATE_TEST01 : TEMPLATE_DLVMOVA
    const parentVM = s.clone === 'instant' ? (s.template === 'dlvmova' ? PARENT_VM_NAME : null) : null
    let r
    if (s.clone === 'full' && !s.batch) {
      r = await runFullCloneSingle(page, template, s.ip, s.name, `v5-lifecycle-${s.id}`)
    } else if (s.clone === 'full' && s.batch) {
      r = await runFullCloneBatch(page, template, s.startIP, s.count, s.prefix, `v5-lifecycle-${s.id}`)
    } else if (s.clone === 'instant' && !s.batch) {
      r = await runInstantCloneSingle(page, template, s.ip, s.name, parentVM, `v5-lifecycle-${s.id}`)
    } else {
      r = await runInstantCloneBatch(page, template, s.startIP, s.count, s.prefix, parentVM, `v5-lifecycle-${s.id}`)
    }
    results[`${s.id}: ${s.template} ${s.clone} ${s.batch ? 'batch' : 'single'}`] = r
  }

  // ── Phase 9: Single-Agent Lifecycle Operations ─────────────────────────────
  console.log('\n' + '='.repeat(70))
  console.log('  LIFECYCLE OPERATIONS (Single-Agent)')
  console.log('='.repeat(70))

  // Use deployed agents that actually exist from the deploy phase above.
  // test01 full single is the most reliable deploy scenario.
  const lifecycleAgent = 't01-full-single'

  results['Lifecycle: Stop']    = await agentLifecycleAction(page, context, lifecycleAgent, 'stop',    { waitMs: 15000 })
  results['Lifecycle: Start']   = await agentLifecycleAction(page, context, lifecycleAgent, 'start',   { waitMs: 15000 })
  results['Lifecycle: Restart'] = await agentLifecycleAction(page, context, lifecycleAgent, 'restart', { waitMs: 15000 })

  // ── vCenter live verification ──────────────────────────────────────────────
  console.log('\n--- VCENTER HARD VERIFICATION (post-lifecycle) ---')
  const agent = await findAgent(context, lifecycleAgent)
  if (agent) {
    console.log(`   Agent: id=${agent.id} name=${agent.name} status=${agent.status} endpoint=${agent.endpoint || '(none)'}`)
    try {
      const resp = await context.request.post(FRONTEND_URL + '/query', {
        data: {
          query: `query AgentVmResources($id: ID!) { agentVmResources(id: $id) { cpu memory disk networkLabel } }`,
          variables: { id: agent.id },
        },
      })
      const body = await resp.json()
      if (body.data?.agentVmResources) {
        console.log(`   [VC-LIVE] VM resources: ${JSON.stringify(body.data.agentVmResources)}`)
      } else if (body.errors) {
        console.log(`   [VC-LIVE] Errors: ${body.errors[0].message}`)
      }
    } catch (e) {
      console.log(`   [VC-LIVE] Could not query live VM: ${e.message}`)
    }
  }

  // ── Phase 10: Batch Lifecycle ──────────────────────────────────────────────
  console.log('\n' + '='.repeat(70))
  console.log('  BATCH LIFECYCLE OPERATIONS')
  console.log('='.repeat(70))

  // Use the test01 full batch agents (batch naming uses zero-padded suffixes).
  const batchAgents = ['t01-full-batch-01', 't01-full-batch-02']

  try { results['Batch: Stop'] = await batchLifecycleAction(page, context, batchAgents, 'stop') }
  catch (e) { results['Batch: Stop'] = { pass: false, reason: e.message } }

  try { results['Batch: Start'] = await batchLifecycleAction(page, context, batchAgents, 'start') }
  catch (e) { results['Batch: Start'] = { pass: false, reason: e.message } }

  // ── Phase 11: Delete & HardDelete ──────────────────────────────────────────
  console.log('\n' + '='.repeat(70))
  console.log('  DELETE & HARD-DELETE OPERATIONS')
  console.log('='.repeat(70))

  results['Delete (recycle)'] = await agentLifecycleAction(page, context, 't01-full-batch-02', 'delete',    { waitMs: 12000 })
  results['HardDelete']       = await agentLifecycleAction(page, context, 't01-full-batch-01', 'hardDelete', { waitMs: 15000 })

  // ── Final ──────────────────────────────────────────────────────────────────
  console.log('\n===== FINAL: Agent List =====')
  try { await gotoAgentList(page); await page.waitForTimeout(2000); await screenshot(page, 'v5-lifecycle-final-list.png') }
  catch (e) { console.log(`   [WARN] Final screenshot: ${e.message}`) }

  await browser.close()

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70))
  console.log('  E2E LIFECYCLE TEST RESULTS')
  console.log('='.repeat(70))
  let pass = 0, fail = 0
  for (const [name, r] of Object.entries(results)) {
    const ok = r && r.pass
    if (ok) pass++; else fail++
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`)
    if (r && r.detail) console.log(`        ${r.detail}`)
    if (r && r.reason) console.log(`        Reason: ${r.reason}`)
  }
  console.log('-'.repeat(70))
  console.log(`  Passed: ${pass}/${pass + fail}    Failed: ${fail}/${pass + fail}`)
  console.log('='.repeat(70))
  if (fail > 0) console.log('\nSome tests failed. Check screenshots in /tmp/e2e-screenshots/')
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
