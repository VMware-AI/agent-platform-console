/**
 * Debug script - captures page DOM to understand the actual structure
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE_URL = 'http://192.168.15.128:5173';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();

  // Login
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.locator('input[type="email"]').first().fill('admin@platform.local');
  await page.locator('input[type="password"]').first().fill('ChangeMe123!');
  await page.locator('cds-button[type="submit"]').first().click();
  await page.waitForTimeout(5000);

  // Navigate to agents list
  await page.goto(`${BASE_URL}/agents/list`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  // Dump table structure
  const tableHtml = await page.locator('cds-grid').first().innerHTML();
  writeFileSync('/tmp/e2e-screenshots/grid-html.txt', tableHtml);
  console.log('Grid HTML saved.');

  // Dump all text on the page
  const bodyText = await page.locator('body').innerText();
  writeFileSync('/tmp/e2e-screenshots/page-text.txt', bodyText);
  console.log('Page text saved.');

  // Show agent rows count
  const rows = await page.locator('cds-grid-row').all();
  for (let i = 0; i < rows.length; i++) {
    const text = await rows[i].innerText();
    console.log(`Row ${i}: ${text.substring(0, 200)}`);
  }

  // Now let's interact with a specific row - open "更多的" menu
  // Find a running agent row
  const runningRow = page.locator('cds-grid-row').filter({ hasText: 'test-v4-02' }).first();
  console.log('\n--- Getting HTML of running agent row ---');
  const rowHtml = await runningRow.innerHTML();
  writeFileSync('/tmp/e2e-screenshots/row-html.txt', rowHtml);

  // Find and click the "更多" button in the actions cell
  const actionsCell = runningRow.locator('cds-grid-cell').last();
  const moreBtn = actionsCell.locator('cds-button-action[aria-label="更多"]');
  console.log(`More button found: ${await moreBtn.count() > 0}`);

  // Get all button-action elements with their ARIA labels
  const actionsHtml = await actionsCell.innerHTML();
  writeFileSync('/tmp/e2e-screenshots/actions-cell.txt', actionsHtml);
  console.log('Actions cell HTML saved.');

  // Click more button and look at dropdown
  await moreBtn.click();
  await page.waitForTimeout(2000);

  // Check what the dropdown looks like
  const dropdownHtml = await page.locator('cds-dropdown#row-actions').first().innerHTML();
  writeFileSync('/tmp/e2e-screenshots/dropdown-html.txt', dropdownHtml);
  console.log('Dropdown HTML saved.');

  // List dropdown menu items
  const menuOpts = await page.locator('cds-dropdown#row-actions button.menu-opt').all();
  for (const opt of menuOpts) {
    const label = await opt.getAttribute('aria-label');
    const text = await opt.innerText();
    console.log(`  Menu item: aria-label="${label}", text="${text}"`);
  }

  await browser.close();
}

main().catch(console.error);
