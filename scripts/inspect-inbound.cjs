/**
 * Read-only diagnostic: inspect the latest inbound emails to see whether
 * attachments were parsed/stored. Prints metadata only — never email body
 * content. Helps pinpoint why an attachment didn't show in the frontend.
 *
 * Usage: node --env-file=.env scripts/inspect-inbound.cjs
 */
const { PrismaClient } = require('../generated/prisma');

const db = new PrismaClient();

async function main() {
  const msgs = await db.emailMessage.findMany({
    where: { direction: 'INBOUND' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      fromAddress: true,
      subject: true,
      body: true,
      bodyHtml: true,
      attachments: true,
      createdAt: true,
    },
  });

  if (msgs.length === 0) {
    console.log('No inbound messages found.');
    return;
  }

  for (const m of msgs) {
    const atts = Array.isArray(m.attachments) ? m.attachments : [];
    console.log('────────────────────────────────────────');
    console.log(`at:        ${m.createdAt.toISOString()}`);
    console.log(`from:      ${m.fromAddress}`);
    console.log(`subject:   ${m.subject}`);
    console.log(`bodyLen:   ${(m.body || '').length}   hasBodyHtml: ${!!m.bodyHtml}`);
    console.log(`attachments: ${atts.length}`);
    atts.forEach((a, i) =>
      console.log(
        `   [${i}] ${a.filename} | ${a.mimetype} | ${a.size}B | s3Key=${a.s3Key ? 'SET' : 'NULL'}`,
      ),
    );
  }
  console.log('────────────────────────────────────────');
  console.log('Read: bodyLen>0 + attachments 0  => fallback path ran (no rawEmail / parse failed)');
  console.log('      attachments>0 + s3Key NULL  => storage failed');
  console.log('      attachments>0 + s3Key SET   => stored fine (frontend/refetch issue)');
}

main()
  .catch((e) => {
    console.error('Inspect failed:', e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
