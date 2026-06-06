const API_BASE = 'http://localhost:3001/api/email/domains'; // Update this to your backend URL

async function testDomainRegistration() {
  console.log('=== TESTING DOMAIN REGISTRATION API ===\n');
  
  // Simulate the exact API call the frontend makes
  const testDomain = 'trueprop.xyz';
  
  console.log('1. Registering domain:', testDomain);
  console.log('   API Endpoint:', API_BASE);
  console.log('   Method: POST');
  console.log('   Body:', JSON.stringify({ domain: testDomain }));
  console.log('');
  
  try {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token' // Add your auth token if needed
      },
      body: JSON.stringify({ domain: testDomain })
    });
    
    const data = await response.json();
    
    console.log('2. API Response:');
    console.log('   Status:', response.status);
    console.log('   Success:', data.success !== false);
    console.log('');
    
    console.log('3. Response Data:');
    console.log('   Domain:', data.domain);
    console.log('   Status:', data.status);
    console.log('   Verified:', data.verified);
    console.log('   Nameservers:', data.nameservers);
    console.log('   Message:', data.message);
    console.log('');
    
    if (data.nameservers && data.nameservers.length > 0) {
      console.log('✅ SUCCESS! Nameservers returned correctly:');
      data.nameservers.forEach(ns => console.log('   -', ns));
    } else {
      console.log('❌ FAILURE! No nameservers returned');
      console.log('   Error message:', data.message);
    }
    
    return data;
    
  } catch (error) {
    console.log('❌ API CALL FAILED:', error.message);
    console.log('\nMake sure your backend server is running on:', API_BASE);
    return null;
  }
}

// Also test fetching domains (what the frontend does on page load)
async function testGetDomains() {
  console.log('\n\n=== TESTING GET DOMAINS API ===\n');
  
  try {
    const response = await fetch(API_BASE, {
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });
    
    const data = await response.json();
    
    console.log('API Response:');
    console.log('   Status:', response.status);
    console.log('   Domains count:', data.length);
    
    if (data.length > 0) {
      data.forEach(d => {
        console.log('\n   Domain:', d.domain);
        console.log('   Status:', d.status);
        console.log('   Nameservers:', d.nameservers);
      });
    } else {
      console.log('   No domains found');
    }
    
    return data;
  } catch (error) {
    console.log('❌ API CALL FAILED:', error.message);
    return null;
  }
}

// Run tests
async function main() {
  // First test registration
  const regResult = await testDomainRegistration();
  
  // Then test listing
  await testGetDomains();
  
  console.log('\n\n=== DIAGNOSIS ===');
  if (!regResult) {
    console.log('Backend server is not running or not accessible');
    console.log('Start your backend: cd backend && npm run start:dev');
  } else if (!regResult.nameservers || regResult.nameservers.length === 0) {
    console.log('Backend is still returning empty nameservers');
    console.log('The backend code may not be reloaded/restarted after changes');
    console.log('');
    console.log('FIX:');
    console.log('1. Stop your backend server');
    console.log('2. Run: cd backend && npm run build');
    console.log('3. Start again: cd backend && npm run start:dev');
    console.log('4. Then test again');
  } else {
    console.log('Backend is working correctly!');
    console.log('If frontend still shows error, the issue is frontend caching or not calling API');
  }
}

main();
