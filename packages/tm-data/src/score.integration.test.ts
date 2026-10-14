/**
 * P5.4 acceptance against a real PostgreSQL 16 (ARCH-01 §13 — no mock DB).
 *
 * Wires the real `PrismaCorpusSearcher` through the feature builder and the
 * versioned model (`CorpusAssessmentScorer`), then exercises the label/eval
 * machinery (`assembleLabelSet`, `buildCalibrationReport`, `evaluateRelease`)
 * over corpus-derived outcomes. Verifies:
 *   - the search candidate carries the class/goods fields the features need;
 *   - scoring reproduces the same `pRegistration` for the same input (M6.1);
 *   - labels partition into positive/negative/censored and the calibration gate
 *     refuses release on an under-sized set (M6.5 / D-25).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";
import postgres from "postgres";

import { assembleLabelSet, type OutcomeRow, temporalSplit } from "./labels.js";
import { BOOTSTRAP_MODEL } from "./model.js";
import { DEFAULT_RELEASE_THRESHOLDS, buildCalibrationReport, evaluateRelease, type EvalSample } from "./eval.js";
import { CorpusAssessmentScorer } from "./score.js";
import { PrismaCorpusSearcher, type CorpusSqlClient } from "./search.js";

jest.setTimeout(180_000);

const MIGRATION_SQL = readFileSync(
  path.resolve(__dirname, "../../db/prisma/migrations/0P3__p0_3_backlog/migration.sql"),
  "utf8",
);

const DISCLAIMER_VERSION = "disclaimer-1.0.0";
const EXTERNAL_DATABASE_URL = process.env.TM_TEST_DATABASE_URL;

interface SeedMark {
  serialNumber: string;
  markText: string;
  normalizedText: string;
  statusCode: string;
  filingDate: Date | null;
  registrationDate?: Date | null;
  abandonDate?: Date | null;
  goodsSummary: string | null;
  classCodes: string[];
}

describe("corpus assessment + calibration against PostgreSQL 16 (P5.4)", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaClient;
  let sql: ReturnType<typeof postgres>;
  let scorer: CorpusAssessmentScorer;

  const seed = async (mark: SeedMark): Promise<void> => {
    await prisma.tmCorpusMark.create({
      data: {
        serialNumber: mark.serialNumber,
        registrationNumber: mark.registrationDate ? `R${mark.serialNumber}` : null,
        markText: mark.markText,
        normalizedText: mark.normalizedText,
        statusCode: mark.statusCode,
        filingDate: mark.filingDate,
        registrationDate: mark.registrationDate ?? null,
        abandonDate: mark.abandonDate ?? null,
        goodsSummary: mark.goodsSummary,
        sourceFile: "score-fixture",
        classes: { create: mark.classCodes.map((classId) => ({ class: { connect: { id: classId } } })) },
      },
    });
  };

  beforeAll(async () => {
    let url = EXTERNAL_DATABASE_URL;
    if (!url) {
      container = await new PostgreSqlContainer("postgres:16-alpine").start();
      url = container.getConnectionUri();
    }
    sql = postgres(url, { max: 1 });
    await sql.unsafe(MIGRATION_SQL);
    prisma = new PrismaClient({ datasourceUrl: url });

    for (const id of ["009", "025", "042"]) {
      await prisma.tmCorpusClass.upsert({
        where: { id },
        update: {},
        create: { id, label: `Nice ${id}` },
      });
    }

    const searcher = new PrismaCorpusSearcher(prisma as unknown as CorpusSqlClient);
    scorer = new CorpusAssessmentScorer({ searcher, model: BOOTSTRAP_MODEL, disclaimerVersion: DISCLAIMER_VERSION });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await sql?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await sql.unsafe(`TRUNCATE "TmCorpusMark" RESTART IDENTITY CASCADE;`);
  });

  const seedSimilaritySet = async (): Promise<void> => {
    await Promise.all([
      seed({ serialNumber: "1", markText: "SOFTNEST", normalizedText: "softnest", statusCode: "700", filingDate: new Date("2020-01-10"), registrationDate: new Date("2020-07-10"), goodsSummary: "software as a service", classCodes: ["009"] }),
      seed({ serialNumber: "2", markText: "SOFT NEST", normalizedText: "soft nest", statusCode: "700", filingDate: new Date("2020-02-10"), registrationDate: new Date("2020-09-10"), goodsSummary: "software design", classCodes: ["009"] }),
      seed({ serialNumber: "3", markText: "SOFTEKS", normalizedText: "softeks", statusCode: "600", filingDate: new Date("2020-03-10"), goodsSummary: "software applications", classCodes: ["009"] }),
      seed({ serialNumber: "4", markText: "HARDNEST", normalizedText: "hardnest", statusCode: "600", filingDate: new Date("2020-04-10"), goodsSummary: "hardware", classCodes: ["042"] }),
      seed({ serialNumber: "5", markText: "ZEBRA", normalizedText: "zebra", statusCode: "600", filingDate: new Date("2020-05-10"), goodsSummary: "clothing", classCodes: ["025"] }),
    ]);
  };

  it("search carries class codes and goods so features can be built", async () => {
    await seedSimilaritySet();
    const searcher = new PrismaCorpusSearcher(prisma as unknown as CorpusSqlClient);
    const result = await searcher.search("SOFTNEST", { limit: 10 });
    const top = result.candidates[0]!;
    expect(top.markText).toBe("SOFTNEST");
    expect(top.score).toBeCloseTo(1, 5);
    expect(top.classCodes).toEqual([9]);
    expect(top.goodsSummary).toBe("software as a service");
  });

  it("scores a query and is reproducible for the same input (M6.1)", async () => {
    await seedSimilaritySet();
    const query = { markText: "SOFTNEST", classCodes: [9], goodsSummary: "software as a service" };

    const first = await scorer.score(query);
    const second = await scorer.score(query);

    expect(first.status).toBe("scored");
    expect(first.isLegalAdvice).toBe(false);
    expect(first.modelVersion).toBe(BOOTSTRAP_MODEL.version);
    expect(first.disclaimerVersion).toBe(DISCLAIMER_VERSION);
    expect(first.pRegistration).toBeGreaterThan(0);
    expect(first.pRegistration).toBeLessThanOrEqual(1);
    expect(first.subSignals.candidateCount).toBeGreaterThanOrEqual(2);
    expect(first.featureSnapshot.topCandidates.length).toBeGreaterThan(0);

    expect(second.pRegistration).toBe(first.pRegistration);
    expect(second.modelVersion).toBe(first.modelVersion);
  });

  it("assembles labels and refuses release on an under-sized calibration set (M6.5/D-25)", async () => {
    await seedSimilaritySet();
    const rows = await prisma.tmCorpusMark.findMany({ orderBy: { serialNumber: "asc" } });

    const outcomeRows: OutcomeRow[] = rows.map((row) => ({
      serialNumber: row.serialNumber,
      filingDate: row.filingDate ?? new Date("2020-01-01"),
      registrationDate: row.registrationDate,
      abandonDate: row.abandonDate,
      statusCode: row.statusCode,
    }));

    const census = new Date("2026-01-01");
    const assembled = assembleLabelSet(outcomeRows, census, 12);
    expect(assembled.labeled).toHaveLength(2);
    expect(assembled.censored).toBe(3);
    expect(assembled.baseRate).toBe(1);

    const { holdout } = temporalSplit(outcomeRows, new Date("2020-02-01"), (row) => row.filingDate);
    expect(holdout.length).toBeGreaterThan(0);

    const samples: EvalSample[] = assembled.labeled.map(({ row, label }) => ({
      score: row.registrationDate ? 0.8 : 0.2,
      label: label === "positive" ? 1 : 0,
    }));
    const report = buildCalibrationReport(samples);
    expect(report.sampleSize).toBe(2);
    expect(report.auc).toBeGreaterThanOrEqual(0);
    expect(report.auc).toBeLessThanOrEqual(1);

    const gate = evaluateRelease(report, DEFAULT_RELEASE_THRESHOLDS);
    expect(gate.releasable).toBe(false);
    expect(gate.reasons.join(" ")).toContain("sampleSize");
  });
});
