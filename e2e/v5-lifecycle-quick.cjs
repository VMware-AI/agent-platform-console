/**
 * Quick lifecycle-only test on existing agents (no deploys).
 * Uses agents created by v5-lifecycle-test.cjs deploy phases.
 *
 * Run: node e2e/v5-lifecycle-quick.cjs
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const FRONTEND_URL = 'http://192.168.15.128:5173'
const SCREENSHOT_DIR = '/tmp/e2e-screenshots'
const ADMIN_EMAIL = 'admin@platform.local'
const ADMIN_PASSWORD = 'ChangeMe123!'

// Test targets — these agents must exist and be running from the deploy phase
const SINGLE_AGENT = 't01-full-single'
const BATCH_AGENTS = ['t01-full-batch-01', 't01-full-batch-02']
const DELETE_AGENT = 't01-full-batch-02'
const HARDDELETE_AGENT = 't01-full-batch-01'

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: false })
  console.log(`   [screenshot] ${name}`)
}

async function loginViaAPI(context) {
  const resp = await context.request.post(FRONTEND_URL + '/query', {
    data: {
      query: `mutation Login($input: LoginInput!) { login(input: $input) { token user { id username role } } }`,
      variables: { input: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, remember: true } },
    },
  })
  const body = await resp.json()
  if (body.errors) throw new Error('Login: ' + body.errors[0].message)
  console.log('   Authenticated')
}

async function backendListAgents(context, nameFilter) {
  const resp = await context.request.post(FRONTEND_URL + '/query', {
    data: { query: `query Agents($filter: AgentFilter){ agents(filter:$filter, pagination:{page:1,pageSize:50}) { nodes { id name status endpoint } } }`, variables: { filter: nameFilter ? { nameKeyword: nameFilter } : null } },
  })
  const body = await resp.json()
  if (body.errors) { console.log('API ERR:', body.errors[0].message); return [] }
  return body.data?.agents?.nodes || []
}

async function findAgent(context, nameSubstr) {
  const agents = await backendListAgents(context, nameSubstr)
  return agents.find(a => a.name.includes(nameSubstr)) || null
}

async function verifyVMState(context, nameSubstr, expectRunning, expectExists) {
  const agent = await findAgent(context, nameSubstr)
  if (expectExists && !agent) { console.log(`   [VC] X "${nameSubstr}" not found`); return false }
  if (!expectExists && !agent) { console.log(`   [VC] OK "${nameSubstr}" gone (hard-deleted)`); return true }
  if (!expectExists && agent) { console.log(`   [VC] X "${agent.name}" still exists`); return false }
  const exp = expectRunning ? 'running' : 'stopped'
  const ok = agent.status === exp
  console.log(`   [VC] "${agent.name}" status=${agent.status} expect=${exp} ${ok ? 'OK' : 'X'}`)
  return ok
}

async function openRowActions(page, agentName) {
  const row = page.locator('cds-grid-row').filter({ hasText: agentName }).first()
  if (await row.count() === 0) { console.log(`   [WARN] Row "${agentName}" not found`); return false }
  const moreBtn = row.locator('cds-button').filter({ hasText: '更多' }).first()
  if (await moreBtn.count() === 0) {
    const btns = await row.locator('cds-button-action, button').all()
    if (btns.length > 0) { await btns[btns.length - 1].click({ force: true }); await page.waitForTimeout(600); return true }
    return false
  }
  await moreBtn.click({ force: true }); await page.waitForTimeout(600); return true
}

async function clickMenuOption(page, label) {
  const opt = page.locator('button.menu-opt').filter({ hasText: label }).first()
  if (await opt.count() === 0) {
    console.log(`   [WARN] Menu "${label}" not found`)
    const all = page.locator('button.menu-opt'); const c = await all.count()
    console.log(`   [DEBUG] ${c} menu opts:`)
    for (let i = 0; i < c; i++) console.log(`     ${await all.nth(i).textContent()}`)
    return false
  }
  await opt.click({ force: true }); await page.waitForTimeout(800); return true
}

async function confirmDialog(page) {
  const d = page.locator('.confirm-backdrop')
  try { await d.first().waitFor({ state: 'visible', timeout: 5000 }) } catch { return }
  await page.waitForTimeout(400)
  await d.locator('cds-button[action="solid"]').last().click({ force: true })
  console.log('   Confirm accepted'); await page.waitForTimeout(2000)
}

async function typeToConfirmDialog(page, text) {
  const d = page.locator('.confirm-backdrop')
  try { await d.first().waitFor({ state: 'visible', timeout: 5000 }) } catch { return false }
  await page.waitForTimeout(400)
  await d.locator('input.app-input').fill(text)
  await page.waitForTimeout(300)
  await d.locator('cds-button[action="solid"]').last().click({ force: true })
  console.log(`   Typed "${text}" accepted`); await page.waitForTimeout(2000); return true
}

async function doAction(page, context, agentName, action, waitMs = 10000) {
  const labels = { start: '启动', stop: '停止', restart: '重启', delete: '删除', hardDelete: '彻底删除' }
  const label = labels[action] || action
  console.log(`\n--- ${action} on "${agentName}" ---`)

  await page.goto(FRONTEND_URL + '/agents/list', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)

  if (!(await openRowActions(page, agentName))) return { pass: false, reason: `Row not found` }
  await screenshot(page, `v5-quick-${action}-menu.png`)
  if (!(await clickMenuOption(page, label))) return { pass: false, reason: `Menu "${label}" not found` }

  if (action === 'hardDelete') {
    if (!(await typeToConfirmDialog(page, agentName))) return { pass: false, reason: 'Type-to-confirm failed' }
  } else {
    await confirmDialog(page)
  }

  await page.waitForTimeout(waitMs)
  await screenshot(page, `v5-quick-${action}-result.png`)

  const vcLabel = { start: 'PowerOn', stop: 'PowerOff', restart: 'Reboot', delete: 'Destroy', hardDelete: 'HardDelete' }
  let vcOk = true
  if (action === 'start') vcOk = await verifyVMState(context, agentName, true, true)
  else if (action === 'stop') vcOk = await verifyVMState(context, agentName, false, true)
  else if (action === 'restart') vcOk = await verifyVMState(context, agentName, true, true)
  else if (action === 'delete') vcOk = (await findAgent(context, agentName))?.status === 'stopped'
  else if (action === 'hardDelete') { await page.waitForTimeout(3000); vcOk = await verifyVMState(context, agentName, false, false) }

  console.log(`   [RESULT] ${vcOk ? 'PASS' : 'FAIL'} ${vcLabel[action]} on "${agentName}"`)
  return { pass: vcOk, detail: `${vcLabel[action]}: ${vcOk ? 'OK' : 'FAIL'}` }
}

async function doBatchAction(page, context, agentNames, action, waitMs = 15000) {
  const labels = { start: '批量启动', stop: '批量停止' }
  const label = labels[action] || action
  console.log(`\n--- Batch ${action} on [${agentNames}] ---`)

  await page.goto(FRONTEND_URL + '/agents/list', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)

  const cbs = page.locator('cds-grid-row input[type="checkbox"]')
  for (let i = 0; i < agentNames.length; i++) await cbs.nth(i + 1).check()
  await page.waitForTimeout(500)

  await page.locator('span.dd-trigger').filter({ has: page.locator('cds-button').filter({ hasText: '批量操作' }).first() }).first().click({ force: true })
  await page.waitForTimeout(800)
  await page.locator('button.menu-opt').filter({ hasText: label }).first().click({ force: true })
  await page.waitForTimeout(1500)

  await confirmDialog(page)
  await page.waitForTimeout(waitMs)

  let allOk = true
  for (const name of agentNames) {
    if (action === 'start') allOk = (await verifyVMState(context, name, true, true)) && allOk
    else if (action === 'stop') allOk = (await verifyVMState(context, name, false, true)) && allOk
  }
  return { pass: allOk, detail: `Batch ${label}: ${allOk ? 'OK' : 'FAIL'}` }
}

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'zh-CN' })

  console.log('=== QUICK LIFECYCLE TEST ===')
  await loginViaAPI(ctx)

  const page = await ctx.newPage()
  page.on('console', m => { if (m.type() === 'error') console.log(`   [console] ${m.text()}`) })

  const results = {}

  // 1. Verify initial state
  console.log('\n--- INITIAL STATE ---')
  const a = await findAgent(ctx, SINGLE_AGENT)
  console.log(`   ${SINGLE_AGENT}: ${a ? `status=${a.status}` : 'NOT FOUND'}`)

  // 2. Stop
  results['Stop'] = await doAction(page, ctx, SINGLE_AGENT, 'stop', 15000)

  // 3. Start
  results['Start'] = await doAction(page, ctx, SINGLE_AGENT, 'start', 15000)

  // 4. Restart
  results['Restart'] = await doAction(page, ctx, SINGLE_AGENT, 'restart', 10000)

  // 5. Batch Stop
  results['Batch Stop'] = await doBatchAction(page, ctx, BATCH_AGENTS, 'stop', 15000)

  // 6. Batch Start
  results['Batch Start'] = await doBatchAction(page, ctx, BATCH_AGENTS, 'start', 15000)

  // 7. Delete (recycle)
  results['Delete'] = await doAction(page, ctx, DELETE_AGENT, 'delete', 12000)

  // 8. Hard Delete
  results['HardDelete'] = await doAction(page, ctx, HARDDELETE_AGENT, 'hardDelete', 15000)

  await page.goto(FRONTEND_URL + '/agents/list', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)
  await screenshot(page, 'v5-quick-final.png')
  await browser.close()

  console.log('\n' + '='.repeat(50))
  console.log('  RESULTS')
  console.log('='.repeat(50))
  let pass = 0, fail = 0
  for (const [name, r] of Object.entries(results)) {
    if (r.pass) pass++; else fail++
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${name}: ${r.detail || r.reason || ''}`)
  }
  console.log(`  Passed: ${pass}/${pass + fail}  Failed: ${fail}/${pass + fail}`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
