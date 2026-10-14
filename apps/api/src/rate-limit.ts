/**
 * Anonymous-endpoint rate limiting (P5.6, mandates M8.2 / R-016).
 *
 * Fixed-window counters keyed by IP and by (normalised mark, class). The
 * handler returns `429` with `Retry-After` on excess and leaks no existence
 * signal. In-memory is deterministic and clock-injected for tests; Redis is the
 * shared-instance port used in production.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

export interface RedisRateLimitClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
}

export class InMemoryRateLimiter implements RateLimiter {
  readonly #windows = new Map<string, { count: number; windowStart: number }>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = this.#now();
    const existing = this.#windows.get(key);
    const elapsed = existing ? now - existing.windowStart : Number.POSITIVE_INFINITY;
    const expired = existing === undefined || elapsed >= windowSeconds * 1000;
    const windowStart = expired ? now : existing.windowStart;
    const count = (expired ? 0 : existing.count) + 1;
    this.#windows.set(key, { count, windowStart });

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowStart + windowSeconds * 1000 - now) / 1000),
    );
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds };
  }
}

export class RedisRateLimiter implements RateLimiter {
  readonly #client: RedisRateLimitClient;

  constructor(client: RedisRateLimitClient) {
    this.#client = client;
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const count = await this.#client.incr(key);
    if (count === 1) {
      await this.#client.expire(key, windowSeconds);
    }
    const ttl = await this.#client.ttl(key);
    const retryAfterSeconds = Math.max(1, ttl > 0 ? ttl : windowSeconds);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds };
  }
}

export function clientIp(headerValue: string | undefined): string {
  if (!headerValue) return "unknown";
  const first = headerValue.split(",")[0]?.trim() ?? "";
  return first.length > 0 ? first : "unknown";
}
