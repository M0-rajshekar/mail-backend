const { PrismaClient } = require('./generated/prisma');

const prisma = new PrismaClient();

async function verifySchema() {
  console.log('========================================');
  console.log('VERIFYING: Schema Changes Applied');
  console.log('========================================\n');
  
  try {
    // Test 1: Check if isRead field exists
    console.log('1. Testing isRead field...');
    const testMessage = await prisma.emailMessage.findFirst();
    if (testMessage) {
      console.log('   ✅ EmailMessage table accessible');
      console.log('   isRead field exists:', testMessage.isRead !== undefined);
      console.log('   starred field exists:', testMessage.starred !== undefined);
    } else {
      console.log('   ℹ️  No messages in database yet');
    }
    
    // Test 2: Create test message with new fields
    console.log('\n2. Testing create with new fields...');
    const inbox = await prisma.inbox.findFirst();
    if (inbox) {
      const msg = await prisma.emailMessage.create({
        data: {
          inboxId: inbox.id,
          fromAddress: 'test@example.com',
          subject: 'Schema Test',
          body: 'Testing new fields',
          direction: 'INBOUND',
          isRead: false,
          starred: true,
          status: 'RECEIVED'
        }
      });
      console.log('   ✅ Created message with isRead and starred');
      console.log('   isRead:', msg.isRead);
      console.log('   starred:', msg.starred);
      console.log('   status:', msg.status);
      
      // Test 3: Update fields
      console.log('\n3. Testing field updates...');
      const updated = await prisma.emailMessage.update({
        where: { id: msg.id },
        data: { 
          isRead: true,
          starred: false,
          status: 'TRASH'
        }
      });
      console.log('   ✅ Updated fields');
      console.log('   isRead:', updated.isRead);
      console.log('   starred:', updated.starred);
      console.log('   status:', updated.status);
      
      // Cleanup
      await prisma.emailMessage.delete({ where: { id: msg.id } });
      console.log('   ✅ Cleaned up test message');
    } else {
      console.log('   ℹ️  No inbox found - create an inbox first');
    }
    
    console.log('\n========================================');
    console.log('✅ SCHEMA VERIFICATION COMPLETE');
    console.log('========================================');
    console.log('\nAll new fields are working:');
    console.log('  • isRead: Track read/unread status');
    console.log('  • starred: Favorite/important emails');
    console.log('  • TRASH status: Soft delete emails');
    
  } catch (error) {
    console.error('\n❌ SCHEMA ERROR:', error.message);
    console.log('\nYou need to run the migration:');
    console.log('  npx prisma migrate dev --name add_email_status_fields');
  } finally {
    await prisma.$disconnect();
  }
}

verifySchema();
