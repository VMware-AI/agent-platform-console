import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleErrors.push(`[${msg.type()}] ${msg.text().substring(0, 200)}`);
    }
  });
  page.on('pageerror', err => consoleErrors.push(`[PAGE_ERROR] ${err.message}`));

  // Capture actual XHR/fetch API calls (not source map loads)
  const apiResponses = [];
  page.on('response', async response => {
    const url = response.url();
    // Ignore source maps and static files
    if (url.includes('/graphql') && !url.endsWith('.ts') && !url.endsWith('.js')) {
      try {
        const body = await response.json();
        apiResponses.push(body);
        console.log(`[NETWORK] Captured API response from ${url}`);
      } catch {}
    }
  });

  try {
    // ===== LOGIN =====
    console.log('=== LOGIN ===');
    await page.goto('http://192.168.15.128:5173', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    const emailInput = page.locator('cds-input input[type="email"]');
    const passwordInput = page.locator('cds-input input[type="password"]');
    const submitBtn = page.locator('cds-button[type="submit"]');

    await emailInput.first().fill('admin@platform.local');
    await passwordInput.first().fill('ChangeMe123!');
    await page.waitForTimeout(500);
    await submitBtn.first().click();
    await page.waitForTimeout(3000);
    console.log(`URL after login: ${page.url()}`);

    // ===== NAVIGATE TO AGENTS LIST =====
    console.log('\n=== NAVIGATE to /agents/list ===');
    apiResponses.length = 0;

    await page.goto('http://192.168.15.128:5173/agents/list', {
      waitUntil: 'networkidle', timeout: 30000,
    });
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    console.log(`URL: ${currentUrl}`);
    await page.screenshot({ path: '/tmp/e2e-screenshots/debug-status.png', fullPage: true });

    // ===== DEEP STATUS COLUMN ANALYSIS =====
    console.log('\n=== STATUS BADGE ANALYSIS ===');

    const statusAnalysis = await page.evaluate(() => {
      const results = {
        cdsBadges: [],
        cdsGridCells_status: [],
        cdsGridRows: [],
        badgeShadowContent: [],
        allIconShapesInGrid: [],
      };

      // 1. Find all cds-badge elements in the grid
      const grid = document.querySelector('cds-grid');
      if (grid) {
        // Check if grid has shadow root
        if (grid.shadowRoot) {
          results.gridShadowRoot = true;
          results.gridShadowContent = (grid.shadowRoot.textContent || '').substring(0, 2000);
        } else {
          results.gridShadowRoot = false;
        }

        // Find status column cells (4th cds-grid-cell in each row)
        const rows = grid.querySelectorAll('cds-grid-row');
        results.rowCount = rows.length;
        rows.forEach((row, ri) => {
          const cells = row.querySelectorAll('cds-grid-cell');
          const rowData = [];
          cells.forEach((cell, ci) => {
            const text = cell.textContent?.trim() || '';
            const badges = cell.querySelectorAll('cds-badge');
            const icons = cell.querySelectorAll('cds-icon');
            const spans = cell.querySelectorAll('span');
            rowData.push({
              cellIndex: ci,
              text: text.substring(0, 100),
              badgeCount: badges.length,
              iconCount: icons.length,
              iconShapes: Array.from(icons).map(ic => ic.getAttribute('shape')),
              spanTexts: Array.from(spans).map(s => s.textContent?.trim()).filter(Boolean),
              innerHTML: cell.innerHTML.substring(0, 300),
            });
          });
          results.cdsGridRows.push({ row: ri, cells: rowData });
        });
      } else {
        results.gridNotFound = true;
        // Look for any cds-badge anywhere
        document.querySelectorAll('cds-badge').forEach(b => {
          results.cdsBadges.push({
            status: b.getAttribute('status'),
            class: b.className,
            text: b.textContent?.trim().substring(0, 100),
            innerHTML: b.innerHTML.substring(0, 200),
          });
        });
      }

      return results;
    });

    console.log('Grid row count:', statusAnalysis.cdsGridRows.length);
    console.log('Grid has shadow root:', statusAnalysis.gridShadowRoot);
    if (statusAnalysis.gridShadowContent) {
      console.log('Grid shadow content (first 1000 chars):', statusAnalysis.gridShadowContent?.substring(0, 1000));
    }

    // Print each row's data
    statusAnalysis.cdsGridRows.forEach(r => {
      console.log(`\nRow ${r.row}:`);
      r.cells.forEach(c => {
        if (c.cellIndex === 3) {  // Status is the 4th column (0-indexed)
          console.log(`  STATUS CELL:`);
          console.log(`    Text: "${c.text}"`);
          console.log(`    Badges: ${c.badgeCount}, Icons: ${c.iconCount}`);
          console.log(`    Icon shapes: ${JSON.stringify(c.iconShapes)}`);
          console.log(`    Span texts: ${JSON.stringify(c.spanTexts)}`);
          console.log(`    HTML: ${c.innerHTML}`);
        }
      });
    });

    // Also dump ALL rows ALL cells for complete picture
    if (statusAnalysis.cdsGridRows.length > 0) {
      console.log('\n=== FULL ROW DUMP (first 3 rows) ===');
      statusAnalysis.cdsGridRows.slice(0, 3).forEach(r => {
        console.log(`Row ${r.row}:`);
        r.cells.forEach(c => {
          console.log(`  Cell ${c.cellIndex}: text="${c.text}" | icons=${JSON.stringify(c.iconShapes)} | spans=${JSON.stringify(c.spanTexts)}`);
        });
      });
    }

    // ===== CHECK cds-badge SHADOW DOM =====
    console.log('\n=== cds-badge Shadow DOM Analysis ===');
    const badgeShadowInfo = await page.evaluate(() => {
      const results = [];
      const badges = document.querySelectorAll('cds-badge');
      badges.forEach((badge, i) => {
        const sr = badge.shadowRoot;
        if (sr) {
          results.push({
            index: i,
            status: badge.getAttribute('status'),
            class: badge.className,
            shadowText: sr.textContent?.trim().substring(0, 200),
            shadowHTML: sr.innerHTML.substring(0, 500),
            children: Array.from(sr.children).map(c => ({
              tag: c.tagName,
              class: c.className?.substring(0, 60),
              text: (c.textContent || '').substring(0, 60),
            })),
          });
        } else {
          results.push({
            index: i,
            status: badge.getAttribute('status'),
            noShadowRoot: true,
            lightText: badge.textContent?.trim().substring(0, 100),
          });
        }
      });
      return results;
    });

    console.log(`Found ${badgeShadowInfo.length} cds-badge elements`);
    badgeShadowInfo.forEach(b => {
      console.log(`  Badge ${b.index}: status="${b.status}"`);
      if (b.shadowText) console.log(`    Shadow text: "${b.shadowText}"`);
      if (b.shadowHTML) console.log(`    Shadow HTML: ${b.shadowHTML.substring(0, 200)}`);
      if (b.children) b.children.forEach(c => console.log(`    Child: ${c.tag} "${c.text}"`));
      if (b.noShadowRoot) console.log(`    NO shadow root, light text: "${b.lightText}"`);
    });

    // ===== CHECK GRAPHQL RESPONSES FOR AGENT STATUS =====
    console.log('\n=== GraphQL API Responses ===');
    console.log(`Captured ${apiResponses.length} API responses`);

    for (const resp of apiResponses) {
      const dataStr = JSON.stringify(resp, null, 2);
      console.log(dataStr.substring(0, 3000));

      // Extract agent statuses
      const agents = resp?.data?.agents?.nodes || resp?.data?.agents || [];
      if (agents.length > 0) {
        console.log('\nAgent statuses from API:');
        agents.forEach((a, i) => {
          console.log(`  ${i + 1}. ${a.name || a.agentName || '???'} -> status="${a.status}" GQL type="${a.type}"`);
        });

        // Count by status
        const statusCount = {};
        agents.forEach(a => {
          const s = a.status || 'unknown';
          statusCount[s] = (statusCount[s] || 0) + 1;
        });
        console.log('\nStatus distribution:', JSON.stringify(statusCount));
      }
    }

    // ===== CONSOLE ERRORS =====
    console.log('\n=== Console Errors ===');
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
    } else {
      console.log('None.');
    }

  } catch (err) {
    console.error('FATAL:', err.message);
    try { await page.screenshot({ path: '/tmp/e2e-screenshots/debug-fatal.png' }); } catch {}
  }

  await browser.close();
  console.log('\n=== Done ===');
}

main().catch(console.error);
