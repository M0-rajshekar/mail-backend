const { PrismaClient } = require('./generated/prisma');

const prisma = new PrismaClient();

async function createInboxIfNeeded() {
  console.log('========================================');
  console.log('INBOX SETUP FOR trueprop.xyz');
  console.log('========================================\n');
  
  try {
    // Find the custom domain
    const domain = await prisma.customDomain.findFirst({
      where: { domain: 'trueprop.xyz' }
    });
    
    if (!domain) {
      console.log('❌ trueprop.xyz not found in database');
      return;
    }
    
    console.log('Domain found:');
    console.log('  ID:', domain.id);
    console.log('  Status:', domain.status);
    console.log('  Verified:', domain.verified);
    console.log();
    
    // Check if inbox exists
    const existingInbox = await prisma.inbox.findUnique({
      where: { emailAddress: 'yo@trueprop.xyz'.toLowerCase() }
    });
    
    if (existingInbox) {
      console.log('✅ Inbox already exists:');
      console.log('  Email:', existingInbox.emailAddress);
      console.log('  Status:', existingInbox.status);
    } else {
      console.log('❌ Inbox NOT found: yo@trueprop.xyz');
      console.log();
      console.log('You need to create this inbox in the dashboard:');
      console.log('  1. Go to Dashboard → Inboxes');
      console.log('  2. Click "Create Inbox"');
      console.log('  3. Select "trueprop.xyz" from domain dropdown');
      console.log('  4. Enter local part: "yo"');
      console.log('  5. Click Create');
      console.log();
      console.log('OR use the API:');
      console.log('  POST /api/email/inboxes');
      console.log('  Body: {');
      console.log('    "emailAddress": "yo@trueprop.xyz",');
      console.log('    "displayName": "Yo Inbox",');
      console.log('    "customDomainId": "' + domain.id + '"');
      console.log('  }');
    }
    
    // List all inboxes on this domain
    const domainInboxes = await prisma.inbox.findMany({
      where: { customDomainId: domain.id }
    });
    
    console.log('\n\nExisting inboxes on trueprop.xyz:', domainInboxes.length);
    domainInboxes.forEach(i => {
      console.log('  - ' + i.emailAddress + ' (' + i.status + ')');
    });
    
    if (domainInboxes.length === 0) {
      console.log('\n⚠️  No inboxes created yet!');
      console.log('You must create an inbox before emails can be received.');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createInboxIfNeeded();
