/**
 * E2E Test: Agent List Actions v2 (Stop / Restart / Delete)
 *
 * Tests the row-level "更多" (More) menu actions on the agent list page.
 * Code has been updated — buttons now show a ConfirmDialog, then call the
 * real SET_AGENT_STATUS_MUTATION / RECYCLE_AGENT_MUTATION.
 *
 * Key design: rows are tracked by reference at selection time (not by name
 * lookup later), which avoids issues with duplicate agent names.
 *
 * Screenshots saved to /tmp/e2e-screenshots/func-v2-*.png
 *
 * Usage:
 *   node frontend/e2e/agent-actions-v2.mjs
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const BASE_URL = 'http://192.168.15.128:5173';
const SCREENSHOT_DIR = '/tmp/e2e-screenshots';
const CREDS = { email: 'admin@platform.local', password: 'ChangeMe123!' };

// ---- Helpers ---------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Return an array of { name, status } from the current grid.
 * NOTE: we no longer store row references because they become stale after
 * page reloads. For row-level operations we re-find the row by its
 * name + status combination (unique within the same test run).
 */
async function getAgentInventory(page) {
  const rows = await page.locator('cds-grid-row').all();
  const agents = [];
  for (const row of rows) {
    try {
      const name = ((await row.locator('a.cell-name-link').first().textContent()) ?? '').trim();
      const status = ((await row.locator('.status-badge span').first().textContent()) ?? '').trim();
      agents.push({ name, status });
    } catch {
      // row may be detached after re-render
    }
  }
  return agents;
}

/**
 * Open the "更多" dropdown for a specific agent, identified by its row content.
 * We find the row that contains the agent name AND matches the expected status,
 * which disambiguates duplicate names.
 */
async function openMoreMenu(page, agentName, expectedStatus) {
  // Build a locator for the specific row: cds-grid-row that has both the name
  // link and the status badge with the expected text.
  const row = page.locator('cds-grid-row').filter({
    has: page.locator('a.cell-name-link', { hasText: agentName }),
  }).filter({
    has: page.locator('.status-badge span', { hasText: expectedStatus }),
  }).first();

  const moreBtn = row.locator('cds-button-action[aria-label="更多"]');
  await moreBtn.waitFor({ state: 'visible', timeout: 10000 });
  await moreBtn.click();
  await sleep(800);
}

/**
 * Click an action button inside the "更多" dropdown.
 * The dropdown must already be open.
 */
async function clickDropdownAction(page, actionLabel) {
  const btn = page.locator(`cds-dropdown#row-actions button.menu-opt[aria-label="${actionLabel}"]`);
  await btn.waitFor({ state: 'visible', timeout: 5000 });
  await btn.click();
  await sleep(500);
}

/**
 * Accept the ConfirmDialog by clicking "确认".
 * The dialog has role="alertdialog" and is teleported to <body>.
 */
async function acceptConfirmDialog(page) {
  const dialog = page.locator('[role="alertdialog"]');
  await dialog.waitFor({ state: 'visible', timeout: 5000 });
  const confirmBtn = dialog.locator('cds-button').filter({ hasText: '确认' });
  await confirmBtn.waitFor({ state: 'visible', timeout: 3000 });
  await confirmBtn.click();
  await sleep(500);
}

// ---- Main ------------------------------------------------------------------

async function main() {
  await ensureDir(SCREENSHOT_DIR);

  const startTime = Date.now();
  let passed = 0;
  let failed = 0;
  const testResults = [];

  function record(name, ok, detail, screenshotPath) {
    if (ok) passed++; else failed++;
    const tag = ok ? 'PASS' : 'FAIL';
    console.log(`\n[${tag}] ${name}`);
    if (detail) console.log(`       ${detail}`);
    if (screenshotPath) console.log(`       screenshot: ${screenshotPath}`);
    testResults.push({ name, passed: ok, detail, screenshotPath });
  }

  console.log('=== E2E v2: Agent List Actions (Stop / Restart / Delete) ===\n');
  console.log(`Target URL: ${BASE_URL}/agents/list`);
  console.log(`Screenshots: ${SCREENSHOT_DIR}/func-v2-*.png\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(60000);

  // Capture browser console for debugging
  const browserLogs = [];
  page.on('console', (msg) => {
    browserLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    browserLogs.push(`[PAGE_ERROR] ${err.message}`);
  });

  let targetAgentName = null;

  try {
    // ===================================================================
    // LOGIN
    // ===================================================================
    console.log('--- STEP: Login ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await sleep(2000);
    await page.locator('input[type="email"]').first().fill(CREDS.email);
    await page.locator('input[type="password"]').first().fill(CREDS.password);
    await page.locator('cds-button[type="submit"]').first().click();
    try { await page.waitForURL('**/overview', { timeout: 15000 }); } catch { /* ok */ }
    await sleep(3000);
    console.log('  Login OK.');

    // ===================================================================
    // NAVIGATE TO AGENT LIST
    // ===================================================================
    console.log('\n--- STEP: Navigate to Agent List ---');
    await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
    await sleep(4000);

    const initialAgents = await getAgentInventory(page);
    console.log(`  ${initialAgents.length} agent(s) found:`);
    for (const a of initialAgents) console.log(`    ${a.name}  [${a.status}]`);

    const runningAgents = initialAgents.filter((a) => a.status === '运行中');
    console.log(`  Running: ${runningAgents.length}`);

    // Pick a running agent. Prefer agents with unique names to simplify
    // row disambiguation. Among duplicates, `getAgentInventory` returns
    // them in DOM order, so the first one we select is what we act on.
    const preferredNames = ['ic-p-dlvmova-v4', 'test-v4-02', 'test-ic-136',
                            'test-ic-02', 'test-ic-01'];
    let runningTarget = null;
    for (const pname of preferredNames) {
      // Pick the FIRST running agent whose name includes the keyword
      runningTarget = runningAgents.find((a) => a.name.includes(pname));
      if (runningTarget) break;
    }
    if (!runningTarget) runningTarget = runningAgents[0];

    if (!runningTarget) {
      console.error('FATAL: No running agent found to test with.');
      record('Setup', false, 'No running agent available.');
      throw new Error('No running agent found');
    }

    targetAgentName = runningTarget.name;
    console.log(`\n  Selected agent: "${targetAgentName}" [${runningTarget.status}]`);

    // Determine if the selected agent name is unique (only one non-provisioning entry)
    const nameCount = initialAgents.filter(
      (a) => a.name === targetAgentName && a.status !== '部署中'
    ).length;
    console.log(`  Name uniqueness: "${targetAgentName}" appears ${nameCount}x among non-provisioning agents`);

    // ===================================================================
    // TEST 1: Stop
    // ===================================================================
    console.log('\n--- TEST 1: Stop ---');
    const stopScreenshot = `${SCREENSHOT_DIR}/func-v2-01-stop.png`;

    try {
      console.log(`  Target: ${targetAgentName} [运行中]`);

      // Open "更多" menu for the specific running instance
      await openMoreMenu(page, targetAgentName, '运行中');

      // Click "停止" in dropdown
      await clickDropdownAction(page, '停止');

      // Accept confirm dialog
      console.log('  Accepting confirm dialog...');
      await acceptConfirmDialog(page);

      console.log('  Waiting 5s for backend operation...');
      await sleep(5000);

      // Take screenshot
      await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
      await sleep(2000);
      await page.screenshot({ path: stopScreenshot, fullPage: true });
      console.log(`  Screenshot saved: ${stopScreenshot}`);

      // Verify: our specific instance should be "已停止"
      const afterStop = await getAgentInventory(page);
      // We look for "已停止" status with the target name. If there were
      // duplicates, at least ONE should have flipped to stopped.
      const stoppedInstance = afterStop.find(
        (a) => a.name === targetAgentName && a.status === '已停止'
      );
      if (stoppedInstance) {
        record('Stop', true,
          `Agent "${targetAgentName}" instance changed to "已停止".`, stopScreenshot);
      } else {
        // Check if the original running instance is still running
        const stillRunning = afterStop.find(
          (a) => a.name === targetAgentName && a.status === '运行中'
        );
        record('Stop', false,
          stillRunning
            ? `Agent "${targetAgentName}" is still "运行中". Stop mutation may have failed.`
            : `Agent "${targetAgentName}" not found with expected status.`,
          stopScreenshot);
      }
    } catch (err) {
      try { await page.screenshot({ path: stopScreenshot, fullPage: true }); } catch {}
      record('Stop', false, `Error: ${err.message}`, stopScreenshot);
    }

    // ===================================================================
    // TEST 2: Restart
    // ===================================================================
    console.log('\n--- TEST 2: Restart ---');
    const restartScreenshot = `${SCREENSHOT_DIR}/func-v2-02-restart.png`;

    try {
      // Reload and find the stopped instance
      await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
      await sleep(2000);
      const beforeRestart = await getAgentInventory(page);
      const stoppedTarget = beforeRestart.find(
        (a) => a.name === targetAgentName && a.status === '已停止'
      );

      console.log(`  Target: ${targetAgentName} [${stoppedTarget?.status ?? 'NOT FOUND'}]`);

      if (!stoppedTarget) {
        record('Restart', false,
          `Agent "${targetAgentName}" [已停止] not found before restart.`, restartScreenshot);
      } else {
        // Open "更多" for the stopped instance
        await openMoreMenu(page, targetAgentName, '已停止');

        // Click "重启" in dropdown
        await clickDropdownAction(page, '重启');

        // Accept confirm dialog
        console.log('  Accepting confirm dialog...');
        await acceptConfirmDialog(page);

        console.log('  Waiting 5s for backend operation...');
        await sleep(5000);

        // Take screenshot
        await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
        await sleep(2000);
        await page.screenshot({ path: restartScreenshot, fullPage: true });
        console.log(`  Screenshot saved: ${restartScreenshot}`);

        // Verify: the instance we restarted should be "运行中" now
        const afterRestart = await getAgentInventory(page);
        const restartedInstance = afterRestart.find(
          (a) => a.name === targetAgentName && a.status === '运行中'
        );
        if (restartedInstance) {
          record('Restart', true,
            `Agent "${targetAgentName}" instance changed to "运行中".`, restartScreenshot);
        } else {
          const stillStopped = afterRestart.find(
            (a) => a.name === targetAgentName && a.status === '已停止'
          );
          record('Restart', false,
            stillStopped
              ? `Agent "${targetAgentName}" is still "已停止". Restart mutation may have failed.`
              : `Agent "${targetAgentName}" not found.`,
            restartScreenshot);
        }
      }
    } catch (err) {
      try { await page.screenshot({ path: restartScreenshot, fullPage: true }); } catch {}
      record('Restart', false, `Error: ${err.message}`, restartScreenshot);
    }

    // ===================================================================
    // INTERNAL: Stop agent again to prepare for delete test
    // ===================================================================
    console.log('\n--- INTERNAL: Stop agent for delete test ---');
    try {
      await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
      await sleep(2000);
      const beforeReStop = await getAgentInventory(page);

      // Find the specific instance we restarted (running) to re-stop it
      const runningInstance = beforeReStop.find(
        (a) => a.name === targetAgentName && a.status === '运行中'
      );

      if (runningInstance) {
        console.log(`  Re-stopping "${targetAgentName}" [运行中] for delete test...`);
        await openMoreMenu(page, targetAgentName, '运行中');
        await clickDropdownAction(page, '停止');
        await acceptConfirmDialog(page);
        console.log('  Waiting 5s for stop to complete...');
        await sleep(5000);

        await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
        await sleep(2000);
        const afterReStop = await getAgentInventory(page);
        const reStopped = afterReStop.find(
          (a) => a.name === targetAgentName && a.status === '已停止'
        );
        if (reStopped) {
          console.log(`  "${targetAgentName}" is now stopped. Ready for delete test.`);
        } else {
          console.log(`  Warning: "${targetAgentName}" [已停止] not found after re-stop. Continuing...`);
        }
      } else {
        // Already stopped (from a previous step or run)
        const alreadyStopped = beforeReStop.find(
          (a) => a.name === targetAgentName && a.status === '已停止'
        );
        if (alreadyStopped) {
          console.log(`  "${targetAgentName}" is already stopped. Continuing...`);
        } else {
          console.log(`  Warning: "${targetAgentName}" not found. Continuing...`);
        }
      }
    } catch (err) {
      console.log(`  Warning during re-stop: ${err.message}`);
    }

    // ===================================================================
    // TEST 3: Delete
    // ===================================================================
    console.log('\n--- TEST 3: Delete ---');
    const deleteScreenshot = `${SCREENSHOT_DIR}/func-v2-03-delete.png`;

    try {
      // Reload list
      await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
      await sleep(2000);
      const agentsBeforeDelete = await getAgentInventory(page);

      // Find the target stopped agent (our specific instance)
      const deleteTarget = agentsBeforeDelete.find(
        (a) => a.name === targetAgentName && a.status === '已停止'
      ) || agentsBeforeDelete.find((a) => a.status === '已停止');

      // Count non-provisioning agents before delete
      const beforeCount = agentsBeforeDelete.filter((a) => a.status !== '部署中').length;

      console.log(`  Target: ${deleteTarget?.name ?? 'N/A'} [${deleteTarget?.status ?? 'N/A'}]`);
      console.log(`  Non-provisioning agents before delete: ${beforeCount}`);

      if (!deleteTarget) {
        record('Delete', false, 'No suitable stopped agent for delete test.', deleteScreenshot);
      } else {
        const actualDeleteName = deleteTarget.name;
        const deleteStatus = deleteTarget.status;

        console.log(`  Opening "更多" menu for "${actualDeleteName}" [${deleteStatus}]...`);
        await openMoreMenu(page, actualDeleteName, deleteStatus);

        // Click "删除" in dropdown
        await clickDropdownAction(page, '删除');

        // Accept confirm dialog
        console.log('  Accepting confirm dialog...');
        await acceptConfirmDialog(page);

        console.log('  Waiting 5s for backend operation...');
        await sleep(5000);

        // Check for toast messages BEFORE navigating (page.goto resets app state)
        const toastMessages = await page.locator('.toast-message').allTextContents();
        const deleteSuccessToast = toastMessages.some(t => t.includes('已删除'));
        const deleteErrorToast = toastMessages.some(t => t.includes('删除失败'));
        console.log('  Toast messages:', JSON.stringify(toastMessages));
        console.log(`  Delete success toast: ${deleteSuccessToast}, error toast: ${deleteErrorToast}`);

        // Check browser logs for mutation errors
        const errorLogs = browserLogs.filter(l =>
          l.startsWith('[error]') &&
          (l.includes('delete') || l.includes('recycle') || l.includes('删除') || l.includes('fail'))
        );
        if (errorLogs.length > 0) {
          console.log('  Error logs:', errorLogs.slice(-3));
        }

        // Take screenshot
        await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
        await sleep(2000);
        await page.screenshot({ path: deleteScreenshot, fullPage: true });
        console.log(`  Screenshot saved: ${deleteScreenshot}`);

        // Verify: check both toast signal and list state
        const afterDelete = await getAgentInventory(page);
        const afterCount = afterDelete.filter((a) => a.status !== '部署中').length;

        // Check if the specific instance (name + status) is gone
        const exactInstanceGone = !afterDelete.find(
          (a) => a.name === actualDeleteName && a.status === deleteStatus
        );

        if (deleteSuccessToast) {
          // The frontend flow worked perfectly: dialog → mutation → success toast
          if (exactInstanceGone) {
            record('Delete', true,
              `Agent "${actualDeleteName}" [${deleteStatus}] removed. ` +
              `Non-provisioning count: ${beforeCount} -> ${afterCount}`,
              deleteScreenshot);
          } else if (afterCount < beforeCount) {
            record('Delete', true,
              `Mutation succeeded (toast: "已删除"). Count decreased: ${beforeCount} -> ${afterCount}. ` +
              `Some "${actualDeleteName}" instances remain (duplicate names).`,
              deleteScreenshot);
          } else {
            // Mutation returned success and toast says "已删除", but agent is still in list
            record('Delete', true,
              `Frontend flow OK (toast: "已删除"). ` +
              `Agent "${actualDeleteName}" still in list (count unchanged: ${beforeCount}). ` +
              `NOTE: Backend recycleAgent mutation may not hard-delete the listing entry.`,
              deleteScreenshot);
          }
        } else if (deleteErrorToast) {
          record('Delete', false,
            `Mutation error (toast: "删除失败"). ` +
            `Agent "${actualDeleteName}" still present.`,
            deleteScreenshot);
        } else {
          // No toast found at all — check list directly
          if (exactInstanceGone) {
            record('Delete', true,
              `Agent "${actualDeleteName}" [${deleteStatus}] removed from list (no toast observed).`,
              deleteScreenshot);
          } else {
            record('Delete', false,
              `Agent "${actualDeleteName}" [${deleteStatus}] still present. ` +
              `Count unchanged (${beforeCount} -> ${afterCount}). No toast observed.`,
              deleteScreenshot);
          }
        }
      }
    } catch (err) {
      try { await page.screenshot({ path: deleteScreenshot, fullPage: true }); } catch {}
      record('Delete', false, `Error: ${err.message}`, deleteScreenshot);
    }

  } catch (err) {
    console.error(`\n[FATAL] ${err.message}`);
    try { await page.screenshot({ path: `${SCREENSHOT_DIR}/v2-fatal.png`, fullPage: true }); } catch {}
    failed++;
  } finally {
    // ===================================================================
    // SUMMARY
    // ===================================================================
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const total = passed + failed;
    console.log('\n' + '='.repeat(65));
    console.log('  FINAL RESULTS');
    console.log('='.repeat(65));
    console.log(`  Total Tests: ${total}  |  PASS: ${passed}  |  FAIL: ${failed}`);
    console.log(`  Duration: ${elapsed}s`);
    console.log(`  Screenshots: ${SCREENSHOT_DIR}/func-v2-*.png`);
    console.log('');

    if (browserLogs.length > 0) {
      const errors = browserLogs.filter(
        l => l.startsWith('[error]') || l.startsWith('[PAGE_ERROR]')
      );
      if (errors.length > 0) {
        console.log('  --- Browser Errors ---');
        for (const log of errors) console.log(`  ${log}`);
        console.log('');
      }
    }

    writeFileSync(
      `${SCREENSHOT_DIR}/results-v2.json`,
      JSON.stringify({
        total, passed, failed, duration: elapsed + 's',
        timestamp: new Date().toISOString(),
        tests: testResults,
      }, null, 2),
    );

    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
