const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixUserPlans() {
  console.log('Updating users with active subscriptions...');
  
  // Update all users who have subscriptions but currentPlan is not SUBSCRIPTION
  const result = await prisma.$executeRaw`
    UPDATE "User" 
    SET "currentPlan" = 'SUBSCRIPTION' 
    WHERE id IN (
      SELECT DISTINCT "userId" 
      FROM "Subscription" 
      WHERE status IN ('CREATED', 'ACTIVE')
    )
    AND "currentPlan" != 'SUBSCRIPTION'
  `;
  
  console.log(`Updated ${result} user records`);
  
  // Verify the update
  const users = await prisma.$queryRaw`
    SELECT id, "currentPlan", email 
    FROM "User" 
    WHERE id IN (
      SELECT DISTINCT "userId" 
      FROM "Subscription" 
      WHERE status IN ('CREATED', 'ACTIVE')
    )
  `;
  
  console.log('Users with active subscriptions:', users);
}

fixUserPlans()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
