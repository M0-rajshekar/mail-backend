const API = 'https://api.cloudflare.com/client/v4';
const TOKEN = 'cfat_0bLIwHLBSjIBu8K3NgwDFiibjBi07PNBrgXo5gpQea4bf9a1';
const ACCOUNT_ID = '2ec38ae5776fe62e3f11a08fd51e4821';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function go() {
  // Test 1: List zones
  console.log('1. All zones:');
  const r1 = await fetch(`${API}/zones?per_page=3`, { headers: H });
  const d1 = await r1.json();
  console.log('   success:', d1.success, '| count:', d1.result?.length);

  // Test 2: Create zone for trueprop.xyz  
  console.log('\n2. Create zone trueprop.xyz:');
  const r2 = await fetch(`${API}/zones`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ name: 'trueprop.xyz', type: 'full', account: { id: ACCOUNT_ID } }),
  });
  const d2 = await r2.json();
  console.log('   success:', d2.success);
  if (d2.errors) d2.errors.forEach(e => console.log('   error:', e.code, e.message));
  if (d2.result) console.log('   NS:', d2.result.name_servers?.join(', '));

  // Test 3: Get zone if exists
  console.log('\n3. Find zone trueprop.xyz:');
  const r3 = await fetch(`${API}/zones?name=trueprop.xyz`, { headers: H });
  const d3 = await r3.json();
  console.log('   success:', d3.success, '| found:', d3.result?.length);
  if (d3.result?.[0]) console.log('   NS:', d3.result[0].name_servers?.join(', '));
}

go().catch(e => console.error(e.message));
