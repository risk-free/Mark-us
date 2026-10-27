/**
 * P5.2 (M7.1) integration gate against a real PostgreSQL 16 (ARCH-01 §13 —
 * no mock DB): the one-off backfill runner (`parseBackfillArgs` →
 * `runTmIngest`, the exact path `pnpm --filter @markus/workers
 * ingest:backfill` takes) ingests a multi-year researcher fixture archive —
 * never the real 434 MB-per-year download — into `PrismaCorpusStore` and the
 * run lands `complete` in the `TmIngestRun` ledger. Resume-after-crash:
 * re-running a date whose ledger row is stuck `running` completes the same
 * row (find-or-create by runDate; mark upserts are idempotent).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";
import { strToU8, zipSync } from "fflate";
import postgres from "postgres";

import {
  defaultArchiveDecoder,
  PrismaCorpusStore,
  Trcfeco2Source,
  type CorpusTransactionHost,
} from "@markus/tm-data";
import type { Env } from "@markus/config";

import { parseBackfillArgs } from "./backfill.js";
import { runTmIngest, type TmIngestJobPayload, type TmIngestSkip } from "./tm-ingest.js";
import type { IngestReport } from "@markus/tm-data";

jest.setTimeout(180_000);

const MIGRATION_SQL = readFileSync(
  path.resolve(__dirname, "../../packages/db/prisma/migrations/0P3__p0_3_backlog/migration.sql"),
  "utf8",
);

const HEADERS =
  "serial_no,mark_id_char,cfh_status_cd,cfh_status_dt,filing_dt,registration_dt,registration_no,abandon_dt,mark_draw_cd,std_char_claim_in,tad_file_id";

/** Distinct serials per year so the multi-year pass is observable in counters. */
const ROWS_BY_YEAR: Record<number, string[]> = {
  2004: [
    "11111111,ACME,700,2004-02-01,2001-03-04,2002-06-07,6789012,,4000,Y,1",
    "22222222,BIG CO,600,2004-02-01,2003-01-01,,,,3000,,2",
  ],
  2005: [
    "33333333,RESUME ONE,700,2005-02-01,2001-03-04,2002-06-07,6789013,,4000,Y,1",
    "44444444,RESUME TWO,600,2005-02-01,2003-01-01,,,,3000,,2",
  ],
};

const RESUME_ROWS = [
  "55555555,CRASH ONE,700,2004-02-01,2001-03-04,2002-06-07,6789014,,4000,Y,1",
  "66666666,CRASH TWO,600,2004-02-01,2003-01-01,,,,3000,,2",
];

const archiveBytes = (rows: readonly string[]): Uint8Array =>
  new Uint8Array(zipSync({ "case_file.csv": strToU8([HEADERS, ...rows].join("\n")) }));

/** CI uses testcontainers; Windows Dev can point WORKERS_TEST_DATABASE_URL at a real PG. */
const EXTERNAL_DATABASE_URL = process.env.WORKERS_TEST_DATABASE_URL;

/** Only the fields the source builder reads; sources are injected with a fake http. */
const env = {
  USPTO_BULK_BASE_URL: "https://data.uspto.gov",
  USPTO_RESEARCHER_PRODUCT_ID: "TRCFECO2",
  TM_CORPUS_INGEST_SOURCE: "trcfeco2",
} as Env;

describe("P5.2 corpus backfill runner against PostgreSQL 16", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaClient;
  let sql: ReturnType<typeof postgres>;
  let store: PrismaCorpusStore;

  beforeAll(async () => {
    let url = EXTERNAL_DATABASE_URL;
    if (!url) {
      container = await new PostgreSqlContainer("postgres:16-alpine").start();
      url = container.getConnectionUri();
    }
    sql = postgres(url, { max: 1 });
    await sql.unsafe(MIGRATION_SQL);
    prisma = new PrismaClient({ datasourceUrl: url });
    store = new PrismaCorpusStore(prisma as unknown as CorpusTransactionHost);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await sql?.end();
    await container?.stop();
  });

  /** The runner path the CLI takes, with a fixture http standing in for USPTO. */
  const runBackfill = async (
    payload: TmIngestJobPayload,
    rowsByYear: Record<number, string[]>,
  ): Promise<IngestReport | TmIngestSkip> => {
    const source = new Trcfeco2Source({
      baseUrl: env.USPTO_BULK_BASE_URL,
      productId: env.USPTO_RESEARCHER_PRODUCT_ID,
      years: payload.years,
      table: payload.table ?? "case_file",
      http: {
        // The signed-URL dance: endpoint URL carries the year; echo it through.
        getJson: async (endpoint: string) => ({
          Location: endpoint.replace(
            "https://data.uspto.gov/ui/datasets/products/files",
            "https://cdn.example/signed",
          ),
        }),
        getBytes: async (location: string) => {
          const year = Number(/\/(\d{4})\//.exec(location)?.[1]);
          const rows = rowsByYear[year];
          if (!rows) throw new Error(`no fixture rows for ${location}`);
          return archiveBytes(rows);
        },
      },
      decode: defaultArchiveDecoder,
    });
    return runTmIngest(payload, { store, env, sources: [source] });
  };

  test("multi-year fixture archive flows through the backfill runner into the ledger", async () => {
    const args = parseBackfillArgs(["--years", "2004-2005"]);

    const report = await runBackfill({ runDate: "2024-06-01", years: args.years }, ROWS_BY_YEAR);

    expect("skipped" in report).toBe(false);
    if ("skipped" in report) return;
    expect(report).toMatchObject({
      filesProcessed: 2,
      marksImported: 4,
      marksUpdated: 0,
      marksRejected: 0,
    });

    const runs = await store.recentRuns(10);
    const run = runs.find((entry) => entry.id === report.ingestRunId);
    expect(run).toMatchObject({
      status: "complete",
      runDate: new Date("2024-06-01T00:00:00.000Z"),
      marksImported: 4,
      marksUpserted: 4,
      filesProcessed: 2,
    });
    expect(await prisma.tmCorpusMark.count()).toBe(4);
  });

  test("resume-after-crash: a stuck `running` row for the run date completes in place", async () => {
    const runDate = new Date("2024-06-02T00:00:00.000Z");
    // Simulate the crash: a run row was opened and never finished.
    const crashedRunId = await store.startRun(runDate);

    const report = await runBackfill(
      { runDate: "2024-06-02", years: [2004] },
      { 2004: RESUME_ROWS },
    );

    expect("skipped" in report).toBe(false);
    if ("skipped" in report) return;
    expect(report.ingestRunId).toBe(crashedRunId);
    const runs = await store.recentRuns(10);
    const rowsForDate = runs.filter(
      (run) => new Date(run.runDate).toISOString() === runDate.toISOString(),
    );
    expect(rowsForDate).toHaveLength(1);
    expect(rowsForDate[0]).toMatchObject({ id: crashedRunId, status: "complete", marksImported: 2 });
  });
});
