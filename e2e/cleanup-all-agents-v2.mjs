/**
 * E2E Cleanup Script v2: Delete All Agents via Direct GraphQL Calls
 *
 * Strategy:
 * 1. Login and navigate to /agents/list
 * 2. Use page.evaluate to get agent IDs from Apollo cache
 * 3. Call the recycleAgent mutation directly via fetch (bypassing UI)
 * 4. Verify results
 *
 * Why v2: The UI row actions are wired to real mutations but the backend
 * recycleAgent might not hard-delete. This script hits the API directly.
 *
 * Usage:
 *   node frontend/e2e/cleanup-all-agents-v2.mjs
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const BASE_URL = 'http://192.168.15.128:5173';
const SCREENSHOT_DIR = '/tmp/e2e-screenshots';
const CREDS = { email: 'admin@platform.local', password: 'ChangeMe123!' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

let screenshotCounter = 0;
async function takeScreenshot(page, label) {
  screenshotCounter++;
  const padded = String(screenshotCounter).padStart(2, '0');
  const path = `${SCREENSHOT_DIR}/cleanup-v2-${padded}-${label}.png`;
  try {
    await page.screenshot({ path, fullPage: true });
    console.log(`  [screenshot] ${path}`);
  } catch {}
  return path;
}

/**
 * Use page.evaluate to extract agent data from the Apollo cache.
 */
async function getApolloAgentData(page) {
  return page.evaluate(() => {
    try {
      // Try to get Apollo client from window.__APOLLO_CLIENT__ (devtools)
      // or from the Vue app
      const appEl = document.querySelector('#app');
      const vueApp = appEl?.__vue_app__;
      let apolloClient = null;

      if (vueApp) {
        // Walk the provides for ApolloClient
        for (const key of Object.getOwnPropertySymbols(vueApp.provides)) {
          const val = vueApp.provides[key];
          if (val && typeof val === 'object' && val.query && val.mutate) {
            apolloClient = val;
            break;
          }
        }
      }

      if (!apolloClient) {
        // Try window.__APOLLO_CLIENT__
        apolloClient = window.__APOLLO_CLIENT__;
      }

      if (apolloClient) {
        // Read the cache
        const cache = apolloClient.cache;
        const data = cache.extract ? cache.extract() : {};
        return { found: true, cacheData: data };
      }

      return { found: false, cacheData: null };
    } catch (err) {
      return { found: false, error: err.message, cacheData: null };
    }
  });
}

/**
 * Extract agent info directly from the DOM rows.
 */
async function extractAgentsFromDOM(page) {
  return page.evaluate(() => {
    const rows = document.querySelectorAll('cds-grid-row');
    const agents = [];
    rows.forEach((row) => {
      const nameEl = row.querySelector('a.cell-name-link');
      const statusEl = row.querySelector('.status-badge span');
      // Try to find agent ID in data attributes or hidden fields
      const idEl = row.querySelector('[data-agent-id]');
      const agentId = idEl ? idEl.getAttribute('data-agent-id') : null;
      const name = nameEl ? (nameEl.textContent ?? '').trim() : '';
      const status = statusEl ? (statusEl.textContent ?? '').trim() : '';
      if (name && status) {
        agents.push({ name, status, agentId });
      }
    });
    return agents;
  });
}

/**
 * Directly call the recycleAgent mutation via fetch.
 */
async function callRecycleMutation(page, agentId) {
  return page.evaluate(async (id) => {
    const mutation = `
      mutation RecycleAgent($input: RecycleAgentInput!) {
        recycleAgent(input: $input) {
          id
          status
          updatedAt
        }
      }
    `;
    const variables = {
      input: { agentId: id, confirm: true }
    };

    try {
      const response = await fetch('/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          query: mutation,
          variables,
        }),
      });
      const data = await response.json();
      return { ok: true, status: response.status, data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, agentId);
}

/**
 * Directly call setAgentStatus mutation via fetch.
 */
async function callStopMutation(page, agentId) {
  return page.evaluate(async (id) => {
    const mutation = `
      mutation SetAgentStatus($id: ID!, $status: AgentStatus!) {
        setAgentStatus(id: $id, status: $status) {
          id
          status
          updatedAt
        }
      }
    `;
    const variables = { id, status: 'stopped' };

    try {
      const response = await fetch('/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          query: mutation,
          variables,
        }),
      });
      const data = await response.json();
      return { ok: true, status: response.status, data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, agentId);
}

/**
 * Get all agent IDs from Apollo cache by reading the AGENTS_QUERY cached data.
 */
async function getAgentIdsFromCache(page) {
  return page.evaluate(() => {
    try {
      // Method 1: Look for __APOLLO_CLIENT__
      const apolloClient = window.__APOLLO_CLIENT__;
      if (apolloClient && apolloClient.cache) {
        const cacheData = apolloClient.cache.extract();
        const agentIds = [];

        // Walk all ROOT_QUERY entries
        for (const [key, value] of Object.entries(cacheData)) {
          if (key.startsWith('ROOT_QUERY') && value) {
            for (const [field, fieldValue] of Object.entries(value)) {
              if (field.startsWith('agents')) {
                // Found the agents query result
                if (fieldValue && typeof fieldValue === 'object') {
                  const nodes = fieldValue.nodes || [];
                  for (const node of nodes) {
                    if (node && typeof node === 'object' && node.__ref) {
                      const ref = node.__ref;
                      const refData = cacheData[ref];
                      if (refData) {
                        agentIds.push({
                          id: refData.id || ref.replace(/^Agent:/, ''),
                          name: refData.name,
                          status: refData.status,
                          __ref: ref,
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }

        if (agentIds.length > 0) {
          return { found: true, method: 'apollo_cache', agents: agentIds };
        }
      }

      // Method 2: Walk Vue app provides
      const appEl = document.querySelector('#app');
      const vueApp = appEl?.__vue_app__;
      if (vueApp) {
        for (const key of Object.getOwnPropertySymbols(vueApp.provides)) {
          const val = vueApp.provides[key];
          if (val && typeof val === 'object' && val.cache && val.cache.extract) {
            const cacheData = val.cache.extract();
            const agentIds = [];
            for (const [refKey, refValue] of Object.entries(cacheData)) {
              if (refKey.startsWith('Agent:') || refKey.includes('Agent')) {
                agentIds.push({
                  id: refValue.id || refKey.replace(/^Agent:/, ''),
                  name: refValue.name,
                  status: refValue.status,
                  __ref: refKey,
                });
              }
            }
            if (agentIds.length > 0) {
              return { found: true, method: 'vue_provides', agents: agentIds };
            }
          }
        }
      }

      // Method 3: Look for __APOLLO_DEVTOOLS__
      if (window.__APOLLO_DEVTOOLS__) {
        return { found: true, method: 'devtools', notice: 'devtools available but not extracting' };
      }

      return { found: false, method: 'none' };
    } catch (err) {
      return { found: false, error: err.message };
    }
  });
}

/**
 * Get agent IDs from the list page by looking at row data attributes or
 * by extracting them from the AGENTS_QUERY cache.
 */
async function getAgentIdsFromUI(page) {
  return page.evaluate(() => {
    const rows = document.querySelectorAll('cds-grid-row');
    const agents = [];
    rows.forEach((row) => {
      const nameEl = row.querySelector('a.cell-name-link');
      const statusEl = row.querySelector('.status-badge span');
      const name = nameEl ? (nameEl.textContent ?? '').trim() : '';
      const status = statusEl ? (statusEl.textContent ?? '').trim() : '';
      // Check for agent-id in various data attributes
      const idAttr = row.getAttribute('data-agent-id')
        || row.getAttribute('data-id')
        || row.querySelector('[data-agent-id]')?.getAttribute('data-agent-id')
        || '';
      if (name && status) {
        agents.push({
          name,
          status,
          agentId: idAttr,
          // Store row index for potential UI operations
          rowIndex: agents.length,
        });
      }
    });
    return agents;
  });
}

// ---- Main ------------------------------------------------------------------

async function main() {
  await ensureDir(SCREENSHOT_DIR);
  const startTime = Date.now();

  console.log('=== E2E Cleanup v2: Delete All Agents (Direct GraphQL) ===\n');

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

  // Capture console for debugging
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`  [browser:error] ${msg.text()}`);
    }
  });

  let stopCount = 0;
  let deleteCount = 0;
  let errorCount = 0;
  let processedCount = 0;

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
    try { await page.waitForURL('**/overview', { timeout: 15000 }); } catch {}
    await sleep(3000);
    console.log('  Login OK.');
    await takeScreenshot(page, 'after-login');

    // ===================================================================
    // NAVIGATE TO AGENT LIST
    // ===================================================================
    console.log('\n--- STEP: Navigate to Agent List ---');
    await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
    await sleep(3000);

    const initialAgents = await extractAgentsFromDOM(page);
    console.log(`  Found ${initialAgents.length} agents in DOM:`);
    for (const a of initialAgents) {
      console.log(`    ${a.name.padEnd(20)} [${a.status}]  id=${a.agentId || 'N/A'}`);
    }

    // ===================================================================
    // GET AGENT IDS FROM APOLLO CACHE
    // ===================================================================
    console.log('\n--- STEP: Extract Agent IDs from Apollo Cache ---');
    const cacheInfo = await getAgentIdsFromCache(page);
    console.log(`  Apollo cache extraction: ${cacheInfo.found ? 'OK' : 'FAILED'}`);
    if (cacheInfo.found) {
      console.log(`  Method: ${cacheInfo.method}`);
      console.log(`  Agents in cache: ${cacheInfo.agents?.length || 0}`);
      if (cacheInfo.agents) {
        for (const a of cacheInfo.agents) {
          console.log(`    ${a.name.padEnd(20)} [${a.status}]  id=${a.id}`);
        }
      }
    } else {
      console.log(`  Reason: ${cacheInfo.error || 'cache not accessible'}`);
    }

    // ===================================================================
    // If Apollo cache gave us IDs, use them directly via GraphQL
    // ===================================================================
    let agentsToDelete = [];

    if (cacheInfo.found && cacheInfo.agents && cacheInfo.agents.length > 0) {
      agentsToDelete = cacheInfo.agents.filter(
        (a) => a.status !== 'provisioning' && a.id
      );
      console.log(`\n  Using ${agentsToDelete.length} agent IDs from Apollo cache.`);
    } else {
      console.log('\n  Apollo cache not accessible. Trying alternative methods...');

      // Try the cache data from the first extraction method
      const apolloData = await getApolloAgentData(page);
      console.log(`  Cache extraction attempt 2: ${apolloData.found ? 'OK' : 'FAIL'}`);

      // Fall back: try to find agent data in Vue component internals
      const viaUI = await getAgentIdsFromUI(page);
      console.log(`  UI extraction: ${viaUI.length ? 'OK' : 'FAIL'}`);
      for (const a of viaUI) {
        console.log(`    ${a.name.padEnd(20)} [${a.status}]`);
      }

      // Since we can't easily get agent IDs without Apollo cache,
      // fall back to the row-action UI approach but be smarter about it
      console.log('\n  Falling back to UI row-action approach...');
      agentsToDelete = initialAgents
        .filter((a) => a.status !== '部署中')
        .map((a) => ({ id: null, name: a.name, status: a.status }));
    }

    // ===================================================================
    // PROCESS: Stop running agents, then delete all
    // ===================================================================
    console.log(`\n--- STEP: Process ${agentsToDelete.length} agents ---`);

    // Reorder: stopped first, then running
    const ordered = [
      ...agentsToDelete.filter((a) => a.status === '已停止' || a.status === 'stopped'),
      ...agentsToDelete.filter((a) => a.status === '运行中' || a.status === 'running'),
    ];

    for (let idx = 0; idx < ordered.length; idx++) {
      const agent = ordered[idx];
      console.log(`\n  [${idx + 1}/${ordered.length}] "${agent.name}" [${agent.status}] (id=${agent.id || 'unknown'})`);

      try {
        // ---- If we have an ID, use direct GraphQL ----
        if (agent.id) {
          // Step 1: Stop if running
          if (agent.status === '运行中' || agent.status === 'running') {
            console.log(`  Direct stop via GraphQL...`);
            const stopResult = await callStopMutation(page, agent.id);
            if (stopResult.ok && stopResult.data?.data?.setAgentStatus) {
              console.log(`  Stop OK: status -> ${stopResult.data.data.setAgentStatus.status}`);
              stopCount++;
            } else {
              console.log(`  Stop result: ${JSON.stringify(stopResult.data?.errors || stopResult.error)}`);
            }
            await sleep(500);
          }

          // Step 2: Delete
          console.log(`  Direct delete via GraphQL...`);
          const deleteResult = await callRecycleMutation(page, agent.id);
          if (deleteResult.ok && !deleteResult.data?.errors) {
            console.log(`  Delete OK: ${JSON.stringify(deleteResult.data?.data)}`);
            deleteCount++;
          } else {
            console.log(`  Delete FAILED: ${JSON.stringify(deleteResult.data?.errors || deleteResult.error)}`);
            errorCount++;
          }
        } else {
          // ---- No ID available - use UI approach ----
          // Reload the page for fresh state
          await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
          await sleep(2000);

          // Find the current row
          const currentStatus = agent.status;

          // Step 1: Stop if running
          if (agent.status === '运行中' || agent.status === 'running') {
            console.log(`  UI: Stopping "${agent.name}"...`);
            const row = page.locator('cds-grid-row').filter({
              has: page.locator('a.cell-name-link', { hasText: agent.name }),
            }).filter({
              has: page.locator('.status-badge span', { hasText: currentStatus }),
            }).first();

            const moreBtn = row.locator('cds-button-action[aria-label="更多"]');
            await moreBtn.waitFor({ state: 'visible', timeout: 10000 });
            await moreBtn.click();
            await sleep(500);

            const stopBtn = page.locator('cds-dropdown#row-actions button.menu-opt[aria-label="停止"]');
            await stopBtn.waitFor({ state: 'visible', timeout: 5000 });
            await stopBtn.click();
            await sleep(500);

            // Accept dialog
            const dialog = page.locator('[role="alertdialog"]');
            await dialog.waitFor({ state: 'visible', timeout: 5000 });
            await dialog.locator('cds-button').filter({ hasText: '确认' }).click();
            await sleep(500);

            console.log('  Waiting 3s after stop...');
            await sleep(3000);
            stopCount++;
          }

          // Step 2: Delete via UI
          // Reload to get fresh state
          await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
          await sleep(2000);

          const row = page.locator('cds-grid-row').filter({
            has: page.locator('a.cell-name-link', { hasText: agent.name }),
          }).filter({
            has: page.locator('.status-badge span', { hasText: currentStatus }),
          }).first();

          const moreBtn = row.locator('cds-button-action[aria-label="更多"]');
          await moreBtn.waitFor({ state: 'visible', timeout: 10000 });
          await moreBtn.click();
          await sleep(500);

          const deleteBtn = page.locator('cds-dropdown#row-actions button.menu-opt.danger[aria-label="删除"]');
          await deleteBtn.waitFor({ state: 'visible', timeout: 5000 });
          await deleteBtn.click();
          await sleep(500);

          // Accept dialog
          const dialog = page.locator('[role="alertdialog"]');
          await dialog.waitFor({ state: 'visible', timeout: 5000 });
          await dialog.locator('cds-button').filter({ hasText: '确认' }).click();
          await sleep(500);

          // Check for type-to-confirm input
          const confirmInput = page.locator('[role="alertdialog"] input[type="text"]');
          if (await confirmInput.isVisible({ timeout: 2000 })) {
            await confirmInput.fill(agent.name);
            await sleep(300);
            await dialog.locator('cds-button').filter({ hasText: '确认' }).click();
            await sleep(500);
          }

          console.log('  Waiting 3s after delete...');
          await sleep(3000);
          deleteCount++;
        }

        processedCount++;

        // Screenshot every 5 processed agents
        if (processedCount % 5 === 0) {
          await takeScreenshot(page, `progress-${processedCount}`);
        }

      } catch (err) {
        console.log(`  ERROR: ${err.message}`);
        await takeScreenshot(page, `error-${agent.name.replace(/[^a-zA-Z0-9]/g, '_')}`);
        errorCount++;
      }
    }

    // ===================================================================
    // FINAL VERIFICATION
    // ===================================================================
    console.log('\n--- STEP: Final Verification ---');
    await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
    await sleep(3000);

    const finalAgents = await extractAgentsFromDOM(page);
    await takeScreenshot(page, 'final');

    const remaining = finalAgents.filter((a) => a.status !== '部署中');
    const provisioning = finalAgents.filter((a) => a.status === '部署中');

    // Also try direct GraphQL query to see what the backend returns
    console.log('\n--- Direct GraphQL agents query for verification ---');
    const queryResult = await page.evaluate(() => {
      return fetch('/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          query: `
            query Agents {
              agents {
                nodes {
                  id
                  name
                  status
                }
                totalCount
              }
            }
          `,
        }),
      }).then((r) => r.json());
    });

    const backendAgents = queryResult?.data?.agents?.nodes || [];
    console.log(`  Backend totalCount: ${queryResult?.data?.agents?.totalCount || 'N/A'}`);
    for (const a of backendAgents) {
      console.log(`    ${a.name.padEnd(20)} [${a.status}]  id=${a.id}`);
    }

    // ===================================================================
    // SUMMARY
    // ===================================================================
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(65));
    console.log('  CLEANUP v2 COMPLETE');
    console.log('='.repeat(65));
    console.log(`  Processed:     ${processedCount}`);
    console.log(`  Stopped:       ${stopCount}`);
    console.log(`  Deleted:       ${deleteCount}`);
    console.log(`  Errors:        ${errorCount}`);
    console.log(`  Duration:      ${elapsed}s`);
    console.log(`  Screenshots:   ${SCREENSHOT_DIR}/cleanup-v2-*.png`);
    console.log(`\n  DOM status:    ${finalAgents.length} total`);
    console.log(`    Non-provisioning: ${remaining.length}`);
    for (const a of remaining) {
      console.log(`      ${a.name.padEnd(20)} [${a.status}]`);
    }
    console.log(`    Provisioning: ${provisioning.length}`);
    for (const a of provisioning) {
      console.log(`      ${a.name.padEnd(20)} [${a.status}]`);
    }
    console.log(`\n  Backend query: ${backendAgents.length} agents returned`);
    console.log(`    Non-provisioning: ${backendAgents.filter((a) => a.status !== 'provisioning').length}`);

    // Write results
    writeFileSync(
      `${SCREENSHOT_DIR}/cleanup-v2-results.json`,
      JSON.stringify({
        processed: processedCount,
        stopped: stopCount,
        deleted: deleteCount,
        errors: errorCount,
        duration: elapsed + 's',
        timestamp: new Date().toISOString(),
        domAgents: finalAgents,
        backendAgents: backendAgents,
        remaining: remaining,
      }, null, 2),
    );

  } catch (err) {
    console.error(`\n[FATAL] ${err.message}`);
    try { await takeScreenshot(page, 'fatal'); } catch {}
  } finally {
    await browser.close();
    process.exit(0);
  }
}

main();
