const API_BASE = 'http://localhost:3001/api/email'; // Update if different

async function testRegisterDomain() {
  console.log('========================================');
  console.log('TESTING: Register trueprop.xyz with FIXED backend');
  console.log('========================================\n');
  
  try {
    // Step 1: Register domain
    console.log('1. POST /api/email/domains');
    console.log('   Body: { domain: "trueprop.xyz" }\n');
    
    const response = await fetch(`${API_BASE}/domains`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify({ domain: 'trueprop.xyz' })
    });
    
    const data = await response.json();
    
    console.log('2. Response Status:', response.status);
    console.log('3. Response Body:');
    console.log(JSON.stringify(data, null, 2));
    
    console.log('\n4. RESULT CHECK:');
    if (data.nameservers && data.nameservers.length > 0) {
      console.log('   ✅ SUCCESS! Nameservers returned:');
      data.nameservers.forEach(ns => console.log(`      - ${ns}`));
    } else {
      console.log('   ❌ FAILURE! No nameservers returned');
      console.log('   Message:', data.message);
    }
    
    return data;
  } catch (error) {
    console.log('❌ API ERROR:', error.message);
    console.log('\nMake sure backend is running: cd backend && npm run start:dev');
    return null;
  }
}

async function testGetDomains() {
  console.log('\n\n========================================');
  console.log('TESTING: GET /api/email/domains');
  console.log('========================================\n');
  
  try {
    const response = await fetch(`${API_BASE}/domains`, {
      headers: { 'Authorization': 'Bearer test-token' }
    });
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.length > 0 && data[0].nameservers?.length > 0) {
      console.log('\n✅ Frontend will show nameservers correctly!');
    } else {
      console.log('\n❌ Frontend will still show error');
    }
    
    return data;
  } catch (error) {
    console.log('❌ API ERROR:', error.message);
    return null;
  }
}

// Run tests
async function main() {
  const regResult = await testRegisterDomain();
  await testGetDomains();
  
  console.log('\n\n========================================');
  console.log('DIAGNOSIS');
  console.log('========================================');
  
  if (!regResult) {
    console.log('Backend is not running or not accessible');
    console.log('Start it with: cd backend && npm run start:dev');
  } else if (regResult.nameservers?.length > 0) {
    console.log('✅ Backend is working correctly!');
    console.log('If frontend still shows error:');
    console.log('1. Frontend is cached - hard refresh (Ctrl+F5)');
    console.log('2. Frontend not calling API correctly');
    console.log('3. Check browser devtools Network tab');
  } else {
    console.log('❌ Backend still returning empty nameservers');
    console.log('The code fix may need backend restart');
  }
}

main();
