/**
 * 24-hour anonymous assessment cache (P5.6, mandates M8.1 / R-016).
 *
 * The cache key is a SHA-256 over a stable, delimiter-safe string of the
 * normalised mark, the sorted classes, the normalised goods and the model and
 * disclaimer versions, so a replay of the same screening never reaches the
 * scorer twice and the cache is never an oracle for a variant that differs only
 * by case, whitespace or token order.
 */

import { createHash } from "node:crypto";

import { normalizeMarkText, type QueryMark } from "@markus/tm-data";

export interface AssessmentCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export interface RedisCacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttl: number): Promise<unknown>;
}

const KEY_PREFIX = "markus:assess:v1:";

const normaliseGoodsForKey = (goods: string | null): string => {
  if (goods === null) return "-";
  const flattened = goods.toLowerCase().trim().replace(/\s+/g, " ");
  if (flattened.length === 0) return "-";
  return flattened.split(" ").sort().join(" ");
};

export function assessmentCacheKey(
  query: QueryMark,
  modelVersion: string,
  disclaimerVersion: string,
): string {
  const mark = normalizeMarkText(query.markText);
  const classes = [...query.classCodes].sort((a, b) => a - b).join(",");
  const goods = normaliseGoodsForKey(query.goodsSummary);
  const stable = [mark, classes, goods, modelVersion, disclaimerVersion].join("\u0000");
  return `${KEY_PREFIX}${createHash("sha256").update(stable).digest("hex")}`;
}

export class InMemoryAssessmentCache implements AssessmentCache {
  readonly #entries = new Map<string, { value: string; expiresAt: number }>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.#entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.#entries.set(key, { value, expiresAt: this.#now() + ttlSeconds * 1000 });
  }
}

export class RedisAssessmentCache implements AssessmentCache {
  readonly #client: RedisCacheClient;

  constructor(client: RedisCacheClient) {
    this.#client = client;
  }

  async get(key: string): Promise<string | null> {
    return this.#client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.#client.set(key, value, "EX", ttlSeconds);
  }
}
