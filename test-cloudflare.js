require('dotenv').config();

const API = 'https://api.cloudflare.com/client/v4';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const HEADERS = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function main() {
  const domain = 'trueprop.xyz';
  
  console.log('Token length:', TOKEN?.length || 0);
  console.log('Account ID:', ACCOUNT_ID);

  // 1. List all zones
  console.log('\n--- GET /zones ---');
  const zonesRes = await fetch(`${API}/zones?name=${domain}&status=active`, { headers: HEADERS });
  const zones = await zonesRes.json();
  console.log('Status:', zonesRes.status);
  console.log('Found:', zones.result?.length, 'zones');
  if (zones.result?.[0]) {
    console.log('Zone ID:', zones.result[0].id);
    console.log('Status:', zones.result[0].status);
    console.log('Nameservers:', zones.result[0].name_servers);
  }
  if (zones.errors?.length) console.log('Errors:', JSON.stringify(zones.errors));

  // 2. Try without status filter
  console.log('\n--- GET /zones (all statuses) ---');
  const zonesAll = await fetch(`${API}/zones?name=${domain}`, { headers: HEADERS });
  const allZones = await zonesAll.json();
  console.log('Status:', zonesAll.status);
  console.log('Found:', allZones.result?.length, 'zones');
  if (allZones.result?.[0]) {
    console.log('Status:', allZones.result[0].status);
    console.log('Nameservers:', allZones.result[0].name_servers);
  }

  // 3. Try creating zone
  console.log('\n--- POST /zones (create) ---');
  const createRes = await fetch(`${API}/zones`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ name: domain, type: 'full', account: { id: ACCOUNT_ID } }),
  });
  const createData = await createRes.json();
  console.log('Status:', createRes.status);
  console.log('Success:', createData.success);
  if (createData.result) {
    console.log('Zone ID:', createData.result.id);
    console.log('Nameservers:', createData.result.name_servers);
  }
  if (createData.errors?.length) console.log('Errors:', JSON.stringify(createData.errors, null, 2));
}

main().catch(console.error);
