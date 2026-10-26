/**
 * Client magic links (R-005 / R-013, mandates M2/M8). Tokens are 256-bit
 * random, HMAC-SHA256 hashed with the dedicated `MAGIC_LINK_SECRET` (R-023
 * domain separation) and stored only as hex digests; raw tokens are never
 * logged and never at rest. Single-use via an atomic conditional consume
 * (R-005 / ADR D-18: token rows live in Postgres, not Redis). Issuance always
 * answers 202 with a neutral body; per-contact limits fail silently and per-IP
 * limits fail as 429 (the contract lists 429 for the operation). Redemption
 * rejects invalid, expired, consumed or erased-contact tokens with a single
 * 401 shape; 5 failed attempts destroy the token.
 */

import { createHmac, randomBytes } from "node:crypto";

import type { RateLimiter } from "../rate-limit.js";
import { AuthError } from "./staff-auth.js";
import type { Session, SessionService } from "./session.js";

export const MAGIC_LINK_TOKEN_TTL_SECONDS = 15 * 60;
export const MAGIC_LINK_MAX_ATTEMPTS = 5;
export const MAGIC_LINK_IP_LIMIT = 20;
export const MAGIC_LINK_CONTACT_LIMIT = 5;
export const MAGIC_LINK_VERIFY_LIMIT = 10;

export interface MagicLinkContact {
  id: string;
  name: string;
  email: string;
  locale: string;
  deletedAt: Date | null;
}

export interface MagicLinkTokenRow {
  id: string;
  contactId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  contact: MagicLinkContact;
}

export interface MagicLinkStore {
  findContactByEmail(email: string): Promise<MagicLinkContact | null>;
  createToken(input: {
    contactId: string;
    tokenHash: string;
    scope: string;
    expiresAt: Date;
    requestIp: string;
    requestUa: string;
  }): Promise<void>;
  findTokenByHash(tokenHash: string): Promise<MagicLinkTokenRow | null>;
  /** Records a failed redemption; `destroy` also marks the token consumed. */
  recordAttempt(id: string, attempts: number, destroy: boolean): Promise<void>;
  /** Atomic single-use consume; `false` when already consumed (race loser). */
  consume(id: string): Promise<boolean>;
}

/**
 * Delivery port. The AliCloud DirectMail adapter (DQ-017) landed in P2.5
 * (mail.ts); dev/test wire a metadata-only logger. `email` is the contact's
 * address resolved at issuance — deliverers must never log it or the URL.
 * Delivery failure never changes the neutral 202 response.
 */
export interface MagicLinkDeliverer {
  deliver(input: { contactId: string; email: string; url: string; expiresAt: Date }): Promise<void>;
}

export interface MagicLinkRequestInput {
  email: string;
  contactId?: string;
  ip: string;
  ua: string;
}

export interface MagicLinkRedeemResult {
  session: Session;
  contactId: string;
  displayName: string;
  locale: string;
}

export interface MagicLinkDeps {
  store: MagicLinkStore;
  sessions: SessionService;
  rateLimiter: RateLimiter;
  deliverer: MagicLinkDeliverer;
  /** `MAGIC_LINK_SECRET` — base64 key material; HMAC key, never SESSION_SECRET. */
  secret: string;
  publicBaseUrl: string;
  now?: () => Date;
}

export class MagicLinkService {
  readonly #store: MagicLinkStore;
  readonly #sessions: SessionService;
  readonly #rateLimiter: RateLimiter;
  readonly #deliverer: MagicLinkDeliverer;
  readonly #secret: string;
  readonly #publicBaseUrl: string;
  readonly #now: () => Date;

  constructor(deps: MagicLinkDeps) {
    this.#store = deps.store;
    this.#sessions = deps.sessions;
    this.#rateLimiter = deps.rateLimiter;
    this.#deliverer = deps.deliverer;
    this.#secret = deps.secret;
    this.#publicBaseUrl = deps.publicBaseUrl.replace(/\/+$/, "");
    this.#now = deps.now ?? (() => new Date());
  }

  /** HMAC-SHA256 hex — the only representation of a token that touches storage. */
  tokenHash(token: string): string {
    return createHmac("sha256", this.#secret).update(token).digest("hex");
  }

  async request(input: MagicLinkRequestInput): Promise<void> {
    const ipLimit = await this.#rateLimiter.consume(
      `markus:rl:ml:ip:${input.ip}`,
      MAGIC_LINK_IP_LIMIT,
      3600,
    );
    if (!ipLimit.allowed) {
      throw new AuthError(429, "RATE_LIMITED", Math.max(1, Math.ceil(ipLimit.retryAfterSeconds)));
    }

    const email = input.email.trim().toLowerCase();
    const contact = await this.#store.findContactByEmail(email);
    // Neutral 202: unknown, erased or hint-mismatched contacts silently pass.
    if (contact === null || contact.deletedAt !== null) return;
    if (input.contactId !== undefined && input.contactId !== contact.id) return;

    const contactLimit = await this.#rateLimiter.consume(
      `markus:rl:ml:contact:${contact.id}`,
      MAGIC_LINK_CONTACT_LIMIT,
      3600,
    );
    if (!contactLimit.allowed) return;

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.#now().getTime() + MAGIC_LINK_TOKEN_TTL_SECONDS * 1000);
    await this.#store.createToken({
      contactId: contact.id,
      tokenHash: this.tokenHash(token),
      scope: "portal",
      expiresAt,
      requestIp: input.ip,
      requestUa: input.ua,
    });

    const url = `${this.#publicBaseUrl}/portal/auth?token=${token}`;
    try {
      await this.#deliverer.deliver({ contactId: contact.id, email: contact.email, url, expiresAt });
    } catch {
      // Delivery is best-effort until the notification module lands; the
      // response stays neutral either way (never log the token or the URL).
    }
  }

  async redeem(input: { token: string; ip: string; ua: string }): Promise<MagicLinkRedeemResult> {
    const tokenHash = this.tokenHash(input.token);

    const limit = await this.#rateLimiter.consume(
      `markus:rl:mlv:${tokenHash.slice(0, 24)}`,
      MAGIC_LINK_VERIFY_LIMIT,
      900,
    );
    if (!limit.allowed) {
      throw new AuthError(429, "RATE_LIMITED", Math.max(1, Math.ceil(limit.retryAfterSeconds)));
    }

    const row = await this.#store.findTokenByHash(tokenHash);
    if (row === null) throw new AuthError(401, "UNAUTHENTICATED");

    const now = this.#now();
    const invalid =
      row.consumedAt !== null || row.expiresAt <= now || row.contact.deletedAt !== null;
    if (invalid) {
      const attempts = row.attempts + 1;
      await this.#store.recordAttempt(row.id, attempts, attempts >= MAGIC_LINK_MAX_ATTEMPTS);
      throw new AuthError(401, "UNAUTHENTICATED");
    }

    if (!(await this.#store.consume(row.id))) throw new AuthError(401, "UNAUTHENTICATED");

    const session = await this.#sessions.create({
      actorType: "CONTACT",
      actorId: row.contact.id,
      role: null,
      locale: row.contact.locale,
      ip: input.ip,
      ua: input.ua,
      scopes: ["portal"],
    });
    return {
      session,
      contactId: row.contact.id,
      displayName: row.contact.name,
      locale: row.contact.locale,
    };
  }
}
