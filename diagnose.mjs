/**
 * Diagnose the 5 failed tools by hitting Zernio API directly
 */
const API_KEY = 'sk_8d2006e62f8c884a837cc5b464dafa356f2a854dba3d37494be7f0e0ab04a454';
const BASE    = 'https://zernio.com/api/v1';
const PROFILE = '69fb3a37160cee7400bffa58';
const ACCOUNT = '69fb45ba157a6202f6db2132'; // twitter @parasraut176773

const h = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

async function test(label, method, path, body) {
  process.stdout.write(`\n▶ ${label}\n  ${method} ${path}\n`);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: h,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    console.log(`  Status: ${res.status}`);
    console.log(`  Body:   ${JSON.stringify(json).substring(0, 200)}`);
    return { status: res.status, json };
  } catch (e) {
    console.log(`  Error: ${e.message}`);
    return null;
  }
}

// 1. get_account — 405 Method Not Allowed
await test('get_account GET /accounts/:id', 'GET', `/accounts/${ACCOUNT}`);

// 2. get_analytics — 402 Payment Required
await test('get_analytics GET /analytics', 'GET', `/analytics?profileId=${PROFILE}&platform=twitter&limit=5`);

// 3. bookmark_tweet — 500
await test('bookmark_tweet POST /twitter/bookmark', 'POST', '/twitter/bookmark', {
  accountId: ACCOUNT,
  tweetId: '1897571303564009652',
});

// 4. list_conversations — 403
await test('list_conversations GET /inbox/conversations', 'GET', `/inbox/conversations?profileId=${PROFILE}&limit=5`);

// 5. list_comments — 404
await test('list_comments GET /comments', 'GET', `/comments?accountId=${ACCOUNT}&limit=5`);
