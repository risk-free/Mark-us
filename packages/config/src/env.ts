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
export const DEV_SESSION_FALLBACK = "insecure-local-development-secret-000";
export const REJECTED_SESSION_SECRETS = [
  DEV_SESSION_FALLBACK,
  "change-me-32-bytes-minimum",
] as const;
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

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  RUN_WORKER: envBoolean("false"),

  // Core
  DATABASE_URL: urlWithSchemes(["postgres:", "postgresql:"]).default(DEV_DATABASE_URL),
  REDIS_URL: urlWithSchemes(["redis:", "rediss:"]).default(DEV_REDIS_URL),
  PUBLIC_BASE_URL: urlWithSchemes(["http:", "https:"]).default("http://localhost:3000"),
  API_BASE_URL: urlWithSchemes(["http:", "https:"]).default("http://localhost:3001"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET needs >= 32 chars (generate: node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\")"),

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
  USPTO_ASSISTED_LOGIN_ENABLED: envBoolean("false"),

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
  if (env.DATABASE_URL === DEV_DATABASE_URL) {
    problems.push("DATABASE_URL is still the local development connection string");
  }
  if (env.REDIS_URL === DEV_REDIS_URL) {
    problems.push("REDIS_URL is still the local development connection string");
  }
  if (problems.length > 0) throw new EnvValidationError(problems);
}
