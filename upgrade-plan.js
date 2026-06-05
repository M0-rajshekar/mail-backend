const { PrismaClient } = require('./generated/prisma');

const prisma = new PrismaClient();

async function main() {
  const walletAddress = '0x3b9B597Add127eadf6D0d7cd20C3aaaC4ee94a96';
  
  const user = await prisma.user.findUnique({
    where: { walletAddress: walletAddress.toLowerCase() },
    include: { Subscription: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  
  if (!user) {
    console.error('User not found');
    process.exit(1);
  }
  
  console.log('User ID:', user.id);
  console.log('Current PaymentPlan:', user.currentPlan);
  console.log('Subscriptions:', user.Subscription);
  
  // Update user's currentPlan to SUBSCRIPTION (since they have a paid plan)
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { currentPlan: 'SUBSCRIPTION' },
  });
  
  console.log('\nUpdated PaymentPlan:', updated.currentPlan);
  
  // If they have no subscription, create one with ULTIMATE tier
  if (user.Subscription.length === 0) {
    console.log('\nCreating ULTIMATE subscription...');
    const sub = await prisma.subscription.create({
      data: {
        userId: user.id,
        subscriptionPlan: 'ULTIMATE',
        totalCredits: 999999,
        creditUsage: 0,
      },
    });
    console.log('Created subscription:', sub.subscriptionPlan);
  } else {
    // Update existing subscription to ULTIMATE
    console.log('\nUpdating subscription to ULTIMATE...');
    const sub = await prisma.subscription.update({
      where: { id: user.Subscription[0].id },
      data: { subscriptionPlan: 'ULTIMATE' },
    });
    console.log('Updated subscription:', sub.subscriptionPlan);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
