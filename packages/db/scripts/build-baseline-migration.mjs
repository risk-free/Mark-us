/**
 * Rebuilds packages/db/prisma/migrations/0P3__p0_3_backlog/migration.sql from
 * two reproducible inputs:
 *
 *   1. the DDL Prisma derives from prisma/schema.prisma  (machine-generated)
 *   2. fragments/*.sql in lexical order                  (authored: partial and
 *      functional indexes, CHECK constraints, extensions, sequences, BRIN,
 *      autovacuum — everything Prisma cannot express, ARCH-02 §4.2/§5.3)
 *
 * Why a script instead of a hand-edited migration.sql: ARCH-02 §7.6 requires that
 * the schema and the migrations can never drift. `pnpm db:build-migration` then
 * `git diff --exit-code prisma/migrations` is a CI-enforceable drift gate that
 * needs no database. Applying the migration to a scratch database and diffing
 * against the schema (the other half of the gate) runs in CI, which has Postgres.
 *
 * Usage: pnpm --filter @markus/db db:build-migration
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "0P3__p0_3_backlog";
const migrationDir = path.join(packageRoot, "prisma", "migrations", migrationName);
const fragmentDir = path.join(migrationDir, "fragments");
const migrationFile = path.join(migrationDir, "migration.sql");
const generatedFile = path.join(migrationDir, ".generated.sql");

const header = [
  "-- GENERATED FILE — do not edit.",
  "-- Rebuild with: pnpm --filter @markus/db db:build-migration",
  "-- Sources: prisma/schema.prisma + prisma/migrations/" + migrationName + "/fragments/*.sql",
  "-- Authority: docs/architecture/02-data-model.md (ARCH-02) §5, §7",
  "",
].join("\n");

const run = (args) =>
  execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), ...args], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

mkdirSync(fragmentDir, { recursive: true });

run([
  "migrate",
  "diff",
  "--from-empty",
  "--to-schema-datamodel",
  "prisma/schema.prisma",
  "--script",
  "-o",
  path.relative(packageRoot, generatedFile),
]);

const generated = readFileSync(generatedFile, "utf8").trimEnd();
rmSync(generatedFile, { force: true });

const fragments = readdirSync(fragmentDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(path.join(fragmentDir, name), "utf8").trimEnd());

const banner = [
  "",
  "-- " + "=".repeat(74),
  "-- BEGIN AUTHORED FRAGMENTS (Prisma cannot express these; see ARCH-02 §4.2/§5.3)",
  "-- " + "=".repeat(74),
  "",
].join("\n");

writeFileSync(
  migrationFile,
  `${header}\n${generated}\n${banner}\n${fragments.join("\n\n")}\n`,
  "utf8",
);

const createTableCount = (generated.match(/^CREATE TABLE/gm) ?? []).length;
process.stdout.write(
  `[db] migration.sql rebuilt: ${createTableCount} tables, ${fragments.length} fragment(s)\n`,
);
