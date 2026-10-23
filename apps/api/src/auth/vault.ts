/**
 * TOTP seed vault — INTERIM implementation (D-01). `StaffUser.totpSecretCipher`
 * is AES-256-GCM under a key derived from `VAULT_MASTER_KEY` until the KMS
 * envelope adapter lands with the credential-vault subphase. The auth service
 * only sees the `TotpSeedVault` port, so swapping this for KMS is a wiring
 * change, not an auth change. Ciphertext layout: iv(12) ‖ tag(16) ‖ data.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export class TotpVaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TotpVaultError";
  }
}

export class InterimTotpCipher {
  readonly #key: Buffer;

  constructor(masterKey: string) {
    if (masterKey.length === 0) throw new TotpVaultError("VAULT_MASTER_KEY is empty");
    this.#key = createHash("sha256").update(`markus:totp-vault:interim:${masterKey}`).digest();
  }

  encrypt(plaintextBase32: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const data = Buffer.concat([cipher.update(plaintextBase32, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]);
  }

  decrypt(ciphertext: Buffer): string {
    if (ciphertext.length < 12 + 16 + 1) {
      throw new TotpVaultError("totpSecretCipher is too short to be AES-256-GCM output");
    }
    const iv = ciphertext.subarray(0, 12);
    const tag = ciphertext.subarray(12, 28);
    const data = ciphertext.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.#key, iv);
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
      throw new TotpVaultError("totpSecretCipher failed authentication");
    }
  }
}
