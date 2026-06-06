const API_BASE = 'http://localhost:3001/api/email'; // Update if different

async function testVerification() {
  console.log('========================================');
  console.log('TESTING: Domain Verification with Nameserver Check');
  console.log('========================================\n');
  
  // First, get all domains
  console.log('1. Getting domains...');
  const getRes = await fetch(`${API_BASE}/domains`, {
    headers: { 'Authorization': 'Bearer test-token' }
  });
  const domains = await getRes.json();
  
  if (!domains || domains.length === 0) {
    console.log('No domains found. Add a domain first.');
    return;
  }
  
  const domain = domains[0];
  console.log(`   Domain: ${domain.domain}`);
  console.log(`   Status: ${domain.status}`);
  console.log(`   Verified: ${domain.verified}`);
  console.log(`   Expected Nameservers: ${domain.nameservers?.join(', ') || 'None'}`);
  console.log();
  
  // Try to verify
  console.log(`2. Calling verify API for domain ${domain.id}...`);
  const verifyRes = await fetch(`${API_BASE}/domains/${domain.id}/verify`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer test-token' }
  });
  
  const result = await verifyRes.json();
  
  console.log('3. Verification Result:');
  console.log('   Status:', verifyRes.status);
  console.log('   Verified:', result.verified);
  console.log('   Message:', result.message);
  if (result.steps) {
    console.log('   Steps:', result.steps);
  }
  if (result.nameservers) {
    console.log('   Nameservers:', result.nameservers);
  }
  
  console.log('\n========================================');
  if (result.verified) {
    console.log('✅ Domain is properly verified!');
  } else {
    console.log('❌ Domain NOT verified yet');
    console.log('Expected: Nameservers must match Cloudflare-assigned nameservers');
    console.log('Current registrar nameservers need to be updated first');
  }
  console.log('========================================');
}

testVerification().catch(console.error);
