/**
 * RFC 6238 TOTP over node:crypto only — no dependency surface for the MFA path
 * (staff login, mandatory for MASTER_ADMIN/EXPERT per R-013). Verification is
 * constant-time and accepts the ±1 step window for clock drift.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=]/g, "").toUpperCase();
  if (clean.length === 0) throw new Error("empty base32 input");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`invalid base32 character: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function totp(secret: Buffer, atMs: number, periodSeconds = 30, digits = 6): string {
  return hotp(secret, Math.floor(atMs / 1000 / periodSeconds), digits);
}

export function verifyTotp(
  secret: Buffer,
  code: string,
  atMs: number,
  window = 1,
  periodSeconds = 30,
  digits = 6,
): boolean {
  if (!/^\d+$/.test(code)) return false;
  const candidate = Buffer.from(code);
  const counter = Math.floor(atMs / 1000 / periodSeconds);
  for (let drift = -window; drift <= window; drift += 1) {
    const expected = Buffer.from(hotp(secret, counter + drift, digits));
    if (expected.length === candidate.length && timingSafeEqual(expected, candidate)) {
      return true;
    }
  }
  return false;
}
