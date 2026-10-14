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

import { corpusFreshness, type AssessmentScore, type CorpusSearchResult, type QueryMark } from "@markus/tm-data";
import type { CorpusStore } from "@markus/tm-data";

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
}

export interface AppOptions {
  /** Corpus freshness SLA in hours (`TM_CORPUS_FRESHNESS_HOURS`). */
  freshnessSlaHours: number;
  defaultSearchLimit?: number;
  maxSearchLimit?: number;
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
  const { search, store, assess } = services;
  const sla = options.freshnessSlaHours;
  const defaultSearchLimit = options.defaultSearchLimit ?? 20;
  const maxSearchLimit = options.maxSearchLimit ?? 100;

  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "markus-api",
      time: new Date().toISOString(),
    }),
  );

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

    const [assessment, lastCompletedAt] = await Promise.all([
      assess.score(query),
      store.lastCompletedRunAt(),
    ]);

    return c.json({
      ...assessment,
      corpusFreshness: corpusFreshness(lastCompletedAt, new Date(), sla),
    });
  });

  app.get("/tm/ingest/runs", async (c) => {
    const limit = parseLimit(c.req.query("limit"), 20, 100);
    const runs = await store.recentRuns(limit);
    return c.json({ runs });
  });

  return app;
}