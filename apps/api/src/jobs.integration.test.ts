/**
 * P5.2 (M7.1) integration gate against a real PostgreSQL 16 (ARCH-01 §13 —
 * no mock DB): `POST /admin/jobs` enqueues a corpus-ingest job spec; the
 * runner (the same `runCorpusIngest` wiring the worker uses) consumes the
 * captured spec against a small fixture archive — never the real 434 MB
 * download — and the run lands in the `TmIngestRun` ledger exposed by
 * `GET /tm/ingest/runs`. Resume-after-crash: re-running a date whose ledger
 * row is stuck `running` completes the same row (find-or-create by runDate).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";
import { strToU8, zipSync } from "fflate";
import postgres from "postgres";

import {
  defaultArchiveDecoder,
  runCorpusIngest,
  Trcfeco2Source,
  PrismaCorpusStore,
  type CorpusTransactionHost,
  type IngestReport,
} from "@markus/tm-data";

import { createApp } from "./app.js";
import { createInMemoryAuth, type InMemoryAuth } from "./auth/fakes.js";
import type { TmIngestJobSpec } from "./jobs.js";

jest.setTimeout(180_000);

const MIGRATION_SQL = readFileSync(
  path.resolve(__dirname, "../../../packages/db/prisma/migrations/0P3__p0_3_backlog/migration.sql"),
  "utf8",
);

const HEADERS =
  "serial_no,mark_id_char,cfh_status_cd,cfh_status_dt,filing_dt,registration_dt,registration_no,abandon_dt,mark_draw_cd,std_char_claim_in,tad_file_id";

const FIXTURE_ROWS = [
  "11111111,ACME,700,2024-02-01,2021-03-04,2022-06-07,6789012,,4000,Y,1",
  "22222222,BIG CO,600,2024-02-01,2023-01-01,,,,3000,,2",
];

const archiveBytes = (): Uint8Array =>
  new Uint8Array(zipSync({ "case_file.csv": strToU8([HEADERS, ...FIXTURE_ROWS].join("\n")) }));

/** CI uses testcontainers; Windows Dev can point API_TEST_DATABASE_URL at a real PG. */
const EXTERNAL_DATABASE_URL = process.env.API_TEST_DATABASE_URL;

describe("P5.2 corpus-ingest job enqueue against PostgreSQL 16", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaClient;
  let sql: ReturnType<typeof postgres>;
  let store: PrismaCorpusStore;
  let app: ReturnType<typeof createApp>;
  let auth: InMemoryAuth;
  const enqueued: Array<{ name: string; payload: TmIngestJobSpec }> = [];

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
    auth = createInMemoryAuth();
    app = createApp(
      {
        search: {
          async search() {
            throw new Error("not exercised by the jobs integration gate");
          },
        },
        store,
        assess: {
          async score() {
            throw new Error("not exercised by the jobs integration gate");
          },
        },
        auth,
      },
      {
        freshnessSlaHours: 26,
        secureCookies: true,
        jobsQueue: {
          async add(name: string, payload: TmIngestJobSpec) {
            enqueued.push({ name, payload });
            return { id: `job-${enqueued.length}` };
          },
        },
      },
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await sql?.end();
    await container?.stop();
  });

  const adminSession = async (): Promise<{ cookie: string; csrf: string }> => {
    const session = await auth.sessions.create({
      actorType: "STAFF",
      actorId: "admin-1",
      role: "MASTER_ADMIN",
      locale: "zh-CN",
      ip: "127.0.0.1",
      ua: "jest",
    });
    return { cookie: `mkus_staff=${session.id}`, csrf: session.record.csrfSecret };
  };

  /** Run the captured spec exactly as the worker would wire it. */
  const runCaptured = async (spec: TmIngestJobSpec): Promise<IngestReport> => {
    const source = new Trcfeco2Source({
      baseUrl: "https://data.uspto.gov",
      years: spec.years ?? [2024],
      table: spec.table ?? "case_file",
      http: {
        getJson: async () => ({ Location: "https://cdn.example/signed/TRCFECO2/2024/case_file.csv.zip" }),
        getBytes: async () => archiveBytes(),
      },
      decode: defaultArchiveDecoder,
    });
    return runCorpusIngest({
      runDate: new Date(spec.runDate ?? "2024-06-01"),
      sources: [source],
      store,
    });
  };

  test("enqueue → runner → store → ledger end-to-end on a fixture archive", async () => {
    const { cookie, csrf } = await adminSession();

    const accepted = await app.request("/admin/jobs", {
      method: "POST",
      headers: { "content-type": "application/json", cookie, "x-csrf-token": csrf },
      body: JSON.stringify({ queue: "tm-ingest", runDate: "2024-06-01", years: [2024] }),
    });
    expect(accepted.status).toBe(202);
    expect(await accepted.json()).toEqual({ jobId: "job-1", status: "QUEUED", queue: "tm-ingest" });
    expect(enqueued[0]?.payload).toEqual({ runDate: "2024-06-01", years: [2024] });

    const report = await runCaptured(enqueued[0]!.payload);
    expect(report.marksImported).toBe(2);
    expect(report.marksRejected).toBe(0);

    const ledger = await app.request("/tm/ingest/runs", { headers: { cookie } });
    expect(ledger.status).toBe(200);
    const { runs } = (await ledger.json()) as { runs: Array<Record<string, unknown>> };
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      id: report.ingestRunId,
      status: "complete",
      marksImported: 2,
      marksUpserted: 2,
      marksRejected: 0,
    });
    expect(await prisma.tmCorpusMark.count()).toBe(2);
  });

  test("resume-after-crash: a stuck `running` row for the run date completes in place", async () => {
    const runDate = new Date("2024-06-02T00:00:00.000Z");
    // Simulate the crash: a run row was opened and never finished.
    const crashedRunId = await store.startRun(runDate);

    const report = await runCaptured({ runDate: "2024-06-02", years: [2024] });

    expect(report.ingestRunId).toBe(crashedRunId);
    const runs = await store.recentRuns(10);
    const rowsForDate = runs.filter(
      (run) => new Date(run.runDate).toISOString() === runDate.toISOString(),
    );
    expect(rowsForDate).toHaveLength(1);
    expect(rowsForDate[0]).toMatchObject({ id: crashedRunId, status: "complete", marksImported: 2 });
  });
});
