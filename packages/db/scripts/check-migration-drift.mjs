/**
 * Migration drift gate (ARCH-02 §7.6, mandate M3.1).
 *
 * Two INDEPENDENT checks, because their prerequisites differ:
 *
 *  1. Rebuild 0P3__p0_3_backlog/migration.sql from schema.prisma + fragments/ and
 *     fail if the committed file differs. Needs no database. Catches "schema
 *     edited, migration not regenerated" everywhere, including on a laptop.
 *
 *  2. Apply the migrations to an EMPTY shadow database, then assert that
 *     everything the Prisma schema models exists in the physical database. Runs
 *     only when SHADOW_DATABASE_URL points at an empty database, because
 *     `prisma migrate diff` applies the migrations into it.
 *
 *     Polarity matters. `migrate diff --from-migrations --to-schema-datamodel`
 *     demands the database match the datamodel EXACTLY, which is the wrong
 *     question here: ARCH-02 §4.2.4/§5.3 mandate indexes, constraints, sequences
 *     and extensions that Prisma cannot express, and those always read as drift
 *     in that direction. So the diff runs datamodel -> database instead:
 *
 *       [-] something the schema models is missing from the database -> FAIL
 *       [+] something extra exists in the database              -> expected,
 *            because the authored fragments are the declared source of extras
 *
 *     Everything in fragments/*.sql shows up as a `[+]` line, which is exactly
 *     the evidence that the fragments were applied.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
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

let diffOutput = "";
try {
  diffOutput = prisma([
    "migrate",
    "diff",
    "--from-schema-datamodel",
    "prisma/schema.prisma",
    "--to-schema-datasource",
    "prisma/schema.prisma",
    "--shadow-database-url",
    shadowUrl,
  ]);
} catch (error) {
  const details = String(error?.stderr ?? error?.message ?? "").split("\n").slice(0, 4).join(" ");
  process.stderr.write(
    `[db] the shadow-database comparison could not run against ${shadowUrl}\n[db] ${details}\n` +
      "[db] this database must exist and be EMPTY: prisma migrate diff applies the\n" +
      "[db] migrations into it. Recreate it (DROP + CREATE) before running this check.\n",
  );
  process.exit(1);
}

const removed = diffOutput.split("\n").filter((line) => line.includes("[-]"));
const added = diffOutput.split("\n").filter((line) => line.includes("[+]"));

if (removed.length > 0) {
  process.stderr.write(
    [
      `[db] MIGRATION DRIFT: ${removed.length} object(s) modelled by schema.prisma are missing from the database:`,
      ...removed.map((line) => `  ${line.trim()}`),
      "",
    ].join("\n"),
  );
  process.exit(1);
}

process.stdout.write(
  `[db] schema objects all present; ${added.length} extra object(s) in the database (authored fragments — expected)\n`,
);

/*
 * Check 3 — the authored fragment objects exist in the live database, by name.
 *
 * Check 2 cannot do this. Prisma's diff model does not include CHECK
 * constraints, sequences or extensions at all, so the hand-written objects in
 * fragments/*.sql are invisible to it: 20-odd indexes and constraints that the
 * architecture requires would fail to apply and this gate would still say green.
 * So the names are extracted from the fragments and looked up directly.
 */
if (!process.env.DATABASE_URL) {
  process.stdout.write("[db] fragment verification skipped (no DATABASE_URL)\n");
  process.exit(0);
}

const fragmentDir = path.join(packageRoot, "prisma", "migrations", migrationName, "fragments");
const fragmentSql = readdirSync(fragmentDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(path.join(fragmentDir, name), "utf8"))
  .join("\n");

const expected = {
  indexes: [...fragmentSql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+([a-z0-9_]+)/gi)].map((m) => m[1].toLowerCase()),
  constraints: [...fragmentSql.matchAll(/ADD\s+CONSTRAINT\s+([a-z0-9_]+)/gi)].map((m) => m[1].toLowerCase()),
  sequences: [...fragmentSql.matchAll(/CREATE\s+SEQUENCE\s+([a-z0-9_]+)/gi)].map((m) => m[1].toLowerCase()),
  extensions: [...fragmentSql.matchAll(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)/gi)].map((m) => m[1].toLowerCase()),
};

const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
const missing = [];

try {
  // Static tagged queries only — no interpolation, per ARCH-01 §11.1.
  const [indexes, constraints, sequences, extensions] = await Promise.all([
    db.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    db.$queryRaw`SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'`,
    db.$queryRaw`SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'`,
    db.$queryRaw`SELECT extname FROM pg_extension`,
  ]);

  const actual = {
    indexes: new Set(indexes.map((r) => r.indexname.toLowerCase())),
    constraints: new Set(constraints.map((r) => r.conname.toLowerCase())),
    sequences: new Set(sequences.map((r) => r.sequencename.toLowerCase())),
    extensions: new Set(extensions.map((r) => r.extname.toLowerCase())),
  };

  for (const kind of Object.keys(expected)) {
    for (const name of expected[kind]) {
      if (!actual[kind].has(name)) missing.push(`${kind}: ${name}`);
    }
  }
} finally {
  await db.$disconnect();
}

if (missing.length > 0) {
  process.stderr.write(
    [
      `[db] FRAGMENT DRIFT: ${missing.length} authored object(s) from fragments/*.sql are absent from the database:`,
      ...missing.map((m) => `  ${m}`),
      "",
    ].join("\n"),
  );
  process.exit(1);
}

process.stdout.write(
  `[db] authored fragments verified by name: ${Object.values(expected).flat().length} object(s)\n`,
);
process.exit(0);
