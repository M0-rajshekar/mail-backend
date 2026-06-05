const { PrismaClient } = require('./generated/prisma');

const prisma = new PrismaClient();

async function main() {
  // Check if column exists
  const result = await prisma.$queryRaw`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'inboxes' AND column_name = 'customDomainId'
  `;
  console.log('Column exists:', result);

  // Check if foreign key exists
  const fkResult = await prisma.$queryRaw`
    SELECT constraint_name 
    FROM information_schema.table_constraints 
    WHERE table_name = 'inboxes' AND constraint_name = 'inboxes_customDomainId_fkey'
  `;
  console.log('Foreign key exists:', fkResult);

  // List all columns
  const allColumns = await prisma.$queryRaw`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'inboxes'
    ORDER BY ordinal_position
  `;
  console.log('\nAll columns in inboxes table:');
  console.table(allColumns);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
