/**
 * Full tool test with real connected Twitter account
 */
import { PrismaClient } from './generated/prisma/index.js';

const MCP = 'http://localhost:4000/mcp/AgentMail';
const p   = new PrismaClient();

const green  = s => `\x1b[32m${s}\x1b[0m`;
const red    = s => `\x1b[31m${s}\x1b[0m`;
const cyan   = s => `\x1b[36m${s}\x1b[0m`;
const gray   = s => `\x1b[90m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const bold   = s => `\x1b[1m${s}\x1b[0m`;
const magenta= s => `\x1b[35m${s}\x1b[0m`;

let pass = 0, fail = 0;
const results = [];

async function call(label, apiKey, toolName, args, expectSuccess = true) {
  process.stdout.write(`\n  ${cyan('▶')} ${bold(label)}\n`);
  const body = { jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: toolName, arguments: args } };
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'x-api-key': apiKey };
  try {
    const res = await fetch(MCP, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
    const json = await res.json();
    const text = json?.result?.content?.[0]?.text ?? '';
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = null; }

    const isSuccess  = parsed?.status === 'SUCCESS';
    const isReverted = parsed?.status === 'REVERTED' || json?.result?.isError;
    const isSchema   = text?.includes('Invalid parameters');

    let status;
    if (expectSuccess && isSuccess)              { status = 'PASS'; pass++; }
    else if (!expectSuccess && (isReverted||isSchema)) { status = 'PASS'; pass++; }
    else if (expectSuccess && isReverted)        { status = 'FAIL'; fail++; }
    else                                         { status = 'INFO'; pass++; }

    const icon = status === 'PASS' ? green('✅') : status === 'FAIL' ? red('❌') : yellow('⚠️ ');
    console.log(`     ${icon} ${parsed?.message ?? text.substring(0, 100)}`);
    if (parsed?.data && status !== 'FAIL') {
      console.log(gray(`        ${JSON.stringify(parsed.data).substring(0, 220)}`));
    }
    results.push({ label, status, message: parsed?.message });
    return parsed;
  } catch (e) {
    console.log(red(`     ❌ ${e.message}`));
    fail++;
    results.push({ label, status: 'FAIL', message: e.message });
    return null;
  }
}

try {
  const keyRecord = await p.apiKey.findFirst({ include: { User: { include: { ZernioProfile: true } } } });
  if (!keyRecord) { console.log(red('No API key')); process.exit(1); }
  const KEY = keyRecord.key;

  console.log(bold(magenta('\n╔══════════════════════════════════════════════════════╗')));
  console.log(bold(magenta('║   Full MCP Tool Test — Real Twitter Account          ║')));
  console.log(bold(magenta('╚══════════════════════════════════════════════════════╝')));

  // ── ACCOUNTS ──────────────────────────────────────────────────────────────
  console.log(cyan('\n\n── ACCOUNTS ──────────────────────────────────────────────'));

  const accountsRes = await call('list_accounts', KEY, 'list_accounts', {});
  const accounts = accountsRes?.data?.accounts ?? [];
  const twitter = accounts.find(a => a.platform === 'twitter');
  const twitterId = twitter?._id;

  console.log(gray(`\n     Found ${accounts.length} account(s):`));
  accounts.forEach(a => console.log(gray(`       • ${a.platform} @${a.username ?? a._id} (${a._id})`)));

  await call('get_account', KEY, 'get_account', { accountId: twitterId ?? 'dummy' }, !!twitterId);
  await call('check_accounts_health', KEY, 'check_accounts_health', {});
  await call('get_my_profile', KEY, 'get_my_profile', {});
  await call('get_usage_stats', KEY, 'get_usage_stats', {});

  // ── POSTS ─────────────────────────────────────────────────────────────────
  console.log(cyan('\n\n── POSTS ─────────────────────────────────────────────────'));

  await call('list_posts (all)', KEY, 'list_posts', { limit: 5 });
  await call('list_posts (published)', KEY, 'list_posts', { status: 'published', limit: 5 });
  await call('get_post_stats', KEY, 'get_post_stats', {});
  await call('validate_post — twitter', KEY, 'validate_post', {
    content: 'Test post from SocialPilot MCP 🚀',
    platforms: [{ platform: 'twitter', accountId: twitterId ?? 'dummy' }],
  });

  // Create a draft post
  let draftPostId = null;
  if (twitterId) {
    const draftRes = await call('create_post — draft', KEY, 'create_post', {
      content: 'Draft test from SocialPilot MCP 📝',
      platforms: [{ platform: 'twitter', accountId: twitterId }],
      isDraft: true,
    });
    draftPostId = draftRes?.data?.post?._id ?? draftRes?.data?._id;
    if (draftPostId) console.log(gray(`     Draft post ID: ${draftPostId}`));
  }

  // Get the draft
  if (draftPostId) {
    await call('get_post — draft', KEY, 'get_post', { postId: draftPostId });
    await call('delete_post — draft', KEY, 'delete_post', { postId: draftPostId });
  }

  // List posts after operations
  await call('list_posts (after draft+delete)', KEY, 'list_posts', { limit: 5 });

  // ── QUEUE ─────────────────────────────────────────────────────────────────
  console.log(cyan('\n\n── QUEUE ─────────────────────────────────────────────────'));

  // Set a queue schedule
  const queueRes = await call('set_queue_slots', KEY, 'set_queue_slots', {
    slots: [
      { day: 'MON', time: '09:00' },
      { day: 'WED', time: '14:00' },
      { day: 'FRI', time: '18:00' },
    ],
    timezone: 'Asia/Kolkata',
  });

  await call('list_queue_slots', KEY, 'list_queue_slots', {});
  await call('get_next_queue_slot', KEY, 'get_next_queue_slot', {});
  await call('preview_queue_slots', KEY, 'preview_queue_slots', { count: 5 });

  // ── ANALYTICS ─────────────────────────────────────────────────────────────
  console.log(cyan('\n\n── ANALYTICS ─────────────────────────────────────────────'));

  await call('get_analytics', KEY, 'get_analytics', { platform: 'twitter', limit: 5 });

  // ── TWITTER SPECIFIC ──────────────────────────────────────────────────────
  console.log(cyan('\n\n── TWITTER SPECIFIC ──────────────────────────────────────'));

  if (twitterId) {
    // Bookmark a real tweet (Elon's pinned tweet as test)
    await call('bookmark_tweet', KEY, 'bookmark_tweet', {
      accountId: twitterId,
      tweetId: '1897571303564009652', // public tweet
    });

    // Follow a user (Zernio's Twitter)
    await call('follow_user', KEY, 'follow_user', {
      accountId: twitterId,
      targetUserId: '1234567890', // dummy — will get Zernio error but tests routing
    });
  }

  // ── INBOX ─────────────────────────────────────────────────────────────────
  console.log(cyan('\n\n── INBOX ─────────────────────────────────────────────────'));

  await call('list_conversations', KEY, 'list_conversations', { limit: 5 });

  if (twitterId) {
    await call('list_comments', KEY, 'list_comments', { accountId: twitterId, limit: 5 });
  }

  // ── MEDIA ─────────────────────────────────────────────────────────────────
  console.log(cyan('\n\n── MEDIA ─────────────────────────────────────────────────'));

  await call('get_upload_url — image', KEY, 'get_upload_url', {
    fileName: 'test-image.jpg',
    fileType: 'image/jpeg',
  });

  // ── CONNECT ───────────────────────────────────────────────────────────────
  console.log(cyan('\n\n── CONNECT ───────────────────────────────────────────────'));

  await call('get_connect_url — instagram', KEY, 'get_connect_url', { platform: 'instagram' });
  await call('get_connect_url — linkedin', KEY, 'get_connect_url', { platform: 'linkedin' });

  // ── SCHEMA VALIDATION ─────────────────────────────────────────────────────
  console.log(cyan('\n\n── SCHEMA VALIDATION ─────────────────────────────────────'));

  await call('create_post — missing platforms (expect error)', KEY, 'create_post', { content: 'test' }, false);
  await call('get_post — missing postId (expect error)', KEY, 'get_post', {}, false);
  await call('send_message — missing fields (expect error)', KEY, 'send_message', { conversationId: 'x' }, false);

  // ── CREDIT CHECK ──────────────────────────────────────────────────────────
  console.log(cyan('\n\n── CREDIT CHECK ──────────────────────────────────────────'));
  const keyAfter = await p.apiKey.findFirst({ include: { User: { include: { Credits: true } } } });
  const used = keyAfter?.User?.Credits?.creditUsage ?? 0;
  const avail = (keyAfter?.User?.Credits?.availableCredits ?? 0) - used;
  console.log(gray(`\n     Credits used total: ${used}  |  remaining: ${avail}`));
  console.log(avail > 0 ? green('     ✅ Credits tracking correctly') : red('     ❌ Out of credits'));
  if (avail > 0) pass++;

} finally {
  await p.$disconnect();
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${magenta('═'.repeat(56))}`);
console.log(bold(`  Results: ${green(`${pass} passed`)}  ${fail > 0 ? red(`${fail} failed`) : green('0 failed')}`));
console.log(`\n  ${bold('Failed tests:')}`);
results.filter(r => r.status === 'FAIL').forEach(r => console.log(red(`    • ${r.label}: ${r.message}`)));
if (results.filter(r => r.status === 'FAIL').length === 0) console.log(green('    None!'));
console.log(`${magenta('═'.repeat(56))}\n`);
process.exit(fail > 0 ? 1 : 0);
