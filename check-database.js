const { PrismaClient } = require('./generated/prisma');

const prisma = new PrismaClient();

async function checkAndFix() {
  console.log('=== Checking Database State ===\n');
  
  // Get all custom domains
  const domains = await prisma.customDomain.findMany({
    select: {
      id: true,
      domain: true,
      status: true,
      verified: true,
      nameservers: true,
      createdAt: true
    }
  });
  
  console.log('Found', domains.length, 'domain(s):');
  domains.forEach(d => {
    console.log('\n  Domain:', d.domain);
    console.log('  ID:', d.id);
    console.log('  Status:', d.status);
    console.log('  Verified:', d.verified);
    console.log('  Nameservers:', d.nameservers);
  });
  
  // Check if trueprop.xyz is incorrectly marked as verified
  const trueprop = domains.find(d => d.domain === 'trueprop.xyz');
  
  if (trueprop && trueprop.verified) {
    console.log('\n\n⚠️  PROBLEM FOUND!');
    console.log('trueprop.xyz is marked as verified but nameservers are not updated!');
    console.log('\nFixing...');
    
    // Reset to unverified/PENDING
    await prisma.customDomain.update({
      where: { id: trueprop.id },
      data: {
        verified: false,
        status: 'PENDING',
        mxConfigured: false
      }
    });
    
    console.log('✅ Fixed! Domain reset to PENDING status.');
  } else if (trueprop && !trueprop.verified) {
    console.log('\n\n✓ Domain is correctly marked as NOT verified');
  } else {
    console.log('\n\nℹ️  No trueprop.xyz found in database');
  }
  
  await prisma.$disconnect();
}

checkAndFix().catch(console.error);
