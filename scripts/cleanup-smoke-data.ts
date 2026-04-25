import { rm } from "node:fs/promises";
import { db } from "../src/server/db/client";

async function main() {
  const sessions = await db.session.findMany({
    where: { sourceTitle: "Smoke test video" },
    select: { id: true }
  });

  await db.session.deleteMany({
    where: { sourceTitle: "Smoke test video" }
  });

  for (const session of sessions) {
    await rm(`storage/sessions/${session.id}`, { recursive: true, force: true });
  }

  console.log(`Cleaned ${sessions.length} smoke session(s).`);
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
