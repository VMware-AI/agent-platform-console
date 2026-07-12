/**
 * Fixed lifecycle test using correct Carbon Design System selectors.
 * The agent list uses <cds-grid-row> web components.
 * Actions are behind <cds-button-action aria-label="更多">.
 *
 * Tests: stop, start, restart, delete, hardDelete with backend verification.
 * Run: node e2e/v5-lifecycle-fixed.cjs
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const FRONTEND_URL = 'http://192.168.15.128:5173'
const SCREENSHOT_DIR = '/tmp/e2e-screenshots'
const ADMIN_EMAIL = 'admin@platform.local'
const ADMIN_PASSWORD = 'ChangeMe123!'

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: false })
  console.log(`   [ss] ${name}`)
}

async function loginViaAPI(context) {
  await context.request.post(FRONTEND_URL + '/query', {
    data: { query: `mutation Login($input: LoginInput!) { login(input: $input) { token } }`,
      variables: { input: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, remember: true } } }
  })
  console.log('   Authenticated')
}

// ── API verification ──────────────────────────────────────────────────────

async function backendListAgents(context, nameFilter) {
  const resp = await context.request.post(FRONTEND_URL + '/query', {
    data: { query: `query Agents($filter: AgentFilter){ agents(filter:$filter, pagination:{page:1,pageSize:50}) { nodes { id name status endpoint } } }`,
      variables: { filter: nameFilter ? { nameKeyword: nameFilter } : null } }
  })
  const body = await resp.json()
  if (body.errors) { console.log('   API ERR:', body.errors[0].message); return [] }
  return body.data?.agents?.nodes || []
}

async function findAgent(context, nameSubstr) {
  return (await backendListAgents(context, nameSubstr)).find(a => a.name.includes(nameSubstr)) || null
}

async function verifyVMState(context, nameSubstr, expectRunning, expectExists) {
  const agent = await findAgent(context, nameSubstr)
  if (expectExists && !agent) { console.log(`   [VC] X "${nameSubstr}" not found`); return false }
  if (!expectExists && !agent) { console.log(`   [VC] OK "${nameSubstr}" hard-deleted`); return true }
  if (!expectExists && agent) { console.log(`   [VC] X "${agent.name}" still exists`); return false }
  const exp = expectRunning ? 'running' : 'stopped'
  const ok = agent.status === exp
  console.log(`   [VC] "${agent.name}" status=${agent.status} expect=${exp} ${ok ? 'OK' : 'X'}`)
  return ok
}

// ── Row action helpers (Carbon Design System web components) ──────────────

async function findRowIndex(page, agentName) {
  return page.evaluate((name) => {
    const rows = document.querySelectorAll('cds-grid-row')
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i].textContent || '').includes(name)) return i
    }
    return -1
  }, agentName)
}

async function clickMoreInRow(page, rowIndex) {
  return page.evaluate((idx) => {
    const rows = document.querySelectorAll('cds-grid-row')
    if (idx >= rows.length) return false
    const btns = rows[idx].querySelectorAll('cds-button-action')
    for (const btn of btns) {
      if (btn.getAttribute('aria-label') === '更多') {
        const inner = btn.shadowRoot ? btn.shadowRoot.querySelector('button') : btn
        if (inner) inner.click()
        return true
      }
    }
    return false
  }, rowIndex)
}

async function clickMenuOption(page, label) {
  const opt = page.locator('button.menu-opt').filter({ hasText: label }).first()
  if (await opt.count() === 0) {
    console.log(`   [WARN] Menu "${label}" not found`)
    const all = page.locator('button.menu-opt'); const c = await all.count()
    console.log(`   [DEBUG] ${c} menu options:`)
    for (let i = 0; i < c; i++) console.log(`     ${await all.nth(i).textContent()}`)
    return false
  }
  await opt.click({ force: true }); await wait(600); return true
}

async function confirmDialog(page) {
  const d = page.locator('.confirm-backdrop')
  try { await d.first().waitFor({ state: 'visible', timeout: 5000 }) } catch { return }
  await wait(400)
  await d.locator('cds-button[action="solid"]').last().click({ force: true })
  console.log('   Confirm OK'); await wait(2000)
}

async function typeToConfirmDialog(page, text) {
  const d = page.locator('.confirm-backdrop')
  try { await d.first().waitFor({ state: 'visible', timeout: 5000 }) } catch { return false }
  await wait(400)
  await d.locator('input.app-input').fill(text)
  await wait(300)
  await d.locator('cds-button[action="solid"]').last().click({ force: true })
  console.log(`   Typed "${text}" → OK`); await wait(2000); return true
}

async function navigateToList(page) {
  await page.goto(FRONTEND_URL + '/agents/list', { waitUntil: 'networkidle', timeout: 30000 })
  await wait(4000)
}

// ── Main action flow ──────────────────────────────────────────────────────

async function doAction(page, context, agentName, action, waitMs = 10000) {
  const LABELS = { start: '启动', stop: '停止', restart: '重启', delete: '删除', hardDelete: '彻底删除' }
  const label = LABELS[action] || action
  console.log(`\n--- ${action.toUpperCase()} "${agentName}" ---`)

  await navigateToList(page)
  const rowIdx = await findRowIndex(page, agentName)
  if (rowIdx < 0) return { pass: false, reason: 'Row not found' }
  console.log(`   Row idx=${rowIdx}`)

  if (!(await clickMoreInRow(page, rowIdx))) return { pass: false, reason: 'More btn not found' }
  await wait(600)
  await screenshot(page, `v5-fixed-${action}-menu.png`)

  if (!(await clickMenuOption(page, label))) return { pass: false, reason: `Menu "${label}" not found` }

  if (action === 'hardDelete') {
    if (!(await typeToConfirmDialog(page, agentName))) return { pass: false, reason: 'Type-to-confirm failed' }
  } else {
    await confirmDialog(page)
  }

  await wait(waitMs)
  await screenshot(page, `v5-fixed-${action}-result.png`)

  let vcOk = true
  if (action === 'start') vcOk = await verifyVMState(context, agentName, true, true)
  else if (action === 'stop') vcOk = await verifyVMState(context, agentName, false, true)
  else if (action === 'restart') vcOk = await verifyVMState(context, agentName, true, true)
  else if (action === 'delete') vcOk = ((await findAgent(context, agentName))?.status === 'stopped')
  else if (action === 'hardDelete') { await wait(3000); vcOk = await verifyVMState(context, agentName, false, false) }

  console.log(`   [RESULT] ${vcOk ? 'PASS' : 'FAIL'}`)
  return { pass: vcOk, detail: `${action}: ${vcOk ? 'OK' : 'FAIL'}` }
}

// ── main ──────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'zh-CN' })

  console.log('=== LIFECYCLE TEST (Fixed Selectors) ===')
  await loginViaAPI(ctx)

  const page = await ctx.newPage()
  page.on('console', m => { if (m.type() === 'error') console.log(`   [console] ${m.text()}`) })

  // Check initial state
  console.log('\n--- INITIAL ---')
  const a = await findAgent(ctx, 't01-full-single')
  console.log(`   t01-full-single: ${a ? 'status=' + a.status : 'NOT FOUND'}`)
  const ba = await backendListAgents(ctx, 't01-full-batch')
  console.log(`   Batch agents: ${ba.map(x => x.name + '=' + x.status).join(', ') || 'none'}`)

  const results = {}

  // Determine which agents exist and set targets
  const batchNames = ba.map(a => a.name)
  const hasBatch = batchNames.length >= 2
  const singleAgent = a ? 't01-full-single' : (batchNames[0] || null)
  if (!singleAgent) { console.log('No agents available for testing!'); process.exit(1) }

  // 1. Stop
  results['Stop'] = await doAction(page, ctx, singleAgent, 'stop', 15000)

  // 2. Start
  results['Start'] = await doAction(page, ctx, singleAgent, 'start', 15000)

  // 3. Restart
  results['Restart'] = await doAction(page, ctx, singleAgent, 'restart', 10000)

  // 4. Delete and HardDelete on batch agents if available
  if (hasBatch) {
    results['Delete'] = await doAction(page, ctx, batchNames[1], 'delete', 12000)
    results['HardDelete'] = await doAction(page, ctx, batchNames[0], 'hardDelete', 15000)
  } else {
    console.log('   Skipping delete/hardDelete — need 2 batch agents')
  }

  await navigateToList(page)
  await screenshot(page, 'v5-fixed-final.png')
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
