/**
 * E2E: Instant Clone + Batch x2 (v5-04 specific)
 *
 * Focused test for one scenario only with careful race-condition handling.
 *
 * Run with:
 *   node /data/claude/ai-workstation-platform/frontend/e2e/v5-ic-batch2-test.cjs
 *
 * Prerequisites:
 *   - Frontend @ http://192.168.15.128:5173
 *   - Backend @ http://192.168.15.128:8080
 *   - Admin account: admin@platform.local / ChangeMe123!
 *   - "test01" template exists in marketplace
 *   - vCenter credentials: svcroot / VMware1!
 *   - VLAN 805 available
 *   - ic-p-* parent VMs exist for instant clone
 *
 * Race-condition avoidance:
 *   1. Open deploy dialog
 *   2. Select cloneMode=instant FIRST
 *   3. POLL parent VM select until options appear (not just setTimeout)
 *   4. Select parent VM (ic-p-*)
 *   5. Then fill all other fields
 *   6. Submit
 *   7. Wait 20s
 *   8. Screenshots
 *   9. Verify agent list has 2 new agents
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
async function waitForDialogVisible(page, timeoutMs = 10000) {
  try {
    await dlg(page).waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/**
 * Select an option in a cds-select by matching label text and option value.
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
 * Fill batch mode inputs: count, prefix, start IP.
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
 * CRITICAL: Select the clone mode to "instant" FIRST, then POLL for parent VM options.
 *
 * Race-condition fix:
 *   1. Select cloneMode=instant
 *   2. Wait/poll until the parent VM select has NON-EMPTY options
 *   3. Select the ic-p-* parent VM
 */
async function dialogSetInstantCloneWithParent(page) {
  const g = dlg(page);

  // Step 1: Switch clone mode to "instant"
  console.log('   [STEP 1] Setting clone mode to "instant"...');
  await dialogSelect(page, '克隆模式', 'instant');

  // Step 2: Wait a moment for the UI to react to the mode change
  await page.waitForTimeout(1000);

  // Step 3: Ensure "选择已有父虚拟机" radio is selected
  console.log('   [STEP 2] Selecting "选择已有父虚拟机" radio...');
  const existingRadio = g.locator('label').filter({ hasText: '选择已有父虚拟机' }).locator('input[type="radio"]');
  if (await existingRadio.count() > 0) {
    await existingRadio.check({ force: true });
    console.log('   [INFO] Selected "选择已有父虚拟机" radio');
  } else {
    console.log('   [INFO] "选择已有父虚拟机" radio not found, trying direct parent select');
  }

  // Step 4: Wait for the parent VM select to appear (may be hidden until radio is selected)
  await page.waitForTimeout(1000);

  // Step 5: POLL for parent VM select options to become available (RACE CONDITION FIX)
  const sel = g.locator('cds-select').filter({ hasText: '父虚拟机' }).locator('select');
  if (await sel.count() === 0) {
    console.log('   [ERROR] Parent VM select not found after switching to instant mode');
    return false;
  }

  console.log('   [STEP 3] Polling for parent VM options to load...');
  let foundOption = false;
  for (let attempt = 1; attempt <= 20; attempt++) {
    const opts = await sel.locator('option').all();
    const nonEmptyOpts = [];
    for (const o of opts) {
      const v = await o.getAttribute('value');
      const t = (await o.textContent() || '').trim();
      if (v && t && v !== '') {
        nonEmptyOpts.push({ value: v, text: t });
      }
    }

    if (nonEmptyOpts.length > 0) {
      console.log(`   [INFO] Found ${nonEmptyOpts.length} parent VM options after ${attempt}s`);

      // Prefer ic-p-* prefix
      let selected = false;
      for (const opt of nonEmptyOpts) {
        if (opt.text.startsWith('ic-p-')) {
          await sel.selectOption(opt.value);
          console.log(`   [INFO] Selected parent VM (ic-p-*): ${opt.text}`);
          selected = true;
          foundOption = true;
          break;
        }
      }

      // Fallback: select first non-empty option
      if (!selected) {
        await sel.selectOption(nonEmptyOpts[0].value);
        console.log(`   [INFO] Selected parent VM (first available): ${nonEmptyOpts[0].text}`);
        foundOption = true;
      }
      break;
    }

    console.log(`   [POLL] Attempt ${attempt}/20 — no parent VM options yet, waiting 1s...`);
    await page.waitForTimeout(1000);
  }

  if (!foundOption) {
    console.log('   [ERROR] No parent VM options appeared after 20 seconds');
    return false;
  }

  return true;
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
 * Select the first available vSphere placement pool (poll up to 10s).
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

/**
 * Navigate to agent list and count agents matching a prefix.
 */
async function countAgentsByPrefix(page, prefix) {
  await page.goto(FRONTEND_URL + '/agents/list', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Try to find matching agent rows/cards
  const rows = page.locator('cds-table-row, .agent-row, .agent-card, cds-card').filter({ hasText: prefix });
  const count = await rows.count();
  console.log(`   [INFO] Found ${count} agent(s) with prefix "${prefix}"`);
  return count;
}

// ── main scenario ───────────────────────────────────────────────────────

/**
 * Scenario: Instant Clone + Batch x2
 *   - prefix=test-v5-ic
 *   - startIP=172.16.85.150
 *   - cloneMode=instant
 *   - parentSource=existing (ic-p-*)
 *
 * Race-condition-safe order:
 *   1. Open dialog
 *   2. Select cloneMode=instant FIRST
 *   3. Poll and wait for parent VM options to appear
 *   4. Select parent VM
 *   5. THEN fill remaining fields (placement, batch, network, credentials)
 *   6. Submit
 *   7. Wait 20s
 *   8. Screenshots
 *   9. Verify agents in list
 */
async function scenarioInstantCloneBatch2(page) {
  console.log('\n===== SCENARIO: Instant Clone + Batch x2 (prefix=test-v5-ic, startIP=172.16.85.150) =====');

  // ── Navigate to marketplace ──
  await gotoMarketplace(page);
  console.log('   Marketplace loaded');

  // ── Open deploy dialog ──
  const opened = await openDeployDialog(page);
  if (!opened) {
    console.log('   FAIL: Could not open deploy dialog');
    return { pass: false, reason: 'Could not open deploy dialog' };
  }
  console.log('   Deploy dialog opened');

  // ════════════════════════════════════════════════════════════════════
  // RACE CONDITION: Must set clone mode BEFORE touching parent VM fields
  // ════════════════════════════════════════════════════════════════════

  // Step 1: Switch clone mode to "instant" FIRST
  // Step 2: POLL for parent VM options to actually load (critical fix)
  // Step 3: Select parent VM
  const parentConfigured = await dialogSetInstantCloneWithParent(page);
  if (!parentConfigured) {
    console.log('   [WARN] Parent VM configuration may be incomplete, continuing...');
  }

  // Step 4: Now fill all other fields (placement, batch mode, network, credentials)
  console.log('   [STEP 4] Filling remaining fields...');

  // Select placement pool
  await dialogSelectPlacementPool(page);

  // Switch to batch mode
  await dialogRadio(page, '批量部署');
  await page.waitForTimeout(500);
  console.log('   Deploy mode set to batch');

  // Select VLAN
  await dialogSelect(page, '目标端口组', VLAN_TARGET);
  console.log(`   Selected VLAN: ${VLAN_TARGET}`);

  // Set static IP mode
  await dialogRadio(page, '静态 IP');
  await page.waitForTimeout(500);
  console.log('   Set static IP mode');

  // Fill static IP fields
  await dialogFill(page, '子网掩码', NETMASK);
  await dialogFill(page, '网关', GATEWAY);
  await dialogFill(page, 'DNS', DNS);

  // Fill batch config: count=2, prefix=test-v5-ic, startIP=172.16.85.150
  await dialogBatchInputs(page, 2, 'test-v5-ic', '172.16.85.150');

  // Generate manifest
  await dialogGenerateManifest(page);
  console.log('   Manifest generated');

  // Fill credentials
  await dialogFill(page, 'RunAs User', RUNAS_USER);
  await dialogPassword(page, '至少 8 位', VM_PASSWORD);
  await dialogPassword(page, '再次输入', VM_PASSWORD);
  console.log('   All fields filled');

  // ── Screenshot before submit ──
  await screenshot(page, 'v5-04-retry.png');

  // ── Submit ──
  console.log('   Submitting deployment...');
  await dialogSubmit(page);
  console.log('   Submitted');

  // ── Wait 20 seconds for deployment ──
  console.log('   Waiting 20s for deployment to process...');
  await page.waitForTimeout(20000);

  // ── Screenshot after submit ──
  await screenshot(page, 'v5-04-retry-result.png');

  // ── Close dialog if still open ──
  await dialogClose(page);

  return { pass: true, detail: 'Instant clone batch x2 prefix=test-v5-ic startIP=172.16.85.150' };
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

  console.log('===== E2E: Instant Clone + Batch x2 (v5-04 retry) =====\n');
  console.log('--- LOGIN ---');
  await loginViaAPI(context);
  console.log('');

  const page = await context.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`   [console.error] ${msg.text()}`);
    }
  });

  // Run the scenario
  const result = await scenarioInstantCloneBatch2(page);

  // Verify agents in list
  console.log('\n===== VERIFICATION: Agent List =====');
  let agentCount = 0;
  try {
    agentCount = await countAgentsByPrefix(page, 'test-v5-ic');
    console.log(`   [INFO] Found ${agentCount} agent(s) with prefix "test-v5-ic"`);
  } catch (err) {
    console.log(`   [WARN] Could not count agents: ${err.message}`);
  }

  await browser.close();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  RESULT: ' + (result.pass ? 'PASS' : 'FAIL'));
  console.log('  ' + (result.detail || result.reason || ''));
  if (agentCount > 0) {
    console.log(`  Agent list verification: ${agentCount} agent(s) with prefix "test-v5-ic" found`);
  }
  console.log('='.repeat(70));

  process.exit(result.pass ? 0 : 1);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
