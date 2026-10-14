/**
 * API surface for the USPTO corpus (mandate M7.2 / M7.1 freshness).
 *
 * `createApp` is a pure dependency-injected factory: services come from the
 * caller, so the route contract and the freshness gate are integration-tested
 * with **real** PostgreSQL services while the process stays DB-free at boot.
 * `/tm/search` is a signal, not an opinion (M7.2): it always carries the method,
 * the disclaimer and `isLegalAdvice: false`, plus the corpus freshness that the
 * M7.1 acceptance gate keys on (`stale` beyond the SLA).
 */

import { Hono } from "hono";

import {
  corpusFreshness,
  normalizeMarkText,
  type AssessmentScore,
  type CorpusSearchResult,
  type QueryMark,
} from "@markus/tm-data";
import type { CorpusStore } from "@markus/tm-data";

import { assessmentCacheKey, type AssessmentCache } from "./assessment-cache.js";
import { METRICS_CONTENT_TYPE, type MetricsRegistry } from "./metrics.js";
import { clientIp, type RateLimiter } from "./rate-limit.js";

export interface CorpusSearcher {
  search(query: string, options?: { limit?: number }): Promise<CorpusSearchResult>;
}

export interface Assessor {
  score(query: QueryMark): Promise<AssessmentScore>;
}

export interface AppServices {
  search: CorpusSearcher;
  store: CorpusStore;
  assess: Assessor;
  /** Optional 24 h result cache (M8.1); active only with both versions set. */
  cache?: AssessmentCache;
  /** Optional abuse-control limiter (M8.2). */
  rateLimiter?: RateLimiter;
  /** Optional Prometheus registry; `/metrics` is exposed only when enabled. */
  metrics?: MetricsRegistry;
}

export interface AppOptions {
  /** Corpus freshness SLA in hours (`TM_CORPUS_FRESHNESS_HOURS`). */
  freshnessSlaHours: number;
  defaultSearchLimit?: number;
  maxSearchLimit?: number;
  /** Result-cache TTL in seconds (`TM_ASSESSMENT_CACHE_TTL_SECONDS`), default 24 h. */
  assessmentCacheTtlSeconds?: number;
  /** Per-IP hourly limit (`TM_ASSESS_RATE_IP_PER_HOUR`). */
  assessRateIpPerHour?: number;
  /** Per (normalised mark, class) hourly limit (`TM_ASSESS_RATE_MARK_PER_HOUR`). */
  assessRateMarkPerHour?: number;
  /** Version stamped into the cache key; required for caching to engage. */
  modelVersion?: string;
  /** Version stamped into the cache key; required for caching to engage. */
  disclaimerVersion?: string;
  /** Expose `GET /metrics` when a registry is supplied. */
  metricsEnabled?: boolean;
}

const parseLimit = (raw: string | undefined, fallback: number, max: number): number => {
  const parsed = parseInt(raw ?? "", 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

/** Nice class codes are `1..45`; anything else is ignored (not an error). */
const parseClassCodes = (raw: string | undefined): number[] => {
  const parsed = parseInt(raw ?? "", 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 45) return [];
  return [parsed];
};

export function createApp(services: AppServices, options: AppOptions): Hono {
  const { search, store, assess, cache, rateLimiter, metrics } = services;
  const sla = options.freshnessSlaHours;
  const defaultSearchLimit = options.defaultSearchLimit ?? 20;
  const maxSearchLimit = options.maxSearchLimit ?? 100;
  const cacheTtl = options.assessmentCacheTtlSeconds ?? 86_400;
  const rateIpPerHour = options.assessRateIpPerHour ?? 20;
  const rateMarkPerHour = options.assessRateMarkPerHour ?? 5;
  const metricsEnabled = options.metricsEnabled === true && metrics !== undefined;

  const app = new Hono();

  if (metrics) {
    app.use("*", async (c, next) => {
      const start = performance.now();
      await next();
      metrics.observeHttp(
        c.req.routePath,
        c.req.method,
        c.res.status,
        (performance.now() - start) / 1000,
      );
    });
  }

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "markus-api",
      time: new Date().toISOString(),
    }),
  );

  if (metricsEnabled && metrics) {
    app.get("/metrics", (c) => c.body(metrics.render(), 200, { "Content-Type": METRICS_CONTENT_TYPE }));
  }

  app.get("/tm/search", async (c) => {
    const q = c.req.query("q") ?? "";
    if (q.trim().length === 0) {
      return c.json({ error: "missing required query parameter: q" }, 400);
    }

    const limit = parseLimit(c.req.query("limit"), defaultSearchLimit, maxSearchLimit);
    const [result, lastCompletedAt] = await Promise.all([
      search.search(q, { limit }),
      store.lastCompletedRunAt(),
    ]);

    return c.json({
      ...result,
      corpusFreshness: corpusFreshness(lastCompletedAt, new Date(), sla),
    });
  });

  app.get("/tm/assess", async (c) => {
    const q = c.req.query("q") ?? "";
    if (q.trim().length === 0) {
      return c.json({ error: "missing required query parameter: q" }, 400);
    }

    const query: QueryMark = {
      markText: q,
      classCodes: parseClassCodes(c.req.query("niceClass")),
      goodsSummary: c.req.query("goods") ?? null,
    };

    if (rateLimiter) {
      const ip = clientIp(c.req.header("x-forwarded-for"));
      const mark = normalizeMarkText(query.markText);
      const niceClass = query.classCodes.length > 0 ? query.classCodes.join(",") : "-";
      const ipResult = await rateLimiter.consume(`markus:rl:assess:ip:${ip}`, rateIpPerHour, 3600);
      const markResult = await rateLimiter.consume(
        `markus:rl:assess:mark:${mark}:${niceClass}`,
        rateMarkPerHour,
        3600,
      );
      if (!ipResult.allowed || !markResult.allowed) {
        const retryAfter = Math.max(
          1,
          Math.ceil(Math.max(ipResult.retryAfterSeconds, markResult.retryAfterSeconds)),
        );
        return c.json({ error: "rate limit exceeded" }, 429, {
          "Retry-After": String(retryAfter),
        });
      }
    }

    const lastCompletedAt = await store.lastCompletedRunAt();
    const freshness = corpusFreshness(lastCompletedAt, new Date(), sla);

    const canCache =
      cache !== undefined && options.modelVersion !== undefined && options.disclaimerVersion !== undefined;
    const key = canCache
      ? assessmentCacheKey(query, options.modelVersion!, options.disclaimerVersion!)
      : "";

    if (canCache) {
      const startedAt = performance.now();
      const cached = await cache!.get(key);
      if (cached !== null) {
        metrics?.observeAssessment((performance.now() - startedAt) / 1000, true);
        const core = JSON.parse(cached) as Record<string, unknown>;
        return c.json({ ...core, corpusFreshness: freshness });
      }
    }

    const scoreStartedAt = performance.now();
    const assessment = await assess.score(query);
    metrics?.observeAssessment((performance.now() - scoreStartedAt) / 1000, false);

    if (canCache) {
      await cache!.set(key, JSON.stringify(assessment), cacheTtl);
    }

    return c.json({
      ...assessment,
      corpusFreshness: freshness,
    });
  });

  app.get("/tm/ingest/runs", async (c) => {
    const limit = parseLimit(c.req.query("limit"), 20, 100);
    const runs = await store.recentRuns(limit);
    return c.json({ runs });
  });

  return app;
}