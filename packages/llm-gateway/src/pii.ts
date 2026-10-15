/**
 * PII guard (mandate M6.3, rule G3).
 *
 * Runs before any network call. It rejects a denylisted key anywhere in the
 * business `context` and scans every message body for an e-mail, a phone number
 * or a contact-identifier pattern. Error messages name the pattern kind and
 * position only — never the matched value, so a thrown error cannot leak PII
 * into logs.
 */

import { LlmPiiError, type ChatMessage } from "./types.js";

/** Field names that must never cross the LLM boundary (M6.3). */
export const PII_DENYLIST = [
  "contactName",
  "name",
  "firstName",
  "lastName",
  "email",
  "phone",
  "mobile",
  "wechatId",
  "openId",
  "contactId",
  "documentContents",
  "documentBody",
] as const;

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const DENY_KEYS: ReadonlySet<string> = new Set(PII_DENYLIST.map(normalizeKey));

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_PATTERN = /\+?\d[\d\s().-]{6,}\d/g;
const CONTACT_ID_PATTERN = /contact[_\s-]?id/i;
/** Prisma/cuid shape: `c` + 24 lowercase alphanumerics. */
const CUID_PATTERN = /\bc[a-z0-9]{22,}\b/;

export type PiiKind = "email" | "phone" | "contactId";

export interface PiiHit {
  kind: PiiKind;
  detail: string;
}

const firstPhone = (text: string): string | null => {
  for (const match of text.matchAll(PHONE_PATTERN)) {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 15) return match[0];
  }
  return null;
};

/** Returns the first PII pattern found in `text`, or null. Never echoes the value. */
export function scanText(text: string): PiiHit | null {
  if (EMAIL_PATTERN.test(text)) return { kind: "email", detail: "an e-mail address" };
  if (CONTACT_ID_PATTERN.test(text) || CUID_PATTERN.test(text)) {
    return { kind: "contactId", detail: "a contact identifier" };
  }
  if (firstPhone(text) !== null) return { kind: "phone", detail: "a phone number" };
  return null;
}

/**
 * Throws `LlmPiiError` if the context contains a denylisted key (at any depth)
 * or any message body matches a PII pattern.
 */
export function assertNoPii(
  messages: readonly ChatMessage[],
  context?: Record<string, unknown>,
): void {
  if (context !== undefined) assertDenylistKeys(context, "context");
  for (const [index, message] of messages.entries()) {
    const hit = scanText(message.content);
    if (hit !== null) {
      throw new LlmPiiError(
        `LLM prompt rejected: ${hit.kind} detected in message ${index} (${hit.detail})`,
        hit.kind,
      );
    }
  }
}

function assertDenylistKeys(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertDenylistKeys(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, entry] of Object.entries(value)) {
    if (DENY_KEYS.has(normalizeKey(key))) {
      throw new LlmPiiError(`LLM context rejected: denylisted field "${key}" at ${path}`, key);
    }
    assertDenylistKeys(entry, `${path}.${key}`);
  }
}
