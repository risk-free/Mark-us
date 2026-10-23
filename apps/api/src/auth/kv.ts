/**
 * Tiny TTL key-value port shared by the auth domain (R-005): session records,
 * single-use MFA challenges and login lockout counters. Redis is the
 * shared-instance store in production; the in-memory variant is clock-injected
 * for deterministic tests. Nothing here ever stores a raw credential or token —
 * callers pass already-hashed key material only (R-005: never logged, never
 * stored plaintext at rest).
 */

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  /** SET with a mandatory TTL; there is no persistent auth state in Redis. */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Atomic read-and-delete (Redis GETDEL) so one-time values cannot replay. */
  getAndDelete(key: string): Promise<string | null>;
  /** INCR; on the first increment the key gets `ttlSeconds` to live. */
  incrWithTtl(key: string, ttlSeconds: number): Promise<number>;
  del(...keys: string[]): Promise<void>;
}

export interface RedisKvCommands {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
  getdel(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
}

export class RedisKeyValueStore implements KeyValueStore {
  readonly #client: RedisKvCommands;

  constructor(client: RedisKvCommands) {
    this.#client = client;
  }

  get(key: string): Promise<string | null> {
    return this.#client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.#client.set(key, value, "EX", Math.max(1, Math.ceil(ttlSeconds)));
  }

  getAndDelete(key: string): Promise<string | null> {
    return this.#client.getdel(key);
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.#client.incr(key);
    if (count === 1) await this.#client.expire(key, Math.max(1, Math.ceil(ttlSeconds)));
    return count;
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.#client.del(...keys);
  }
}

interface InMemoryEntry {
  value: string;
  expiresAtMs: number;
}

export class InMemoryKeyValueStore implements KeyValueStore {
  readonly #entries = new Map<string, InMemoryEntry>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  #live(key: string): InMemoryEntry | null {
    const entry = this.#entries.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAtMs <= this.#now()) {
      this.#entries.delete(key);
      return null;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    return this.#live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.#entries.set(key, { value, expiresAtMs: this.#now() + ttlSeconds * 1000 });
  }

  async getAndDelete(key: string): Promise<string | null> {
    const entry = this.#live(key);
    if (entry === null) return null;
    this.#entries.delete(key);
    return entry.value;
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const existing = this.#live(key);
    const value = existing === null ? 1 : Number.parseInt(existing.value, 10) + 1;
    this.#entries.set(key, {
      value: String(value),
      expiresAtMs: existing === null ? this.#now() + ttlSeconds * 1000 : existing.expiresAtMs,
    });
    return value;
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) this.#entries.delete(key);
  }
}
