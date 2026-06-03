import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixUserPlans() {
  // Get all users with active subscriptions but currentPlan != SUBSCRIPTION
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: {
        in: ['CREATED', 'ACTIVE'],
      },
    },
    include: {
      user: true,
    },
  });

  console.log(`Found ${subscriptions.length} active subscriptions`);

  for (const sub of subscriptions) {
    if (sub.user.currentPlan !== 'SUBSCRIPTION') {
      console.log(`Updating user ${sub.user.id} currentPlan from ${sub.user.currentPlan} to SUBSCRIPTION`);
      await prisma.user.update({
        where: { id: sub.user.id },
        data: { currentPlan: 'SUBSCRIPTION' },
      });
    }
  }

  console.log('Done!');
}

fixUserPlans()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
