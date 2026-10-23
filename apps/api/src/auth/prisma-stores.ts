/**
 * Prisma adapters for the auth ports — the only place the auth domain touches
 * Postgres (R-005 / ADR D-18: magic-link token rows are Postgres, sessions are
 * Redis). `StaffUser` is read narrowly for credentials; role/status changes
 * stay with the staff module that owns the table.
 */

import type { PrismaClient } from "@prisma/client";

import type { MagicLinkContact, MagicLinkStore, MagicLinkTokenRow } from "./magic-link.js";
import type { StaffCredential, StaffCredentialStore, TotpSeedVault } from "./staff-auth.js";
import { InterimTotpCipher } from "./vault.js";

export class PrismaStaffCredentialStore implements StaffCredentialStore {
  readonly #prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.#prisma = prisma;
  }

  async findByEmail(email: string): Promise<StaffCredential | null> {
    const row = await this.#prisma.staffUser.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locale: true,
        status: true,
        passwordHash: true,
        totpEnabledAt: true,
      },
    });
    if (row === null) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      locale: row.locale,
      status: row.status,
      passwordHash: row.passwordHash,
      totpEnabled: row.totpEnabledAt !== null,
    };
  }

  async findById(id: string): Promise<StaffCredential | null> {
    const row = await this.#prisma.staffUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locale: true,
        status: true,
        passwordHash: true,
        totpEnabledAt: true,
      },
    });
    if (row === null) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      locale: row.locale,
      status: row.status,
      passwordHash: row.passwordHash,
      totpEnabled: row.totpEnabledAt !== null,
    };
  }

  async touchLastLogin(id: string, at: Date): Promise<void> {
    await this.#prisma.staffUser.update({ where: { id }, data: { lastLoginAt: at } });
  }
}

/** D-01 interim: AES-256-GCM cipher until the KMS envelope adapter lands. */
export class PrismaTotpSeedVault implements TotpSeedVault {
  readonly #prisma: PrismaClient;
  readonly #cipher: InterimTotpCipher;

  constructor(prisma: PrismaClient, masterKey: string) {
    this.#prisma = prisma;
    this.#cipher = new InterimTotpCipher(masterKey);
  }

  async revealSeed(staffId: string): Promise<string | null> {
    const row = await this.#prisma.staffUser.findUnique({
      where: { id: staffId },
      select: { totpSecretCipher: true },
    });
    if (row?.totpSecretCipher == null) return null;
    try {
      return this.#cipher.decrypt(Buffer.from(row.totpSecretCipher));
    } catch {
      // Fail closed: an undecryptable seed denies MFA rather than 500ing.
      return null;
    }
  }
}

const CONTACT_SELECT = {
  id: true,
  name: true,
  email: true,
  locale: true,
  deletedAt: true,
} as const;

export class PrismaMagicLinkStore implements MagicLinkStore {
  readonly #prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.#prisma = prisma;
  }

  async findContactByEmail(email: string): Promise<MagicLinkContact | null> {
    const row = await this.#prisma.contact.findUnique({
      where: { email },
      select: CONTACT_SELECT,
    });
    if (row === null || row.email === null) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      locale: row.locale,
      deletedAt: row.deletedAt,
    };
  }

  async createToken(input: {
    contactId: string;
    tokenHash: string;
    scope: string;
    expiresAt: Date;
    requestIp: string;
    requestUa: string;
  }): Promise<void> {
    await this.#prisma.magicLinkToken.create({
      data: {
        contactId: input.contactId,
        tokenHash: input.tokenHash,
        scope: input.scope,
        expiresAt: input.expiresAt,
        requestIp: input.requestIp,
        requestUa: input.requestUa,
      },
    });
  }

  async findTokenByHash(tokenHash: string): Promise<MagicLinkTokenRow | null> {
    const row = await this.#prisma.magicLinkToken.findUnique({
      where: { tokenHash },
      include: { contact: { select: CONTACT_SELECT } },
    });
    if (row === null || row.contact.email === null) return null;
    return {
      id: row.id,
      contactId: row.contactId,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
      attempts: row.attempts,
      contact: {
        id: row.contact.id,
        name: row.contact.name,
        email: row.contact.email,
        locale: row.contact.locale,
        deletedAt: row.contact.deletedAt,
      },
    };
  }

  async recordAttempt(id: string, attempts: number, destroy: boolean): Promise<void> {
    await this.#prisma.magicLinkToken.update({
      where: { id },
      data: { attempts, ...(destroy ? { consumedAt: new Date() } : {}) },
    });
  }

  /** Atomic conditional update — the single-use guarantee under races. */
  async consume(id: string): Promise<boolean> {
    const result = await this.#prisma.magicLinkToken.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return result.count === 1;
  }
}
