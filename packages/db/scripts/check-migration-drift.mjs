/**
 * Migration drift gate (ARCH-02 §7.6, mandate M3.1).
 *
 * Two INDEPENDENT checks, because their prerequisites differ:
 *
 *  1. Rebuild 0P3__p0_3_backlog/migration.sql from schema.prisma + fragments/ and
 *     fail if the committed file differs. Needs no database. Catches "schema
 *     edited, migration not regenerated" everywhere, including on a laptop.
 *
 *  2. Apply the migrations to an empty shadow database and assert
 *     `prisma migrate diff --from-migrations --to-schema-datamodel` is empty, i.e.
 *     the physical database and the Prisma schema cannot disagree. Runs only when
 *     SHADOW_DATABASE_URL points at an EMPTY database, because
 *     `prisma migrate diff --from-migrations` *applies* the migrations into it.
 *     A populated shadow database fails this check for the wrong reason.
 *
 * The two are gated on different variables on purpose: conflating them on
 * DATABASE_URL meant a job with a migration target also tried to run the
 * comparison against a database that did not exist yet.
 *
 * Exit code 0 = in sync. Non-zero = drift (or an unusable shadow database, which
 * is reported as such rather than as drift).
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

const shadowUrl = process.env.SHADOW_DATABASE_URL;
if (!shadowUrl) {
  process.stdout.write("[db] shadow-database comparison skipped (no SHADOW_DATABASE_URL)\n");
  process.exit(0);
}

let diff;
try {
  diff = prisma([
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
} catch (error) {
  const details = String(error?.stderr ?? error?.message ?? "").split("\n").slice(0, 3).join(" ");
  process.stderr.write(
    `[db] the shadow-database comparison could not run against ${shadowUrl}\n[db] ${details}\n` +
      "[db] this database must exist and be EMPTY: prisma migrate diff --from-migrations\n" +
      "[db] applies the migrations into it. Recreate it (DROP + CREATE) before running this check.\n",
  );
  process.exit(1);
}

process.exit(diff === null || diff === undefined ? 0 : 1);
