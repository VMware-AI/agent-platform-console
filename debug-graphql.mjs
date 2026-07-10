import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const graphqlResponses = [];
  page.on('response', async response => {
    const url = response.url();
    // Only capture actual GraphQL responses (not source files)
    if (url.endsWith('/query')) {
      try {
        const body = await response.json();
        graphqlResponses.push(body);
        console.log(`[NETWORK] Captured GraphQL response: ${url}`);
      } catch {
        console.log(`[NETWORK] Non-JSON response from: ${url}`);
      }
    }
  });

  try {
    // Login
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

    // Navigate to agents list to trigger the GraphQL query
    console.log('\n=== Go to agents list ===');
    await page.goto('http://192.168.15.128:5173/agents/list', {
      waitUntil: 'networkidle', timeout: 30000
    });
    await page.waitForTimeout(5000);

    // Now make direct GraphQL queries via page.evaluate
    console.log('\n=== Direct GraphQL query via Apollo Client ===');
    const agentData = await page.evaluate(async () => {
      try {
        // Try to get the apollo client from the window (if exposed)
        // Or use fetch to make a direct GraphQL request
        const resp = await fetch('/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            operationName: 'Agents',
            variables: { pagination: { page: 1, pageSize: 50 }, filter: null, sort: null },
            query: `query Agents($filter: AgentFilter, $pagination: Pagination, $sort: AgentSort) {
              agents(filter: $filter, pagination: $pagination, sort: $sort) {
                nodes { id name status type apiKey { name } owner { displayName } credentials { username } createdAt }
                totalCount
              }
            }`
          })
        });
        const data = await resp.json();
        return data;
      } catch (err) {
        return { error: err.message };
      }
    });

    if (agentData?.data?.agents?.nodes) {
      const agents = agentData.data.agents.nodes;
      console.log(`Total agents: ${agentData.data.agents.totalCount}`);
      console.log('All agents with status:');
      agents.forEach((a, i) => {
        console.log(`  ${i + 1}. [${a.status}] ${a.name} (type: ${a.type}, user: ${a.credentials?.username || '?'})`);
      });

      // Count by status
      const countByStatus = {};
      agents.forEach(a => {
        countByStatus[a.status] = (countByStatus[a.status] || 0) + 1;
      });
      console.log('\nStatus distribution:');
      Object.entries(countByStatus).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

      // Check for provisioning agents specifically
      const provisioningAgents = agents.filter(a => a.status === 'provisioning');
      console.log(`\nProvisioning agents (${provisioningAgents.length}):`);
      provisioningAgents.forEach(a => console.log(`  - ${a.name} (${a.id})`));
    } else {
      console.log('No agent data in response');
      console.log(JSON.stringify(agentData, null, 2));
    }

    // Also check the captured network responses
    if (graphqlResponses.length > 0) {
      console.log('\n=== Captured GraphQL responses ===');
      graphqlResponses.forEach((resp, i) => {
        const str = JSON.stringify(resp, null, 2);
        console.log(`Response ${i}: ${str.substring(0, 2000)}`);
      });
    }

  } catch (err) {
    console.error('FATAL:', err.message);
  }

  await browser.close();
}

main().catch(console.error);
