/**
 * M7.2 acceptance against a real PostgreSQL 16 (ARCH-01 §13 — no mock DB).
 *
 * Seeds a small labelled golden set, hits `/tm/search` through the same Hono
 * app used in production (real `PrismaCorpusSearcher` + `PrismaCorpusStore`),
 * and verifies the mandate gates:
 *   - recall of the labelled similar marks at the chosen `minScore`;
 *   - every response carries `method`, the disclaimer and `isLegalAdvice: false`;
 *   - freshness comes from the last completed run — `unknown` with no run,
 *     `stale` beyond the 26 h SLA (M7.1), and the run ledger is exposed.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";
import postgres from "postgres";

import {
  BOOTSTRAP_MODEL,
  CorpusAssessmentScorer,
  DISCLAIMER_VERSION,
  PrismaCorpusSearcher,
  PrismaCorpusStore,
  type CorpusSqlClient,
  type CorpusTransactionHost,
} from "@markus/tm-data";

import { createApp } from "./app.js";
import { createInMemoryAuth, type InMemoryAuth } from "./auth/fakes.js";
import { PrismaClientStore } from "./client.js";
import { PrismaNotificationStore } from "./notifications.js";

jest.setTimeout(180_000);

const MIGRATION_SQL = readFileSync(
  path.resolve(__dirname, "../../../packages/db/prisma/migrations/0P3__p0_3_backlog/migration.sql"),
  "utf8",
);

/** Labelled similar-mark pairs (normalised text is the search key). */
const GOLDEN_SET = [
  { mark: "HAWTHORN APOTHECARY", similar: ["HAWTHORN APOTHECARY CO", "HAWTHORNE APOTHECARY"] },
  { mark: "BRIARWOOD ESTATES", similar: ["BRIARWOOD ESTATE VILLAS"] },
];

const EXTERNAL_DATABASE_URL = process.env.API_TEST_DATABASE_URL;

describe("USPTO corpus search API against PostgreSQL 16 (M7.2)", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaClient;
  let sql: ReturnType<typeof postgres>;
  let app: ReturnType<typeof createApp>;
  let auth: InMemoryAuth;

  const seedMark = (mark: string, overrides: Partial<Parameters<typeof prisma.tmCorpusMark.create>[0]["data"]> = {}) =>
    prisma.tmCorpusMark.create({
      data: {
        serialNumber: `9${Math.abs(mark.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 99_999_999)}`,
        registrationNumber: null,
        markText: mark,
        normalizedText: mark.toLowerCase(),
        statusCode: "700",
        filingDate: null,
        registrationDate: null,
        abandonDate: null,
        goodsSummary: null,
        sourceFile: "golden-set",
        sourceUpdatedAt: new Date("2026-10-01T00:00:00.000Z"),
        ...overrides,
      },
    });

  beforeAll(async () => {
    let url = EXTERNAL_DATABASE_URL;
    if (!url) {
      container = await new PostgreSqlContainer("postgres:16-alpine").start();
      url = container.getConnectionUri();
    }
    sql = postgres(url, { max: 1 });
    await sql.unsafe(MIGRATION_SQL);
    prisma = new PrismaClient({ datasourceUrl: url });
    const search = new PrismaCorpusSearcher(prisma as unknown as CorpusSqlClient);
    auth = createInMemoryAuth();
    app = createApp(
      {
        search,
        store: new PrismaCorpusStore(prisma as unknown as CorpusTransactionHost),
        assess: new CorpusAssessmentScorer({
          searcher: search,
          model: BOOTSTRAP_MODEL,
          disclaimerVersion: DISCLAIMER_VERSION,
        }),
        auth,
        client: new PrismaClientStore(prisma as unknown as PrismaClient, "http://localhost:3001"),
        notifications: new PrismaNotificationStore(prisma as unknown as PrismaClient),
      },
      { freshnessSlaHours: 26 },
    );
  });

  /** MASTER_ADMIN session cookie for the RBAC-guarded ingest ledger. */
  const adminCookie = async (): Promise<string> => {
    const session = await auth.sessions.create({
      actorType: "STAFF",
      actorId: "admin-1",
      role: "MASTER_ADMIN",
      locale: "zh-CN",
      ip: "127.0.0.1",
      ua: "jest",
    });
    return `mkus_staff=${session.id}`;
  };

  afterAll(async () => {
    await prisma?.$disconnect();
    await sql?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await sql.unsafe(`TRUNCATE "TmCorpusMark" RESTART IDENTITY CASCADE; DELETE FROM "TmIngestRun";`);
  });

  const createCompletedRun = async (finishedAt: Date) => {
    const store = new PrismaCorpusStore(prisma as unknown as CorpusTransactionHost);
    const runDate = new Date(`${finishedAt.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const id = await store.startRun(runDate);
    await store.finishRun(id, {
      filesProcessed: 0,
      marksUpserted: 0,
      marksSkipped: 0,
      marksImported: 0,
      marksUpdated: 0,
      marksRejected: 0,
      errorLog: [],
      finishedAt: new Date(finishedAt),
    });
    return store;
  };

  it("recalls the labelled similar marks at the chosen minScore with the full signal contract", async () => {
    const all = Array.from(new Set(GOLDEN_SET.flatMap((g) => [g.mark, ...g.similar])));
    await Promise.all(all.map((mark) => seedMark(mark)));

    for (const entry of GOLDEN_SET) {
      const response = await app.request(`/tm/search?q=${encodeURIComponent(entry.mark)}`);
      expect(response.status).toBe(200);
      const body = await response.json();

      // M7.2 contract: never an opinion.
      expect(body.method).toBe("trigram");
      expect(body.isLegalAdvice).toBe(false);
      expect(body.disclaimer.length).toBeGreaterThan(20);
      expect(body.minScore).toBe(0.3);

      // Recall: every labelled similar mark ranks in the top 5 at ≥ minScore.
      const serials = new Map(all.map((m) => [m.toLowerCase(), m]));
      const hits = body.candidates as Array<{ markText: string; serialNumber: string; score: number }>;
      for (const expected of entry.similar) {
        const hit = hits.find((h) => h.markText === expected);
        expect(hit).toBeDefined();
        expect(hit?.score).toBeGreaterThanOrEqual(body.minScore);
        expect(hits.indexOf(hit!)).toBeLessThan(5);
        void serials;
      }

      // Ranked descending by score.
      const scores = hits.map((h) => h.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    }
  });

  it("reports unknown freshness with no completed run, fresh within 26 h, stale beyond it", async () => {
    await seedMark("ACME");
    expect((await (await app.request("/tm/search?q=acme")).json()).corpusFreshness).toMatchObject({
      status: "unknown",
      ageHours: null,
    });

    await createCompletedRun(new Date(Date.now() - 5 * 3_600_000));
    const fresh = await (await app.request("/tm/search?q=acme")).json();
    expect(fresh.corpusFreshness).toMatchObject({ status: "fresh" });
    expect(fresh.corpusFreshness.ageHours).toBeLessThan(26);

    await sql.unsafe(`DELETE FROM "TmIngestRun";`);
    await createCompletedRun(new Date(Date.now() - 27 * 3_600_000));
    const stale = await (await app.request("/tm/search?q=acme")).json();
    expect(stale.corpusFreshness.status).toBe("stale");
    expect(stale.corpusFreshness.ageHours).toBeGreaterThan(26);
  });

  it("exposes the ingest run ledger newest-first with counters", async () => {
    const store = new PrismaCorpusStore(prisma as unknown as CorpusTransactionHost);
    const firstId = await store.startRun(new Date("2026-10-11T00:00:00.000Z"));
    await store.finishRun(firstId, {
      filesProcessed: 1,
      marksUpserted: 3,
      marksSkipped: 0,
      marksImported: 2,
      marksUpdated: 1,
      marksRejected: 1,
      errorLog: [{ reason: "invalid-status-date", raw: "{}" }],
      finishedAt: new Date("2026-10-11T03:05:00.000Z"),
    });
    const secondId = await store.startRun(new Date("2026-10-12T00:00:00.000Z"));
    await store.finishRun(secondId, {
      filesProcessed: 1,
      marksUpserted: 0,
      marksSkipped: 5,
      marksImported: 0,
      marksUpdated: 0,
      marksRejected: 0,
      errorLog: null,
      finishedAt: new Date("2026-10-12T03:05:00.000Z"),
    });

    const body = await (
      await app.request("/tm/ingest/runs", { headers: { cookie: await adminCookie() } })
    ).json();
    expect(body.runs).toHaveLength(2);
    expect(body.runs[0].runDate).toBe("2026-10-12T00:00:00.000Z");
    expect(body.runs[0].marksSkipped).toBe(5);
    expect(body.runs[1].marksImported).toBe(2);
    expect(body.runs[1].marksRejected).toBe(1);
  });

  it("scores against the live corpus with the 3-locale disclosure and degrades on an empty corpus (P5.5)", async () => {
    await sql.unsafe(
      `INSERT INTO "TmCorpusClass" ("id", "label") VALUES ('009', 'Electrical'), ('025', 'Clothing')
       ON CONFLICT DO NOTHING;`,
    );
    const soft = await seedMark("SOFTNEST", { goodsSummary: "software as a service" });
    const spaced = await seedMark("SOFT NEST", { goodsSummary: "software as a service" });
    await seedMark("SOFTEKS", { goodsSummary: "software" });
    await prisma.tmCorpusMarkClass.createMany({
      data: [
        { markId: soft.id, classId: "009" },
        { markId: spaced.id, classId: "009" },
      ],
    });

    const path = "/tm/assess?q=SOFTNEST&niceClass=9&goods=software%20as%20a%20service";
    const response = await app.request(path);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("scored");
    expect(body.pRegistration).toBeGreaterThan(0);
    expect(body.pRegistration).toBeLessThanOrEqual(1);
    expect(body.modelVersion).toBe(BOOTSTRAP_MODEL.version);
    expect(body.disclaimerVersion).toBe(DISCLAIMER_VERSION);
    expect(body.isLegalAdvice).toBe(false);
    expect(Object.keys(body.disclaimers).sort()).toEqual(["en", "zh-CN", "zh-TW"]);
    expect(Array.isArray(body.riskFlags)).toBe(true);
    expect(body.recommendedNextActions.length).toBeGreaterThan(0);
    expect(body.corpusFreshness.status).toBe("unknown");
    expect(body.featureSnapshot.query).toMatchObject({ markText: "SOFTNEST", classCodes: [9] });

    const replay = await (await app.request(path)).json();
    expect(replay.pRegistration).toBe(body.pRegistration);

    await sql.unsafe(`TRUNCATE "TmCorpusMark" RESTART IDENTITY CASCADE;`);
    const degraded = await (await app.request("/tm/assess?q=SOFTNEST")).json();
    expect(degraded.status).toBe("INSUFFICIENT_DATA");
    expect(degraded.pRegistration).toBeNull();
    expect(degraded.headlineConfidence).toBe("INSUFFICIENT_DATA");
    expect(degraded.riskFlags).toContain("INSUFFICIENT_CORPUS");
  });
});