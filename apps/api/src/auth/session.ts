/**
 * Opaque session service (R-005 / ARCH-01 §5.1, §5.2). The cookie carries a
 * 256-bit random session id; Redis holds the record under
 * `markus:sess:<sha256(sessionId)>` so the id itself never appears at rest.
 * TTLs slide on every resolution: 12 h staff, 30 min client portal. A per-actor
 * index set (`markus:sess:idx:…`) backs bulk revocation — on
 * `Contact.deletedAt` or staff-initiated revoke (R-005, mandate M2).
 */

import { createHash, randomBytes } from "node:crypto";

import type { Role } from "@markus/core";

import type { KeyValueStore } from "./kv.js";

export const STAFF_SESSION_TTL_SECONDS = 12 * 60 * 60;
export const CONTACT_SESSION_TTL_SECONDS = 30 * 60;

export type ActorType = "STAFF" | "CONTACT";

export interface SessionRecord {
  actorId: string;
  actorType: ActorType;
  /** Staff role; always `null` for client (CONTACT) sessions. */
  role: Role | null;
  /** Preferred UI locale at issuance (staff or contact preference). */
  locale: string;
  /** Compared against the `x-csrf-token` header on every mutation. */
  csrfSecret: string;
  createdAt: string;
  lastSeenAt: string;
  ip: string;
  ua: string;
  scopes: string[];
}

export interface Session {
  id: string;
  record: SessionRecord;
  expiresAt: Date;
}

export interface CreateSessionInput {
  actorType: ActorType;
  actorId: string;
  role: Role | null;
  locale: string;
  ip: string;
  ua: string;
  scopes?: string[];
}

/** Per-actor set of live session keys; powers `destroyAll` revocation. */
export interface SessionIndexStore {
  add(indexKey: string, sessionKey: string, ttlSeconds: number): Promise<void>;
  members(indexKey: string): Promise<string[]>;
  remove(indexKey: string, sessionKey: string): Promise<void>;
  touch(indexKey: string, ttlSeconds: number): Promise<void>;
}

export interface RedisSessionIndexCommands {
  sadd(key: string, member: string): Promise<unknown>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, member: string): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export class RedisSessionIndexStore implements SessionIndexStore {
  readonly #client: RedisSessionIndexCommands;

  constructor(client: RedisSessionIndexCommands) {
    this.#client = client;
  }

  async add(indexKey: string, sessionKey: string, ttlSeconds: number): Promise<void> {
    await this.#client.sadd(indexKey, sessionKey);
    await this.touch(indexKey, ttlSeconds);
  }

  members(indexKey: string): Promise<string[]> {
    return this.#client.smembers(indexKey);
  }

  async remove(indexKey: string, sessionKey: string): Promise<void> {
    await this.#client.srem(indexKey, sessionKey);
  }

  async touch(indexKey: string, ttlSeconds: number): Promise<void> {
    await this.#client.expire(indexKey, Math.max(1, Math.ceil(ttlSeconds)));
  }
}

export class InMemorySessionIndexStore implements SessionIndexStore {
  readonly #sets = new Map<string, { members: Set<string>; expiresAtMs: number }>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  async add(indexKey: string, sessionKey: string, ttlSeconds: number): Promise<void> {
    const set = this.#sets.get(indexKey) ?? {
      members: new Set<string>(),
      expiresAtMs: 0,
    };
    set.members.add(sessionKey);
    set.expiresAtMs = this.#now() + ttlSeconds * 1000;
    this.#sets.set(indexKey, set);
  }

  async members(indexKey: string): Promise<string[]> {
    const set = this.#sets.get(indexKey);
    if (set === undefined || set.expiresAtMs <= this.#now()) return [];
    return [...set.members];
  }

  async remove(indexKey: string, sessionKey: string): Promise<void> {
    this.#sets.get(indexKey)?.members.delete(sessionKey);
  }

  async touch(indexKey: string, ttlSeconds: number): Promise<void> {
    const set = this.#sets.get(indexKey);
    if (set !== undefined) set.expiresAtMs = this.#now() + ttlSeconds * 1000;
  }
}

const sha256Hex = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const sessionKeyFor = (sessionId: string): string =>
  `markus:sess:${sha256Hex(sessionId)}`;

export const sessionIndexKeyFor = (actorType: ActorType, actorId: string): string =>
  `markus:sess:idx:${actorType === "STAFF" ? "staff" : "contact"}:${actorId}`;

const ttlFor = (actorType: ActorType): number =>
  actorType === "STAFF" ? STAFF_SESSION_TTL_SECONDS : CONTACT_SESSION_TTL_SECONDS;

export class SessionService {
  readonly #kv: KeyValueStore;
  readonly #index: SessionIndexStore;
  readonly #now: () => Date;

  constructor(kv: KeyValueStore, index: SessionIndexStore, now: () => Date = () => new Date()) {
    this.#kv = kv;
    this.#index = index;
    this.#now = now;
  }

  ttlSecondsFor(actorType: ActorType): number {
    return ttlFor(actorType);
  }

  async create(input: CreateSessionInput): Promise<Session> {
    const ttlSeconds = ttlFor(input.actorType);
    const now = this.#now();
    const sessionId = randomBytes(32).toString("base64url");
    const record: SessionRecord = {
      actorId: input.actorId,
      actorType: input.actorType,
      role: input.actorType === "STAFF" ? input.role : null,
      locale: input.locale,
      csrfSecret: randomBytes(32).toString("base64url"),
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      ip: input.ip,
      ua: input.ua,
      scopes: input.scopes ?? [],
    };
    const key = sessionKeyFor(sessionId);
    await this.#kv.set(key, JSON.stringify(record), ttlSeconds);
    await this.#index.add(sessionIndexKeyFor(input.actorType, input.actorId), key, ttlSeconds);
    return { id: sessionId, record, expiresAt: new Date(now.getTime() + ttlSeconds * 1000) };
  }

  /** Sliding resolution: a live session's TTL resets to the full window. */
  async resolve(sessionId: string): Promise<Session | null> {
    const key = sessionKeyFor(sessionId);
    const raw = await this.#kv.get(key);
    if (raw === null) return null;
    const record = JSON.parse(raw) as SessionRecord;
    const ttlSeconds = ttlFor(record.actorType);
    const now = this.#now();
    record.lastSeenAt = now.toISOString();
    await this.#kv.set(key, JSON.stringify(record), ttlSeconds);
    await this.#index.touch(sessionIndexKeyFor(record.actorType, record.actorId), ttlSeconds);
    return { id: sessionId, record, expiresAt: new Date(now.getTime() + ttlSeconds * 1000) };
  }

  async destroy(sessionId: string): Promise<void> {
    const key = sessionKeyFor(sessionId);
    const raw = await this.#kv.get(key);
    if (raw !== null) {
      const record = JSON.parse(raw) as SessionRecord;
      await this.#index.remove(sessionIndexKeyFor(record.actorType, record.actorId), key);
    }
    await this.#kv.del(key);
  }

  /** Bulk revoke — called when a Contact is deleted or staff access is revoked. */
  async destroyAll(actorType: ActorType, actorId: string): Promise<void> {
    const indexKey = sessionIndexKeyFor(actorType, actorId);
    const keys = await this.#index.members(indexKey);
    if (keys.length > 0) await this.#kv.del(...keys);
    await this.#kv.del(indexKey);
  }
}
