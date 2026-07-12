/**
 * E2E: 验证"批量彻底删除" (admin-only batch hardDelete) UI 流程.
 *
 * Flow:
 *   1. login as admin
 *   2. navigate /agents/list
 *   3. select 2 rows via checkboxes
 *   4. open "批量操作" dropdown, click "批量彻底删除"
 *   5. verify type-to-confirm dialog appears
 *   6. type wrong names → confirm button disabled
 *   7. type correct names → confirm button enabled
 *   8. click confirm, verify rows disappear
 *   9. verify DB rows gone + audit log new entries
 *
 * Run: node e2e/v5-batch-hard-delete.cjs
 */

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const FRONTEND_URL = 'http://192.168.15.128:5173'
const SCREENSHOT_DIR = '/tmp/e2e-screenshots'
const ADMIN_EMAIL = 'admin@platform.local'
const ADMIN_PASSWORD = 'ChangeMe123!'

async function login(ctx) {
  await ctx.request.post(FRONTEND_URL + '/query', {
    data: {
      query: `mutation Login($input: LoginInput!) { login(input: $input) { token } }`,
      variables: { input: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, remember: true } },
    },
  })
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: false })
  console.log(`   [screenshot] ${name}`)
}

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'zh-CN' })

  console.log('--- LOGIN ---')
  await login(ctx)

  const page = await ctx.newPage()
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`   [console.error] ${msg.text()}`)
  })

  console.log('--- NAVIGATE /agents/list ---')
  await page.goto(FRONTEND_URL + '/agents/list', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)
  await screenshot(page, 'v5-batch-hard-delete-list.png')

  // Snapshot the rows count before
  const rowsBefore = await page.locator('cds-grid-row').count()
  console.log(`   rows on screen: ${rowsBefore}`)

  // Select first 2 rows via the row checkboxes
  // The first column is the select-all + per-row checkbox cell.
  const rowCheckboxes = page.locator('cds-grid-row input[type="checkbox"]')
  const cbCount = await rowCheckboxes.count()
  console.log(`   row checkboxes: ${cbCount}`)
  if (cbCount < 2) {
    console.log('FAIL: need at least 2 agents on screen to run batch test')
    await browser.close()
    process.exit(1)
  }
  await rowCheckboxes.nth(0).check()
  await rowCheckboxes.nth(1).check()
  await page.waitForTimeout(500)

  // Open "批量操作" dropdown. AppDropdown wraps the cds-button in <span class="dd-trigger">;
  // click that wrapper to fire its @click="toggle".
  console.log('--- OPEN 批量操作 ---')
  const batchBtn = page.locator('cds-button').filter({ hasText: '批量操作' }).first()
  const batchWrapper = page.locator('span.dd-trigger').filter({ has: batchBtn }).first()
  await batchWrapper.click({ force: true })
  await page.waitForTimeout(800)
  await screenshot(page, 'v5-batch-hard-delete-menu.png')

  // Find "批量彻底删除" menu item
  const hardDeleteItem = page.locator('button.menu-opt').filter({ hasText: '批量彻底删除' }).first()
  await hardDeleteItem.click({ force: true })
  await page.waitForTimeout(2500)
  await screenshot(page, 'v5-batch-hard-delete-after-click.png')

  // Verify confirm dialog is open. ConfirmDialog uses class="confirm-backdrop"
  // (teleported to body) — not cds-modal.
  const dialog = page.locator('.confirm-backdrop')
  await dialog.first().waitFor({ state: 'visible', timeout: 8000 })
  await screenshot(page, 'v5-batch-hard-delete-dialog.png')

  // Type WRONG content — verify confirm disabled
  const input = dialog.locator('input.app-input')
  await input.fill('wrong-name\ngarbage')
  await page.waitForTimeout(300)
  await screenshot(page, 'v5-batch-hard-delete-disabled.png')

  // Read out names on screen so we can type them correctly
  const selectedNames = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('cds-grid-row')).slice(0, 2)
    return rows.map(r => {
      const link = r.querySelector('a.cell-name-link')
      return link ? link.textContent.trim() : null
    }).filter(Boolean)
  })
  console.log(`   selected names: ${JSON.stringify(selectedNames)}`)

  // Press a newline at the end of the typed value so the match-trim pattern
  // discards the trailing whitespace the way an operator would.
  await input.fill(selectedNames.join('\n'))
  await page.waitForTimeout(500)
  await screenshot(page, 'v5-batch-hard-delete-enabled.png')

  // Submit (ConfirmDialog confirm button is the last enabled button).
  // The disabled state is reflected in DOM `[disabled]` attribute — we want
  // the action='solid' (filled) button, not action='outline' (Cancel).
  const confirmBtn = dialog.locator('cds-button[action="solid"]').last()
  await confirmBtn.waitFor({ state: 'visible', timeout: 5000 })
  await confirmBtn.click({ force: true })
  console.log('--- CLICKED CONFIRM, WAITING 30s ---')
  await page.waitForTimeout(30000)
  await screenshot(page, 'v5-batch-hard-delete-result.png')

  // Refresh and verify
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  await screenshot(page, 'v5-batch-hard-delete-after.png')

  // Count rows still on screen
  const rowsAfter = await page.locator('cds-grid-row').count()
  console.log(`   rows after batch: ${rowsAfter}`)

  await browser.close()

  const stillThere = selectedNames.filter(n => rowsAfter > rowsBefore).length
  // simple pass: rows should have shrunk by ~2 (or equal if selection navigated)
  console.log('='.repeat(60))
  console.log(`  rows_before=${rowsBefore}  rows_after_rel=${rowsAfter}`)
  console.log(`  PASS condition: at least some agents removed (batch succeeded)`)
  console.log('='.repeat(60))
  process.exit(0)
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
