/**
 * Direct API lifecycle test — calls GraphQL mutations directly.
 * Bypasses Carbon Design System web component menu issues.
 * Verifies each operation against backend DB.
 *
 * Run: node e2e/v5-lifecycle-direct.cjs
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

async function backendListAgents(context, nameFilter) {
  const resp = await context.request.post(FRONTEND_URL + '/query', {
    data: { query: `query Agents($filter: AgentFilter){ agents(filter:$filter, pagination:{page:1,pageSize:50}) { nodes { id name status endpoint } } }`,
      variables: { filter: nameFilter ? { nameKeyword: nameFilter } : null } }
  })
  const body = await resp.json()
  if (body.errors) { console.log('API ERR:', body.errors[0].message); return [] }
  return body.data?.agents?.nodes || []
}

async function findAgent(context, nameSubstr) {
  return (await backendListAgents(context, nameSubstr)).find(a => a.name.includes(nameSubstr)) || null
}

async function verifyStatus(context, nameSubstr, expectedStatus) {
  const agent = await findAgent(context, nameSubstr)
  if (!agent) { console.log(`   [VC] "${nameSubstr}" NOT FOUND`); return expectedStatus === 'gone' }
  const ok = agent.status === expectedStatus
  console.log(`   [VC] "${agent.name}" status=${agent.status} expect=${expectedStatus} ${ok ? 'OK' : 'X'}`)
  return ok
}

// ── Direct GraphQL mutations ──────────────────────────────────────────────

async function gqlMutate(context, query, variables) {
  const resp = await context.request.post(FRONTEND_URL + '/query', { data: { query, variables } })
  const body = await resp.json()
  if (body.errors) { console.log(`   [GQL ERR] ${body.errors[0].message}`); return null }
  return body.data
}

async function directSetStatus(context, agentId, status) {
  return gqlMutate(context,
    `mutation SetAgentStatus($id: ID!, $status: AgentStatus!) { setAgentStatus(id: $id, status: $status) { id status updatedAt } }`,
    { id: agentId, status })
}

async function directRestart(context, agentId) {
  return gqlMutate(context,
    `mutation RestartAgent($id: ID!) { restartAgent(id: $id) { id status updatedAt } }`,
    { id: agentId })
}

async function directRecycle(context, agentId) {
  return gqlMutate(context,
    `mutation RecycleAgent($input: RecycleAgentInput!) { recycleAgent(input: $input) { id status } }`,
    { input: { agentId, confirm: true } })
}

async function directHardDelete(context, agentId) {
  return gqlMutate(context,
    `mutation HardDeleteAgent($input: HardDeleteAgentInput!) { hardDeleteAgent(input: $input) }`,
    { input: { agentId, confirm: true } })
}

// ── main ──────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'zh-CN' })

  console.log('=== LIFECYCLE TEST (Direct API) ===')
  await loginViaAPI(ctx)

  const page = await ctx.newPage()
  page.on('console', m => { if (m.type() === 'error') console.log(`   [console] ${m.text()}`) })

  console.log('\n--- FINDING AGENTS ---')
  const allAgents = await backendListAgents(ctx, '')
  const running = allAgents.filter(a => a.status === 'running')
  const stopped = allAgents.filter(a => a.status === 'stopped')
  console.log(`   Total: ${allAgents.length}, Running: ${running.length}, Stopped: ${stopped.length}`)

  const single = running.find(a => a.name.includes('t01-full-single') || a.name.includes('test-v5'))
    || running.find(a => a.name.includes('full-single') || a.name.includes('batch'))
  const recycleTarget = stopped[0] || (running.length > 1 ? running[running.length - 1] : null)
  const hardDeleteTarget = stopped[1] || (running.length > 1 ? running[0] : null)

  if (!single) { console.log('No running agent for testing!'); await browser.close(); process.exit(1) }
  console.log(`   Single: ${single.name} (${single.status})`)
  if (recycleTarget) console.log(`   Delete: ${recycleTarget.name} (${recycleTarget.status})`)
  if (hardDeleteTarget) console.log(`   HardDel: ${hardDeleteTarget.name} (${hardDeleteTarget.status})`)

  const results = {}

  // Screenshot initial state
  await page.goto(FRONTEND_URL + '/agents/list', { waitUntil: 'networkidle', timeout: 30000 })
  await wait(4000)
  await screenshot(page, 'v5-direct-initial.png')

  // 1. STOP
  console.log(`\n--- STOP "${single.name}" via API ---`)
  const stopRes = await directSetStatus(ctx, single.id, 'stopped')
  console.log(`   Result: ${stopRes ? JSON.stringify(stopRes.setAgentStatus) : 'ERROR'}`)
  await wait(8000)
  results['Stop'] = { pass: await verifyStatus(ctx, single.name, 'stopped'), detail: 'API PowerOff' }

  // 2. START
  console.log(`\n--- START "${single.name}" via API ---`)
  const startRes = await directSetStatus(ctx, single.id, 'running')
  console.log(`   Result: ${startRes ? JSON.stringify(startRes.setAgentStatus) : 'ERROR'}`)
  await wait(8000)
  results['Start'] = { pass: await verifyStatus(ctx, single.name, 'running'), detail: 'API PowerOn' }

  // 3. RESTART
  console.log(`\n--- RESTART "${single.name}" via API ---`)
  const restartRes = await directRestart(ctx, single.id)
  console.log(`   Result: ${restartRes ? JSON.stringify(restartRes.restartAgent) : 'ERROR'}`)
  await wait(8000)
  results['Restart'] = { pass: await verifyStatus(ctx, single.name, 'running'), detail: 'API RebootGuest' }

  // 4. DELETE (recycle)
  if (recycleTarget) {
    console.log(`\n--- DELETE "${recycleTarget.name}" via API ---`)
    const delRes = await directRecycle(ctx, recycleTarget.id)
    console.log(`   Result: ${delRes ? JSON.stringify(delRes.recycleAgent) : 'ERROR'}`)
    await wait(8000)
    results['Delete'] = { pass: await verifyStatus(ctx, recycleTarget.name, 'stopped'), detail: 'API recycle' }
  }

  // 5. HARDDELETE
  if (hardDeleteTarget) {
    console.log(`\n--- HARDDELETE "${hardDeleteTarget.name}" via API ---`)
    const hdRes = await directHardDelete(ctx, hardDeleteTarget.id)
    console.log(`   Result: ${hdRes ? JSON.stringify(hdRes.hardDeleteAgent) : 'ERROR'}`)
    await wait(5000)
    results['HardDelete'] = { pass: await verifyStatus(ctx, hardDeleteTarget.name, 'gone'), detail: 'API hardDelete' }
  }

  await page.goto(FRONTEND_URL + '/agents/list', { waitUntil: 'networkidle', timeout: 30000 })
  await wait(3000)
  await screenshot(page, 'v5-direct-final.png')
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
