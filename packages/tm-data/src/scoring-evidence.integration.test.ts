/**
 * Scoring/evidence contract invariants against PostgreSQL 16 (D-32 / BUG-017).
 *
 * Applying the migration proves the SQL is syntactically valid. This suite proves
 * the constraints and triggers actually reject unrepresentable evidence:
 *   - scores/models, review triad and append-only assessment evidence;
 *   - active-EXPERT assessment reviewers;
 *   - candidate-only registration and schema-v2 releasable evaluations;
 *   - horizon/census-bound labels and post-review label freezing;
 *   - artifact-bound evaluation summaries and approved promotion quorum.
 *
 * No Docker locally is not a reason to weaken the test: CI's existing
 * `tm-ingest-integration` job runs every `*.integration.test.ts` file.
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient, type Prisma } from "@prisma/client";
import postgres from "postgres";

import {
  DEFAULT_RELEASE_THRESHOLDS,
  buildCalibrationReport,
  evaluateRelease,
  type EvalSample,
} from "./eval.js";
import { LOGISTIC_FEATURE_ORDER } from "./model.js";
import {
  DEFAULT_LABEL_HORIZON_MONTHS,
  LOGISTIC_CONVERGENCE_TOLERANCE,
  LOGISTIC_L2_REGULARIZATION,
  LOGISTIC_MAX_ITERATIONS,
  MODEL_ARTIFACT_SCHEMA_VERSION,
  type ModelArtifact,
} from "./train.js";
import {
  CURRENT_CORPUS_RECONSTRUCTION_LIMITATION,
  TRAINING_SAMPLING_ALGORITHM,
} from "./training-config.js";

jest.setTimeout(180_000);

const MIGRATION_SQL = readFileSync(
  path.resolve(__dirname, "../../db/prisma/migrations/0P3__p0_3_backlog/migration.sql"),
  "utf8",
);

const EXTERNAL_DATABASE_URL = process.env.TM_TEST_DATABASE_URL;
const DISCLAIMER_VERSION = "disclaimer-1.0.0";
const COHORT = "scoring-contract-test";
const TRAINING_CUTOFF = new Date("2024-01-01T00:00:00.000Z");
const CENSUS_AT = new Date("2026-01-01T00:00:00.000Z");
const TRAIN_FILING = new Date("2023-06-15T00:00:00.000Z");
const TRAIN_HORIZON = new Date("2024-06-15T00:00:00.000Z");
const HOLDOUT_FILING = new Date("2024-06-15T00:00:00.000Z");
const HOLDOUT_HORIZON = new Date("2025-06-15T00:00:00.000Z");
const RESOLVED_AT = new Date("2025-05-01T00:00:00.000Z");
const HOLDOUT_POSITIVES = 300;
const HOLDOUT_NEGATIVES = 200;
const TRAIN_POSITIVES = 5;
const TRAIN_NEGATIVES = 3;
const CENSORED_LABELS = 2;

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

describe("scoring/evidence SQL invariants (D-32)", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaClient;
  let sql: ReturnType<typeof postgres>;
  let fixtureSequence = 0;

  const nextId = (prefix: string): string => `${prefix}-${randomUUID()}-${fixtureSequence++}`;

  const expectSqlError = async (run: () => Promise<unknown>, code: string): Promise<void> => {
    await expect(run()).rejects.toMatchObject({ code });
  };

  const expectRejected = async (run: () => Promise<unknown>, message: RegExp): Promise<void> => {
    await expect(run()).rejects.toThrow(message);
  };

  const seedReviewer = async (
    role: "EXPERT" | "MASTER_ADMIN" | "SALESPERSON",
    status: "ACTIVE" | "DISABLED" = "ACTIVE",
  ) => {
    const suffix = nextId("reviewer");
    return prisma.staffUser.create({
      data: {
        name: suffix,
        email: `${suffix}@example.test`,
        role,
        status,
      },
    });
  };

  const seedMark = async () => {
    const suffix = nextId("mark");
    const contact = await prisma.contact.create({ data: { name: `Contact ${suffix}` } });
    return prisma.trademark.create({
      data: {
        title: `MARK ${suffix}`,
        niceClass: 9,
        goodsServices: "software as a service",
        contactId: contact.id,
      },
    });
  };

  const seedAssessment = async () => {
    const mark = await seedMark();
    return prisma.trademarkAssessment.create({
      data: {
        trademarkId: mark.id,
        outcome: "SCORED",
        pRegistration: "0.7",
        subSignals: {},
        modelId: "pm_bootstrap_0_1_0",
        disclaimerVersion: DISCLAIMER_VERSION,
        featureSnapshot: {},
        corpusSnapshotAt: CENSUS_AT,
      },
    });
  };

  const holdoutSamples: EvalSample[] = [
    ...Array.from({ length: HOLDOUT_POSITIVES }, () => ({ score: 0.9, label: 1 as const })),
    ...Array.from({ length: HOLDOUT_NEGATIVES }, () => ({ score: 0.1, label: 0 as const })),
  ];

  const buildArtifact = (modelVersion: string): ModelArtifact => {
    const report = buildCalibrationReport(holdoutSamples);
    const gate = evaluateRelease(report, DEFAULT_RELEASE_THRESHOLDS);
    if (!gate.releasable) throw new Error(`test fixture is not releasable: ${gate.reasons.join("; ")}`);

    return {
      schemaVersion: MODEL_ARTIFACT_SCHEMA_VERSION,
      modelVersion,
      featureOrder: [...LOGISTIC_FEATURE_ORDER],
      scaling: {
        mean: LOGISTIC_FEATURE_ORDER.map(() => 0),
        scale: LOGISTIC_FEATURE_ORDER.map(() => 1),
      },
      coefficients: {
        intercept: -1,
        trigram: 0.1,
        phonetic: 0.1,
        classAdjacency: 0.1,
        goods: 0.1,
        crowdedness: 0.1,
      },
      trainingCutoff: TRAINING_CUTOFF.toISOString(),
      censusAt: CENSUS_AT.toISOString(),
      labelHorizonMonths: DEFAULT_LABEL_HORIZON_MONTHS,
      corpus: {
        cohort: COHORT,
        seed: 0,
        batchSize: 500,
        maxExamples: 50_000,
        samplingAlgorithm: TRAINING_SAMPLING_ALGORITHM,
        sampleSize:
          HOLDOUT_POSITIVES + HOLDOUT_NEGATIVES + TRAIN_POSITIVES + TRAIN_NEGATIVES + CENSORED_LABELS,
        historicalReconstruction: CURRENT_CORPUS_RECONSTRUCTION_LIMITATION,
      },
      labelCounts: {
        train: { positive: TRAIN_POSITIVES, negative: TRAIN_NEGATIVES },
        holdout: { positive: HOLDOUT_POSITIVES, negative: HOLDOUT_NEGATIVES },
        censored: CENSORED_LABELS,
      },
      trainer: {
        algorithm: "batch-newton",
        l2Regularization: LOGISTIC_L2_REGULARIZATION,
        tolerance: LOGISTIC_CONVERGENCE_TOLERANCE,
        maxIterations: LOGISTIC_MAX_ITERATIONS,
        iterations: 10,
        converged: true,
      },
      evalReport: report,
      releaseGate: { ...gate, thresholds: DEFAULT_RELEASE_THRESHOLDS },
    };
  };

  const createTrainedModel = async (transformArtifact: (artifact: ModelArtifact) => ModelArtifact = (value) => value) => {
    const modelVersion = nextId("model");
    const artifactSha256 = sha256(modelVersion);
    const artifact = transformArtifact(buildArtifact(modelVersion));
    const model = await prisma.probabilityModel.create({
      data: {
        modelVersion,
        kind: "TRAINED",
        artifactSchemaVersion: MODEL_ARTIFACT_SCHEMA_VERSION,
        artifactSha256,
        artifactJson: artifact as unknown as Prisma.InputJsonValue,
        cohort: COHORT,
        labelHorizonMonths: DEFAULT_LABEL_HORIZON_MONTHS,
        trainingCutoff: TRAINING_CUTOFF,
        censusAt: CENSUS_AT,
        trainedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    });
    return { model, artifact, artifactSha256, modelVersion };
  };

  const buildEvaluationData = async (withLabels = true) => {
    const fixture = await createTrainedModel();
    const evaluationKey = sha256(`evaluation:${fixture.modelVersion}`);
    const report = fixture.artifact.evalReport;

    const evaluation = await prisma.modelEvaluation.create({
      data: {
        evaluationKey,
        modelId: fixture.model.id,
        cohort: COHORT,
        labelHorizonMonths: DEFAULT_LABEL_HORIZON_MONTHS,
        trainingCutoff: TRAINING_CUTOFF,
        censusAt: CENSUS_AT,
        split: "HOLDOUT",
        artifactSchemaVersion: MODEL_ARTIFACT_SCHEMA_VERSION,
        artifactSha256: fixture.artifactSha256,
        configurationJson: {
          accuracyThreshold: 0.5,
          artifactSha256: fixture.artifactSha256,
          cohort: COHORT,
          labelHorizonMonths: DEFAULT_LABEL_HORIZON_MONTHS,
          maxExamples: 50_000,
          modelVersion: fixture.modelVersion,
          samplingAlgorithm: TRAINING_SAMPLING_ALGORITHM,
          seed: 0,
          split: "HOLDOUT",
          thresholds: DEFAULT_RELEASE_THRESHOLDS,
          trainingCutoff: TRAINING_CUTOFF.toISOString(),
          censusAt: CENSUS_AT.toISOString(),
        } as unknown as Prisma.InputJsonValue,
        sampleSize: report.sampleSize,
        positiveLabels: HOLDOUT_POSITIVES,
        negativeLabels: HOLDOUT_NEGATIVES,
        censoredLabels: CENSORED_LABELS,
        auc: report.auc,
        accuracy: report.accuracy,
        baselineAccuracy: report.baselineAccuracy,
        accuracyLiftPp: report.accuracyLiftPp,
        ciHalfWidthPp: report.ciHalfWidthPp,
        calibrationJson: report.buckets as unknown as Prisma.InputJsonValue,
        minResolvedLabels: DEFAULT_RELEASE_THRESHOLDS.minResolvedLabels,
        maxCiHalfWidthPp: DEFAULT_RELEASE_THRESHOLDS.maxCiHalfWidthPp,
        minAuc: DEFAULT_RELEASE_THRESHOLDS.minAuc,
        minLiftPp: DEFAULT_RELEASE_THRESHOLDS.minLiftPp,
        releasable: true,
        releaseReasons: [],
        trainerCommit: "0".repeat(40),
      },
    });

    if (withLabels) {
      const labels: Prisma.CorpusLabelCreateManyInput[] = [];
      for (let index = 0; index < HOLDOUT_POSITIVES + HOLDOUT_NEGATIVES; index += 1) {
        const positive = index < HOLDOUT_POSITIVES;
        labels.push({
          evaluationId: evaluation.id,
          serialNumber: `${fixture.modelVersion}-h-${index}`,
          outcome: positive ? "POSITIVE" : "NEGATIVE",
          split: "HOLDOUT",
          predictionScore: positive ? 0.9 : 0.1,
          filingDate: HOLDOUT_FILING,
          horizonAt: HOLDOUT_HORIZON,
          resolvedAt: RESOLVED_AT,
          sourceStatusCode: positive ? "700" : "600",
        });
      }
      for (let index = 0; index < TRAIN_POSITIVES + TRAIN_NEGATIVES; index += 1) {
        const positive = index < TRAIN_POSITIVES;
        labels.push({
          evaluationId: evaluation.id,
          serialNumber: `${fixture.modelVersion}-t-${index}`,
          outcome: positive ? "POSITIVE" : "NEGATIVE",
          split: "TRAIN",
          predictionScore: positive ? 0.9 : 0.1,
          filingDate: TRAIN_FILING,
          horizonAt: TRAIN_HORIZON,
          resolvedAt: RESOLVED_AT,
          sourceStatusCode: positive ? "700" : "600",
        });
      }
      for (let index = 0; index < CENSORED_LABELS; index += 1) {
        labels.push({
          evaluationId: evaluation.id,
          serialNumber: `${fixture.modelVersion}-c-${index}`,
          outcome: "CENSORED",
          split: "HOLDOUT",
          predictionScore: null,
          filingDate: HOLDOUT_FILING,
          horizonAt: HOLDOUT_HORIZON,
          resolvedAt: null,
          sourceStatusCode: "600",
        });
      }
      await prisma.corpusLabel.createMany({ data: labels });
    }

    return { ...fixture, evaluation };
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
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await sql?.end();
    await container?.stop();
  });

  it("seeds both non-promotable reference descriptors as candidates", async () => {
    const rows = await prisma.probabilityModel.findMany({
      where: { id: { in: ["pm_bootstrap_0_1_0", "pm_baseline_base_rate"] } },
      orderBy: { id: "asc" },
    });
    expect(rows.map(({ id, kind, status }) => [id, kind, status])).toEqual([
      ["pm_baseline_base_rate", "BASELINE", "CANDIDATE"],
      ["pm_bootstrap_0_1_0", "BOOTSTRAP", "CANDIDATE"],
    ]);
  });

  it("rejects scores without models and non-EXPERT or mutating assessment reviews", async () => {
    const mark = await seedMark();
    await expectSqlError(
      () =>
        sql`UPDATE "Trademark" SET "probabilityScore" = 0.5 WHERE "id" = ${mark.id}`,
      "23514",
    );
    await expectSqlError(
      () =>
        sql`UPDATE "Trademark"
            SET "probabilityVerdict" = 'CONFIRMED', "probabilityScore" = 0.5
            WHERE "id" = ${mark.id}`,
      "23514",
    );

    const assessment = await seedAssessment();
    const salesperson = await seedReviewer("SALESPERSON");
    await expectSqlError(
      () =>
        sql`INSERT INTO "AssessmentReview"
              ("id", "assessmentId", "reviewerId", "verdict", "rationale")
            VALUES (${nextId("review")}, ${assessment.id}, ${salesperson.id},
              'CONFIRMED', 'Long enough review rationale')`,
      "P0001",
    );

    const disabledExpert = await seedReviewer("EXPERT", "DISABLED");
    await expectSqlError(
      () =>
        sql`INSERT INTO "AssessmentReview"
              ("id", "assessmentId", "reviewerId", "verdict", "rationale")
            VALUES (${nextId("review")}, ${assessment.id}, ${disabledExpert.id},
              'CONFIRMED', 'Long enough review rationale')`,
      "P0001",
    );

    const overrideAssessment = await seedAssessment();
    const expert = await seedReviewer("EXPERT");
    await expectSqlError(
      () =>
        sql`INSERT INTO "AssessmentReview"
              ("id", "assessmentId", "reviewerId", "verdict", "rationale", "reviewedScore")
            VALUES (${nextId("review")}, ${overrideAssessment.id}, ${expert.id},
              'OVERRIDDEN', 'Long enough review rationale', NULL)`,
      "23514",
    );

    const reviewId = nextId("review");
    await sql`INSERT INTO "AssessmentReview"
                ("id", "assessmentId", "reviewerId", "verdict", "rationale")
              VALUES (${reviewId}, ${assessment.id}, ${expert.id},
                'CONFIRMED', 'Long enough review rationale')`;
    await expectSqlError(
      () => sql`UPDATE "AssessmentReview" SET "rationale" = 'Changed rationale' WHERE "id" = ${reviewId}`,
      "P0001",
    );

    await expectSqlError(
      () => sql`UPDATE "TrademarkAssessment" SET "pRegistration" = 0.8 WHERE "id" = ${assessment.id}`,
      "P0001",
    );
  });

  it("rejects retrospective model states and evaluations without matching releasable artifacts", async () => {
    await expectSqlError(
      () =>
        sql`INSERT INTO "ProbabilityModel"
              ("id", "modelVersion", "kind", "status", "cohort", "labelHorizonMonths")
            VALUES (${nextId("model")}, ${nextId("version")}, 'BOOTSTRAP', 'PROMOTED',
              'bootstrap', 12)`,
      "P0001",
    );

    const fixture = await createTrainedModel();
    const evaluationData = {
      evaluationKey: sha256(`foreign:${fixture.modelVersion}`),
      modelId: fixture.model.id,
      cohort: COHORT,
      labelHorizonMonths: DEFAULT_LABEL_HORIZON_MONTHS,
      trainingCutoff: TRAINING_CUTOFF,
      censusAt: CENSUS_AT,
      split: "HOLDOUT" as const,
      artifactSchemaVersion: MODEL_ARTIFACT_SCHEMA_VERSION,
      artifactSha256: "f".repeat(64),
      configurationJson: {
        accuracyThreshold: 0.5,
        artifactSha256: "f".repeat(64),
        cohort: COHORT,
        labelHorizonMonths: DEFAULT_LABEL_HORIZON_MONTHS,
        maxExamples: 50_000,
        modelVersion: fixture.modelVersion,
        samplingAlgorithm: TRAINING_SAMPLING_ALGORITHM,
        seed: 0,
        split: "HOLDOUT",
        thresholds: DEFAULT_RELEASE_THRESHOLDS,
        trainingCutoff: TRAINING_CUTOFF.toISOString(),
        censusAt: CENSUS_AT.toISOString(),
      } as unknown as Prisma.InputJsonValue,
      sampleSize: HOLDOUT_POSITIVES + HOLDOUT_NEGATIVES,
      positiveLabels: HOLDOUT_POSITIVES,
      negativeLabels: HOLDOUT_NEGATIVES,
      censoredLabels: CENSORED_LABELS,
      auc: fixture.artifact.evalReport.auc,
      accuracy: fixture.artifact.evalReport.accuracy,
      baselineAccuracy: fixture.artifact.evalReport.baselineAccuracy,
      accuracyLiftPp: fixture.artifact.evalReport.accuracyLiftPp,
      ciHalfWidthPp: fixture.artifact.evalReport.ciHalfWidthPp,
      calibrationJson: fixture.artifact.evalReport.buckets as unknown as Prisma.InputJsonValue,
      minResolvedLabels: DEFAULT_RELEASE_THRESHOLDS.minResolvedLabels,
      maxCiHalfWidthPp: DEFAULT_RELEASE_THRESHOLDS.maxCiHalfWidthPp,
      minAuc: DEFAULT_RELEASE_THRESHOLDS.minAuc,
      minLiftPp: DEFAULT_RELEASE_THRESHOLDS.minLiftPp,
      releasable: true,
      releaseReasons: [],
      trainerCommit: "0".repeat(40),
    };

    await expectRejected(
      () => prisma.modelEvaluation.create({ data: evaluationData }),
      /does not match the model artifact/,
    );

    const failed = await createTrainedModel((artifact) => ({
      ...artifact,
      releaseGate: {
        ...artifact.releaseGate,
        releasable: false,
        reasons: ["test fixture below the release floor"],
      },
    }));
    await expectRejected(
      () =>
        prisma.modelEvaluation.create({
          data: {
            ...evaluationData,
            evaluationKey: sha256(`not-releasable:${failed.modelVersion}`),
            modelId: failed.model.id,
            artifactSha256: failed.artifactSha256,
            configurationJson: {
              accuracyThreshold: 0.5,
              artifactSha256: failed.artifactSha256,
              cohort: COHORT,
              labelHorizonMonths: DEFAULT_LABEL_HORIZON_MONTHS,
              maxExamples: 50_000,
              modelVersion: failed.modelVersion,
              samplingAlgorithm: TRAINING_SAMPLING_ALGORITHM,
              seed: 0,
              split: "HOLDOUT",
              thresholds: DEFAULT_RELEASE_THRESHOLDS,
              trainingCutoff: TRAINING_CUTOFF.toISOString(),
              censusAt: CENSUS_AT.toISOString(),
            } as unknown as Prisma.InputJsonValue,
            releasable: false,
            releaseReasons: ["test fixture below the release floor"],
          },
        }),
      /ck_eval_schema_v2_releasable/,
    );
  });

  it("binds labels to an elapsed horizon and freezes them at the first review", async () => {
    const { evaluation, model } = await buildEvaluationData(false);

    await expectRejected(
      () =>
        prisma.corpusLabel.create({
          data: {
            evaluationId: evaluation.id,
            serialNumber: `${model.modelVersion}-late`,
            outcome: "POSITIVE",
            split: "HOLDOUT",
            predictionScore: 0.9,
            filingDate: new Date("2025-06-15T00:00:00.000Z"),
            horizonAt: new Date("2026-06-15T00:00:00.000Z"),
            resolvedAt: new Date("2025-12-01T00:00:00.000Z"),
            sourceStatusCode: "700",
          },
        }),
      /horizon has not elapsed/,
    );

    const finalized = await buildEvaluationData(true);
    const attorney = await seedReviewer("EXPERT");
    await sql`INSERT INTO "ModelPromotionReview"
                ("id", "modelId", "evaluationId", "reviewerId", "reviewerRole",
                 "decision", "spotCheckSampleSize", "spotCheckAgreementPct", "rationale")
              VALUES (${nextId("promotion-review")}, ${finalized.model.id}, ${finalized.evaluation.id},
                ${attorney.id}, 'ATTORNEY', 'APPROVE', 50, 95,
                'Approved after reviewing fifty labelled samples')`;

    await expectRejected(
      () =>
        prisma.corpusLabel.create({
          data: {
            evaluationId: finalized.evaluation.id,
            serialNumber: `${finalized.modelVersion}-after-review`,
            outcome: "NEGATIVE",
            split: "HOLDOUT",
            predictionScore: 0.1,
            filingDate: HOLDOUT_FILING,
            horizonAt: HOLDOUT_HORIZON,
            resolvedAt: RESOLVED_AT,
            sourceStatusCode: "600",
          },
        }),
      /label set is frozen/,
    );

    await expectSqlError(
      () =>
        sql`UPDATE "ModelEvaluation" SET "auc" = 0.99 WHERE "id" = ${finalized.evaluation.id}`,
      "P0001",
    );
    await expectSqlError(
      () =>
        sql`DELETE FROM "CorpusLabel"
            WHERE "evaluationId" = ${finalized.evaluation.id}
              AND "serialNumber" = ${`${finalized.modelVersion}-h-0`}`,
      "P0001",
    );
  });

  it("requires the attorney/Master-Admin quorum and bind the promoted evaluation", async () => {
    const { evaluation, model } = await buildEvaluationData(true);
    const attorney = await seedReviewer("EXPERT");
    const administrator = await seedReviewer("MASTER_ADMIN");

    await expectRejected(
      () =>
        prisma.probabilityModel.update({
          where: { id: model.id },
          data: {
            status: "PROMOTED",
            promotedAt: new Date("2026-01-03T00:00:00.000Z"),
            promotedById: administrator.id,
            promotedEvaluationId: evaluation.id,
          },
        }),
      /distinct ATTORNEY and MASTER_ADMIN approvals/,
    );

    await prisma.modelPromotionReview.create({
      data: {
        modelId: model.id,
        evaluationId: evaluation.id,
        reviewerId: attorney.id,
        reviewerRole: "ATTORNEY",
        decision: "APPROVE",
        spotCheckSampleSize: 50,
        spotCheckAgreementPct: 95,
        rationale: "Approved after reviewing fifty labelled samples",
      },
    });

    await expectRejected(
      () =>
        prisma.probabilityModel.update({
          where: { id: model.id },
          data: {
            status: "PROMOTED",
            promotedAt: new Date("2026-01-03T00:00:00.000Z"),
            promotedById: administrator.id,
            promotedEvaluationId: evaluation.id,
          },
        }),
      /distinct ATTORNEY and MASTER_ADMIN approvals/,
    );

    await prisma.modelPromotionReview.create({
      data: {
        modelId: model.id,
        evaluationId: evaluation.id,
        reviewerId: administrator.id,
        reviewerRole: "MASTER_ADMIN",
        decision: "APPROVE",
        rationale: "Evidence and release gate independently verified",
      },
    });

    const promoted = await prisma.probabilityModel.update({
      where: { id: model.id },
      data: {
        status: "PROMOTED",
        promotedAt: new Date("2026-01-03T00:00:00.000Z"),
        promotedById: administrator.id,
        promotedEvaluationId: evaluation.id,
      },
    });
    expect(promoted.status).toBe("PROMOTED");
    expect(promoted.promotedEvaluationId).toBe(evaluation.id);

    await expectSqlError(
      () => sql`DELETE FROM "ProbabilityModel" WHERE "id" = ${model.id}`,
      "P0001",
    );
  });
});
