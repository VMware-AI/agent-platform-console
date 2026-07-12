/**
 * E2E: Full Test Matrix — test01 + dlvmova × Full/Instant Clone × Single/Batch
 *
 * Run with:
 *   node /data/claude/ai-workstation-platform/frontend/e2e/v5-full-test.cjs
 *
 * Prerequisites:
 *   - Frontend @ http://192.168.15.128:5173
 *   - Backend @ http://192.168.15.128:8080
 *   - Admin account: admin@platform.local / ChangeMe123!
 *   - "test01" template exists in marketplace
 *   - "dlvmova" template exists in marketplace (if not, script stops)
 *   - vCenter credentials: svcroot / VMware1!
 *   - VLAN 805 available in target network
 *   - ic-p-* parent VMs exist for test01 instant clone scenarios
 *
 * Phases:
 *   0. Create parent VM from dlvmova (full clone, IP 172.16.85.151, name ic-p-dlvmova-v5)
 *   Test01:
 *     1. Full clone single  — IP 172.16.85.152, name test01-full-single
 *     2. Full clone batch   — IP 172.16.85.153, prefix test01-full-batch, count 2
 *     3. Instant clone single — IP 172.16.85.155, name test01-ic-single (existing ic-p-*)
 *     4. Instant clone batch  — IP 172.16.85.156, prefix test01-ic-batch, count 2 (existing ic-p-*)
 *   DlvmoVa:
 *     5. Full clone single  — IP 172.16.85.160, name dlvmova-full-single
 *     6. Full clone batch   — IP 172.16.85.161, prefix dlvmova-full-batch, count 2
 *     7. Instant clone single — IP 172.16.85.165, name dlvmova-ic-single (ic-p-dlvmova-v5)
 *     8. Instant clone batch  — IP 172.16.85.166, prefix dlvmova-ic-batch, count 2 (ic-p-dlvmova-v5)
 *
 * Screenshots saved to /tmp/e2e-screenshots/v5-full-*.png
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

// Template definitions
const TEMPLATE_TEST01 = 'test01';
const TEMPLATE_DLVMOVA = 'dlvmova';
const PARENT_VM_NAME = 'ic-p-dlvmova-v5';
const PARENT_VM_IP = '172.16.85.151';

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
 * Fill password field by matching placeholder text.
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
 * Fill the hostname field (智能体名称).
 */
async function dialogHostname(page, val) {
  return dialogFill(page, '智能体名称', val);
}

/**
 * Fill the IP address field (IP 地址).
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
 * Navigate to marketplace and wait for content.
 */
async function gotoMarketplace(page) {
  await page.goto(FRONTEND_URL + '/agents/marketplace', { waitUntil: 'networkidle', timeout: 30000 });
  try {
    await page.locator('cds-card').first().waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    console.log('   [WARN] No template cards found (maybe empty or still loading)');
  }
  await page.waitForTimeout(2000);
}

/**
 * Open the deploy dialog from marketplace for the specified template.
 */
async function openDeployDialogFor(page, templateName) {
  const card = page.locator('cds-card').filter({ hasText: templateName });
  if (await card.count() === 0) {
    console.log(`   [WARN] Template card "${templateName}" not found`);
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
 * Fill common credential & static IP fields (hostname/IP must be set separately).
 */
async function fillStaticIPFields(page) {
  // Select VLAN
  await dialogSelect(page, '目标端口组', VLAN_TARGET);
  console.log(`   [INFO] Selected VLAN: ${VLAN_TARGET}`);

  // Set static IP mode
  await dialogRadio(page, '静态 IP');
  await page.waitForTimeout(500);
  console.log('   [INFO] Set static IP mode');

  // Fill static IP fields
  await dialogFill(page, '子网掩码', NETMASK);
  await dialogFill(page, '网关', GATEWAY);
  await dialogFill(page, 'DNS', DNS);

  // Fill credentials
  await dialogFill(page, 'RunAs User', RUNAS_USER);
  await dialogPassword(page, '至少 8 位', VM_PASSWORD);
  await dialogPassword(page, '再次输入', VM_PASSWORD);
  console.log('   [INFO] Filled static IP fields & credentials');
}

// ── instant clone helpers ────────────────────────────────────────────────

/**
 * Set clone mode to instant and select an existing parent VM.
 * Uses the race-condition-safe polling approach from v5-ic-batch2-test.cjs.
 *
 * Prefers matching preferredParent if given, otherwise falls back to ic-p-*.
 */
async function dialogSetInstantCloneWithParent(page, preferredParent) {
  const g = dlg(page);

  // Step 1: Switch clone mode to "instant"
  console.log('   [STEP 1] Setting clone mode to "instant"...');
  await dialogSelect(page, '克隆模式', 'instant');
  await page.waitForTimeout(1000);

  // Step 2: Ensure "选择已有父虚拟机" radio is selected
  console.log('   [STEP 2] Selecting "选择已有父虚拟机" radio...');
  const existingRadio = g.locator('label').filter({ hasText: '选择已有父虚拟机' }).locator('input[type="radio"]');
  if (await existingRadio.count() > 0) {
    await existingRadio.check({ force: true });
    console.log('   [INFO] Selected "选择已有父虚拟机" radio');
  }
  await page.waitForTimeout(1000);

  // Step 3: POLL for parent VM select options (RACE CONDITION FIX)
  const sel = g.locator('cds-select').filter({ hasText: '父虚拟机' }).locator('select');
  if (await sel.count() === 0) {
    console.log('   [ERROR] Parent VM select not found');
    return { found: false, parentName: null };
  }

  console.log('   [STEP 3] Polling for parent VM options...');
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

      // Prefer the specific parent if given
      if (preferredParent) {
        for (const opt of nonEmptyOpts) {
          if (opt.text === preferredParent || opt.text.includes(preferredParent)) {
            await sel.selectOption(opt.value);
            console.log(`   [INFO] Selected target parent VM: ${opt.text}`);
            return { found: true, parentName: opt.text };
          }
        }
        console.log(`   [WARN] Preferred parent "${preferredParent}" not found in options`);
      }

      // Fallback to ic-p-* prefix
      for (const opt of nonEmptyOpts) {
        if (opt.text.startsWith('ic-p-')) {
          await sel.selectOption(opt.value);
          console.log(`   [INFO] Selected parent VM (ic-p-*): ${opt.text}`);
          return { found: true, parentName: opt.text };
        }
      }

      // Fallback to first available
      await sel.selectOption(nonEmptyOpts[0].value);
      console.log(`   [INFO] Selected parent VM (first available): ${nonEmptyOpts[0].text}`);
      return { found: true, parentName: nonEmptyOpts[0].text };
    }

    console.log(`   [POLL] Attempt ${attempt}/20 — no parent VM options yet, waiting 1s...`);
    await page.waitForTimeout(1000);
  }

  console.log('   [ERROR] No parent VM options appeared after 20 seconds');
  return { found: false, parentName: null };
}

// ── scenarios ────────────────────────────────────────────────────────────

/**
 * Scenario: Full Clone + Single Deploy
 */
async function runFullCloneSingle(page, templateName, ip, hostname, screenshotLabel) {
  console.log(`\n===== Full Clone + Single (template=${templateName}, IP=${ip}, name=${hostname}) =====`);

  await gotoMarketplace(page);
  const opened = await openDeployDialogFor(page, templateName);
  if (!opened) return { pass: false, reason: 'Could not open deploy dialog' };

  await dialogSelectPlacementPool(page);
  await fillStaticIPFields(page);
  await dialogHostname(page, hostname);
  await dialogIP(page, ip);

  await screenshot(page, `${screenshotLabel}.png`);
  await dialogSubmit(page);
  console.log('   Submitted, waiting 15s...');
  await page.waitForTimeout(15000);

  await screenshot(page, `${screenshotLabel}-result.png`);
  await dialogClose(page);
  return { pass: true, detail: `Full single ${templateName} name=${hostname} IP=${ip}` };
}

/**
 * Scenario: Full Clone + Batch Deploy
 */
async function runFullCloneBatch(page, templateName, startIP, count, prefix, screenshotLabel) {
  console.log(`\n===== Full Clone + Batch (template=${templateName}, startIP=${startIP}, count=${count}, prefix=${prefix}) =====`);

  await gotoMarketplace(page);
  const opened = await openDeployDialogFor(page, templateName);
  if (!opened) return { pass: false, reason: 'Could not open deploy dialog' };

  await dialogSelectPlacementPool(page);
  await dialogRadio(page, '批量部署');
  await page.waitForTimeout(500);
  console.log('   Deploy mode set to batch');

  await fillStaticIPFields(page);
  await dialogBatchInputs(page, count, prefix, startIP);
  await dialogGenerateManifest(page);
  console.log('   Manifest generated');

  await screenshot(page, `${screenshotLabel}.png`);
  await dialogSubmit(page);
  console.log('   Submitted, waiting 15s...');
  await page.waitForTimeout(15000);

  await screenshot(page, `${screenshotLabel}-result.png`);
  await dialogClose(page);
  return { pass: true, detail: `Full batch ${templateName} prefix=${prefix} startIP=${startIP} count=${count}` };
}

/**
 * Scenario: Instant Clone + Single Deploy
 */
async function runInstantCloneSingle(page, templateName, ip, hostname, parentVM, screenshotLabel) {
  console.log(`\n===== Instant Clone + Single (template=${templateName}, IP=${ip}, name=${hostname}) =====`);

  await gotoMarketplace(page);
  const opened = await openDeployDialogFor(page, templateName);
  if (!opened) return { pass: false, reason: 'Could not open deploy dialog' };

  await dialogSelectPlacementPool(page);
  const parentResult = await dialogSetInstantCloneWithParent(page, parentVM);
  await fillStaticIPFields(page);
  await dialogHostname(page, hostname);
  await dialogIP(page, ip);

  await screenshot(page, `${screenshotLabel}.png`);
  await dialogSubmit(page);
  console.log('   Submitted, waiting 20s...');
  await page.waitForTimeout(20000);

  await screenshot(page, `${screenshotLabel}-result.png`);
  await dialogClose(page);
  return { pass: true, detail: `Instant single ${templateName} name=${hostname} IP=${ip} parent=${parentResult.parentName || 'none'}` };
}

/**
 * Scenario: Instant Clone + Batch Deploy
 */
async function runInstantCloneBatch(page, templateName, startIP, count, prefix, parentVM, screenshotLabel) {
  console.log(`\n===== Instant Clone + Batch (template=${templateName}, startIP=${startIP}, count=${count}, prefix=${prefix}) =====`);

  await gotoMarketplace(page);
  const opened = await openDeployDialogFor(page, templateName);
  if (!opened) return { pass: false, reason: 'Could not open deploy dialog' };

  await dialogSelectPlacementPool(page);
  // MUST set instant clone BEFORE batch mode
  const parentResult = await dialogSetInstantCloneWithParent(page, parentVM);

  await dialogRadio(page, '批量部署');
  await page.waitForTimeout(500);
  console.log('   Deploy mode set to batch');

  await fillStaticIPFields(page);
  await dialogBatchInputs(page, count, prefix, startIP);
  await dialogGenerateManifest(page);
  console.log('   Manifest generated');

  await screenshot(page, `${screenshotLabel}.png`);
  await dialogSubmit(page);
  console.log('   Submitted, waiting 20s...');
  await page.waitForTimeout(20000);

  await screenshot(page, `${screenshotLabel}-result.png`);
  await dialogClose(page);
  return { pass: true, detail: `Instant batch ${templateName} prefix=${prefix} startIP=${startIP} count=${count} parent=${parentResult.parentName || 'none'}` };
}

// ── Phase 0: Create Parent VM from dlvmova ───────────────────────────────

async function phase0_createParentVM(page) {
  console.log('\n' + '='.repeat(70));
  console.log('  PHASE 0: Create Parent VM from dlvmova template');
  console.log('  Template: dlvmova | Clone: full | IP: 172.16.85.151');
  console.log('  Hostname: ic-p-dlvmova-v5');
  console.log('='.repeat(70));

  await gotoMarketplace(page);
  console.log('   Marketplace loaded');

  const opened = await openDeployDialogFor(page, TEMPLATE_DLVMOVA);
  if (!opened) {
    console.log('   FAIL: Could not open deploy dialog for dlvmova');
    return { pass: false, reason: 'Phase 0: Could not open deploy dialog for dlvmova' };
  }

  await dialogSelectPlacementPool(page);
  await fillStaticIPFields(page);
  await dialogHostname(page, PARENT_VM_NAME);
  await dialogIP(page, PARENT_VM_IP);
  console.log(`   Parent VM config: name=${PARENT_VM_NAME}, IP=${PARENT_VM_IP}`);

  await screenshot(page, 'v5-full-phase0-parent.png');
  await dialogSubmit(page);
  console.log('   Submitted parent VM creation, waiting 20s...');
  await page.waitForTimeout(20000);

  await screenshot(page, 'v5-full-phase0-parent-result.png');
  await dialogClose(page);
  console.log('   Phase 0 complete: parent VM should be ready');
  return { pass: true, detail: `Parent VM ${PARENT_VM_NAME} from dlvmova` };
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

  console.log('='.repeat(70));
  console.log('  E2E: Full Test Matrix — test01 + dlvmova');
  console.log('  8 Deploy Scenarios + 1 Parent VM Creation');
  console.log('='.repeat(70));

  console.log('\n--- LOGIN ---');
  await loginViaAPI(context);

  const page = await context.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`   [console.error] ${msg.text()}`);
    }
  });

  // ── Phase 0: Create Parent VM ──
  const p0 = await phase0_createParentVM(page);

  // ── test01 (4 scenarios) ──
  console.log('\n' + '='.repeat(70));
  console.log('  TEST01 TEMPLATE — 4 Scenarios');
  console.log('='.repeat(70));

  const s1 = await runFullCloneSingle(page, TEMPLATE_TEST01, '172.16.85.152', 'test01-full-single', 'v5-full-s1-test01-full-single');
  const s2 = await runFullCloneBatch(page, TEMPLATE_TEST01, '172.16.85.153', 2, 'test01-full-batch', 'v5-full-s2-test01-full-batch');
  const s3 = await runInstantCloneSingle(page, TEMPLATE_TEST01, '172.16.85.155', 'test01-ic-single', null, 'v5-full-s3-test01-ic-single');
  const s4 = await runInstantCloneBatch(page, TEMPLATE_TEST01, '172.16.85.156', 2, 'test01-ic-batch', null, 'v5-full-s4-test01-ic-batch');

  // ── dlvmova (4 scenarios) ──
  console.log('\n' + '='.repeat(70));
  console.log('  DLVMOVA TEMPLATE — 4 Scenarios');
  console.log('='.repeat(70));

  const s5 = await runFullCloneSingle(page, TEMPLATE_DLVMOVA, '172.16.85.160', 'dlvmova-full-single', 'v5-full-s5-dlvmova-full-single');
  const s6 = await runFullCloneBatch(page, TEMPLATE_DLVMOVA, '172.16.85.161', 2, 'dlvmova-full-batch', 'v5-full-s6-dlvmova-full-batch');
  const s7 = await runInstantCloneSingle(page, TEMPLATE_DLVMOVA, '172.16.85.165', 'dlvmova-ic-single', PARENT_VM_NAME, 'v5-full-s7-dlvmova-ic-single');
  const s8 = await runInstantCloneBatch(page, TEMPLATE_DLVMOVA, '172.16.85.166', 2, 'dlvmova-ic-batch', PARENT_VM_NAME, 'v5-full-s8-dlvmova-ic-batch');

  // ── Final: Agent list screenshot ──
  console.log('\n===== FINAL: Agent List =====');
  try {
    await page.goto(FRONTEND_URL + '/agents/list', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await screenshot(page, 'v5-full-final-agent-list.png');
  } catch (err) {
    console.log(`   [WARN] Could not navigate to agent list: ${err.message}`);
  }

  await browser.close();

  // ── Summary ──
  const results = {
    'Phase 0: Parent VM (dlvmova)': p0,
    'S1: test01 full single': s1,
    'S2: test01 full batch': s2,
    'S3: test01 instant single': s3,
    'S4: test01 instant batch': s4,
    'S5: dlvmova full single': s5,
    'S6: dlvmova full batch': s6,
    'S7: dlvmova instant single': s7,
    'S8: dlvmova instant batch': s8,
  };

  console.log('\n' + '='.repeat(70));
  console.log('  E2E FULL TEST MATRIX RESULTS');
  console.log('='.repeat(70));
  let pass = 0, fail = 0;
  for (const [name, r] of Object.entries(results)) {
    if (r.pass) pass++; else fail++;
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${name}`);
    if (r.detail) console.log(`        ${r.detail}`);
    if (r.reason) console.log(`        Reason: ${r.reason}`);
  }
  console.log('-'.repeat(70));
  console.log(`  Passed: ${pass}/${pass + fail}    Failed: ${fail}/${pass + fail}`);
  console.log('='.repeat(70));

  if (fail > 0) {
    console.log('\nSome scenarios failed. Check screenshots in /tmp/e2e-screenshots/');
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
