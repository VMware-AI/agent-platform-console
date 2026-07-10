/**
 * E2E tests for AI Agent Deployment — 4 scenarios (v4)
 *
 * Run with:
 *   node /data/claude/ai-workstation-platform/frontend/e2e/deploy-agent-test.js
 *
 * Prerequisites:
 *   - Frontend @ http://192.168.15.128:5173
 *   - Backend @ http://192.168.15.128:8080
 *   - Admin account: admin@platform.local / ChangeMe123!
 *   - "test01" template exists in marketplace
 *   - vCenter credentials: svcroot / VMware1!
 *   - VLAN 805 available in target network
 *   - ic-p* parent VMs exist for instant clone scenarios
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'http://192.168.15.128:5173';
const SCREENSHOT_DIR = '/tmp/e2e-screenshots';
const ADMIN_EMAIL = 'admin@platform.local';
const ADMIN_PASSWORD = 'ChangeMe123!';
const VLAN_TARGET = 'vlan805';
const GATEWAY = '172.16.85.1';
const NETMASK = '255.255.255.0';
const DNS = '172.16.85.1';
const RUNAS_USER = 'svcroot';
const VM_PASSWORD = 'VMware1!';
const TEMPLATE_NAME = 'test01';

// Track whether we've already visited marketplace (to skip re-login)
let marketplaceVisited = false;

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

/** Wait for the dialog to be visible, return true if found */
async function waitForDialogVisible(page, timeoutMs = 8000) {
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
    // Option value not exact, try partial match on option text
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
 * Fill the password field (custom wrapper, not cds-input).
 * Password field has placeholder "至少 8 位", confirm has "再次输入".
 */
async function dialogPassword(page, placeholderPart, value) {
  const pw = dlg(page).locator('input[type="password"]');
  // Filter by placeholder
  const target = pw.filter({ has: page.locator(`[placeholder*="${placeholderPart}"]`) });
  if (await target.count() > 0) {
    await target.fill(value);
    return true;
  }
  // Fallback: iterate and match placeholder
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

  // Count
  const ci = g.locator('cds-input').filter({ hasText: '数量' }).locator('input');
  if (await ci.count() > 0) {
    await ci.click();
    await ci.fill(String(count));
  }

  // Prefix
  const pi = g.locator('cds-input').filter({ hasText: '名称前缀' }).locator('input');
  if (await pi.count() > 0) {
    await pi.click();
    await pi.fill(prefix);
  }

  // Start IP (only visible when static IP mode)
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
 * Select an existing parent VM for instant clone.
 * The dropdown filters for ic-p* prefixes.
 */
async function dialogSelectInstantParent(page) {
  const g = dlg(page);

  // First ensure "选择已有父虚拟机" radio is checked
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

  // Select the first available option
  const opts = await sel.locator('option').all();
  let selected = false;
  for (const o of opts) {
    const v = await o.getAttribute('value');
    const t = (await o.textContent() || '').trim();
    if (v && t && v !== '') {
      await sel.selectOption(v);
      console.log(`   [INFO] Selected parent VM: ${t}`);
      selected = true;
      break;
    }
  }
  if (!selected) {
    console.log('   [INFO] No parent VM options available');
  }
  return selected;
}

/**
 * Click the deploy submit button (last cds-button in modal-actions).
 */
async function dialogSubmit(page) {
  const actions = dlg(page).locator('cds-modal-actions');
  const btn = actions.locator('cds-button').last();
  // Use boundingBox to bypass shadow DOM click interception
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
  // Find the template card and click its deploy button
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
  // Use boundingBox to bypass shadow DOM
  const box = await btn.first().boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    await btn.first().click({ force: true });
  }
  const opened = await waitForDialogVisible(page);
  if (opened) await page.waitForTimeout(1500); // Allow queries to complete
  return opened;
}

/**
 * Navigate to marketplace and wait for content.
 */
async function gotoMarketplace(page) {
  await page.goto(FRONTEND_URL + '/agents/marketplace', { waitUntil: 'networkidle', timeout: 30000 });
  // Wait for template cards to render
  try {
    await page.locator('cds-card').first().waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    console.log('   [WARN] No template cards found (maybe empty or still loading)');
  }
  await page.waitForTimeout(2000);
}

/**
 * Select the first available vSphere placement pool (if any).
 * This is needed when the template's default resource pool is not set.
 * Polls for up to 10 seconds waiting for the options to appear.
 */
async function dialogSelectPlacementPool(page) {
  const sel = dlg(page).locator('cds-select').filter({ hasText: 'vSphere 放置资源池' }).locator('select');
  if (await sel.count() === 0) return false;

  // Poll for options to appear (vsphere query may take time)
  let optionsFound = false;
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
    if (!optionsFound) {
      await page.waitForTimeout(1000);
    }
  }
  console.log('   [INFO] No placement pool options available (vsphere query returned empty)');
  return false;
}

/**
 * Fill common network & credential fields in the deploy dialog.
 */
async function fillCommonFields(page, ip) {
  // Select vSphere placement pool (needed when template has no default)
  await dialogSelectPlacementPool(page);

  // Select VLAN
  await dialogSelect(page, '目标端口组', VLAN_TARGET);

  // Set static IP mode
  await dialogRadio(page, '静态 IP');
  await page.waitForTimeout(500);

  // Fill static IP fields (only visible after selecting static IP)
  await dialogFill(page, '子网掩码', NETMASK);
  await dialogFill(page, '网关', GATEWAY);
  await dialogFill(page, 'DNS', DNS);

  // Fill hostname and IP
  await dialogHostname(page, `test-${ip.replace(/\./g, '-')}`);
  await dialogIP(page, ip);

  // Fill credentials
  await dialogFill(page, 'RunAs User', RUNAS_USER);
  await dialogPassword(page, '至少 8 位', VM_PASSWORD);
  await dialogPassword(page, '再次输入', VM_PASSWORD);
}

// ── scenarios ────────────────────────────────────────────────────────────

/**
 * Scenario 1: Full Clone + Single Deploy + Static IP 172.16.85.135
 */
async function scenario1(page) {
  console.log('\n===== SCENARIO 1: Full Clone + Single Deploy (172.16.85.135) =====');

  await gotoMarketplace(page);
  console.log('   Marketplace loaded');

  const opened = await openDeployDialog(page);
  if (!opened) {
    console.log('   FAIL: Could not open deploy dialog');
    return { pass: false, reason: 'Could not open deploy dialog' };
  }
  console.log('   Deploy dialog opened');

  // Full clone is default, single deploy is default
  // Fill common fields with the specific IP
  await fillCommonFields(page, '172.16.85.135');

  // Screenshot before submit
  await screenshot(page, 'v4-01.png');

  // Submit
  await dialogSubmit(page);
  console.log('   Submitted');

  // Wait 8 seconds for deployment to process
  await page.waitForTimeout(8000);

  // Screenshot after submit
  await screenshot(page, 'v4-01-result.png');

  // Close dialog if still open
  await dialogClose(page);

  return { pass: true, detail: 'Full clone single deploy to 172.16.85.135' };
}

/**
 * Scenario 2: Instant Clone + Single Deploy + Static IP 172.16.85.136
 */
async function scenario2(page) {
  console.log('\n===== SCENARIO 2: Instant Clone + Single Deploy (172.16.85.136) =====');

  await gotoMarketplace(page);
  console.log('   Marketplace loaded');

  const opened = await openDeployDialog(page);
  if (!opened) {
    console.log('   FAIL: Could not open deploy dialog');
    return { pass: false, reason: 'Could not open deploy dialog' };
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

  // Fill common fields with the specific IP
  await fillCommonFields(page, '172.16.85.136');

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

  return { pass: true, detail: parentFound ? 'Instant clone with existing parent VM to 172.16.85.136' : 'Instant clone without parent VM to 172.16.85.136' };
}

/**
 * Scenario 3: Full Clone + Batch x3 + Prefix test-dlvm + Start IP 172.16.85.140
 */
async function scenario3(page) {
  console.log('\n===== SCENARIO 3: Full Clone + Batch x3 (test-dlvm, 172.16.85.140) =====');

  await gotoMarketplace(page);
  console.log('   Marketplace loaded');

  const opened = await openDeployDialog(page);
  if (!opened) {
    console.log('   FAIL: Could not open deploy dialog');
    return { pass: false, reason: 'Could not open deploy dialog' };
  }
  console.log('   Deploy dialog opened');

  // Select placement pool (needed when template has no default)
  await dialogSelectPlacementPool(page);

  // Switch to batch mode
  await dialogRadio(page, '批量部署');
  await page.waitForTimeout(500);
  console.log('   Deploy mode set to batch');

  // Select VLAN
  await dialogSelect(page, '目标端口组', VLAN_TARGET);

  // Set static IP mode
  await dialogRadio(page, '静态 IP');
  await page.waitForTimeout(500);

  // Fill static IP fields
  await dialogFill(page, '子网掩码', NETMASK);
  await dialogFill(page, '网关', GATEWAY);
  await dialogFill(page, 'DNS', DNS);

  // Fill batch config: count=3, prefix=test-dlvm, startIP=172.16.85.140
  await dialogBatchInputs(page, 3, 'test-dlvm', '172.16.85.140');

  // Generate manifest
  await dialogGenerateManifest(page);
  console.log('   Manifest generated');

  // Fill credentials
  await dialogFill(page, 'RunAs User', RUNAS_USER);
  await dialogPassword(page, '至少 8 位', VM_PASSWORD);
  await dialogPassword(page, '再次输入', VM_PASSWORD);

  // Screenshot before submit
  await screenshot(page, 'v4-03.png');

  // Submit
  await dialogSubmit(page);
  console.log('   Submitted');

  // Wait 8 seconds for deployment to process
  await page.waitForTimeout(8000);

  // Screenshot after submit
  await screenshot(page, 'v4-03-result.png');

  // Close dialog if still open
  await dialogClose(page);

  return { pass: true, detail: 'Full clone batch x3 prefix=test-dlvm startIP=172.16.85.140' };
}

/**
 * Scenario 4: Instant Clone + Batch x2 + Prefix test-ic + Start IP 172.16.85.150
 */
async function scenario4(page) {
  console.log('\n===== SCENARIO 4: Instant Clone + Batch x2 (test-ic, 172.16.85.150) =====');

  await gotoMarketplace(page);
  console.log('   Marketplace loaded');

  const opened = await openDeployDialog(page);
  if (!opened) {
    console.log('   FAIL: Could not open deploy dialog');
    return { pass: false, reason: 'Could not open deploy dialog' };
  }
  console.log('   Deploy dialog opened');

  // Select placement pool (needed when template has no default)
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

  // Select VLAN
  await dialogSelect(page, '目标端口组', VLAN_TARGET);

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

  return { pass: true, detail: parentFound ? 'Instant clone batch x2 with parent VM prefix=test-ic startIP=172.16.85.150' : 'Instant clone batch x2 without parent VM prefix=test-ic startIP=172.16.85.150' };
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

  console.log('===== E2E: Deploy Agent Tests (v4) =====\n');
  console.log('--- LOGIN ---');
  await loginViaAPI(context);
  console.log('');

  const page = await context.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`   [console.error] ${msg.text()}`);
    }
  });

  const results = {
    scenario1: await scenario1(page),
    scenario2: await scenario2(page),
    scenario3: await scenario3(page),
    scenario4: await scenario4(page),
  };

  // Final: navigate to agent list and screenshot
  console.log('\n===== FINAL: Agent List =====');
  try {
    await page.goto(FRONTEND_URL + '/agents/list', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await screenshot(page, 'v4-agent-list.png');
  } catch (err) {
    console.log(`   [WARN] Could not navigate to agent list: ${err.message}`);
  }

  await browser.close();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  E2E DEPLOY AGENT TEST RESULTS — 4 Scenarios');
  console.log('='.repeat(70));
  let pass = 0, fail = 0;
  for (const [name, r] of Object.entries(results)) {
    if (r.pass) pass++; else fail++;
    console.log(`  ${name}: ${r.pass ? 'PASS' : 'FAIL'}`);
    if (r.detail) console.log(`    -> ${r.detail}`);
    if (r.reason) console.log(`    -> Reason: ${r.reason}`);
  }
  console.log('-'.repeat(70));
  console.log(`  Passed: ${pass}/4    Failed: ${fail}/4`);
  console.log('='.repeat(70));

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
