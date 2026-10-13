/**
 * M7.1 acceptance against a real PostgreSQL 16 (ARCH-01 §13 — no mock DB).
 *
 * Mimics the nightly backfill: a TRCFECO2-shaped `.csv.zip` is decompressed with
 * the real `fflate` path, parsed, and upserted by `PrismaCorpusStore` (the real
 * store, against the real migration). Verifies the mandate gates:
 *   - ingest a fixed archive twice → idempotent (2nd run writes nothing new and
 *     reports only updates/skips, no duplicate rows);
 *   - a malformed record quarantines into `marksRejected` + `errorLog` and the
 *     run still completes;
 *   - freshness comes from the last completed run (stale beyond the 26 h SLA).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";
import { strToU8, zipSync } from "fflate";
import postgres from "postgres";

import { corpusFreshness } from "./freshness.js";
import { runCorpusIngest } from "./ingest.js";
import { defaultArchiveDecoder, Trcfeco2Source } from "./source.js";
import { PrismaCorpusStore, type CorpusTransactionHost } from "./store.js";

jest.setTimeout(180_000);

const MIGRATION_SQL = readFileSync(
  path.resolve(__dirname, "../../db/prisma/migrations/0P3__p0_3_backlog/migration.sql"),
  "utf8",
);

const HEADERS =
  "serial_no,mark_id_char,cfh_status_cd,cfh_status_dt,filing_dt,registration_dt,registration_no,abandon_dt,mark_draw_cd,std_char_claim_in,tad_file_id";

/** Researcher-shaped fixture. Rows as README strings minus the header. */
const FIXTURE_V1 = [
  "11111111,ACME,700,2024-02-01,2021-03-04,2022-06-07,6789012,,4000,Y,1",
  "22222222,BIG CO,600,2024-02-01,2023-01-01,,,,3000,,2",
  "33333333,,600,2024-02-01,2023-01-01,,,,2000,,3",
  "44444444,SHUT,800,2024-02-01,2021-01-01,,,,4000,,4",
  "55555555,BAD,700,not-a-date,2022-06-07,,,,4000,Y,5",
];

/** Next nightly run: serial 11111111 gained a status change; nothing else moved. */
const FIXTURE_V2 = FIXTURE_V1.map((row) => (row.startsWith("11111111") ? row.replace("2024-02-01", "2024-03-01") : row));

const archiveBytes = (rows: readonly string[]): Uint8Array =>
  new Uint8Array(zipSync({ "case_file.csv": strToU8([HEADERS, ...rows].join("\n")) }));

async function ingestArchive(
  bytes: Uint8Array,
  runDate: Date,
  store: PrismaCorpusStore,
): Promise<Awaited<ReturnType<typeof runCorpusIngest>>> {
  const source = new Trcfeco2Source({
    baseUrl: "https://data.uspto.gov",
    years: [2024],
    http: {
      getJson: async () => ({ Location: "https://cdn.example/signed/TRCFECO2/2024/case_file.csv.zip" }),
      getBytes: async () => bytes,
    },
    decode: defaultArchiveDecoder,
  });
  return runCorpusIngest({ runDate, sources: [source], store });
}

/** CI uses testcontainers; Windows Dev can point TM_TEST_DATABASE_URL at a real PG. */
const EXTERNAL_DATABASE_URL = process.env.TM_TEST_DATABASE_URL;

describe("USPTO corpus ingest against PostgreSQL 16 (M7.1)", () => {
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

  beforeEach(async () => {
    await sql.unsafe(`TRUNCATE "TmCorpusMark" RESTART IDENTITY CASCADE; DELETE FROM "TmIngestRun";`);
  });

  it("imports word marks, skips non-word / non-LIVE, quarantines a malformed row", async () => {
    const report = await ingestArchive(archiveBytes(FIXTURE_V1), new Date("2026-10-12"), store);

    expect(report).toMatchObject({
      filesProcessed: 1,
      marksUpserted: 2,
      marksImported: 2,
      marksUpdated: 0,
      marksSkipped: 2,
      marksRejected: 1,
    });

    const run = await prisma.tmIngestRun.findUnique({ where: { runDate: new Date("2026-10-12") } });
    expect(run?.status).toBe("complete");
    expect(run?.marksRejected).toBe(1);
    expect(run?.errorLog).toEqual([{ reason: "invalid-status-date", raw: expect.stringContaining("55555555") }]);

    const marks = await prisma.tmCorpusMark.findMany({ orderBy: { serialNumber: "asc" } });
    expect(marks).toHaveLength(2);
    expect(marks.map((m) => m.serialNumber)).toEqual(["11111111", "22222222"]);
    expect(marks[0]?.sourceFile).toBe("TRCFECO2/2024/case_file.csv");
    expect(marks[0]?.ingestRunId).toBe(report.ingestRunId);
  });

  it("is idempotent across nightly runs and reports only updates/skips (M7.1)", async () => {
    const day1 = await ingestArchive(archiveBytes(FIXTURE_V1), new Date("2026-10-12"), store);

    const day2 = await ingestArchive(archiveBytes(FIXTURE_V2), new Date("2026-10-13"), store);

    expect(day2).toMatchObject({
      marksUpserted: 1,
      marksImported: 0,
      marksUpdated: 1,
      marksSkipped: 3,
      marksRejected: 1,
    });

    const marks = await prisma.tmCorpusMark.findMany({ orderBy: { serialNumber: "asc" } });
    expect(marks).toHaveLength(2);

    const changed = marks.find((m) => m.serialNumber === "11111111");
    expect(changed?.sourceUpdatedAt).toEqual(new Date("2024-03-01T00:00:00.000Z"));
    expect(changed?.ingestRunId).toBe(day2.ingestRunId);
    const unchanged = marks.find((m) => m.serialNumber === "22222222");
    expect(unchanged?.ingestRunId).toBe(day1.ingestRunId);
    expect(unchanged?.sourceUpdatedAt).toEqual(new Date("2024-02-01T00:00:00.000Z"));
  });

  it("drives freshness from the last completed run, not a table scan (M7.1)", async () => {
    const report = await ingestArchive(archiveBytes(FIXTURE_V1), new Date("2026-10-12"), store);

    const lastCompletedAt = await store.lastCompletedRunAt();
    expect(lastCompletedAt).not.toBeNull();

    const fresh = corpusFreshness(lastCompletedAt, new Date(report.finishedAt.getTime() + 2_000));
    expect(fresh.status).toBe("fresh");

    const stale = corpusFreshness(lastCompletedAt, new Date(report.finishedAt.getTime() + 27 * 3_600_000));
    expect(stale.status).toBe("stale");
    expect(stale.ageHours).toBeGreaterThan(26);
  });
});