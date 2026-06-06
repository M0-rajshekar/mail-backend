const TOKEN = 'cfat_LblVy8FzwJdSVPv0j56E75eGzl4UvbeZegWTFWpFf88c670f';
const API = 'https://api.cloudflare.com/client/v4';
const HEADERS = { Authorization: 'Bearer ' + TOKEN };
const ZONE_IDS = {
  'owntheedge.xyz': '03272e8dc741b8fd2eea5fc89003ec5a',
  'trueprop.xyz': '65e162ce2d65add81ec3746b9cc9f2f5'
};

async function checkEmailRoutingIssues() {
  console.log('========================================');
  console.log('CHECKING EMAIL ROUTING FOR BLOCKING ISSUES');
  console.log('========================================\n');
  
  for (const [domain, zoneId] of Object.entries(ZONE_IDS)) {
    console.log(`\n--- ${domain} ---`);
    
    // Check routing settings
    const routingRes = await fetch(`${API}/zones/${zoneId}/email/routing`, { headers: HEADERS });
    const routing = await routingRes.json();
    console.log('Status:', routing.result?.status);
    console.log('Enabled:', routing.result?.enabled);
    console.log('Locked:', routing.result?.admin_locked);
    console.log('Synced:', routing.result?.synced);
    
    // Check for any blocks or filters
    const rulesRes = await fetch(`${API}/zones/${zoneId}/email/routing/rules`, { headers: HEADERS });
    const rules = await rulesRes.json();
    console.log('Rules:', rules.result?.length);
    
    rules.result?.forEach(rule => {
      console.log(`  Rule: ${rule.name || 'unnamed'}`);
      console.log(`    Enabled: ${rule.enabled}`);
      console.log(`    Action: ${JSON.stringify(rule.actions)}`);
      
      // Check if rule action is 'drop' or reject
      if (rule.actions?.[0]?.type === 'drop') {
        console.log('    ⚠️  WARNING: Rule DROPS emails!');
      }
    });
    
    // Check DNS health
    const dnsRes = await fetch(`${API}/zones/${zoneId}/dns_records?type=MX`, { headers: HEADERS });
    const dns = await dnsRes.json();
    const hasCloudflareMx = dns.result?.some(r => r.content?.includes('mx.cloudflare.net'));
    console.log('Cloudflare MX:', hasCloudflareMx ? '✅ Present' : '❌ Missing');
    
    // Check for SPF/DKIM/DMARC
    const txtRes = await fetch(`${API}/zones/${zoneId}/dns_records?type=TXT`, { headers: HEADERS });
    const txt = await txtRes.json();
    const hasSpf = txt.result?.some(r => r.content?.includes('v=spf1'));
    const hasDmarc = txt.result?.some(r => r.name?.includes('_dmarc'));
    console.log('SPF Record:', hasSpf ? '✅ Present' : '❌ Missing');
    console.log('DMARC Record:', hasDmarc ? '✅ Present' : '❌ Missing');
  }
  
  console.log('\n========================================');
  console.log('MOST LIKELY CAUSES OF "MESSAGE BLOCKED":');
  console.log('========================================');
  console.log('');
  console.log('1. Sender reputation (your Gmail/domain is flagged)');
  console.log('2. Missing DMARC on RECEIVING domain');
  console.log('3. Worker throwing errors (check wrangler logs)');
  console.log('4. Cloudflare Email Routing spam filter');
  console.log('5. Rate limiting');
  console.log('');
  console.log('IMMEDIATE FIXES TO TRY:');
  console.log('');
  console.log('A. Deploy updated worker (has better error handling):');
  console.log('   wrangler deploy worker-email-routing.js --name calm-scene-39ae');
  console.log('');
  console.log('B. Check worker logs when sending test email:');
  console.log('   wrangler tail calm-scene-39ae');
  console.log('');
  console.log('C. Add missing DMARC to owntheedge.xyz:');
  console.log('   _dmarc.owntheedge.xyz TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@owntheedge.xyz"');
  console.log('');
  console.log('D. Use a different sending email address');
  console.log('   (Your current sender might be on a blocklist)');
}

checkEmailRoutingIssues();
