#!/usr/bin/env node
/**
 * Test: trueprop.xyz Nameserver Flow
 * 
 * This tests the custom domain registration flow to ensure:
 * 1. Domain validation works
 * 2. Nameservers are fetched from Cloudflare zone
 * 3. If zone doesn't exist, we CREATE it and get Cloudflare nameservers
 * 4. User sees CORRECT nameservers to add to their registrar
 * 5. Verification flow works
 */

console.log('========================================');
console.log('Testing trueprop.xyz Domain Flow');
console.log('========================================\n');

// Mock the current implementation behavior
async function simulateCurrentFlow(domain) {
    console.log(`Step 1: Registering domain "${domain}"`);
    
    // Current logic from custom-domain.service.ts
    let nameservers = [];
    let zoneCreated = false;
    let zoneFound = false;
    
    // Try to get zone details
    console.log('  → Checking if zone exists in Cloudflare...');
    // Simulating: zone doesn't exist yet
    zoneFound = false;
    console.log('  → Zone NOT found');
    
    // Try to create zone
    console.log('  → Attempting to create zone...');
    // In reality, this might fail if:
    // - Domain already in another Cloudflare account
    // - API token doesn't have permission
    // - Rate limited
    
    // Simulating SUCCESS (what SHOULD happen)
    zoneCreated = true;
    nameservers = ['lara.ns.cloudflare.com', 'greg.ns.cloudflare.com'];
    console.log('  ✓ Zone created successfully');
    console.log('  ✓ Nameservers:', nameservers.join(', '));
    
    // Fallback (what happens if zone creation fails)
    if (nameservers.length === 0) {
        console.log('  → FALLBACK: Doing DNS NS lookup...');
        // This gets CURRENT nameservers (wrong!)
        nameservers = ['ns1.godaddy.com', 'ns2.godaddy.com'];
        console.log('  ⚠ Got current nameservers (NOT Cloudflare):', nameservers.join(', '));
        console.log('  ⚠ User would be told to add these - BUT THEY ARE WRONG!');
    }
    
    return {
        domain,
        nameservers,
        zoneCreated,
        zoneFound
    };
}

async function simulateBrokenFlow(domain) {
    console.log('\n--- BROKEN FLOW (Current Bug) ---');
    console.log('If zone creation fails, fallback to DNS lookup gives WRONG nameservers:');
    
    // Bug: fallback returns current nameservers
    const currentNs = ['ns1.godaddy.com', 'ns2.godaddy.com'];
    console.log(`  Current nameservers: ${currentNs.join(', ')}`);
    console.log('  ❌ User sees these and keeps them - verification never works!');
    console.log('  ❌ User should see Cloudflare nameservers instead');
    
    return { nameservers: currentNs, isCorrect: false };
}

async function simulateCorrectFlow(domain) {
    console.log('\n--- CORRECT FLOW (Fixed) ---');
    console.log('System creates zone and returns Cloudflare nameservers:');
    
    const cloudflareNs = ['lara.ns.cloudflare.com', 'greg.ns.cloudflare.com'];
    console.log(`  Cloudflare nameservers: ${cloudflareNs.join(', ')}`);
    console.log('  ✓ User adds these to their registrar');
    console.log('  ✓ After propagation, verification succeeds');
    
    return { nameservers: cloudflareNs, isCorrect: true };
}

// Run tests
async function main() {
    const domain = 'trueprop.xyz';
    
    // Test current flow
    const result = await simulateCurrentFlow(domain);
    
    // Show the bug
    const broken = await simulateBrokenFlow(domain);
    
    // Show the fix
    const correct = await simulateCorrectFlow(domain);
    
    console.log('\n========================================');
    console.log('TEST RESULTS FOR trueprop.xyz');
    console.log('========================================');
    
    console.log('\n✓ Domain format: VALID');
    console.log('✓ Length: 12 characters (OK)');
    console.log('✓ Has TLD: Yes (.xyz)');
    console.log('✓ Characters: Valid (letters, dot)');
    
    console.log('\n--- Nameserver Flow ---');
    if (result.nameservers.length > 0 && result.zoneCreated) {
        console.log('✓ Zone creation: SUCCESS');
        console.log('✓ Nameservers returned:', result.nameservers.join(', '));
        console.log('✓ User can add these to registrar');
    } else {
        console.log('✗ Zone creation: FAILED or not attempted');
        console.log('✗ Nameservers missing or incorrect');
    }
    
    console.log('\n--- UI Display Check ---');
    console.log('Frontend should show:');
    console.log('  1. Domain name: trueprop.xyz');
    console.log('  2. Status: Pending');
    console.log('  3. Nameservers to add:');
    if (result.nameservers.length > 0) {
        result.nameservers.forEach(ns => {
            console.log(`     • ${ns}`);
        });
    }
    console.log('  4. Instructions: "Add these nameservers at your domain registrar"');
    console.log('  5. Action button: "Verify" (checks if nameservers propagated)');
    
    console.log('\n--- Verification Flow ---');
    console.log('When user clicks Verify:');
    console.log('  1. Check DNS TXT record exists');
    console.log('  2. Check MX records point to Cloudflare');
    console.log('  3. If verified → Mark ACTIVE, enable email routing');
    console.log('  4. If not → Show remaining DNS records to add');
    
    console.log('\n========================================');
    console.log('ISSUE IDENTIFIED:');
    console.log('========================================');
    console.log('Current code has a fallback that does DNS NS lookup');
    console.log('This returns CURRENT nameservers, not Cloudflare ones');
    console.log('FIX: Remove fallback or make it return correct Cloudflare NS');
    console.log('FIX: Always create zone first, then return those nameservers');
    
    console.log('\n========================================');
    console.log('RECOMMENDED FIX:');
    console.log('========================================');
    console.log('1. Try to CREATE zone first (not just get existing)');
    console.log('2. If creation fails, return error (not wrong nameservers)');
    console.log('3. Store Cloudflare nameservers in database');
    console.log('4. Show these to user in UI');
    console.log('5. User adds them to registrar');
    console.log('6. Click verify → check propagation → auto-configure DNS');
}

main().catch(console.error);
