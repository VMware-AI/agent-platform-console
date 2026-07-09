/**
 * E2E Cleanup Script: Delete All Agents
 *
 * Iterates through every agent on every page of /agents/list.
 * For running agents: stop first, then delete.
 * For stopped agents: delete directly.
 * For provisioning agents: skip (cannot be stopped/deleted in normal flow).
 *
 * Usage:
 *   node frontend/e2e/cleanup-all-agents.mjs
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { writeFileSync } from 'fs';

const BASE_URL = 'http://192.168.15.128:5173';
const SCREENSHOT_DIR = '/tmp/e2e-screenshots';
const CREDS = { email: 'admin@platform.local', password: 'ChangeMe123!' };

// ---- Helpers ---------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

let screenshotCounter = 0;
async function takeScreenshot(page, label) {
  screenshotCounter++;
  const padded = String(screenshotCounter).padStart(2, '0');
  const path = `${SCREENSHOT_DIR}/cleanup-${padded}-${label}.png`;
  try {
    await page.screenshot({ path, fullPage: true });
    console.log(`  [screenshot] ${path}`);
  } catch (err) {
    console.log(`  [screenshot FAIL] ${err.message}`);
  }
  return path;
}

/**
 * Use page.evaluate to extract all agent entries from the current page.
 * Returns: Array<{ name: string, status: string, nameIndex: number }>
 */
async function extractAgentsFromPage(page) {
  return page.evaluate(() => {
    const rows = document.querySelectorAll('cds-grid-row');
    const agents = [];
    rows.forEach((row) => {
      const nameEl = row.querySelector('a.cell-name-link');
      const statusEl = row.querySelector('.status-badge span');
      if (!nameEl || !statusEl) return;
      const name = (nameEl.textContent ?? '').trim();
      const status = (statusEl.textContent ?? '').trim();
      // Infer index among visible rows (for log purposes)
      if (name && status) {
        agents.push({ name, status });
      }
    });
    return agents;
  });
}

/**
 * Check if there is a "next page" button that is enabled.
 */
async function hasNextPage(page) {
  return page.evaluate(() => {
    // 1) Look for a pagination next-page button
    const nextBtns = document.querySelectorAll(
      'cds-pagination button[aria-label="Next"], ' +
      'cds-pagination button[aria-label="下一页"], ' +
      'cds-pagination li.next a, ' +
      'button:has(svg[data-icon="chevron--right"]), ' +
      '[aria-label="Next page"], ' +
      '[aria-label="下一页"]'
    );
    for (const btn of nextBtns) {
      if (!btn.disabled) return true;
    }
    // 2) Check for page-number buttons: if there is a page > 1 that we are not on
    const pageNumbers = document.querySelectorAll(
      'cds-pagination cds-page-number, ' +
      'cds-pagination .page-number, ' +
      'cds-pagination button[data-page]'
    );
    // If more than 1 page-number button exists, there are multiple pages
    if (pageNumbers.length > 1) return true;
    return false;
  });
}

/**
 * Go to a specific page number by clicking pagination, if available.
 */
async function goToPage(page, pageNum) {
  console.log(`  Navigating to page ${pageNum}...`);
  // Try clicking the page number button
  const clicked = await page.evaluate((p) => {
    const pageBtns = document.querySelectorAll(
      'cds-pagination button, cds-pagination cds-page-number, ' +
      'cds-pagination [data-page], .pagination button'
    );
    for (const btn of pageBtns) {
      const text = (btn.textContent ?? '').trim();
      if (text === String(p) && !btn.disabled) {
        btn.click();
        return true;
      }
    }
    return false;
  }, pageNum);
  if (clicked) {
    await sleep(2000);
    await page.waitForLoadState('networkidle');
    await sleep(1000);
  }
  return clicked;
}

/**
 * Open the row actions dropdown for a given agent identified by name + status.
 */
async function openMoreMenu(page, agentName, status) {
  const row = page.locator('cds-grid-row').filter({
    has: page.locator('a.cell-name-link', { hasText: agentName }),
  }).filter({
    has: page.locator('.status-badge span', { hasText: status }),
  }).first();

  const moreBtn = row.locator('cds-button-action[aria-label="更多"]');
  await moreBtn.waitFor({ state: 'visible', timeout: 10000 });
  await moreBtn.click();
  await sleep(500);
}

/**
 * Click an action button inside the "更多" dropdown.
 */
async function clickDropdownAction(page, actionLabel) {
  const btn = page.locator(
    `cds-dropdown#row-actions button.menu-opt[aria-label="${actionLabel}"]`
  );
  await btn.waitFor({ state: 'visible', timeout: 5000 });
  await btn.click();
  await sleep(500);
}

/**
 * Accept the ConfirmDialog by clicking "确认".
 */
async function acceptConfirmDialog(page) {
  try {
    const dialog = page.locator('[role="alertdialog"]');
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    const confirmBtn = dialog.locator('cds-button').filter({ hasText: '确认' });
    await confirmBtn.waitFor({ state: 'visible', timeout: 3000 });
    await confirmBtn.click();
    await sleep(500);
    return true;
  } catch (err) {
    // Maybe it's a different dialog type
    try {
      const dialog = page.locator('[role="dialog"]');
      const visible = await dialog.first().isVisible({ timeout: 2000 });
      if (visible) {
        const okBtn = dialog.first().locator('button').filter({ hasText: /确认|确定|删除/ });
        if ((await okBtn.count()) > 0) {
          await okBtn.first().click();
          await sleep(500);
          return true;
        }
      }
    } catch {}
    return false;
  }
}

/**
 * Try to fill a type-to-confirm input if the dialog has one.
 */
async function fillConfirmInput(page, text) {
  try {
    const input = page.locator('[role="alertdialog"] input[type="text"], [role="dialog"] input[type="text"]');
    if (await input.isVisible({ timeout: 2000 })) {
      await input.fill(text);
      console.log(`  Typed "${text}" in confirmation input.`);
      await sleep(300);
      return true;
    }
  } catch {}
  return false;
}

/**
 * Get the total number of non-provisioning agents on ALL pages.
 */
async function countAllAgents(page) {
  // First check how many pages exist via evaluate
  let totalPages = await page.evaluate(() => {
    const pageBtns = document.querySelectorAll(
      'cds-pagination button, cds-pagination cds-page-number, ' +
      'cds-pagination [data-page]'
    );
    let max = 1;
    for (const btn of pageBtns) {
      const text = parseInt((btn.textContent ?? '').trim(), 10);
      if (!isNaN(text) && text > max) max = text;
    }
    return max;
  });

  // Visit each page and count agents
  const targetPage = await page.url();
  let agents = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p > 1) {
      const ok = await goToPage(page, p);
      if (!ok) break;
    }
    const pageAgents = await extractAgentsFromPage(page);
    agents = agents.concat(pageAgents);
  }

  // Go back to page 1
  await page.goto(targetPage, { waitUntil: 'networkidle' });
  await sleep(2000);

  console.log(`  Total pages: ${totalPages}`);
  const nonProvisioning = agents.filter((a) => a.status !== '部署中');
  return { agents, totalPages, nonProvisioning };
}

// ---- Main ------------------------------------------------------------------

async function main() {
  await ensureDir(SCREENSHOT_DIR);

  const startTime = Date.now();
  let stopCount = 0;
  let deleteCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  let operationCount = 0;

  console.log('=== E2E Cleanup: Delete All Agents ===\n');
  console.log(`Target URL: ${BASE_URL}/agents/list`);
  console.log(`Screenshots: ${SCREENSHOT_DIR}/cleanup-*.png\n`);

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
  let initialized = false;

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
    try {
      await page.waitForURL('**/overview', { timeout: 15000 });
    } catch {
      // maybe redirected elsewhere
    }
    await sleep(3000);
    console.log('  Login OK.');
    initialized = true;

    // ===================================================================
    // NAVIGATE TO AGENT LIST
    // ===================================================================
    console.log('\n--- STEP: Navigate to Agent List ---');
    await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
    await sleep(3000);
    await takeScreenshot(page, 'initial');

    // ===================================================================
    // MAIN LOOP: Process all agents across all pages
    // ===================================================================
    console.log('\n--- STEP: Processing all agents ---');

    // Determine total pages first, collecting agent summaries
    const { agents, totalPages } = await countAllAgents(page);

    console.log(`\n  Found ${agents.length} total agent entries across ${totalPages} pages.`);
    console.log(`  Breakdown by status:`);
    const statusCounts = {};
    for (const a of agents) {
      statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
    }
    for (const [status, count] of Object.entries(statusCounts)) {
      console.log(`    ${status}: ${count}`);
    }

    // Build ordered list: stopped first (easier to delete), then running, skip provisioning
    const orderedAgents = [];
    const provisioningAgents = [];
    for (const a of agents) {
      if (a.status === '已停止') orderedAgents.push(a);
    }
    for (const a of agents) {
      if (a.status === '运行中') orderedAgents.push(a);
    }
    for (const a of agents) {
      if (a.status !== '已停止' && a.status !== '运行中') provisioningAgents.push(a);
    }

    console.log(`\n  Processing order: ${orderedAgents.length} agents (stopped first, then running)`);
    if (provisioningAgents.length > 0) {
      console.log(`  Skipping ${provisioningAgents.length} provisioning agent(s) (cannot operate).`);
    }

    const processedNames = new Set();

    for (let idx = 0; idx < orderedAgents.length; idx++) {
      const agent = orderedAgents[idx];
      const { name, status } = agent;
      console.log(`\n  --- Agent ${idx + 1}/${orderedAgents.length}: "${name}" [${status}] ---`);

      // Reload the list for a fresh state
      await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
      await sleep(2000);

      try {
        // Step 1: If running, stop it first
        if (status === '运行中') {
          console.log(`  Stopping "${name}"...`);
          await openMoreMenu(page, name, '运行中');
          await clickDropdownAction(page, '停止');
          await acceptConfirmDialog(page);
          console.log('  Waiting 3s after stop...');
          await sleep(3000);
          stopCount++;
          operationCount++;
        }

        // Step 2: Delete (if after stop, it should now be stopped or still running)
        // Reload to reflect status change
        await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
        await sleep(2000);

        // Find current agent status (after potential stop)
        const currentAgents = await extractAgentsFromPage(page);
        const currentAgent = currentAgents.find(
          (a) => a.name === name && (a.status === '已停止' || a.status === '运行中')
        );
        const currentStatus = currentAgent ? currentAgent.status : status;

        console.log(`  Deleting "${name}" [${currentStatus}]...`);
        await openMoreMenu(page, name, currentStatus);
        await clickDropdownAction(page, '删除');

        // Accept confirm dialog
        const dialogAccepted = await acceptConfirmDialog(page);
        console.log(`  Dialog accepted: ${dialogAccepted}`);

        // Fill type-to-confirm if needed
        await fillConfirmInput(page, name);

        // If dialog didn't appear the first time (maybe it's a different flow),
        // try once more
        if (!dialogAccepted) {
          // Maybe the click happened but dialog is delayed
          await sleep(2000);
          await acceptConfirmDialog(page);
          await fillConfirmInput(page, name);
        }

        console.log('  Waiting 3s after delete...');
        await sleep(3000);
        deleteCount++;
        operationCount++;

        // Screenshot every 5 operations
        if (deleteCount % 5 === 0) {
          await takeScreenshot(page, `progress-${deleteCount}deleted`);
        }

        processedNames.add(name);

      } catch (err) {
        console.log(`  ERROR processing "${name}": ${err.message}`);
        // Take error screenshot
        try {
          const errorScreenshotPath = `${SCREENSHOT_DIR}/cleanup-${screenshotCounter + 1}-error-${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
          await page.screenshot({ path: errorScreenshotPath, fullPage: true });
          console.log(`  [screenshot] ${errorScreenshotPath}`);
          screenshotCounter++;
        } catch {}
        errorCount++;
        // Continue to next agent
      }
    }

    // ===================================================================
    // FINAL CHECK
    // ===================================================================
    console.log('\n--- STEP: Final verification ---');

    // Reload and count remaining agents
    await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
    await sleep(3000);

    // Check all pages
    const finalCount = await countAllAgents(page);
    const remainingNonProvisioning = finalCount.nonProvisioning;
    const remainingAll = finalCount.agents;

    await takeScreenshot(page, 'final');

    // ===================================================================
    // SUMMARY
    // ===================================================================
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(65));
    console.log('  CLEANUP COMPLETE');
    console.log('='.repeat(65));
    console.log(`  Stopped:       ${stopCount}`);
    console.log(`  Deleted:       ${deleteCount}`);
    console.log(`  Skipped:       ${skipCount} (provisioning/other)`);
    console.log(`  Errors:        ${errorCount}`);
    console.log(`  Operations:    ${operationCount}`);
    console.log(`  Total agents remaining: ${remainingAll.length}`);
    console.log(`    - Non-provisioning: ${remainingNonProvisioning.length}`);
    for (const a of remainingNonProvisioning) {
      console.log(`      ${a.name}  [${a.status}]`);
    }
    if (provisioningAgents.length > 0) {
      console.log(`    - Provisioning (never touched): ${provisioningAgents.length}`);
      for (const a of provisioningAgents) {
        console.log(`      ${a.name}  [${a.status}]`);
      }
    }
    console.log(`\n  Duration: ${elapsed}s`);
    console.log(`  Screenshots: ${SCREENSHOT_DIR}/cleanup-*.png`);
    console.log(`  Screenshot count: ${screenshotCounter}`);

    // Write results JSON
    writeFileSync(
      `${SCREENSHOT_DIR}/cleanup-results.json`,
      JSON.stringify({
        status: 'completed',
        stopped: stopCount,
        deleted: deleteCount,
        skipped: skipCount,
        errors: errorCount,
        operations: operationCount,
        duration: elapsed + 's',
        timestamp: new Date().toISOString(),
        remaining: {
          total: remainingAll.length,
          nonProvisioning: remainingNonProvisioning.length,
          agents: remainingNonProvisioning.map((a) => ({ name: a.name, status: a.status })),
          provisioning: provisioningAgents.map((a) => ({ name: a.name, status: a.status })),
        },
      }, null, 2),
    );

  } catch (err) {
    console.error(`\n[FATAL] ${err.message}`);
    try {
      await takeScreenshot(page, 'fatal');
    } catch {}
    errorCount++;
  } finally {
    await browser.close();
    // Exit code: 0 even if some errors (this is cleanup, not a test suite)
    process.exit(0);
  }
}

main();
