/**
 * Full E2E test via API — deploys + lifecycle + vCenter verification.
 * Uses native Node.js fetch (Node 24+). No Playwright.
 * Run: node e2e/api-test.cjs
 */
let AUTH = ''

async function gql(q, v) {
  const headers = { 'Content-Type': 'application/json', 'Origin': 'http://127.0.0.1:8080' }
  if (AUTH) headers['Authorization'] = 'Bearer ' + AUTH
  const r = await fetch('http://127.0.0.1:8080/query', {
    method: 'POST', headers,
    body: JSON.stringify({ query: q, variables: v || {} })
  })
  const b = await r.json()
  if (b.errors) { console.log('GQL ERR:', b.errors[0].message); return null }
  return b.data
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log('=== FULL E2E API TEST ===\n')

  const login = await gql('mutation Login($i: LoginInput!) { login(input: $i) { token } }', {
    i: { email: 'admin@platform.local', password: 'ChangeMe123!', remember: true } })
  if (!login) { console.log('LOGIN FAILED'); process.exit(1) }
  AUTH = login.login.token
  console.log('Logged in, token prefix:', AUTH.substring(0, 14))

  console.log('\n--- CLEANUP ---')
  const all = await gql('query { agents(pagination:{page:1,pageSize:50}) { nodes { id name status endpoint } } }')
  const orphans = (all?.agents?.nodes || []).filter(a => a.status === 'provisioning' && !a.endpoint)
  console.log('Orphans:', orphans.length)
  for (const o of orphans) {
    console.log('  Deleting:', o.name)
    await gql('mutation($i: HardDeleteAgentInput!) { hardDeleteAgent(input: $i) }', { i: { agentId: o.id, confirm: true } })
  }

  const T = {
    test01: { fid: '262fdc2c-9fd7-4e5c-8e51-74d12cd46ac8', vid: '07223aeb-23d1-4370-a677-bf866adefd94' },
    dlvmova: { fid: '7d266ac7-6ea4-48b8-b652-d17c94194dad', vid: '095cb5e7-f6c0-44d0-ab1b-4987ead6b69a' }
  }
  const POOL_ID = 'e7717008-54f8-4a81-8461-53ae76e6adee'
  const POOL_PATH = '/Datacenter/host/Cluster/Resources'

  async function deploy(tpl, name, ip) {
    const t = T[tpl]
    const r = await gql(`mutation DeployAgent($i: DeployAgentInput!) {
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
          { key: 'guestinfo.ip_mode', value: 'static' }
        ]
      } })
    return r?.deployAgent?.agent || null
  }

  async function verify(name, expect) {
    const a = await gql('query($f: AgentFilter) { agents(filter: $f) { nodes { name status } } }', { f: { nameKeyword: name } })
    const ag = a?.agents?.nodes?.find(x => x.name.includes(name))
    const s = ag?.status || 'not_found'
    const ok = (expect === 'gone') ? s === 'not_found' : s === expect
    console.log('  [VC]', name, 'status=' + s, 'expect=' + expect, ok ? 'OK' : 'X')
    return ok
  }

  const R = {}

  // Phase 0: Parent VM
  console.log('\n=== PHASE 0: Parent VM ===')
  const p0 = await deploy('dlvmova', 'ic-p-dlvmova-v5', '172.16.85.151')
  if (p0) { console.log('  Agent:', p0.name, p0.status); await wait(35000); R['P0: Parent VM'] = { pass: await verify('ic-p-dlvmova-v5', 'running'), detail: 'dlvmova parent' } }
  else R['P0: Parent VM'] = { pass: false, reason: 'deploy failed' }

  // test01 deploys
  console.log('\n=== test01 Deploys ===')
  await deploy('test01', 't01-full-single', '172.16.85.152'); await wait(20000)
  R['S1: test01 full single'] = { pass: await verify('t01-full-single', 'running'), detail: 't01-full-single' }
  for (let i = 1; i <= 2; i++) {
    const ips = '172.16.85.153'.split('.'); ips[3] = String(parseInt(ips[3]) + i - 1)
    await deploy('test01', 't01-full-batch-0' + i, ips.join('.')); await wait(15000)
  }
  let ok = true; for (let i = 1; i <= 2; i++) ok = (await verify('t01-full-batch-0' + i, 'running')) && ok
  R['S2: test01 full batch'] = { pass: ok, detail: 't01-full-batch x2' }

  // dlvmova deploys
  console.log('\n=== dlvmova Deploys ===')
  await deploy('dlvmova', 'dv-full-single', '172.16.85.158'); await wait(20000)
  R['S5: dlvmova full single'] = { pass: await verify('dv-full-single', 'running'), detail: 'dv-full-single' }
  for (let i = 1; i <= 2; i++) {
    const ips = '172.16.85.159'.split('.'); ips[3] = String(parseInt(ips[3]) + i - 1)
    await deploy('dlvmova', 'dv-full-batch-0' + i, ips.join('.')); await wait(15000)
  }
  ok = true; for (let i = 1; i <= 2; i++) ok = (await verify('dv-full-batch-0' + i, 'running')) && ok
  R['S6: dlvmova full batch'] = { pass: ok, detail: 'dv-full-batch x2' }

  // LIFECYCLE
  console.log('\n=== LIFECYCLE ===')
  const agent = (await gql('query($f: AgentFilter) { agents(filter: $f) { nodes { id name } } }', { f: { nameKeyword: 't01-full-single' } }))?.agents?.nodes?.[0]
  if (agent) {
    await gql('mutation($id: ID!, $s: AgentStatus!) { setAgentStatus(id: $id, status: $s) { id status } }', { id: agent.id, s: 'stopped' })
    await wait(12000); R['Stop'] = { pass: await verify('t01-full-single', 'stopped'), detail: 'PowerOff' }
    await gql('mutation($id: ID!, $s: AgentStatus!) { setAgentStatus(id: $id, status: $s) { id status } }', { id: agent.id, s: 'running' })
    await wait(12000); R['Start'] = { pass: await verify('t01-full-single', 'running'), detail: 'PowerOn' }
    await gql('mutation($id: ID!) { restartAgent(id: $id) { id status } }', { id: agent.id })
    await wait(10000); R['Restart'] = { pass: await verify('t01-full-single', 'running'), detail: 'RebootGuest' }
    const vc = await gql('query($id: ID!) { agentVmResources(id: $id) { cpu memory disk networkLabel } }', { id: agent.id })
    if (vc?.agentVmResources) console.log('  VM:', JSON.stringify(vc.agentVmResources))
  }

  // Batch lifecycle
  console.log('\n=== BATCH LIFECYCLE ===')
  const batch = (await gql('query($f: AgentFilter) { agents(filter: $f) { nodes { id name } } }', { f: { nameKeyword: 'dv-full-batch' } }))?.agents?.nodes || []
  if (batch.length >= 2) {
    for (const a of batch.slice(0, 2)) await gql('mutation($id: ID!, $s: AgentStatus!) { setAgentStatus(id: $id, status: $s) { id status } }', { id: a.id, s: 'stopped' })
    await wait(12000); ok = true; for (const a of batch.slice(0, 2)) ok = (await verify(a.name, 'stopped')) && ok
    R['Batch Stop'] = { pass: ok, detail: 'x2 PowerOff' }
    for (const a of batch.slice(0, 2)) await gql('mutation($id: ID!, $s: AgentStatus!) { setAgentStatus(id: $id, status: $s) { id status } }', { id: a.id, s: 'running' })
    await wait(12000); ok = true; for (const a of batch.slice(0, 2)) ok = (await verify(a.name, 'running')) && ok
    R['Batch Start'] = { pass: ok, detail: 'x2 PowerOn' }
  }

  // Delete + HardDelete
  console.log('\n=== DELETE & HARDDELETE ===')
  const tb = (await gql('query($f: AgentFilter) { agents(filter: $f) { nodes { id name } } }', { f: { nameKeyword: 't01-full-batch' } }))?.agents?.nodes || []
  if (tb.length >= 2) {
    await gql('mutation($i: RecycleAgentInput!) { recycleAgent(input: $i) { id status } }', { i: { agentId: tb[1].id, confirm: true } })
    await wait(10000); R['Delete'] = { pass: await verify(tb[1].name, 'stopped'), detail: 'RecycleAgent' }
    await gql('mutation($i: HardDeleteAgentInput!) { hardDeleteAgent(input: $i) }', { i: { agentId: tb[0].id, confirm: true } })
    await wait(5000); R['HardDelete'] = { pass: await verify(tb[0].name, 'gone'), detail: 'HardDeleteAgent' }
  }

  // Results
  console.log('\n' + '='.repeat(55))
  console.log('  RESULTS')
  console.log('='.repeat(55))
  let pass = 0, fail = 0
  for (const [k, v] of Object.entries(R)) {
    if (v.pass) pass++; else fail++
    console.log('  ' + (v.pass ? 'PASS' : 'FAIL') + '  ' + k + ': ' + (v.detail || v.reason || ''))
  }
  console.log('-'.repeat(55))
  console.log('  Passed: ' + pass + '/' + (pass + fail) + '  Failed: ' + fail + '/' + (pass + fail))
  process.exit(fail > 0 ? 1 : 0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })
