/**
 * Diagnostic: Check why custom domain emails bounce but default domain works
 */

const TOKEN = 'cfat_LblVy8FzwJdSVPv0j56E75eGzl4UvbeZegWTFWpFf88c670f';
const API = 'https://api.cloudflare.com/client/v4';
const HEADERS = { Authorization: 'Bearer ' + TOKEN };

async function diagnoseEmailRouting() {
  console.log('========================================');
  console.log('EMAIL ROUTING DIAGNOSTIC');
  console.log('========================================\n');
  
  // Check both domains
  const domains = [
    { name: 'owntheedge.xyz', type: 'DEFAULT' },
    { name: 'trueprop.xyz', type: 'CUSTOM' }
  ];
  
  for (const domain of domains) {
    console.log(`\n--- Checking ${domain.name} (${domain.type}) ---`);
    
    // Get zone
    const zoneRes = await fetch(`${API}/zones?name=${domain.name}`, { headers: HEADERS });
    const zoneData = await zoneRes.json();
    
    if (!zoneData.result?.[0]) {
      console.log('  Zone not found');
      continue;
    }
    
    const zoneId = zoneData.result[0].id;
    console.log('  Zone ID:', zoneId);
    console.log('  Zone Status:', zoneData.result[0].status);
    
    // Check MX records
    const dnsRes = await fetch(`${API}/zones/${zoneId}/dns_records?type=MX`, { headers: HEADERS });
    const dnsData = await dnsRes.json();
    console.log('  MX Records:');
    dnsData.result?.forEach(r => {
      console.log(`    Priority ${r.priority}: ${r.content}`);
    });
    
    // Check Email Routing status
    const routingRes = await fetch(`${API}/zones/${zoneId}/email/routing`, { headers: HEADERS });
    const routing = await routingRes.json();
    console.log('  Email Routing:', routing.result?.enabled ? 'ENABLED' : 'DISABLED');
    console.log('  Routing Status:', routing.result?.status);
    
    // Check routing rules
    const rulesRes = await fetch(`${API}/zones/${zoneId}/email/routing/rules`, { headers: HEADERS });
    const rules = await rulesRes.json();
    console.log('  Routing Rules:', rules.result?.length || 0);
    rules.result?.forEach((rule, i) => {
      console.log(`    Rule ${i+1}:`);
      console.log(`      Name: ${rule.name || 'unnamed'}`);
      console.log(`      Enabled: ${rule.enabled}`);
      console.log(`      Matchers: ${JSON.stringify(rule.matchers)}`);
      console.log(`      Actions: ${JSON.stringify(rule.actions)}`);
    });
    
    console.log();
  }
  
  console.log('\n========================================');
  console.log('COMPARISON:');
  console.log('========================================');
  console.log('');
  console.log('If both domains have:');
  console.log('  - Same MX records (route1/2/3.mx.cloudflare.net)');
  console.log('  - Email Routing: ENABLED');
  console.log('  - Active catch-all rule → calm-scene-39ae');
  console.log('');
  console.log('Then emails should work for BOTH.');
  console.log('');
  console.log('If custom domain is missing something, that is the issue.');
  console.log('');
  console.log('\nNext steps:');
  console.log('1. Check if worker logs show errors for custom domain');
  console.log('   wrangler tail calm-scene-39ae');
  console.log('');
  console.log('2. Send test email and immediately check worker logs');
  console.log('');
  console.log('3. Common issues:');
  console.log('   - Worker crashes before forwarding');
  console.log('   - Backend returns 500 error');
  console.log('   - Email address not found in database');
}

diagnoseEmailRouting();
