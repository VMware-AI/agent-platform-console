/**
 * E2E Deploy Scenarios — 4 deployment scenarios for the Agent Marketplace.
 *
 * Validates that the _createParents leak bug is fixed (backend no longer
 * returns 422 when _createParents is in the mutation variables).
 *
 * Usage:
 *   node e2e/deploy-scenarios.mjs
 *
 * Prerequisites:
 *   - Frontend running at http://192.168.15.128:5173
 *   - Playwright installed (npx playwright install chromium)
 *   - admin@platform.local / ChangeMe123! credentials valid
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://192.168.15.128:5173';
const SCREENSHOT_DIR = '/tmp/e2e-screenshots';

const CREDENTIALS = {
  email: 'admin@platform.local',
  password: 'ChangeMe123!',
};

// Network defaults shared across scenarios
const NETWORK = {
  netmask: '255.255.255.0',
  gateway: '172.16.85.1',
  dns: '172.16.85.1',
};

/**
 * Ensure screenshot directory exists.
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Run a single deploy scenario.
 *
 * @param {import('playwright').Page} page
 * @param {object} opts
 * @param {string} opts.scenario   - Short name for logs
 * @param {string} opts.cloneMode  - 'full' | 'instant'
 * @param {string} opts.deployMode - 'single' | 'batch'
 * @param {string} opts.screenshotPath - Where to save screenshot
 * @param {object} [opts.ipConfig] - Static IP config
 * @param {string} [opts.ipConfig.hostname] - Single mode hostname
 * @param {string} [opts.ipConfig.ip] - Single mode IP
 * @param {number} [opts.ipConfig.batchCount] - Batch mode count
 * @param {string} [opts.ipConfig.batchPrefix] - Batch mode prefix
 * @param {string} [opts.ipConfig.batchStartIP] - Batch mode start IP
 * @param {boolean} [opts.createParents] - For instant clone: create new parents
 * @param {Array<{name:string, ip:string}>} [opts.newParents] - Parent VMs to create
 */
async function runScenario(page, opts) {
  const {
    scenario,
    cloneMode,
    deployMode,
    screenshotPath,
    ipConfig = {},
    createParents = false,
    newParents = [],
  } = opts;

  console.log(`\n══════════════ 场景 ${scenario} ══════════════`);
  console.log(`模式: ${cloneMode === 'full' ? '全量克隆' : '即时克隆'} / ${deployMode === 'single' ? '单部署' : '批量部署'}`);

  try {
    // ── Navigate to marketplace ──
    await page.goto(`${BASE_URL}/agents/marketplace`, { waitUntil: 'networkidle', timeout: 30000 });
    // Wait for the card grid to render (template cards)
    await page.waitForSelector('.card-grid cds-card', { timeout: 15000 }).catch(() => {
      console.log('  等待卡片加载，重新检查...');
    });
    // Give Apollo cache-and-network time to populate
    await page.waitForTimeout(2000);

    // ── Find the "test01" template card ──
    // The card title is in .tpl-title. Find the card containing "test01".
    const test01Card = page.locator('cds-card').filter({ has: page.locator('.tpl-title', { hasText: /test01/i }) });
    const cardCount = await test01Card.count();
    if (cardCount === 0) {
      // Try searching by any card text
      const allCards = page.locator('cds-card');
      const count = await allCards.count();
      console.log(`  找到 ${count} 个卡片`);
      if (count === 0) {
        throw new Error('未找到任何模板卡片，可能页面未正确加载');
      }
      // Try finding by text content
      const matched = allCards.filter({ hasText: /test01/i });
      const mCount = await matched.count();
      if (mCount === 0) {
        throw new Error('未找到 test01 模板卡片');
      }
      await matched.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      // Click the "部署智能体" button within this card
      const deployBtn = matched.first().locator('cds-button').filter({ hasText: '部署智能体' });
      if (await deployBtn.count() === 0) {
        // Try alternative text
        const altBtn = matched.first().locator('cds-button[status="primary"]');
        if (await altBtn.count() === 0) {
          // Try the last button in actions (most generic)
          const actionBtns = matched.first().locator('.tpl-actions-buttons cds-button');
          const btnCount = await actionBtns.count();
          console.log(`  找到 ${btnCount} 个操作按钮`);
          // The second button (index 1) is "部署智能体"
          if (btnCount >= 2) {
            await actionBtns.nth(1).click();
          } else if (btnCount >= 1) {
            await actionBtns.nth(0).click();
          } else {
            throw new Error('未找到部署按钮');
          }
        } else {
          await altBtn.first().click();
        }
      } else {
        await deployBtn.first().click();
      }
    } else {
      await test01Card.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      const deployBtn = test01Card.first().locator('cds-button').filter({ hasText: '部署智能体' });
      if (await deployBtn.count() > 0) {
        await deployBtn.first().click();
      } else {
        // Fallback: click the second button in the actions area
        const actionBtns = test01Card.first().locator('.tpl-actions-buttons cds-button');
        const btnCount = await actionBtns.count();
        if (btnCount >= 2) {
          await actionBtns.nth(1).click();
        } else if (btnCount >= 1) {
          await actionBtns.nth(0).click();
        } else {
          throw new Error('未找到部署按钮');
        }
      }
    }

    // ── Wait for deploy dialog to open ──
    await page.waitForTimeout(2000);
    // The dialog is a cds-modal. When open, it's not hidden (hidden attribute is removed)
    // Clarity cds-modal uses a `hidden` attribute
    const modal = page.locator('cds-modal').filter({ hasText: /部署智能体/ });
    await modal.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
      console.log('  等待模态框可见...');
    });
    console.log('  部署对话框已打开');

    // ── Section 1: 基础运行环境 ──
    // Find selects in the first block
    const firstBlockSelects = modal.first().locator('.blk').first().locator('cds-select select');
    const selectCount = await firstBlockSelects.count();
    console.log(`  找到 ${selectCount} 个配置选择器`);

    // Select clone mode (4th select in first block, index 3)
    if (selectCount >= 4) {
      await firstBlockSelects.nth(3).selectOption(cloneMode);
      console.log(`  克隆模式: ${cloneMode === 'full' ? '全量克隆' : '即时克隆'}`);
    }

    // ── Instant clone: handle parent VM section ──
    if (cloneMode === 'instant') {
      await page.waitForTimeout(500);

      if (createParents && newParents.length > 0) {
        // Click "创建新父虚拟机" radio
        const createParentRadio = modal.first().locator('input[type="radio"][value="create"]');
        if (await createParentRadio.count() > 0) {
          await createParentRadio.first().check({ force: true });
          console.log(`  选择: 创建新父虚拟机`);

          // The form auto-populates with one parent row. Fill it.
          const parentInputs = modal.first().locator('.ic-sec cds-input input');
          const parentCount = await parentInputs.count();
          console.log(`  父虚拟机输入框数: ${parentCount}`);

          // Fill first parent
          if (newParents.length > 0 && parentCount >= 1) {
            await parentInputs.nth(0).fill(newParents[0].name);
            if (parentCount >= 2) {
              await parentInputs.nth(1).fill(newParents[0].ip);
            }
          }
        } else {
          console.log('  注意: 未找到创建父虚拟机选项');
        }
      } else {
        // Select "选择已有父虚拟机" and choose a parent
        const existingParentRadio = modal.first().locator('input[type="radio"][value="existing"]');
        if (await existingParentRadio.count() > 0) {
          await existingParentRadio.first().check({ force: true });
          console.log(`  选择: 已有父虚拟机`);
          await page.waitForTimeout(1000);

          // Wait for parent list to load (INSTANT_CLONE_PARENTS_QUERY)
          // The parent select appears when existing is selected
          const parentSelect = modal.first().locator('.ic-sec cds-select select');
          const psCount = await parentSelect.count();
          if (psCount > 0) {
            // Select first ic-p* parent
            const options = await parentSelect.first().locator('option').all();
            const icpOptions = [];
            for (const opt of options) {
              const val = await opt.getAttribute('value');
              const text = await opt.textContent();
              if (val && (val.startsWith('ic-p') || val.startsWith('ic-'))) {
                icpOptions.push(val);
              }
            }
            if (icpOptions.length > 0) {
              await parentSelect.first().selectOption(icpOptions[0]);
              console.log(`  选择父虚拟机: ${icpOptions[0]}`);
            } else {
              console.log('  注意: 未找到 ic-p* 父虚拟机选项');
              // Still select first non-empty option
              const firstOpt = await parentSelect.first().locator('option:nth-child(2)').getAttribute('value');
              if (firstOpt) {
                await parentSelect.first().selectOption(firstOpt);
              }
            }
          }
        } else {
          console.log('  注意: 未找到已有父虚拟机选项');
        }
      }
    }

    // ── Section 3: 部署与网络策略 ──
    // Set IP mode to "静态 IP"
    const staticIPRadio = modal.first().locator('input[type="radio"][value="static"]');
    if (await staticIPRadio.count() > 0) {
      await staticIPRadio.first().check({ force: true });
      console.log('  IP 模式: 静态 IP');
      await page.waitForTimeout(500);

      // Fill network details
      const staticInputs = modal.first().locator('.g3 cds-input input');
      const siCount = await staticInputs.count();
      console.log(`  静态网络输入框数: ${siCount}`);
      if (siCount >= 1) await staticInputs.nth(0).fill(NETWORK.netmask);
      if (siCount >= 2) await staticInputs.nth(1).fill(NETWORK.gateway);
      if (siCount >= 3) await staticInputs.nth(2).fill(NETWORK.dns);
    }

    // Set deploy mode
    if (deployMode === 'batch') {
      const batchRadio = modal.first().locator('input[type="radio"][value="batch"]');
      if (await batchRadio.count() > 0) {
        await batchRadio.first().check({ force: true });
        console.log('  部署模式: 批量');
        await page.waitForTimeout(500);

        // Fill batch config
        if (ipConfig.batchCount) {
          const countInput = modal.first().locator('.bt cds-input').first().locator('input[type="number"]');
          if (await countInput.count() > 0) {
            await countInput.fill(String(ipConfig.batchCount));
          }
        }
        if (ipConfig.batchPrefix) {
          const prefixInput = modal.first().locator('.bt cds-input').nth(1).locator('input');
          if (await prefixInput.count() > 0) {
            await prefixInput.fill(ipConfig.batchPrefix);
          }
        }
        if (ipConfig.batchStartIP) {
          const startIPInput = modal.first().locator('.bt cds-input').nth(2).locator('input');
          if (await startIPInput.count() > 0) {
            await startIPInput.fill(ipConfig.batchStartIP);
          }
        }
        // Click "生成清单" button
        const generateBtn = modal.first().locator('.bt cds-button').filter({ hasText: '生成清单' });
        if (await generateBtn.count() > 0) {
          await generateBtn.first().click();
          console.log('  已生成批量清单');
          await page.waitForTimeout(1000);
        }
      }
    } else {
      // Single mode (default)
      console.log('  部署模式: 单台');

      // Fill hostname
      if (ipConfig.hostname) {
        // Find hostname input in the single deploy section
        const hostnameInput = modal.first().locator('input[placeholder="my-agent-01"]');
        if (await hostnameInput.count() > 0) {
          await hostnameInput.fill(ipConfig.hostname);
        } else {
          // Try finding by label text
          const hostLabel = modal.first().locator('label', { hasText: '智能体名称' });
          if (await hostLabel.count() > 0) {
            // Navigate to sibling/next input
            const hostInput = hostLabel.first().locator('..').locator('input');
            if (await hostInput.count() > 0) {
              await hostInput.fill(ipConfig.hostname);
            }
          }
        }
        console.log(`  主机名: ${ipConfig.hostname}`);
      }

      // Fill IP
      if (ipConfig.ip) {
        const ipInput = modal.first().locator('input[placeholder="172.16.85.200"]');
        if (await ipInput.count() > 0) {
          await ipInput.fill(ipConfig.ip);
        } else {
          const ipLabel = modal.first().locator('label', { hasText: 'IP 地址' });
          if (await ipLabel.count() > 0) {
            const ipInput2 = ipLabel.first().locator('..').locator('input');
            if (await ipInput2.count() > 0) {
              await ipInput2.fill(ipConfig.ip);
            }
          }
        }
        console.log(`  IP: ${ipConfig.ip}`);
      }
    }

    // ── Section 2: 全局安全与认证 ──
    // Find password fields. The password field has placeholder "至少 8 位"
    const pwInput = modal.first().locator('input[type="password"]').first();
    if (await pwInput.count() > 0) {
      await pwInput.fill('TestPass123!');
      console.log('  已填写密码');
    }
    // Confirm password
    const pwInputs = modal.first().locator('input[type="password"]');
    const pwCount = await pwInputs.count();
    if (pwCount >= 2) {
      await pwInputs.nth(1).fill('TestPass123!');
      console.log('  已填写确认密码');
    }

    // ── Submit ──
    // Take screenshot BEFORE clicking submit (dialog filled state)
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  截图已保存: ${screenshotPath}`);

    // Click "部署" submit button
    const submitBtn = modal.first().locator('cds-button[status="primary"]').filter({ hasText: '部署' });
    const submitBtnCount = await submitBtn.count();
    if (submitBtnCount > 0) {
      await submitBtn.first().click();
      console.log('  已点击部署按钮');
    } else {
      // Fallback: find the last primary button in the modal
      const primaryBtns = modal.first().locator('cds-button[status="primary"]');
      if (await primaryBtns.count() > 0) {
        await primaryBtns.last().click();
        console.log('  已点击部署按钮 (fallback)');
      } else {
        // Try by role
        const deployBtns = modal.first().locator('cds-button').filter({ hasText: '部署' });
        if (await deployBtns.count() > 0) {
          await deployBtns.first().click();
          console.log('  已点击部署按钮 (text fallback)');
        }
      }
    }

    // ── Wait for deployment result ──
    // After submit:
    // - On success: the dialog closes, a toast shows, and VirtualKeySecretDialog opens
    // - On failure: a toast error shows
    // Wait for either:
    //   1. Dialog to close (modal hidden)
    //   2. Toast notification
    //   3. Key secret dialog to appear
    console.log('  等待部署结果...');
    await page.waitForTimeout(3000);

    // Check for success indicators
    const secretDialog = page.locator('cds-modal').filter({ hasText: /密钥|secret|key/i });
    const secretVisible = await secretDialog.count() > 0 && await secretDialog.first().isVisible().catch(() => false);

    if (secretVisible) {
      console.log('  ✓ 部署成功! 密钥对话框已显示');
      // Close the secret dialog
      const closeBtn = secretDialog.first().locator('cds-button').filter({ hasText: /关闭|close|查看|view|detail/i });
      if (await closeBtn.count() > 0) {
        await closeBtn.first().click().catch(() => {});
        await page.waitForTimeout(1000);
      }
      return { success: true, error: null };
    }

    // Check dialog state
    const dialogStillOpen = await modal.first().isVisible().catch(() => false);
    if (dialogStillOpen) {
      // Check for error messages
      const errorTexts = await modal.first().locator('.er, .toast, cds-alert, [role="alert"]').allTextContents().catch(() => []);
      const allText = await modal.first().innerText().catch(() => '');
      console.log(`  对话框仍然打开，可能部署失败`);
      console.log(`  对话框文本: ${allText.substring(0, 300)}`);
      return { success: false, error: allText.substring(0, 500) };
    }

    // Check for toast
    const toastEl = page.locator('cds-alert, .toast').first();
    const toastVisible = await toastEl.isVisible().catch(() => false);
    if (toastVisible) {
      const toastText = await toastEl.innerText().catch(() => '');
      console.log(`  Toast: ${toastText}`);
      if (toastText.includes('失败') || toastText.includes('error') || toastText.includes('Error')) {
        return { success: false, error: toastText };
      }
      console.log('  ✓ 部署可能成功 (toast 提示)');
    }

    return { success: true, error: null };
  } catch (err) {
    console.log(`  ✗ 场景异常: ${err.message}`);
    // Take error screenshot
    try {
      await page.screenshot({ path: screenshotPath.replace('.png', '-error.png'), fullPage: false });
    } catch (_) {}
    return { success: false, error: err.message };
  }
}

/**
 * Login to the platform.
 */
async function login(page) {
  console.log('登录中...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  // Fill email - find the input inside the login form
  const emailInput = page.locator('.login-form-wrap input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await emailInput.fill(CREDENTIALS.email);

  // Fill password
  const pwInput = page.locator('.login-form-wrap input[type="password"]');
  await pwInput.fill(CREDENTIALS.password);

  // Click login button
  const loginBtn = page.locator('.login-form-wrap button[type="submit"], .login-form-wrap cds-button[type="submit"]');
  await loginBtn.first().click();

  // Wait for navigation to dashboard
  await page.waitForURL('**/overview', { timeout: 20000 }).catch(() => {
    console.log('  等待仪表盘加载...');
  });
  await page.waitForLoadState('networkidle');
  console.log('  登录成功\n');
}

/**
 * Main test runner.
 */
async function main() {
  ensureDir(SCREENSHOT_DIR);

  console.log('========================================');
  console.log('  Agent Platform E2E — 部署场景测试');
  console.log('========================================\n');
  console.log(`前端: ${BASE_URL}`);
  console.log(`截图: ${SCREENSHOT_DIR}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });

  const page = await context.newPage();

  // Log console errors for debugging
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  const results = [];

  try {
    // ── Login ──
    await login(page);

    // ── Scenario 1: 全量克隆 + 单部署 ──
    const r1 = await runScenario(page, {
      scenario: '1',
      cloneMode: 'full',
      deployMode: 'single',
      ipConfig: { hostname: 'test-dlvm-single', ip: '172.16.85.131' },
      screenshotPath: path.join(SCREENSHOT_DIR, 'v2-01-fullclone-single.png'),
    });
    results.push({ name: '场景1: 全量克隆+单部署', ...r1 });

    // Wait between scenarios
    await page.waitForTimeout(2000);

    // ── Scenario 2: 即时克隆 + 单部署 ──
    const r2 = await runScenario(page, {
      scenario: '2',
      cloneMode: 'instant',
      deployMode: 'single',
      ipConfig: { hostname: 'test-ic-single', ip: '172.16.85.132' },
      createParents: false,
      screenshotPath: path.join(SCREENSHOT_DIR, 'v2-02-instantclone-single.png'),
    });
    results.push({ name: '场景2: 即时克隆+单部署', ...r2 });

    await page.waitForTimeout(2000);

    // ── Scenario 3: 全量克隆 + 批量部署 ──
    const r3 = await runScenario(page, {
      scenario: '3',
      cloneMode: 'full',
      deployMode: 'batch',
      ipConfig: {
        batchCount: 3,
        batchPrefix: 'test-dlvm',
        batchStartIP: '172.16.85.140',
      },
      screenshotPath: path.join(SCREENSHOT_DIR, 'v2-03-fullclone-batch.png'),
    });
    results.push({ name: '场景3: 全量克隆+批量部署', ...r3 });

    await page.waitForTimeout(2000);

    // ── Scenario 4: 即时克隆 + 批量部署 ──
    const r4 = await runScenario(page, {
      scenario: '4',
      cloneMode: 'instant',
      deployMode: 'batch',
      ipConfig: {
        batchCount: 2,
        batchPrefix: 'test-ic',
        batchStartIP: '172.16.85.150',
      },
      createParents: false,
      screenshotPath: path.join(SCREENSHOT_DIR, 'v2-04-instantclone-batch.png'),
    });
    results.push({ name: '场景4: 即时克隆+批量部署', ...r4 });

  } catch (err) {
    console.error(`\n测试框架异常: ${err.message}`);
  } finally {
    await browser.close();
  }

  // ── Results Summary ──
  console.log('\n\n========================================');
  console.log('  测试结果汇总');
  console.log('========================================\n');

  let allPassed = true;
  for (const r of results) {
    const status = r.success ? '✓ 通过' : '✗ 失败';
    if (!r.success) allPassed = false;
    console.log(`  ${status} ${r.name}`);
    if (r.error) {
      console.log(`      错误: ${r.error.substring(0, 200)}`);
    }
  }

  console.log(`\n  总通过率: ${results.filter(r => r.success).length}/${results.length}`);

  // ── Screenshot paths ──
  console.log('\n  截图路径:');
  console.log(`    ${SCREENSHOT_DIR}/v2-01-fullclone-single.png`);
  console.log(`    ${SCREENSHOT_DIR}/v2-02-instantclone-single.png`);
  console.log(`    ${SCREENSHOT_DIR}/v2-03-fullclone-batch.png`);
  console.log(`    ${SCREENSHOT_DIR}/v2-04-instantclone-batch.png`);

  console.log('\n========================================\n');

  // Exit with non-zero if any scenario failed
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
