const { PrismaClient } = require('./generated/prisma');

const prisma = new PrismaClient();

async function clearDomains() {
  try {
    console.log('=== Clearing Custom Domains Database ===\n');
    
    // Get count before
    const beforeCount = await prisma.customDomain.count();
    console.log(`Found ${beforeCount} custom domains`);
    
    // Show which domains will be deleted
    const domains = await prisma.customDomain.findMany({
      select: { id: true, domain: true, status: true }
    });
    
    if (domains.length === 0) {
      console.log('No custom domains found. Nothing to clear.');
      return;
    }
    
    console.log('\nDomains to delete:');
    domains.forEach(d => {
      console.log(`  - ${d.domain} (${d.status}) [ID: ${d.id}]`);
    });
    
    // Delete inboxes linked to custom domains first (to avoid foreign key errors)
    console.log('\nDeleting linked inboxes...');
    const deletedInboxes = await prisma.inbox.deleteMany({
      where: { customDomainId: { not: null } }
    });
    console.log(`  Deleted ${deletedInboxes.count} inboxes`);
    
    // Delete custom domains
    console.log('\nDeleting custom domains...');
    const deletedDomains = await prisma.customDomain.deleteMany({});
    console.log(`  Deleted ${deletedDomains.count} custom domains`);
    
    // Verify
    const afterCount = await prisma.customDomain.count();
    console.log(`\n✓ Database cleared! Remaining custom domains: ${afterCount}`);
    
    console.log('\n=== NEXT STEPS ===');
    console.log('1. Restart your backend server');
    console.log('2. Go to Dashboard → Domains');
    console.log('3. Add trueprop.xyz again');
    console.log('4. It will now work with the new token!');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

clearDomains();
