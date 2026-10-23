import { randomBytes } from "node:crypto";

import {
  assertProductionSafety,
  DEV_MAGIC_LINK_FALLBACK,
  DEV_SESSION_FALLBACK,
  DEV_VAULT_FALLBACK,
  EnvValidationError,
  envSchema,
  loadEnv,
  REJECTED_MAGIC_LINK_SECRETS,
  REJECTED_SESSION_SECRETS,
  type Env,
} from "./env.js";

const validEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "development",
  SESSION_SECRET: "s".repeat(48),
  MAGIC_LINK_SECRET: "m".repeat(48),
});

const parseEnv = (overrides: NodeJS.ProcessEnv): Env =>
  envSchema.parse({
    NODE_ENV: "development",
    SESSION_SECRET: "s".repeat(48),
    MAGIC_LINK_SECRET: "m".repeat(48),
    ...overrides,
  });

const productionOverrides: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  KMS_KEY_ID: "key-2026-09",
  VAULT_MASTER_KEY: "wrapped-data-key",
  DATABASE_URL: "postgresql://user:pass@db.markus.hk:5432/markus",
  REDIS_URL: "rediss://cache.markus.hk:6379",
};

describe("loadEnv", () => {
  test("applies development defaults for core connection settings", () => {
    const env = loadEnv(validEnv());
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3001);
    expect(env.RUN_WORKER).toBe(false);
    expect(env.DATABASE_URL).toBe("postgresql://markus:markus@localhost:5432/markus");
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
    expect(env.USPTO_BULK_BASE_URL).toBe("https://data.uspto.gov");
    expect(env.USPTO_RESEARCHER_PRODUCT_ID).toBe("TRCFECO2");
    expect(env.TM_CORPUS_FRESHNESS_HOURS).toBe(26);
    expect(env.TM_CORPUS_INGEST_ENABLED).toBe(false);
    expect(env.USPTO_ASSISTED_LOGIN_ENABLED).toBe(false);
  });

  test("requires NODE_ENV so the production gate cannot be skipped by omission", () => {
    expect(() => loadEnv({ SESSION_SECRET: "s".repeat(48) })).toThrow(/NODE_ENV/);
  });

  test("rejects a missing or short SESSION_SECRET", () => {
    expect(() => loadEnv({ NODE_ENV: "development" })).toThrow(EnvValidationError);
    expect(() => loadEnv({ ...validEnv(), SESSION_SECRET: "too-short" })).toThrow(
      /SESSION_SECRET/,
    );
  });

  // R-023 / FA-007: entropy is measured in decoded BYTES, not characters.
  test("rejects a 32-character SESSION_SECRET that decodes to fewer than 32 bytes", () => {
    expect(() => loadEnv({ ...validEnv(), SESSION_SECRET: "a".repeat(32) })).toThrow(
      /SESSION_SECRET/,
    );
    expect(() => loadEnv({ ...validEnv(), MAGIC_LINK_SECRET: "a".repeat(32) })).toThrow(
      /MAGIC_LINK_SECRET/,
    );
  });

  test("accepts a generated randomBytes(48) base64 secret", () => {
    const generated = randomBytes(48).toString("base64");
    const env = loadEnv({ ...validEnv(), SESSION_SECRET: generated, MAGIC_LINK_SECRET: generated });
    expect(env.SESSION_SECRET).toBe(generated);
    expect(env.MAGIC_LINK_SECRET).toBe(generated);
  });

  test("rejects the retired placeholder by the schema itself", () => {
    expect(() =>
      loadEnv({ ...validEnv(), SESSION_SECRET: "change-me-32-bytes-minimum" }),
    ).toThrow(/SESSION_SECRET/);
    expect(() =>
      loadEnv({ ...validEnv(), SESSION_SECRET: "insecure-local-development-secret-000" }),
    ).toThrow(/SESSION_SECRET/);
  });

  test("rejects base64url and whitespace-padded secrets (strict alphabet)", () => {
    expect(() => loadEnv({ ...validEnv(), SESSION_SECRET: `${"a".repeat(43)}-` })).toThrow(
      /SESSION_SECRET/,
    );
    expect(() => loadEnv({ ...validEnv(), SESSION_SECRET: ` ${"s".repeat(48)}` })).toThrow(
      /SESSION_SECRET/,
    );
  });

  test("coerces PORT and boolean env vars", () => {
    const env = loadEnv({
      ...validEnv(),
      PORT: "8080",
      RUN_WORKER: "1",
      USPTO_ASSISTED_LOGIN_ENABLED: "true",
    });
    expect(env.PORT).toBe(8080);
    expect(env.RUN_WORKER).toBe(true);
    expect(env.USPTO_ASSISTED_LOGIN_ENABLED).toBe(true);
  });

  test("rejects a non-numeric PORT and a malformed URL", () => {
    expect(() => loadEnv({ ...validEnv(), PORT: "http" })).toThrow(EnvValidationError);
    expect(() => loadEnv({ ...validEnv(), REDIS_URL: "not-a-url" })).toThrow(/REDIS_URL/);
  });

  test("rejects non-service URL schemes", () => {
    const unsafe = [
      { PUBLIC_BASE_URL: "javascript:alert(1)" },
      { API_BASE_URL: "file:///etc/passwd" },
      { SENTRY_DSN: "data:text/plain,leak" },
      { LLM_PRIMARY_BASE_URL: "ftp://models.internal" },
      { DATABASE_URL: "https://db.example.com" },
      { REDIS_URL: "http://cache.example.com" },
      { USPTO_BULK_BASE_URL: "http://bulkdata.uspto.gov" },
    ];
    for (const override of unsafe) {
      expect(() => loadEnv({ ...validEnv(), ...override })).toThrow(EnvValidationError);
    }
  });

  test("treats empty optional values as unset", () => {
    const env = loadEnv({ ...validEnv(), STRIPE_SECRET_KEY: "", SENTRY_DSN: "" });
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  test("never echoes secret values into the error message", () => {
    const secret = "k".repeat(48);
    try {
      loadEnv({ NODE_ENV: "development", SESSION_SECRET: secret, REDIS_URL: "nope" });
      throw new Error("expected EnvValidationError");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as Error).message).not.toContain(secret);
      expect((error as EnvValidationError).problems.join(" ")).not.toContain(secret);
    }
  });
});

describe("assertProductionSafety (D-01)", () => {
  test("accepts a fully configured production environment", () => {
    const env = loadEnv({
      ...validEnv(),
      ...productionOverrides,
    });
    expect(() => assertProductionSafety(env)).not.toThrow();
  });

  test("rejects the development vault fallback outside development", () => {
    const env = parseEnv({
      ...productionOverrides,
      NODE_ENV: "staging",
      VAULT_MASTER_KEY: DEV_VAULT_FALLBACK,
      REDIS_URL: "redis://cache.markus.hk:6379",
    });
    expect(() => assertProductionSafety(env)).toThrow(/development fallback/);
  });

  test("rejects the shipped dev SESSION_SECRET placeholder outside development", () => {
    // Only schema-valid values reach the gate; the retired length-only
    // placeholders are rejected by the schema (see above) before this point.
    const env = parseEnv({ ...productionOverrides, SESSION_SECRET: DEV_SESSION_FALLBACK });
    expect(() => assertProductionSafety(env)).toThrow(/SESSION_SECRET.*placeholder/);
    expect(REJECTED_SESSION_SECRETS).toContain(DEV_SESSION_FALLBACK);
  });

  test("rejects the shipped dev MAGIC_LINK_SECRET placeholder outside development", () => {
    const env = parseEnv({ ...productionOverrides, MAGIC_LINK_SECRET: DEV_MAGIC_LINK_FALLBACK });
    expect(() => assertProductionSafety(env)).toThrow(/MAGIC_LINK_SECRET.*placeholder/);
    expect(REJECTED_MAGIC_LINK_SECRETS).toContain(DEV_MAGIC_LINK_FALLBACK);
  });

  test("rejects missing KMS key and local connection strings in production", () => {
    const env = parseEnv({ NODE_ENV: "production" });
    expect(() => assertProductionSafety(env)).toThrow(/KMS_KEY_ID/);
    expect(() => assertProductionSafety(env)).toThrow(/DATABASE_URL/);
    expect(() => assertProductionSafety(env)).toThrow(/REDIS_URL/);
  });

  test("loadEnv applies the same gate at boot time", () => {
    expect(() => loadEnv({ ...validEnv(), NODE_ENV: "production" })).toThrow(EnvValidationError);
  });

  test("does not enforce production rules in development or test", () => {
    expect(() => assertProductionSafety(loadEnv({ ...validEnv(), NODE_ENV: "test" }))).not.toThrow();
    expect(() =>
      assertProductionSafety(loadEnv({ ...validEnv(), NODE_ENV: "development" })),
    ).not.toThrow();
  });
});
