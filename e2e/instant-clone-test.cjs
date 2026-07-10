/**
 * E2E: Instant Clone scenarios only (v4)
 *
 * Run with:
 *   node /data/claude/ai-workstation-platform/frontend/e2e/instant-clone-test.cjs
 *
 * Prerequisites:
 *   - Frontend @ http://192.168.15.128:5173
 *   - Admin account: admin@platform.local / ChangeMe123!
 *   - "test01" template exists in marketplace
 *   - ic-p* parent VMs exist for instant clone scenarios
 *   - VLAN 805 available
 *   - vCenter svcroot / VMware1!
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'http://192.168.15.128:5173';
const SCREENSHOT_DIR = '/tmp/e2e-screenshots';
const ADMIN_EMAIL = 'admin@platform.local';
const ADMIN_PASSWORD = 'ChangeMe123!';
const GATEWAY = '172.16.85.1';
const NETMASK = '255.255.255.0';
const DNS = '172.16.85.1';
const RUNAS_USER = 'svcroot';
const VM_PASSWORD = 'VMware1!';
const TEMPLATE_NAME = 'test01';

// ── helpers ──────────────────────────────────────────────────────────────

async function screenshot(page, name) {
  const fp = path.join(SCREENSHOT_DIR, name);
  await page.screenshot({ path: fp, fullPage: false });
  console.log(`   [screenshot] ${name}`);
}

/**
 * Login via GraphQL mutation (cookie-based).
 */
async function loginViaAPI(context) {
  const resp = await context.request.post(FRONTEND_URL + '/query', {
    data: {
      query: `mutation Login($input: LoginInput!) {
        login(input: $input) {
          token mustChangePassword user { id username email role }
        }
      }`,
      variables: { input: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, remember: true } },
    },
  });
  const body = await resp.json();
  if (body.errors) throw new Error('Login failed: ' + body.errors[0].message);
  console.log('   Authenticated via API');
}

// ── dialog helpers ───────────────────────────────────────────────────────

/** Locate the visible (non-hidden) dialog */
function dlg(page) {
  return page.locator('cds-modal:not([hidden])');
}

/** Wait for the dialog to be visible */
async function waitForDialogVisible(page, timeoutMs = 10000) {
  try {
    await dlg(page).waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/**
 * Select an option in a cds-select by matching the label text and option value.
 */
async function dialogSelect(page, labelMatch, value) {
  const sel = dlg(page).locator('cds-select').filter({ hasText: labelMatch }).locator('select');
  if (await sel.count() === 0) {
    console.log(`   [WARN] Select with label "${labelMatch}" not found`);
    return false;
  }
  try {
    await sel.selectOption(value);
    return true;
  } catch {
    const opts = await sel.locator('option').all();
    for (const o of opts) {
      const t = (await o.textContent() || '').trim();
      if (t.includes(value)) {
        await sel.selectOption(await o.getAttribute('value') || '');
        return true;
      }
    }
  }
  return false;
}

/**
 * Fill a cds-input by matching label text.
 */
async function dialogFill(page, labelMatch, value) {
  const inp = dlg(page).locator('cds-input').filter({ hasText: labelMatch }).locator('input, textarea').first();
  if (await inp.count() === 0) {
    console.log(`   [WARN] Input with label "${labelMatch}" not found`);
    return false;
  }
  await inp.click();
  await inp.fill(value);
  return true;
}

/**
 * Click a radio button by matching label text.
 */
async function dialogRadio(page, text) {
  const lbl = dlg(page).locator('label').filter({ hasText: text });
  if (await lbl.count() === 0) return false;
  const r = lbl.locator('input[type="radio"]');
  if (await r.count() > 0) {
    await r.check({ force: true });
    return true;
  }
  await lbl.first().click();
  return true;
}

/**
 * Fill password field (custom wrapper, not cds-input).
 * Password has placeholder "至少 8 位", confirm has "再次输入".
 */
async function dialogPassword(page, placeholderPart, value) {
  const pw = dlg(page).locator('input[type="password"]');
  const all = await pw.all();
  for (const inp of all) {
    const ph = await inp.getAttribute('placeholder') || '';
    if (ph.includes(placeholderPart)) {
      await inp.click();
      await inp.fill(value);
      return true;
    }
  }
  return false;
}

/**
 * Fill the hostname field in the dialog (智能体名称).
 */
async function dialogHostname(page, val) {
  return dialogFill(page, '智能体名称', val);
}

/**
 * Fill the IP address field in the dialog (IP 地址).
 */
async function dialogIP(page, val) {
  return dialogFill(page, 'IP 地址', val);
}

/**
 * For batch mode: fill count, prefix, and start IP.
 */
async function dialogBatchInputs(page, count, prefix, startIP) {
  const g = dlg(page);

  const ci = g.locator('cds-input').filter({ hasText: '数量' }).locator('input');
  if (await ci.count() > 0) {
    await ci.click();
    await ci.fill(String(count));
  }

  const pi = g.locator('cds-input').filter({ hasText: '名称前缀' }).locator('input');
  if (await pi.count() > 0) {
    await pi.click();
    await pi.fill(prefix);
  }

  if (startIP) {
    const si = g.locator('cds-input').filter({ hasText: '起始 IP' }).locator('input');
    if (await si.count() > 0) {
      await si.click();
      await si.fill(startIP);
    }
  }
}

/**
 * Click the "生成清单" (generate manifest) button.
 */
async function dialogGenerateManifest(page) {
  const btn = dlg(page).locator('cds-button').filter({ hasText: '生成清单' });
  if (await btn.count() === 0) return false;
  await btn.click();
  await page.waitForTimeout(1000);
  return true;
}

/**
 * Select an existing parent VM for instant clone (ic-p*).
 */
async function dialogSelectInstantParent(page) {
  const g = dlg(page);

  // Ensure "选择已有父虚拟机" radio is checked
  const existingRadio = g.locator('label').filter({ hasText: '选择已有父虚拟机' }).locator('input[type="radio"]');
  if (await existingRadio.count() > 0) {
    await existingRadio.check({ force: true });
    await page.waitForTimeout(2000); // Wait for parent VMs to load
  }

  // Find the parent VM select
  const sel = g.locator('cds-select').filter({ hasText: '父虚拟机' }).locator('select');
  if (await sel.count() === 0) {
    console.log('   [INFO] Parent VM select not found');
    return false;
  }

  // Select the first available option (skip empty default)
  const opts = await sel.locator('option').all();
  for (const o of opts) {
    const v = await o.getAttribute('value');
    const t = (await o.textContent() || '').trim();
    if (v && t && v !== '') {
      await sel.selectOption(v);
      console.log(`   [INFO] Selected parent VM: ${t}`);
      return true;
    }
  }
  console.log('   [INFO] No parent VM options available');
  return false;
}

/**
 * Click the deploy submit button (last cds-button in modal-actions).
 */
async function dialogSubmit(page) {
  const actions = dlg(page).locator('cds-modal-actions');
  const btn = actions.locator('cds-button').last();
  const box = await btn.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    await btn.click({ force: true });
  }
}

/**
 * Close the dialog by clicking the first (cancel) button.
 */
async function dialogClose(page) {
  const g = dlg(page);
  if (await g.count() === 0) return;
  const first = g.locator('cds-modal-actions cds-button').first();
  const box = await first.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    await first.click({ force: true });
  }
  await page.waitForTimeout(1000);
}

/**
 * Open the deploy dialog from marketplace for the specified template.
 */
async function openDeployDialog(page) {
  const card = page.locator('cds-card').filter({ hasText: TEMPLATE_NAME });
  if (await card.count() === 0) {
    console.log(`   [WARN] Template card "${TEMPLATE_NAME}" not found`);
    return false;
  }
  const btn = card.locator('cds-button').filter({ hasText: '部署智能体' });
  if (await btn.count() === 0) {
    console.log('   [WARN] Deploy button not found in card');
    return false;
  }
  const box = await btn.first().boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    await btn.first().click({ force: true });
  }
  const opened = await waitForDialogVisible(page);
  if (opened) await page.waitForTimeout(1500);
  return opened;
}

/**
 * Navigate to marketplace and wait for content.
 */
async function gotoMarketplace(page) {
  await page.goto(FRONTEND_URL + '/agents/marketplace', { waitUntil: 'networkidle', timeout: 30000 });
  try {
    await page.locator('cds-card').first().waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    console.log('   [WARN] No template cards found');
  }
  await page.waitForTimeout(2000);
}

/**
 * Select the first available vSphere placement pool.
 */
async function dialogSelectPlacementPool(page) {
  const sel = dlg(page).locator('cds-select').filter({ hasText: 'vSphere 放置资源池' }).locator('select');
  if (await sel.count() === 0) return false;

  for (let attempt = 0; attempt < 10; attempt++) {
    const opts = await sel.locator('option').all();
    for (const o of opts) {
      const v = await o.getAttribute('value');
      const t = (await o.textContent() || '').trim();
      if (v && t && v !== '') {
        await sel.selectOption(v);
        console.log(`   [INFO] Selected placement pool: ${t}`);
        return true;
      }
    }
    await page.waitForTimeout(1000);
  }
  console.log('   [INFO] No placement pool options available');
  return false;
}

// ── scenarios ────────────────────────────────────────────────────────────

/**
 * Scenario 1 (v4-02): Instant Clone + Single Deploy + Static IP 172.16.85.136
 */
async function scenarioInstantSingle(page) {
  console.log('\n===== SCENARIO 1: Instant Clone + Single (172.16.85.136) [v4-02] =====');

  await gotoMarketplace(page);
  console.log('   Marketplace loaded');

  const opened = await openDeployDialog(page);
  if (!opened) {
    console.log('   FAIL: Could not open deploy dialog');
    return false;
  }
  console.log('   Deploy dialog opened');

  // Switch clone mode to instant
  await dialogSelect(page, '克隆模式', 'instant');
  await page.waitForTimeout(2000);
  console.log('   Clone mode set to instant');

  // Select existing parent VM (ic-p*)
  const parentFound = await dialogSelectInstantParent(page);
  if (!parentFound) {
    console.log('   [INFO] No parent VM available, proceeding without selection');
  }

  // Select placement pool
  await dialogSelectPlacementPool(page);

  // Set static IP mode
  await dialogRadio(page, '静态 IP');
  await page.waitForTimeout(500);

  // Fill static IP fields
  await dialogFill(page, '子网掩码', NETMASK);
  await dialogFill(page, '网关', GATEWAY);
  await dialogFill(page, 'DNS', DNS);

  // Fill hostname and IP
  await dialogHostname(page, `test-ic-${'172-16-85-136'}`);
  await dialogIP(page, '172.16.85.136');

  // Fill credentials
  await dialogFill(page, 'RunAs User', RUNAS_USER);
  await dialogPassword(page, '至少 8 位', VM_PASSWORD);
  await dialogPassword(page, '再次输入', VM_PASSWORD);

  // Screenshot before submit
  await screenshot(page, 'v4-02.png');

  // Submit
  await dialogSubmit(page);
  console.log('   Submitted');

  // Wait 8 seconds for deployment to process
  await page.waitForTimeout(8000);

  // Screenshot after submit
  await screenshot(page, 'v4-02-result.png');

  // Close dialog if still open
  await dialogClose(page);

  return true;
}

/**
 * Scenario 2 (v4-04): Instant Clone + Batch x2 + Prefix test-ic + Start IP 172.16.85.150
 */
async function scenarioInstantBatch(page) {
  console.log('\n===== SCENARIO 2: Instant Clone + Batch x2 (test-ic, 172.16.85.150) [v4-04] =====');

  await gotoMarketplace(page);
  console.log('   Marketplace loaded');

  const opened = await openDeployDialog(page);
  if (!opened) {
    console.log('   FAIL: Could not open deploy dialog');
    return false;
  }
  console.log('   Deploy dialog opened');

  // Select placement pool
  await dialogSelectPlacementPool(page);

  // Switch clone mode to instant
  await dialogSelect(page, '克隆模式', 'instant');
  await page.waitForTimeout(2000);
  console.log('   Clone mode set to instant');

  // Select existing parent VM (ic-p*)
  const parentFound = await dialogSelectInstantParent(page);

  // Switch to batch mode
  await dialogRadio(page, '批量部署');
  await page.waitForTimeout(500);
  console.log('   Deploy mode set to batch');

  // Set static IP mode
  await dialogRadio(page, '静态 IP');
  await page.waitForTimeout(500);

  // Fill static IP fields
  await dialogFill(page, '子网掩码', NETMASK);
  await dialogFill(page, '网关', GATEWAY);
  await dialogFill(page, 'DNS', DNS);

  // Fill batch config: count=2, prefix=test-ic, startIP=172.16.85.150
  await dialogBatchInputs(page, 2, 'test-ic', '172.16.85.150');

  // Generate manifest
  await dialogGenerateManifest(page);
  console.log('   Manifest generated');

  // Fill credentials
  await dialogFill(page, 'RunAs User', RUNAS_USER);
  await dialogPassword(page, '至少 8 位', VM_PASSWORD);
  await dialogPassword(page, '再次输入', VM_PASSWORD);

  // Screenshot before submit
  await screenshot(page, 'v4-04.png');

  // Submit
  await dialogSubmit(page);
  console.log('   Submitted');

  // Wait 8 seconds for deployment to process
  await page.waitForTimeout(8000);

  // Screenshot after submit
  await screenshot(page, 'v4-04-result.png');

  // Close dialog if still open
  await dialogClose(page);

  return true;
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
  });

  console.log('===== E2E: Instant Clone Tests (v4) =====\n');
  console.log('--- LOGIN ---');
  await loginViaAPI(context);
  console.log('');

  const page = await context.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`   [console.error] ${msg.text()}`);
    }
  });

  // Run instant clone scenarios
  const r1 = await scenarioInstantSingle(page);
  const r2 = await scenarioInstantBatch(page);

  // Final: navigate to agent list and screenshot
  console.log('\n===== FINAL: Agent List =====');
  try {
    await page.goto(FRONTEND_URL + '/agents/list', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await screenshot(page, 'v4-agent-list-ic.png');
  } catch (err) {
    console.log(`   [WARN] Could not navigate to agent list: ${err.message}`);
  }

  await browser.close();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  E2E INSTANT CLONE TEST RESULTS');
  console.log('='.repeat(70));
  let pass = 0, fail = 0;
  for (const [name, r] of Object.entries({ scenarioInstantSingle: r1, scenarioInstantBatch: r2 })) {
    if (r) pass++; else fail++;
    console.log(`  ${name}: ${r ? 'PASS' : 'FAIL'}`);
  }
  console.log('-'.repeat(70));
  console.log(`  Passed: ${pass}/2    Failed: ${fail}/2`);
  console.log('='.repeat(70));

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
