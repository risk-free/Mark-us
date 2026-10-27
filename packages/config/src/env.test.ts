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
  DIRECTMAIL_ACCESS_KEY_ID: "dm-access-key-id",
  DIRECTMAIL_ACCESS_KEY_SECRET: "dm-access-key-secret",
  DIRECTMAIL_ACCOUNT_NAME: "no-reply@mail.markus.hk",
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
    expect(env.TM_CORPUS_INGEST_SOURCE).toBe("trcfeco2");
    expect(env.TM_CORPUS_INGEST_YEARS).toBeUndefined();
    expect(env.USPTO_ASSISTED_LOGIN_ENABLED).toBe(false);
  });

  test("parses TM_CORPUS_INGEST_YEARS and TM_CORPUS_INGEST_SOURCE", () => {
    const env = loadEnv({ ...validEnv(), TM_CORPUS_INGEST_YEARS: "2024, 2025", TM_CORPUS_INGEST_SOURCE: "tdxf" });
    expect(env.TM_CORPUS_INGEST_YEARS).toEqual([2024, 2025]);
    expect(env.TM_CORPUS_INGEST_SOURCE).toBe("tdxf");
  });

  test("rejects malformed TM_CORPUS_INGEST_YEARS", () => {
    expect(() => loadEnv({ ...validEnv(), TM_CORPUS_INGEST_YEARS: "2024,not-a-year" })).toThrow(
      EnvValidationError,
    );
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

  // DQ-017: magic links are the only client login path — no silent logger fallback in prod.
  test("production requires DirectMail config (fail closed)", () => {
    const { DIRECTMAIL_ACCESS_KEY_ID, ...missingOne } = productionOverrides;
    void DIRECTMAIL_ACCESS_KEY_ID;
    expect(() => loadEnv({ ...validEnv(), ...missingOne })).toThrow(/DIRECTMAIL/);
    expect(() =>
      loadEnv({ ...validEnv(), ...missingOne, DIRECTMAIL_ALLOW_LOGGER_FALLBACK: "true" }),
    ).toThrow(/DIRECTMAIL/);
  });

  test("staging requires DirectMail config unless the logger fallback is explicitly opted in", () => {
    const staging: NodeJS.ProcessEnv = {
      ...productionOverrides,
      NODE_ENV: "staging",
      DIRECTMAIL_ACCESS_KEY_ID: undefined,
      DIRECTMAIL_ACCESS_KEY_SECRET: undefined,
      DIRECTMAIL_ACCOUNT_NAME: undefined,
    };
    expect(() => loadEnv({ ...validEnv(), ...staging })).toThrow(/DIRECTMAIL_ALLOW_LOGGER_FALLBACK/);
    const optedIn = loadEnv({ ...validEnv(), ...staging, DIRECTMAIL_ALLOW_LOGGER_FALLBACK: "true" });
    expect(optedIn.DIRECTMAIL_ALLOW_LOGGER_FALLBACK).toBe(true);
    expect(optedIn.DIRECTMAIL_ACCESS_KEY_ID).toBeUndefined();
  });

  test("development and test default to the metadata-only logger without a flag", () => {
    expect(loadEnv({ ...validEnv(), NODE_ENV: "development" }).DIRECTMAIL_ACCESS_KEY_ID).toBeUndefined();
    expect(loadEnv({ ...validEnv(), NODE_ENV: "test" }).DIRECTMAIL_ALLOW_LOGGER_FALLBACK).toBe(false);
  });

  test("defaults the DirectMail region to the Singapore intl region", () => {
    expect(loadEnv(validEnv()).DIRECTMAIL_REGION).toBe("ap-southeast-1");
  });

  test("does not enforce production rules in development or test", () => {
    expect(() => assertProductionSafety(loadEnv({ ...validEnv(), NODE_ENV: "test" }))).not.toThrow();
    expect(() =>
      assertProductionSafety(loadEnv({ ...validEnv(), NODE_ENV: "development" })),
    ).not.toThrow();
  });
});
