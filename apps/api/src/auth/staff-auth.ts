/**
 * Staff authentication (R-013): Argon2id password, TOTP step for enrolled
 * accounts (mandatory for MASTER_ADMIN/EXPERT), single-use 5-minute MFA
 * challenge (replay → 409), 10 login attempts per 15 min per IP+email, and a
 * 15-minute lockout after 5 failures (→ 423). Unknown accounts and wrong
 * passwords are indistinguishable (401); a dummy verify keeps the timing
 * profile of a real rejection. This module owns **no domain table**: staff
 * credentials arrive through the `StaffCredentialStore` port and TOTP seeds
 * through `TotpSeedVault` (D-01).
 */

import { createHash, randomBytes } from "node:crypto";

import type { Role } from "@markus/core";

import type { RateLimiter } from "../rate-limit.js";
import type { KeyValueStore } from "./kv.js";
import type { Session, SessionService } from "./session.js";
import { base32Decode, verifyTotp } from "./totp.js";

export const LOGIN_RATE_LIMIT = 10;
export const LOGIN_RATE_WINDOW_SECONDS = 15 * 60;
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_SECONDS = 15 * 60;
export const MFA_CHALLENGE_TTL_SECONDS = 5 * 60;

export type StaffStatus = "INVITED" | "ACTIVE" | "DISABLED";

export interface StaffCredential {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: string;
  status: StaffStatus;
  passwordHash: string | null;
  totpEnabled: boolean;
}

export interface StaffCredentialStore {
  findByEmail(email: string): Promise<StaffCredential | null>;
  findById(id: string): Promise<StaffCredential | null>;
  touchLastLogin(id: string, at: Date): Promise<void>;
}

export interface PasswordVerifier {
  verify(hash: string, password: string): Promise<boolean>;
}

/** D-01 vault port: reveals the base32 TOTP seed for an enrolled staff id. */
export interface TotpSeedVault {
  revealSeed(staffId: string): Promise<string | null>;
}

export type AuthErrorCode =
  | "UNAUTHENTICATED"
  | "ACCOUNT_LOCKED"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "CSRF_FAILED"
  | "FORBIDDEN"
  | "VALIDATION_FAILED";

export class AuthError extends Error {
  readonly status: number;
  readonly code: AuthErrorCode;
  readonly retryAfterSeconds: number | undefined;

  constructor(status: number, code: AuthErrorCode, retryAfterSeconds?: number) {
    super(code);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface LoginInput {
  email: string;
  password: string;
  ip: string;
  ua: string;
}

export type LoginResult =
  | { kind: "session"; session: Session; staff: StaffCredential }
  | { kind: "challenge"; challengeId: string; expiresAt: Date; methods: ["TOTP"] };

export interface MfaVerifyInput {
  challengeId: string;
  code: string;
  ip: string;
  ua: string;
}

const sha256Hex = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export interface StaffAuthDeps {
  store: StaffCredentialStore;
  sessions: SessionService;
  kv: KeyValueStore;
  rateLimiter: RateLimiter;
  passwords: PasswordVerifier;
  totpVault: TotpSeedVault;
  now?: () => Date;
}

export class StaffAuthService {
  readonly #store: StaffCredentialStore;
  readonly #sessions: SessionService;
  readonly #kv: KeyValueStore;
  readonly #rateLimiter: RateLimiter;
  readonly #passwords: PasswordVerifier;
  readonly #totpVault: TotpSeedVault;
  readonly #now: () => Date;
  #dummyHash: string | null = null;

  constructor(deps: StaffAuthDeps) {
    this.#store = deps.store;
    this.#sessions = deps.sessions;
    this.#kv = deps.kv;
    this.#rateLimiter = deps.rateLimiter;
    this.#passwords = deps.passwords;
    this.#totpVault = deps.totpVault;
    this.#now = deps.now ?? (() => new Date());
  }

  /** Anti-enumeration: verify against a real-shaped hash when the user is absent. */
  async #dummyVerifier(): Promise<string> {
    if (this.#dummyHash === null) {
      const { hashPassword } = await import("./passwords.js");
      this.#dummyHash = await hashPassword(randomBytes(18).toString("base64url"));
    }
    return this.#dummyHash;
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const emailHash = sha256Hex(email);

    const limit = await this.#rateLimiter.consume(
      `markus:rl:staff-login:${input.ip}:${emailHash}`,
      LOGIN_RATE_LIMIT,
      LOGIN_RATE_WINDOW_SECONDS,
    );
    if (!limit.allowed) {
      throw new AuthError(429, "RATE_LIMITED", Math.max(1, Math.ceil(limit.retryAfterSeconds)));
    }

    const lockKey = `markus:auth:lock:${emailHash}`;
    if ((await this.#kv.get(lockKey)) !== null) {
      throw new AuthError(423, "ACCOUNT_LOCKED");
    }

    const staff = await this.#store.findByEmail(email);
    const hash = staff?.passwordHash ?? (await this.#dummyVerifier());
    const passwordOk = await this.#passwords.verify(hash, input.password);

    if (staff === null || staff.status !== "ACTIVE" || !passwordOk) {
      const failsKey = `markus:auth:fails:${emailHash}`;
      const failures = await this.#kv.incrWithTtl(failsKey, LOCKOUT_SECONDS);
      if (failures >= LOCKOUT_THRESHOLD) {
        await this.#kv.set(lockKey, "1", LOCKOUT_SECONDS);
        await this.#kv.del(failsKey);
        throw new AuthError(423, "ACCOUNT_LOCKED");
      }
      throw new AuthError(401, "UNAUTHENTICATED");
    }

    await this.#kv.del(`markus:auth:fails:${emailHash}`);
    await this.#store.touchLastLogin(staff.id, this.#now());

    if (staff.totpEnabled) {
      const challengeId = randomBytes(24).toString("base64url");
      const expiresAt = new Date(this.#now().getTime() + MFA_CHALLENGE_TTL_SECONDS * 1000);
      await this.#kv.set(
        `markus:auth:mfa:${sha256Hex(challengeId)}`,
        JSON.stringify({ staffId: staff.id }),
        MFA_CHALLENGE_TTL_SECONDS,
      );
      return { kind: "challenge", challengeId, expiresAt, methods: ["TOTP"] };
    }

    const session = await this.#sessions.create({
      actorType: "STAFF",
      actorId: staff.id,
      role: staff.role,
      locale: staff.locale,
      ip: input.ip,
      ua: input.ua,
    });
    return { kind: "session", session, staff };
  }

  async verifyMfa(input: MfaVerifyInput): Promise<{ session: Session; staff: StaffCredential }> {
    // Single-use: the challenge is consumed by the attempt itself, so a wrong
    // code burns it and the caller must log in again (brute-force resistance).
    const raw = await this.#kv.getAndDelete(`markus:auth:mfa:${sha256Hex(input.challengeId)}`);
    if (raw === null) throw new AuthError(409, "CONFLICT");

    const { staffId } = JSON.parse(raw) as { staffId: string };
    const staff = await this.#store.findById(staffId);
    if (staff === null || staff.status !== "ACTIVE") throw new AuthError(401, "UNAUTHENTICATED");

    const seed = await this.#totpVault.revealSeed(staff.id);
    if (seed === null) throw new AuthError(401, "UNAUTHENTICATED");
    if (!verifyTotp(base32Decode(seed), input.code, this.#now().getTime())) {
      throw new AuthError(401, "UNAUTHENTICATED");
    }

    const session = await this.#sessions.create({
      actorType: "STAFF",
      actorId: staff.id,
      role: staff.role,
      locale: staff.locale,
      ip: input.ip,
      ua: input.ua,
    });
    return { session, staff };
  }

  async logout(sessionId: string): Promise<void> {
    await this.#sessions.destroy(sessionId);
  }
}
