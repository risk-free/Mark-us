/**
 * Offline P5.4 model trainer. No HTTP surface and no production activation.
 *
 *   pnpm --filter @markus/workers model:train -- \
 *     --model-version logistic-2020-v1 --cutoff 2020-01-01 \
 *     --census 2022-01-01 --output artifacts/logistic-2020-v1.json
 *
 * Reads the configured PostgreSQL corpus, assembles D-24/D-26 examples, fits
 * only the temporal training split, evaluates holdout through evaluateRelease,
 * and writes a new versioned JSON artifact only when every gate passes.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_LABEL_HORIZON_MONTHS,
  DEFAULT_RELEASE_THRESHOLDS,
  PrismaCorpusSearcher,
  PrismaCorpusTrainingSource,
  serializeModelArtifact,
  trainCorpusModel,
  type CorpusSqlClient,
  type ReleaseThresholds,
} from "@markus/tm-data";
import { PrismaClient } from "@prisma/client";

const USAGE =
  "usage: pnpm --filter @markus/workers model:train -- --model-version <version> --cutoff <YYYY-MM-DD> --census <YYYY-MM-DD> --output <file> [options]\n" +
  "  --horizon-months <n>       label horizon (default: 12; D-26 secondary: 24)\n" +
  "  --min-resolved-labels <n>  holdout floor (default: 500)\n" +
  "  --max-ci-half-width-pp <n> accuracy 95% CI bound (default: 5)\n" +
  "  --min-auc <n>              holdout AUC floor (default: 0.7)\n" +
  "  --min-lift-pp <n>          accuracy lift over baseline (default: 10)";

export interface ModelTrainArgs {
  modelVersion: string;
  trainingCutoff: Date;
  censusAt: Date;
  output: string;
  horizonMonths: number;
  releaseThresholds: ReleaseThresholds;
}

const parseDate = (raw: string, flag: string): Date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`${flag} must use YYYY-MM-DD\n${USAGE}`);
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new Error(`${flag} must be a valid calendar date\n${USAGE}`);
  }
  return date;
};

const parseNumber = (raw: string, flag: string, integer = false): number => {
  const value = Number(raw);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) {
    throw new Error(`${flag} must be ${integer ? "an integer" : "a number"}\n${USAGE}`);
  }
  return value;
};

export function parseModelTrainArgs(argv: readonly string[]): ModelTrainArgs {
  let modelVersion: string | undefined;
  let trainingCutoff: Date | undefined;
  let censusAt: Date | undefined;
  let output: string | undefined;
  let horizonMonths = DEFAULT_LABEL_HORIZON_MONTHS;
  const releaseThresholds = { ...DEFAULT_RELEASE_THRESHOLDS };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`${String(flag)} requires a value\n${USAGE}`);
    switch (flag) {
      case "--model-version":
        modelVersion = value;
        break;
      case "--cutoff":
        trainingCutoff = parseDate(value, flag);
        break;
      case "--census":
        censusAt = parseDate(value, flag);
        break;
      case "--output":
        output = value;
        break;
      case "--horizon-months":
        horizonMonths = parseNumber(value, flag, true);
        if (horizonMonths <= 0) throw new Error("--horizon-months must be positive");
        break;
      case "--min-resolved-labels":
        releaseThresholds.minResolvedLabels = parseNumber(value, flag, true);
        if (releaseThresholds.minResolvedLabels < 0) throw new Error(`${flag} must not be negative`);
        break;
      case "--max-ci-half-width-pp":
        releaseThresholds.maxCiHalfWidthPp = parseNumber(value, flag);
        if (releaseThresholds.maxCiHalfWidthPp < 0) throw new Error(`${flag} must not be negative`);
        break;
      case "--min-auc":
        releaseThresholds.minAuc = parseNumber(value, flag);
        break;
      case "--min-lift-pp":
        releaseThresholds.minLiftPp = parseNumber(value, flag);
        break;
      default:
        throw new Error(`unknown argument '${String(flag)}'\n${USAGE}`);
    }
    index += 1;
  }

  if (modelVersion === undefined || modelVersion.trim().length === 0) {
    throw new Error(`--model-version is required\n${USAGE}`);
  }
  if (trainingCutoff === undefined) throw new Error(`--cutoff is required\n${USAGE}`);
  if (censusAt === undefined) throw new Error(`--census is required\n${USAGE}`);
  if (output === undefined || output.trim().length === 0) throw new Error(`--output is required\n${USAGE}`);
  if (trainingCutoff.getTime() >= censusAt.getTime()) {
    throw new Error("--cutoff must be earlier than --census");
  }

  return {
    modelVersion,
    trainingCutoff,
    censusAt,
    output,
    horizonMonths,
    releaseThresholds,
  };
}

export function requireDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required for offline model training");

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use postgres: or postgresql:");
  }
  return databaseUrl;
}

export async function main(argv: readonly string[]): Promise<void> {
  const args = parseModelTrainArgs(argv);
  if (process.env.NODE_ENV !== "production") await import("dotenv/config");
  process.env.DATABASE_URL = requireDatabaseUrl();

  const prisma = new PrismaClient();
  try {
    const sql = prisma as unknown as CorpusSqlClient;
    const searcher = new PrismaCorpusSearcher(sql);
    const rows = await new PrismaCorpusTrainingSource(sql, searcher).assemble(args.censusAt);
    const artifact = trainCorpusModel(rows, {
      modelVersion: args.modelVersion,
      trainingCutoff: args.trainingCutoff,
      censusAt: args.censusAt,
      horizonMonths: args.horizonMonths,
      releaseThresholds: args.releaseThresholds,
    });

    await mkdir(path.dirname(path.resolve(args.output)), { recursive: true });
    // A model version is immutable: never overwrite an existing artifact.
    await writeFile(args.output, serializeModelArtifact(artifact), { encoding: "utf8", flag: "wx" });
    console.log(
      `[model-train] wrote ${args.output}: ${JSON.stringify({
        modelVersion: artifact.modelVersion,
        labelCounts: artifact.labelCounts,
        evalReport: artifact.evalReport,
        releaseGate: artifact.releaseGate,
      })}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// ts-jest compiles this module to CommonJS for unit tests, so match the
// invoked script path instead of using import.meta in the entrypoint guard.
if (/(^|[\\/])model-train\.(ts|js)$/.test(process.argv[1] ?? "")) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error("[model-train] fatal:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
