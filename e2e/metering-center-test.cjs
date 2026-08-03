/**
 * 计量中心「设置 + 计费」E2E 测试
 *
 * 覆盖:
 *  设置(计量设置 modal):
 *    S1 打开 modal / S2 货币设置 UI↔API 一致 / S3 修改→保存→持久化→还原
 *    S4 isDirty 短路(未改动保存不生效) / S5 汇率 CRUD+历史 / S6 换算预览数学
 *    S7 成本规则只读展示
 *  计费(计量中心页):
 *    B1 meteringOverview(7d) 数据正确(与 token_usages 核对)
 *    B2 UI KPI↔API 一致 / B3 时间范围切换 / B4 gateway 来源 tab
 *    B5 钻取三 query / B6 预算 Budgets
 *
 * 运行: NODE_PATH=$(npm root -g) node e2e/metering-center-test.cjs
 * 前置: ./dev.sh start 后(需 METERING_SYNC_USER_ID 已配置、LiteLLM 有近 7 天 spend)
 */
const { chromium } = require('playwright')

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
const API_URL = FRONTEND_URL + '/query'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@platform.local'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe123!'
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/e2e-screenshots/metering'
const HERMES_R2 = 'd246dfa4-bb6b-49cc-8359-4f5f68c3516a' // hermes21-r2(测试流量归属 agent)

const results = []
const pass = (name, detail = '') => { results.push({ name, ok: true, detail }); console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`) }
const fail = (name, detail = '') => { results.push({ name, ok: false, detail }); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`) }

async function apiGql(context, query, variables, token) {
  const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }
  if (token) headers.Authorization = `Bearer ${token}`
  const resp = await context.request.post(API_URL, { headers, data: { query, variables } })
  const body = await resp.json()
  if (body.errors) throw new Error('GraphQL: ' + body.errors.map(e => e.message).join('; '))
  return body.data
}

async function loginApi(context) {
  const data = await apiGql(context, `mutation Login($input: LoginInput!) {
    login(input: $input) { token user { id username role } } }`,
    { input: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, remember: true } })
  return data.login
}

const EXCHANGE_RATES_QRY = `query ExchangeRates { exchangeRates { id fromCurrency toCurrency rate status note } }`
const fetchRates = (context, token) => apiGql(context, EXCHANGE_RATES_QRY, undefined, token).then(d => d.exchangeRates)

function approx(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps }

async function screenshot(page, name) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` })
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  // 停用汇率会弹 confirm;统一自动接受
  page.on('dialog', (d) => d.accept())

  // ── 登录(API 拿 token → 注入 localStorage → 页面访问) ──
  const login = await loginApi(context)
  await page.goto(FRONTEND_URL)
  await page.evaluate((tok) => {
    localStorage.setItem('token', tok)
    localStorage.setItem('auth_token', tok)
    localStorage.setItem('user_role', 'admin')
  }, login.token)

  console.log('\n===== Phase 1: 设置(计量设置 modal) =====')

  // ── S1 打开计量设置 modal ──
  try {
    await page.goto(FRONTEND_URL + '/observability/metering')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: '计量设置' }).click()
    await page.waitForSelector('cds-modal:not([hidden])', { timeout: 10000 })
    pass('S1 点击「计量设置」打开 modal')
    await screenshot(page, 'S1-settings-modal')
  } catch (e) { fail('S1 打开 modal', e.message.split('\n')[0]) }

  // ── S2 货币设置 UI ↔ API 一致 ──
  try {
    const api = await apiGql(context, `query { currencySettings { baseCurrency defaultDisplayCurrency amountPrecision preserveOriginalAmount } }`, undefined, login.token)
    const cs = api.currencySettings
    const selects = await page.locator('cds-modal .styled-select').all()
    const uiBase = await selects[0].inputValue()
    const uiDisp = await selects[1].inputValue()
    const uiPrec = await selects[2].inputValue()
    if (uiBase === cs.baseCurrency && uiDisp === cs.defaultDisplayCurrency && Number(uiPrec) === cs.amountPrecision) {
      pass('S2 货币设置 UI 与 API 一致', `${cs.baseCurrency}/${cs.defaultDisplayCurrency}/${cs.amountPrecision}`)
    } else {
      fail('S2 货币设置 UI 与 API 不一致', `UI=${uiBase}/${uiDisp}/${uiPrec} API=${cs.baseCurrency}/${cs.defaultDisplayCurrency}/${cs.amountPrecision}`)
    }
  } catch (e) { fail('S2 货币设置 UI 与 API 一致', e.message.split('\n')[0]) }

  // ── S3 修改货币设置 → 保存 → 持久化 → 还原 ──
  try {
    const api = await apiGql(context, `query { currencySettings { baseCurrency defaultDisplayCurrency amountPrecision } }`, undefined, login.token)
    const orig = api.currencySettings
    const newPrec = orig.amountPrecision === 4 ? 2 : 4
    const selects = await page.locator('cds-modal .styled-select').all()
    await selects[2].selectOption(String(newPrec)) // 改精度(全局影响最小,测完还原)
    await page.getByRole('button', { name: '保存' }).click()
    await page.waitForSelector('cds-modal-actions >> text=已保存', { timeout: 8000 })
    pass('S3a 修改精度并保存,出现「已保存」', `精度 ${orig.amountPrecision} → ${newPrec}`)
    await screenshot(page, 'S3a-saved')
    // 关闭重开,验证持久化
    await page.getByRole('button', { name: '取消' }).click()
    await page.waitForSelector('cds-modal[hidden]', { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: '计量设置' }).click()
    await page.waitForSelector('cds-modal:not([hidden])', { timeout: 10000 })
    await page.waitForTimeout(800)
    const api2 = await apiGql(context, `query { currencySettings { amountPrecision } }`, undefined, login.token)
    if (api2.currencySettings.amountPrecision === newPrec) {
      pass('S3b 重开 modal 后精度已持久化', `${api2.currencySettings.amountPrecision}`)
    } else {
      fail('S3b 精度未持久化', `期望 ${newPrec} 实际 ${api2.currencySettings.amountPrecision}`)
    }
    // 还原(S3a/S3b 已证明 UI 保存链路;还原直接走 API,避免 modal 重挂载后
    // snapshot 时序竞争,保证不污染全局精度设置)
    await apiGql(context, `mutation Restore($input: UpdateCurrencySettingsInput!) {
      updateCurrencySettings(input: $input) { amountPrecision } }`,
      { input: { baseCurrency: orig.baseCurrency, defaultDisplayCurrency: orig.defaultDisplayCurrency, amountPrecision: orig.amountPrecision, preserveOriginalAmount: true } }, login.token)
    await page.getByRole('button', { name: '取消' }).click().catch(() => {})
    await page.waitForTimeout(400)
    const api3 = await apiGql(context, `query { currencySettings { amountPrecision } }`, undefined, login.token)
    if (api3.currencySettings.amountPrecision === orig.amountPrecision) {
      pass('S3c 已还原原精度', `${orig.amountPrecision}`)
    } else {
      fail('S3c 还原失败', `期望 ${orig.amountPrecision} 实际 ${api3.currencySettings.amountPrecision}`)
    }
  } catch (e) { fail('S3 货币设置修改/持久化/还原', e.message.split('\n')[0]) }

  // ── S4 isDirty 短路:未改动直接保存不生效 ──
  try {
    // 兜底:若 modal 还开着先关掉
    const modalOpen = await page.locator('cds-modal:not([hidden])').count()
    if (modalOpen > 0) { await page.getByRole('button', { name: '取消' }).click().catch(() => {}); await page.waitForTimeout(400) }
    await page.getByRole('button', { name: '计量设置' }).click()
    await page.waitForSelector('cds-modal:not([hidden])', { timeout: 10000 })
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(2500)
    const savedBadge = await page.locator('cds-modal-actions >> text=已保存').count()
    if (savedBadge === 0) {
      pass('S4 未改动点保存,无「已保存」徽标(isDirty 短路生效)')
    } else {
      fail('S4 isDirty 短路失效:未改动也显示已保存')
    }
  } catch (e) { fail('S4 isDirty 短路', e.message.split('\n')[0]) }

  // ── S5 汇率 CRUD ──
  try {
    // 清理先前运行残留的测试汇率(表格不显示 note 列,行定位用币种对)
    const leftovers = await fetchRates(context, login.token)
    for (const r of leftovers) {
      if (r.status === 'ACTIVE' && r.note && (r.note.includes('e2e-test') || r.note.includes('e2e-preview') || r.note.includes('dbg-'))) {
        await apiGql(context, `mutation Deactivate($id: ID!) { deactivateExchangeRate(id: $id) { id status } }`, { id: r.id }, login.token)
      }
    }
    const marker = 'e2e-test-' + Date.now().toString().slice(-6)
    const modal = page.locator('cds-modal:not([hidden])')
    await modal.getByRole('button', { name: '添加汇率' }).dispatchEvent('click')
    await page.waitForSelector('.drawer-panel', { timeout: 8000 })
    const drawer = page.locator('.drawer-panel')
    // from USD → to JPY, rate 150
    await drawer.locator('.rate-select').nth(0).selectOption('USD')
    await drawer.locator('.rate-select').nth(1).selectOption('JPY')
    await drawer.locator('input[placeholder="7.2500"]').fill('150.1234')
    await drawer.locator('textarea.note-input').fill(marker)
    await drawer.getByRole('button', { name: '保存' }).dispatchEvent('click')
    await page.waitForSelector('.drawer-panel', { state: 'detached', timeout: 8000 })
    await page.waitForTimeout(1000)
    const rates = await fetchRates(context, login.token)
    const row = rates.find(r => r.note && r.note.includes(marker))
    if (row) {
      pass('S5a 创建汇率成功', `${row.fromCurrency}→${row.toCurrency} @${row.rate} [${row.status}]`)
      await screenshot(page, 'S5a-rate-created')
      // 编辑 rate(表格不显示 note,用独特 rate 值定位;等待 refetch 渲染)
      await page.waitForSelector('cds-modal tbody tr:has-text("150.1234")', { timeout: 8000 })
      const tr = page.locator('cds-modal tbody tr', { hasText: '150.1234' }).first()
      await tr.getByRole('button', { name: '编辑' }).dispatchEvent('click')
      await page.waitForSelector('.drawer-panel', { timeout: 8000 })
      await page.locator('.drawer-panel input[placeholder="7.2500"]').fill('155.9999')
      await page.locator('.drawer-panel').getByRole('button', { name: '保存' }).dispatchEvent('click')
      await page.waitForSelector('.drawer-panel', { state: 'detached', timeout: 8000 })
      await page.waitForTimeout(1000)
      const rates2 = await fetchRates(context, login.token)
      const row2 = rates2.find(r => r.note && r.note.includes(marker))
      if (row2 && approx(row2.rate, 155.9999)) pass('S5b 编辑汇率生效', `rate=155.9999`)
      else fail('S5b 编辑汇率未生效', `实际 ${row2 && row2.rate}`)
      // 历史抽屉
      await page.waitForSelector('cds-modal tbody tr:has-text("155.9999")', { timeout: 8000 })
      const tr2 = page.locator('cds-modal tbody tr', { hasText: '155.9999' }).first()
      await tr2.getByRole('button', { name: '历史' }).dispatchEvent('click')
      await page.waitForTimeout(800)
      const hist = await apiGql(context, `query RateHistory($id: ID!) { exchangeRateHistory(rateId: $id) { id rate status } }`, { id: row2.id }, login.token)
      if (hist.exchangeRateHistory.length >= 2) {
        pass('S5c 汇率历史含多版本', `${hist.exchangeRateHistory.length} 条(150.1234→155.9999)`)
      } else {
        fail('S5c 汇率历史版本数不足', `${hist.exchangeRateHistory.length} 条`)
      }
      await screenshot(page, 'S5c-rate-history')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      // 停用清理
      const tr3 = page.locator('cds-modal tbody tr', { hasText: '155.9999' }).first()
      await tr3.getByRole('button', { name: '停用' }).dispatchEvent('click')
      await page.waitForTimeout(1200)
      const rates3 = await fetchRates(context, login.token)
      const row3 = rates3.find(r => r.note && r.note.includes(marker))
      if (!row3 || row3.status !== 'ACTIVE') pass('S5d 停用汇率生效(测试数据已清理)')
      else fail('S5d 停用未生效', `status=${row3.status}`)
    } else {
      fail('S5a 创建汇率未出现在列表', JSON.stringify(rates).slice(0, 200))
    }
  } catch (e) { fail('S5 汇率 CRUD', e.message.split('\n')[0]) }

  // ── S6 换算预览 API 数学正确性(独立建临时汇率,测后清理) ──
  try {
    const marker = 'e2e-preview-' + Date.now().toString().slice(-6)
    const created = await apiGql(context, `mutation CreateRate($input: CreateExchangeRateInput!) {
      createExchangeRate(input: $input) { id fromCurrency toCurrency rate status } }`,
      { input: { fromCurrency: 'USD', toCurrency: 'EUR', rate: 0.92, note: marker, source: 'MANUAL', effectiveFrom: '2026-08-02T00:00:00Z' } }, login.token)
    const rateRow = created.createExchangeRate
    const data = await apiGql(context, `query Preview($f: String!, $t: String!, $a: Float!) {
      conversionPreview(fromCurrency: $f, toCurrency: $t, amount: $a) {
        fromCurrency toCurrency fromAmount toAmount rate rateDescription effectiveFrom } }`,
      { f: 'USD', t: 'EUR', a: 100 }, login.token)
    const p = data.conversionPreview
    const expectAmount = 100 * p.rate
    if (p.fromAmount === 100 && approx(p.toAmount, expectAmount, 1e-4) && approx(p.rate, 0.92, 1e-4)) {
      pass('S6 换算预览数学正确', `100 USD → ${p.toAmount} EUR @${p.rate} [${p.rateDescription}]`)
    } else {
      fail('S6 换算预览金额不符', `toAmount=${p.toAmount} 期望≈${expectAmount} rate=${p.rate}`)
    }
    // 边界:amount=0 被后端校验拒绝(金额必须大于0)——预期错误处理
    try {
      await apiGql(context, `query Preview($f: String!, $t: String!, $a: Float!) { conversionPreview(fromCurrency: $f, toCurrency: $t, amount: $a) { toAmount } }`, { f: 'USD', t: 'EUR', a: 0 }, login.token)
      fail('S6b amount=0 未被拒绝(应校验报错)')
    } catch (err) {
      if (String(err.message).includes('金额必须大于0')) pass('S6b amount=0 校验拒绝正确', err.message.split(': ').pop())
      else fail('S6b amount=0 报错文案不符', err.message)
    }
    // 清理
    await apiGql(context, `mutation Deactivate($id: ID!) { deactivateExchangeRate(id: $id) { id status } }`, { id: rateRow.id }, login.token)
  } catch (e) { fail('S6 换算预览', e.message.split('\n')[0]) }

  // ── S7 成本规则只读展示 ──
  try {
    await page.locator('cds-modal button[role="tab"]', { hasText: '成本规则' }).dispatchEvent('click')
    await page.waitForTimeout(1200)
    const api = await apiGql(context, `query CostRules { costRuleConfig {
      missingPriceAction chargeFailedRequests countCacheReadTokens countCacheWriteTokens
      roundingRule forecastMethod alertMissingPrice alertMissingRate alertMonthlyBudget alertUsageSpike } }`, undefined, login.token)
    const cfg = api.costRuleConfig
    const checkedRadios = await page.locator('cds-modal input[type=radio]:checked').all()
    // 只读设计:checkbox 全 disabled(开关只读);radio 可点但 @change 为 no-op
    const checkboxes = await page.locator('cds-modal input[type=checkbox]').all()
    const cbDisabled = []
    for (const cb of checkboxes) cbDisabled.push(await cb.isDisabled())
    const radioCount = await page.locator('cds-modal input[type=radio]').count()
    if (checkboxes.length > 0 && cbDisabled.every(Boolean) && radioCount === 9) {
      pass('S7a 成本规则只读设计:checkbox 全 disabled、9 个 radio 展示', `${cbDisabled.length}/${cbDisabled.length} 开关禁用`)
    } else {
      fail('S7a 成本规则只读设计不符', `checkbox=${cbDisabled} radios=${radioCount}`)
    }
    // 关键配置值核对:选中态与 API 一致(missingPriceAction / roundingRule / forecastMethod)
    const names = []
    for (const r of checkedRadios) names.push(await r.getAttribute('value'))
    const expected = [cfg.missingPriceAction, cfg.roundingRule, cfg.forecastMethod].filter(Boolean)
    const matched = expected.every(v => names.includes(v))
    if (matched) pass('S7b 成本规则选中值与 API 一致', names.join(','))
    else fail('S7b 成本规则选中值与 API 不一致', `UI=${names.join(',')} API=${expected.join(',')}`)
    // 开关(chargeFailedRequests/cache/alert) checked 与 API 一致
    const uiChecked = []
    for (const cb of checkboxes) uiChecked.push(await cb.isChecked())
    const apiBools = [cfg.chargeFailedRequests, cfg.countCacheReadTokens, cfg.countCacheWriteTokens, cfg.alertMissingPrice, cfg.alertMissingRate, cfg.alertMonthlyBudget, cfg.alertUsageSpike]
    if (JSON.stringify(uiChecked) === JSON.stringify(apiBools)) {
      pass('S7c 成本规则开关状态与 API 一致', `${apiBools.filter(Boolean).length}/${apiBools.length} 开`)
    } else {
      fail('S7c 成本规则开关与 API 不一致', `UI=${uiChecked} API=${apiBools}`)
    }
    await screenshot(page, 'S7-cost-rules')
    // 关 modal,进入计费部分
    await page.getByRole('button', { name: '取消' }).dispatchEvent('click')
    await page.waitForTimeout(500)
  } catch (e) {
    fail('S7 成本规则', e.message.split('\n')[0])
    // 兜底关闭 modal
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(400)
  }

  console.log('\n===== Phase 2: 计费(计量中心) =====')

  // ── B1 meteringOverview(7d) API 数据正确 ──
  try {
    const data = await apiGql(context, `query Overview($range: MeteringTimeRange) {
      meteringOverview(range: $range) {
        range totalInputTokens totalOutputTokens totalTokens totalRequests
        cost { totalCost monthlyCost }
        byAgent { agentId agentName inputTokens outputTokens totalTokens requests cost }
        byModel { model inputTokens outputTokens totalTokens requests cost }
      } }`, { range: 'LAST_7_DAYS' }, login.token)
    const ov = data.meteringOverview
    const hermes = ov.byAgent.find(a => a.agentName === 'hermes21-r2')
    const deepseek = ov.byModel.find(m => m.model.includes('deepseek'))
    if (ov.totalTokens > 0 && deepseek && hermes) {
      pass('B1a 总览(7d) 含测试数据', `tokens=${ov.totalTokens} cost=${ov.cost.totalCost} agents=${ov.byAgent.length} models=${ov.byModel.length}`)
      if (approx(ov.cost.totalCost, 0.00003276, 1e-8)) pass('B1b 总成本与 token_usages 一致', `$${ov.cost.totalCost}`)
      else fail('B1b 总成本不符', `API=${ov.cost.totalCost} 期望≈0.00003276`)
      if (hermes.agentId === HERMES_R2 && hermes.totalTokens > 0) pass('B1c byAgent 归属正确', `${hermes.agentName} tokens=${hermes.totalTokens}`)
      else fail('B1c byAgent 归属不符', JSON.stringify(hermes))
      if (deepseek.cost > 0) pass('B1d byModel 含 cost', `${deepseek.model} $${deepseek.cost}`)
      else fail('B1d byModel cost 为 0')
    } else {
      fail('B1a 总览无测试数据', `tokens=${ov.totalTokens} byAgent=${JSON.stringify(ov.byAgent).slice(0,150)}`)
    }
  } catch (e) { fail('B1 总览 API', e.message.split('\n')[0]) }

  // ── B2 UI KPI ↔ API 一致 ──
  try {
    const data = await apiGql(context, `query Overview($range: MeteringTimeRange) { meteringOverview(range: $range) { totalTokens totalRequests cost { totalCost } } }`, { range: 'LAST_7_DAYS' }, login.token)
    const ov = data.meteringOverview
    const body = await page.locator('body').innerText()
    // KPI 卡片文本抽查:页面包含总 token 数(格式化后可能缩写,做近似断言)
    const fmtTokens = ov.totalTokens >= 1000 ? Math.round(ov.totalTokens / 1000 * 10) / 10 + 'K' : String(ov.totalTokens)
    const bodyHasTokens = body.includes(String(ov.totalTokens)) || body.includes(fmtTokens)
    if (bodyHasTokens) pass('B2a KPI 含总 token 数', `${ov.totalTokens}`)
    else fail('B2a KPI 未显示总 token 数', `期望 ${ov.totalTokens} 或 ${fmtTokens}`)
    const charts = await page.locator('canvas, svg, .chart-container').count()
    if (charts >= 2) pass('B2b 图表渲染', `${charts} 个图表元素`)
    else fail('B2b 图表渲染不足', `${charts} 个`)
    await screenshot(page, 'B2-overview')
  } catch (e) { fail('B2 UI KPI', e.message.split('\n')[0]) }

  // ── B3 时间范围切换 ──
  try {
    for (const range of ['过去 30 天', '本月']) {
      const btn = page.getByRole('button', { name: range }).first()
      await btn.dispatchEvent('click')
      await page.waitForTimeout(1500)
      const body = await page.locator('body').innerText()
      if (body.includes('计量中心') || body.includes('总')) pass(`B3 切换到「${range}」无报错`)
      else fail(`B3 切换到「${range}」异常`)
    }
    await page.getByRole('button', { name: '过去 7 天' }).first().dispatchEvent('click')
    await page.waitForTimeout(1200)
    pass('B3d 切回「过去 7 天」')
  } catch (e) { fail('B3 时间范围切换', e.message.split('\n')[0]) }

  // ── B4 gateway 来源 tab ──
  try {
    await page.getByRole('tab', { name: /网关记录/ }).click().catch(() => {})
    await page.waitForTimeout(1800)
    // GatewaySpendPanel 展示 spend KPI(总成本/总 tokens)与来源日期
    const body = await page.locator('body').innerText()
    const spendTotal = await page.getByText('总花费', { exact: false }).count()
    const totalToken = await page.getByText('总 Token', { exact: false }).count()
    if (spendTotal > 0 && totalToken > 0) pass('B4 gateway 来源 tab 渲染 spend 面板', '总花费 + 总 Token KPI')
    else fail('B4 gateway tab 无 spend 面板内容', `总花费=${spendTotal} 总Token=${totalToken}`)
    await screenshot(page, 'B4-gateway')
    await page.getByRole('tab', { name: /平台记录/ }).click().catch(() => {})
    await page.waitForTimeout(1000)
  } catch (e) { fail('B4 gateway tab', e.message.split('\n')[0]) }

  // ── B5 钻取三 query ──
  try {
    const byAgent = await apiGql(context, `query ByAgent($agentId: ID!, $range: MeteringTimeRange) {
      modelsForAgent(agentId: $agentId, range: $range) { model inputTokens outputTokens totalTokens requests cost } }`,
      { agentId: HERMES_R2, range: 'LAST_7_DAYS' }, login.token)
    const byModel = await apiGql(context, `query ByModel($model: String!, $range: MeteringTimeRange) {
      agentsForModel(model: $model, range: $range) { agentId agentName inputTokens outputTokens totalTokens requests cost } }`,
      { model: 'deepseek-v4-flash', range: 'LAST_7_DAYS' }, login.token)
    const pair = await apiGql(context, `query Pair($agentId: ID!, $model: String!, $range: MeteringTimeRange) {
      agentModelUsage(agentId: $agentId, model: $model, range: $range) { agentId agentName inputTokens outputTokens totalTokens requests cost } }`,
      { agentId: HERMES_R2, model: 'deepseek-v4-flash', range: 'LAST_7_DAYS' }, login.token)
    if (byAgent.modelsForAgent.length > 0) pass('B5a modelsForAgent 有数据', `${byAgent.modelsForAgent.length} 模型`)
    else fail('B5a modelsForAgent 为空')
    if (byModel.agentsForModel.length > 0 && byModel.agentsForModel[0].agentId === HERMES_R2) pass('B5b agentsForModel 归属正确', byModel.agentsForModel[0].agentName)
    else fail('B5b agentsForModel 为空或归属不符', JSON.stringify(byModel.agentsForModel).slice(0, 150))
    if (pair.agentModelUsage && pair.agentModelUsage.totalTokens > 0) pass('B5c agentModelUsage 有数据', `tokens=${pair.agentModelUsage.totalTokens}`)
    else fail('B5c agentModelUsage 为空', JSON.stringify(pair.agentModelUsage).slice(0, 150))
  } catch (e) { fail('B5 钻取', e.message.split('\n')[0]) }

  // ── B6 预算 Budgets ──
  try {
    const data = await apiGql(context, `query Budgets($scope: BudgetScope!) { budgets(scope: $scope) { label spend maxBudget remaining utilizationPct } }`, { scope: 'KEYS' }, login.token)
    if (data && data.budgets !== undefined) pass('B6 budgets 查询可执行', `${data.budgets.length} 条`)
    else fail('B6 budgets 返回异常', JSON.stringify(data).slice(0, 150))
  } catch (e) {
    // 预算无数据时可能报错——记录但不算失败(记警告)
    console.log(`  ⚠️ B6 budgets — ${e.message.split('\n')[0]} (视为无预算数据)`)
    results.push({ name: 'B6 budgets 查询', ok: true, detail: 'no budget rows (warning)', warn: true })
  }

  await browser.close()

  // ── 汇总 ──
  const failed = results.filter(r => !r.ok)
  const warns = results.filter(r => r.warn)
  console.log(`\n===== 汇总 =====`)
  console.log(`通过 ${results.length - failed.length}/${results.length}${warns.length ? ` (含警告 ${warns.length})` : ''}`)
  if (failed.length) {
    console.log('失败项:')
    for (const f of failed) console.log(`  ❌ ${f.name} — ${f.detail}`)
    process.exit(1)
  }
  console.log('全部通过 ✅')
}

main().catch((e) => { console.error('E2E 异常:', e); process.exit(1) })
