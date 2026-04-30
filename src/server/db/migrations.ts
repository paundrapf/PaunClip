import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

export async function ensureDatabaseMigrations(databaseUrl = process.env.DATABASE_URL ?? "file:../storage/paunclip.db") {
  const migrationDir = path.resolve(process.cwd(), "prisma", "migrations");
  const migrationFiles = fs.existsSync(migrationDir)
    ? fs
        .readdirSync(migrationDir)
        .sort()
        .map((dir) => path.join(migrationDir, dir, "migration.sql"))
        .filter((file) => fs.existsSync(file))
    : [];

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "_paunclip_migrations" ("id" TEXT PRIMARY KEY, "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)'
    );
    const appliedRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "_paunclip_migrations"'
    );
    const applied = new Set(appliedRows.map((row) => row.id));
    const sessionTables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='Session'"
    );
    const hasExistingSchema = sessionTables.length > 0;

    for (const file of migrationFiles) {
      const migrationId = path.basename(path.dirname(file));
      if (applied.has(migrationId)) {
        continue;
      }
      if (hasExistingSchema && migrationId.endsWith("_init")) {
        await prisma.$executeRawUnsafe(
          'INSERT OR IGNORE INTO "_paunclip_migrations" ("id") VALUES (?)',
          migrationId
        );
        applied.add(migrationId);
        continue;
      }

      const sql = fs.readFileSync(file, "utf8").replace(/^--.*$/gm, "");
      const statements = sql
        .split(/;\s*(?:\r?\n|$)/)
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) {
        await prisma.$executeRawUnsafe(statement);
      }
      await prisma.$executeRawUnsafe(
        'INSERT OR IGNORE INTO "_paunclip_migrations" ("id") VALUES (?)',
        migrationId
      );
      applied.add(migrationId);
    }
  } finally {
    await prisma.$disconnect();
  }
}
