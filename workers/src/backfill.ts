/**
 * One-off corpus backfill runner (P5.2 — M7.1 operationalization).
 *
 *   pnpm --filter @markus/workers ingest:backfill -- --years 2004-2023
 *
 * Runs `runTmIngest` in-process against `PrismaCorpusStore` — no Redis, no
 * HTTP surface. The researcher TRCFECO2 snapshot is the only reachable bulk
 * source until FA-011 clears; the researcher-only nightly skip deliberately
 * does not apply here. Prints the `IngestReport` as JSON and exits non-zero
 * on failure. Resume: the ledger run is find-or-created by `runDate`
 * (default: previous UTC day) and mark upserts are idempotent, so a crashed
 * backfill is resumed by re-running the same command within the same UTC
 * day. See docs/runbooks/corpus-ingest.md.
 */

import { loadEnv } from "@markus/config";
import { PrismaCorpusStore } from "@markus/tm-data";
import type { CorpusTransactionHost } from "@markus/tm-data";
import { PrismaClient } from "@prisma/client";

import { isTmIngestSkip, runTmIngest, type TmIngestJobPayload } from "./tm-ingest.js";

const USAGE =
  "usage: pnpm --filter @markus/workers ingest:backfill -- --years <from-to|list> [--table <table>]\n" +
  "  --years  inclusive range (2004-2023) or comma list (2004,2005,2006); each 1900-2100\n" +
  "  --table  USPTO researcher table (default: case_file)";

export interface BackfillArgs {
  years: number[];
  table?: string;
}

const parseYear = (raw: string): number => {
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error(`invalid year '${raw}' (expected an integer 1900-2100)\n${USAGE}`);
  }
  return year;
};

const parseYears = (raw: string): number[] => {
  const range = /^(\d{4})-(\d{4})$/.exec(raw);
  if (range) {
    const from = parseYear(range[1]!);
    const to = parseYear(range[2]!);
    if (from > to) throw new Error(`invalid year range '${raw}' (from > to)\n${USAGE}`);
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
  }
  return raw.split(",").map((part) => parseYear(part.trim()));
};

export function parseBackfillArgs(argv: readonly string[]): BackfillArgs {
  const args: BackfillArgs = { years: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    switch (flag) {
      case "--years":
        if (value === undefined) throw new Error(`--years requires a value\n${USAGE}`);
        args.years = parseYears(value);
        index += 1;
        break;
      case "--table":
        if (value === undefined) throw new Error(`--table requires a value\n${USAGE}`);
        args.table = value;
        index += 1;
        break;
      default:
        throw new Error(`unknown argument '${String(flag)}'\n${USAGE}`);
    }
  }
  if (args.years.length === 0) throw new Error(`--years is required\n${USAGE}`);
  return args;
}

export async function main(argv: readonly string[]): Promise<void> {
  const args = parseBackfillArgs(argv);
  if (process.env.NODE_ENV !== "production") {
    await import("dotenv/config");
  }
  const env = loadEnv();

  const prisma = new PrismaClient();
  try {
    const payload: TmIngestJobPayload = {
      years: args.years,
      ...(args.table === undefined ? {} : { table: args.table }),
    };
    const result = await runTmIngest(payload, {
      store: new PrismaCorpusStore(prisma as unknown as CorpusTransactionHost),
      env,
    });
    if (isTmIngestSkip(result)) {
      console.log(`[backfill] skipped (${result.code}): ${result.reason}`);
      return;
    }
    console.log(`[backfill] ${JSON.stringify(result)}`);
  } finally {
    await prisma.$disconnect();
  }
}

// ts-jest compiles this module to CommonJS for unit tests, so the entrypoint
// guard matches the invoked script path instead of using `import.meta`.
if (/(^|[\\/])backfill\.(ts|js)$/.test(process.argv[1] ?? "")) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error("[backfill] fatal:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
