/**
 * Migration drift gate (ARCH-02 §7.6, mandate M3.1).
 *
 * Two independent checks:
 *
 *  1. Always: rebuild 0P3__p0_3_backlog/migration.sql from schema.prisma +
 *     fragments/ and fail if the committed file differs. This catches "schema
 *     edited, migration not regenerated" without needing a database.
 *
 *  2. When DATABASE_URL points at a reachable Postgres: apply the migrations to a
 *     shadow database and assert `prisma migrate diff --from-migrations
 *     --to-schema-datamodel` is empty, i.e. the physical database and the
 *     Prisma schema can never disagree. Skipped (with a notice) when no database
 *     is configured, so local `pnpm test` never depends on one.
 *
 * Exit code 0 = in sync. Non-zero = drift; the committed file is left untouched.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "0P3__p0_3_backlog";
const migrationFile = path.join(packageRoot, "prisma", "migrations", migrationName, "migration.sql");

const prisma = (args) =>
  execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), ...args], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

const before = readFileSync(migrationFile, "utf8");

execFileSync(process.execPath, [path.join(packageRoot, "scripts", "build-baseline-migration.mjs")], {
  cwd: packageRoot,
  stdio: ["ignore", "inherit", "inherit"],
});

const after = readFileSync(migrationFile, "utf8");

if (before !== after) {
  writeFileSync(migrationFile, before, "utf8");
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  let line = 0;
  while (line < beforeLines.length && beforeLines[line] === afterLines[line]) line += 1;
  process.stderr.write(
    [
      "[db] MIGRATION DRIFT: migration.sql is not what schema.prisma + fragments produce.",
      `[db] first difference at line ${line + 1}:`,
      `  committed: ${JSON.stringify(beforeLines[line] ?? "<eof>")}`,
      `  rebuilt:   ${JSON.stringify(afterLines[line] ?? "<eof>")}`,
      "[db] run: pnpm --filter @markus/db db:build-migration, then commit the result.",
      "[db] the committed file has been restored.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

process.stdout.write("[db] migration.sql matches schema.prisma + fragments\n");

if (!process.env.DATABASE_URL) {
  process.stdout.write("[db] schema-diff check skipped (no DATABASE_URL)\n");
  process.exit(0);
}

const shadowUrl = process.env.SHADOW_DATABASE_URL ?? process.env.DATABASE_URL;
const diff = prisma([
  "migrate",
  "diff",
  "--from-migrations",
  "prisma/migrations",
  "--to-schema-datamodel",
  "prisma/schema.prisma",
  "--shadow-database-url",
  shadowUrl,
  "--exit-code",
]);

process.exit(diff === null || diff === undefined ? 0 : 1);
