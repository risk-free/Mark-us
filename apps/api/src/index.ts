import { loadEnv } from "@markus/config";
import {
  BOOTSTRAP_MODEL,
  CorpusAssessmentScorer,
  DISCLAIMER_VERSION,
  PrismaCorpusSearcher,
  PrismaCorpusStore,
  type CorpusSqlClient,
  type CorpusTransactionHost,
} from "@markus/tm-data";
import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";

import { createApp } from "./app.js";
import { RedisAssessmentCache } from "./assessment-cache.js";
import { MetricsRegistry } from "./metrics.js";
import { RedisRateLimiter } from "./rate-limit.js";

if (process.env.NODE_ENV !== "production") {
  await import("dotenv/config");
}

const env = loadEnv();

const prisma = new PrismaClient();

const redis = new Redis(env.REDIS_URL);
redis.on("error", (error: Error) => {
  console.error("[api] redis error:", error.message);
});

const search = new PrismaCorpusSearcher(prisma as unknown as CorpusSqlClient);

const app = createApp(
  {
    search,
    store: new PrismaCorpusStore(prisma as unknown as CorpusTransactionHost),
    assess: new CorpusAssessmentScorer({
      searcher: search,
      model: BOOTSTRAP_MODEL,
      disclaimerVersion: DISCLAIMER_VERSION,
    }),
    cache: new RedisAssessmentCache(redis),
    rateLimiter: new RedisRateLimiter(redis),
    metrics: new MetricsRegistry(),
  },
  {
    freshnessSlaHours: env.TM_CORPUS_FRESHNESS_HOURS,
    assessmentCacheTtlSeconds: env.TM_ASSESSMENT_CACHE_TTL_SECONDS,
    assessRateIpPerHour: env.TM_ASSESS_RATE_IP_PER_HOUR,
    assessRateMarkPerHour: env.TM_ASSESS_RATE_MARK_PER_HOUR,
    modelVersion: BOOTSTRAP_MODEL.version,
    disclaimerVersion: DISCLAIMER_VERSION,
    metricsEnabled: true,
  },
);

serve({ fetch: app.fetch, port: env.PORT }, () => {
  console.log(`markus-api listening on :${env.PORT}`);
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(`[api] ${signal} received — shutting down`);
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));