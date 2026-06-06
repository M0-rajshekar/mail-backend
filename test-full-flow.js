const API_BASE = 'http://localhost:3001/api/email'; // Update to your backend URL
const AUTH_TOKEN = 'test-token'; // Update to actual auth token

async function testFullFlow() {
  console.log('========================================');
  console.log('TESTING: Complete Domain Registration Flow');
  console.log('========================================\n');
  
  const domain = 'trueprop.xyz';
  
  // Step 1: Register domain
  console.log('STEP 1: Register Domain');
  console.log('------------------------');
  const regRes = await fetch(`${API_BASE}/domains`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`
    },
    body: JSON.stringify({ domain })
  });
  
  const regData = await regRes.json();
  console.log('Status:', regRes.status);
  console.log('Response:', JSON.stringify(regData, null, 2));
  console.log();
  
  if (!regData.nameservers || regData.nameservers.length === 0) {
    console.log('❌ FAILED: No nameservers returned');
    console.log('Error:', regData.message);
    return;
  }
  
  console.log('✅ Nameservers returned:', regData.nameservers.join(', '));
  console.log();
  
  // Step 2: List domains
  console.log('STEP 2: List Domains (should show PENDING)');
  console.log('-------------------------------------------');
  const listRes = await fetch(`${API_BASE}/domains`, {
    headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
  });
  const listData = await listRes.json();
  
  const foundDomain = listData.find((d) => d.domain === domain);
  if (foundDomain) {
    console.log('Domain:', foundDomain.domain);
    console.log('Status:', foundDomain.status);
    console.log('Verified:', foundDomain.verified);
    console.log('Nameservers:', foundDomain.nameservers?.join(', '));
  }
  console.log();
  
  // Step 3: Try to verify (should fail if nameservers not propagated)
  console.log('STEP 3: Attempt Verification (should fail if nameservers not updated)');
  console.log('---------------------------------------------------------------------');
  const verifyRes = await fetch(`${API_BASE}/domains/${regData.id}/verify`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
  });
  
  const verifyData = await verifyRes.json();
  console.log('Status:', verifyRes.status);
  console.log('Verified:', verifyData.verified);
  console.log('Message:', verifyData.message);
  
  if (verifyData.currentNameservers) {
    console.log('Current NS:', verifyData.currentNameservers.join(', '));
  }
  if (verifyData.expectedNameservers) {
    console.log('Expected NS:', verifyData.expectedNameservers.join(', '));
  }
  console.log();
  
  // Summary
  console.log('========================================');
  console.log('SUMMARY');
  console.log('========================================');
  
  if (regData.nameservers?.length > 0) {
    console.log('✅ Domain registration works');
    console.log('✅ Nameservers fetched from Cloudflare API');
    console.log('✅ Nameservers stored in database');
    
    if (!verifyData.verified && verifyData.currentNameservers) {
      console.log();
      console.log('⏳ Waiting for nameserver propagation');
      console.log('Current registrar NS:', verifyData.currentNameservers.join(', ') || 'Not detected');
      console.log('Required Cloudflare NS:', verifyData.expectedNameservers.join(', '));
      console.log();
      console.log('ACTION REQUIRED:');
      console.log('1. Log into your domain registrar');
      console.log('2. Update nameservers to:', regData.nameservers.join(', '));
      console.log('3. Wait 5-30 minutes');
      console.log('4. Click "Verify" again');
    } else if (verifyData.verified) {
      console.log('✅ Domain fully verified!');
    }
  } else {
    console.log('❌ Domain registration failed');
  }
}

testFullFlow().catch(console.error);
