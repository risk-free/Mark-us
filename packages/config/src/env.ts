/**
 * Shared environment contract (ARCHITECTURE §2 — packages/config).
 *
 * Every runtime (apps/api, workers, future jobs) validates its environment
 * through this schema and fails fast at boot. Names mirror `.env.example`
 * one-for-one; a test enforces that. Nothing is defaulted outside development,
 * and `assertProductionSafety` makes the staging/production gate fail **closed**
 * (D-01 vault rules).
 *
 * Error messages never contain values, so logging an EnvValidationError
 * cannot leak a secret.
 */

import { z } from "zod";

export const DEV_VAULT_FALLBACK = "dev-only-not-for-prod";
/**
 * R-023 / FA-007: session-signing secrets must be base64 decoding to >= 32
 * BYTES (256 bits), enforced in the schema itself — a low-entropy 32-character
 * string no longer passes. The local-development value is valid base64 (so the
 * schema accepts it) and is rejected outside development by membership, the
 * same pattern as `VAULT_MASTER_KEY`. The retired length-only fallback stays
 * on the reject list so a stale `.env` still fails closed.
 */
export const DEV_SESSION_FALLBACK =
  "bWFya3VzLWRldi1zZXNzaW9uLXNlY3JldC0tZG8tbm90LXVzZS1pbi1wcm9k"; // "markus-dev-session-secret--do-not-use-in-prod"
export const DEV_MAGIC_LINK_FALLBACK =
  "bWFya3VzLWRldi1tYWdpYy1saW5rLXNlY3JldC0tZG8tbm90LXVzZS1wcm9k"; // "markus-dev-magic-link-secret--do-not-use-prod"
export const REJECTED_SESSION_SECRETS = [
  DEV_SESSION_FALLBACK,
  "insecure-local-development-secret-000",
  "change-me-32-bytes-minimum",
] as const;
export const REJECTED_MAGIC_LINK_SECRETS = [DEV_MAGIC_LINK_FALLBACK] as const;
export const DEV_DATABASE_URL = "postgresql://markus:markus@localhost:5432/markus";
export const DEV_REDIS_URL = "redis://localhost:6379";

const envBoolean = (fallback: "true" | "false") =>
  z
    .enum(["true", "false", "1", "0"])
    .default(fallback)
    .transform((value) => value === "true" || value === "1");

const isValidUrl = (value: string): boolean => {
  try {
    void new URL(value);
    return true;
  } catch {
    return false;
  }
};

const hasScheme = (schemes: string[]) => (value: string): boolean =>
  isValidUrl(value) && schemes.includes(new URL(value).protocol);

const urlWithSchemes = (schemes: string[]) =>
  z.string().refine(hasScheme(schemes), {
    message: `must be a valid ${schemes.join(" / ")} URL`,
  });

const optionalUrl = (schemes: string[] = ["http:", "https:"]) => {
  const base = urlWithSchemes(schemes);
  return z
    .string()
    .optional()
    .refine((value) => value === undefined || value === "" || base.safeParse(value).success, {
      message: `must be a valid ${schemes.join(" / ")} URL when set`,
    })
    .transform((value) => (value === "" ? undefined : value));
};

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

/**
 * R-023: strict standard base64 (no base64url, no whitespace, canonical
 * padding) decoding to at least `minBytes` bytes. `Buffer.from(v, "base64")`
 * alone is lenient — it silently drops invalid characters — so the regex gates
 * the alphabet first and the decoded length is what is measured.
 */
const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const isBase64WithMinBytes = (value: string, minBytes: number): boolean =>
  value.length > 0 &&
  STRICT_BASE64.test(value) &&
  Buffer.from(value, "base64").length >= minBytes;

const base64Secret = (name: string) =>
  z.string().refine((value) => isBase64WithMinBytes(value, 32), {
    message: `${name} must be base64 decoding to >= 32 bytes (generate: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")`,
  });

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  RUN_WORKER: envBoolean("false"),

  // Core
  DATABASE_URL: urlWithSchemes(["postgres:", "postgresql:"]).default(DEV_DATABASE_URL),
  REDIS_URL: urlWithSchemes(["redis:", "rediss:"]).default(DEV_REDIS_URL),
  PUBLIC_BASE_URL: urlWithSchemes(["http:", "https:"]).default("http://localhost:3000"),
  API_BASE_URL: urlWithSchemes(["http:", "https:"]).default("http://localhost:3001"),
  SESSION_SECRET: base64Secret("SESSION_SECRET"),
  // R-023 second ruling: magic-link token hashing has its own key (domain
  // separation) — tokens are HMAC-SHA256(MAGIC_LINK_SECRET, token), hex at
  // rest. Never reuse SESSION_SECRET.
  MAGIC_LINK_SECRET: base64Secret("MAGIC_LINK_SECRET"),

  // Object storage — R2 (or any S3-compatible endpoint)
  R2_ACCOUNT_ID: optionalSecret,
  R2_ACCESS_KEY_ID: optionalSecret,
  R2_SECRET_ACCESS_KEY: optionalSecret,
  R2_BUCKET_DOCUMENTS: optionalSecret,
  R2_BUCKET_INVOICES: optionalSecret,

  // USPTO credential vault (D-01)
  KMS_KEY_ID: optionalSecret,
  VAULT_MASTER_KEY: optionalSecret,

  // Payments (D-05)
  STRIPE_SECRET_KEY: optionalSecret,
  STRIPE_WEBHOOK_SECRET: optionalSecret,
  STRIPE_PRICE_BASE_URL: optionalUrl(),
  PAYPAL_CLIENT_ID: optionalSecret,
  PAYPAL_CLIENT_SECRET: optionalSecret,
  PAYPAL_WEBHOOK_ID: optionalSecret,

  // WeCom (D-06)
  WECOM_CORP_ID: optionalSecret,
  WECOM_CORP_SECRET: optionalSecret,
  WECOM_KF_TOKEN: optionalSecret,
  WECOM_ARCHIVE_KEY: optionalSecret,
  WECOM_CALLBACK_TOKEN: optionalSecret,
  WECOM_CALLBACK_AES_KEY: optionalSecret,

  // USPTO data (D-02). Legacy bulkdata.uspto.gov is DNS-dead; data.uspto.gov is
  // the surviving portal and the base of the researcher signed-URL files.
  TSDR_API_KEY: optionalSecret,
  USPTO_BULK_BASE_URL: urlWithSchemes(["https:"]).default("https://data.uspto.gov"),
  USPTO_RESEARCHER_PRODUCT_ID: z.string().min(1).default("TRCFECO2"),
  TM_CORPUS_FRESHNESS_HOURS: z.coerce.number().int().min(1).max(168).default(26),
  // Nightly corpora ingest job in the worker; off by default so dev never
  // downloads the full researcher archive.
  TM_CORPUS_INGEST_ENABLED: envBoolean("false"),
  USPTO_ASSISTED_LOGIN_ENABLED: envBoolean("false"),

  // Anonymous assessment (M8.1/M8.2): 24 h result cache and abuse limits.
  TM_ASSESSMENT_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).default(86_400),
  TM_ASSESS_RATE_IP_PER_HOUR: z.coerce.number().int().min(1).default(20),
  TM_ASSESS_RATE_MARK_PER_HOUR: z.coerce.number().int().min(1).default(5),

  // Anonymous assistant (M6.4): per-IP hourly limit for POST /tm/assistant.
  TM_ASSISTANT_RATE_IP_PER_HOUR: z.coerce.number().int().min(1).default(30),

  // LLM gateway (D-04)
  LLM_PRIMARY_BASE_URL: optionalUrl(),
  LLM_PRIMARY_API_KEY: optionalSecret,
  LLM_PRIMARY_MODEL: optionalSecret,
  LLM_FALLBACK_BASE_URL: optionalUrl(),
  LLM_FALLBACK_API_KEY: optionalSecret,
  LLM_FALLBACK_MODEL: optionalSecret,
  BGE_EMBED_URL: optionalUrl(),

  // Observability (P0.4)
  SENTRY_DSN: optionalUrl(),
  POSTHOG_HOST: optionalUrl(),
  POSTHOG_KEY: optionalSecret,
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      `Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
    this.name = "EnvValidationError";
    this.problems = problems;
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new EnvValidationError(
      parsed.error.issues.map((issue) => {
        const key = issue.path.join(".") || "(root)";
        return `${key}: ${issue.message}`;
      }),
    );
  }
  assertProductionSafety(parsed.data);
  return parsed.data;
}

/**
 * D-01: outside development the USPTO vault must be KMS-backed, the session key
 * must not be a shipped placeholder, and the local dev connection strings must
 * never reach a shared environment. `NODE_ENV` itself has no default, so an
 * omitted value fails schema validation instead of silently skipping this gate.
 */
export function assertProductionSafety(env: Env): void {
  if (env.NODE_ENV !== "staging" && env.NODE_ENV !== "production") return;

  const problems: string[] = [];
  if (!env.KMS_KEY_ID) {
    problems.push("KMS_KEY_ID is required in staging/production (D-01 envelope encryption)");
  }
  if (!env.VAULT_MASTER_KEY) {
    problems.push("VAULT_MASTER_KEY is required in staging/production (wrapped data key)");
  } else if (env.VAULT_MASTER_KEY === DEV_VAULT_FALLBACK) {
    problems.push("VAULT_MASTER_KEY is still the development fallback value");
  }
  if ((REJECTED_SESSION_SECRETS as readonly string[]).includes(env.SESSION_SECRET)) {
    problems.push("SESSION_SECRET is a shipped placeholder value");
  }
  if ((REJECTED_MAGIC_LINK_SECRETS as readonly string[]).includes(env.MAGIC_LINK_SECRET)) {
    problems.push("MAGIC_LINK_SECRET is a shipped placeholder value");
  }
  if (env.DATABASE_URL === DEV_DATABASE_URL) {
    problems.push("DATABASE_URL is still the local development connection string");
  }
  if (env.REDIS_URL === DEV_REDIS_URL) {
    problems.push("REDIS_URL is still the local development connection string");
  }
  if (problems.length > 0) throw new EnvValidationError(problems);
}
