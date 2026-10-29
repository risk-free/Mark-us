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
import { loadModelArtifact, serializeModelArtifact, trainCorpusModel, type CorpusTrainingRow } from "./train.js";
import { trainingSampleRank, type TrainingCorpusConfig } from "./training-config.js";
import {
  PrismaCorpusTrainingSource,
  type TrainingCorpusPageMetric,
  type TrainingCorpusSqlClient,
} from "./training-corpus.js";

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

const collectTrainingRows = async (
  source: PrismaCorpusTrainingSource,
  censusAt: Date,
  corpus: TrainingCorpusConfig,
  metrics?: TrainingCorpusPageMetric[],
): Promise<CorpusTrainingRow[]> => {
  const rows: CorpusTrainingRow[] = [];
  for await (const row of source.stream(censusAt, corpus, {
    onPage: (metric) => metrics?.push(metric),
  })) {
    rows.push(row);
  }
  return rows;
};

describe("corpus assessment + calibration against PostgreSQL 16 (P5.4/P5.4.1)", () => {
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

  it("excludes self and future marks before retrieval limits during corpus assembly", async () => {
    const queryDate = new Date("2020-06-01T00:00:00.000Z");
    await seed({
      serialNumber: "earlier",
      markText: "TEMPORAL",
      normalizedText: "temporal",
      statusCode: "600",
      filingDate: new Date("2019-01-01T00:00:00.000Z"),
      goodsSummary: null,
      classCodes: ["009"],
    });
    await seed({
      serialNumber: "query",
      markText: "TEMPORAL SIGNAL",
      normalizedText: "temporal signal",
      statusCode: "600",
      filingDate: queryDate,
      goodsSummary: null,
      classCodes: ["009"],
    });
    // These 25 exact matches outrank the valid historical candidate. If they
    // are filtered only after limit 20/21, the earlier mark is never retrieved.
    for (let index = 0; index < 25; index += 1) {
      await seed({
        serialNumber: `future-${index}`,
        markText: "TEMPORAL SIGNAL",
        normalizedText: "temporal signal",
        statusCode: "600",
        filingDate: new Date(Date.UTC(2021, 0, index + 1)),
        goodsSummary: null,
        classCodes: ["009"],
      });
    }

    const sqlClient = prisma as unknown as TrainingCorpusSqlClient;
    const searcher = new PrismaCorpusSearcher(sqlClient);
    const rows = await collectTrainingRows(
      new PrismaCorpusTrainingSource(sqlClient, searcher),
      new Date("2023-01-01T00:00:00.000Z"),
      { cohort: "live-v1", seed: 0, batchSize: 4, maxExamples: 100 },
    );
    const query = rows.find((row) => row.serialNumber === "query")!;

    expect(query.features.candidateCount).toBe(1);
    expect(query.features.maxTrigram).toBeGreaterThan(0);
    expect(query.features.minClassDistance).toBe(0);
  });

  it("trains on corpus features, evaluates holdout, loads the artifact and scores", async () => {
    const families = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima"];
    for (let index = 0; index < families.length; index += 1) {
      const year = index < 6 ? 2019 : 2020;
      const month = index % 6;
      const negativeFiling = new Date(Date.UTC(year, month, 1));
      const positiveFiling = new Date(Date.UTC(year, month, 3));
      const family = families[index]!;
      // The negative is intentionally earlier and dissimilar to all previous
      // families; its positive partner has a strong historical text signal.
      await seed({
        serialNumber: `negative-${index}`,
        markText: family.toUpperCase(),
        normalizedText: family,
        statusCode: "600",
        filingDate: negativeFiling,
        abandonDate: new Date(Date.UTC(year, month + 6, 1)),
        goodsSummary: null,
        classCodes: ["009"],
      });
      await seed({
        serialNumber: `positive-${index}`,
        markText: `${family.toUpperCase()}X`,
        normalizedText: `${family}x`,
        statusCode: "700",
        filingDate: positiveFiling,
        registrationDate: new Date(Date.UTC(year, month + 6, 3)),
        goodsSummary: null,
        classCodes: ["009"],
      });
    }

    // One of these five same-day rows ends page five and the other four start
    // page six. They make the eligible set larger than the sample cap without
    // adding resolved labels, exercising both keyset ties and heap eviction.
    const fillerSerials = Array.from({ length: 5 }, (_, index) => `filler-${index}`);
    for (const [index, serialNumber] of fillerSerials.entries()) {
      await seed({
        serialNumber,
        markText: `FILLER ${index}`,
        normalizedText: `filler ${index}`,
        statusCode: "600",
        filingDate: new Date("2021-01-01T00:00:00.000Z"),
        goodsSummary: null,
        classCodes: ["042"],
      });
    }
    const eligibleSerials = [
      ...families.flatMap((_, index) => [`negative-${index}`, `positive-${index}`]),
      ...fillerSerials,
    ];

    await seed({
      serialNumber: "dead-excluded",
      markText: "DEAD EXCLUDED",
      normalizedText: "dead excluded",
      statusCode: "800",
      filingDate: new Date("2019-01-01T00:00:00.000Z"),
      goodsSummary: null,
      classCodes: ["009"],
    });
    await seed({
      serialNumber: "after-census-excluded",
      markText: "AFTER CENSUS",
      normalizedText: "after census",
      statusCode: "700",
      filingDate: new Date("2023-01-01T00:00:00.000Z"),
      registrationDate: new Date("2023-06-01T00:00:00.000Z"),
      goodsSummary: null,
      classCodes: ["009"],
    });

    const sqlClient = prisma as unknown as TrainingCorpusSqlClient;
    const searcher = new PrismaCorpusSearcher(sqlClient);
    const corpus: TrainingCorpusConfig = {
      cohort: "live-v1",
      seed: 23,
      batchSize: 5,
      maxExamples: 24,
    };
    const metrics: TrainingCorpusPageMetric[] = [];
    const rows = await collectTrainingRows(
      new PrismaCorpusTrainingSource(sqlClient, searcher),
      new Date("2022-01-01T00:00:00.000Z"),
      corpus,
      metrics,
    );
    expect(rows).toHaveLength(24);
    expect(new Set(rows.map((row) => row.serialNumber))).toEqual(
      new Set(
        [...eligibleSerials]
          .sort(
            (left, right) =>
              trainingSampleRank(left, corpus.seed) - trainingSampleRank(right, corpus.seed) ||
              left.localeCompare(right),
          )
          .slice(0, corpus.maxExamples),
      ),
    );
    expect(rows.some((row) => row.serialNumber.includes("excluded"))).toBe(false);
    expect(metrics.map((metric) => metric.pageOutcomeRows)).toEqual([5, 5, 5, 5, 5, 4]);
    expect(Math.max(...metrics.map((metric) => metric.bufferedOutcomeRows))).toBe(29);
    expect(metrics.every((metric) => metric.bufferedOutcomeRows <= corpus.batchSize + corpus.maxExamples)).toBe(
      true,
    );

    const artifact = trainCorpusModel(rows, {
      modelVersion: "postgres-fixture-logistic-1",
      trainingCutoff: new Date("2020-01-01T00:00:00.000Z"),
      censusAt: new Date("2022-01-01T00:00:00.000Z"),
      corpus,
      horizonMonths: 12,
      releaseThresholds: {
        minResolvedLabels: 4,
        maxCiHalfWidthPp: 100,
        minAuc: 0.8,
        minLiftPp: 10,
      },
    });

    expect(artifact.releaseGate.releasable).toBe(true);
    expect(artifact.labelCounts.train.positive).toBeGreaterThan(0);
    expect(artifact.labelCounts.train.negative).toBeGreaterThan(0);
    expect(artifact.labelCounts.holdout.positive).toBeGreaterThan(0);
    expect(artifact.labelCounts.holdout.negative).toBeGreaterThan(0);
    expect(artifact.evalReport.auc).toBeGreaterThanOrEqual(0.8);
    expect(artifact.evalReport.accuracyLiftPp).toBeGreaterThanOrEqual(10);
    expect(artifact.corpus).toEqual({
      ...corpus,
      samplingAlgorithm: "hash-top-n-v1",
      sampleSize: 24,
      historicalReconstruction: "current-corpus-not-point-in-time",
    });

    const loaded = loadModelArtifact(serializeModelArtifact(artifact));
    expect(loaded.artifact.corpus).toEqual(artifact.corpus);
    const holdoutStart = new Date("2020-01-01T00:00:00.000Z").getTime();
    const positive = rows.find(
      (row) => row.serialNumber.startsWith("positive-") && row.filingDate.getTime() >= holdoutStart,
    )!;
    const negative = rows.find(
      (row) => row.serialNumber.startsWith("negative-") && row.filingDate.getTime() >= holdoutStart,
    )!;
    expect(loaded.version).toBe("postgres-fixture-logistic-1");
    expect(loaded.score(positive.features)).toBeGreaterThan(loaded.score(negative.features));
    expect(loaded.score(positive.features)).toBe(loaded.score(positive.features));
  });
});
